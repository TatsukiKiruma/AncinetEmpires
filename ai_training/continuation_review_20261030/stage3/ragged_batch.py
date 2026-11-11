"""设备无关的同尺寸批次前向；源自 expert_iteration_2m_20261022/batch_model.py，保持全部参数与导出网络。"""
import torch
from torch.nn import functional as F
from ragged_map import map_forward


def base_collate(samples):
    b = len(samples)
    n = max(len(s['entities']) for s in samples)
    a = max(len(s['pointers']) for s in samples)
    x = dict(spatial=torch.stack([s['spatial'] for s in samples]),
             players=torch.stack([s['players'] for s in samples]),
             active=torch.stack([s['active'] for s in samples]).bool(),
             raw=torch.zeros(b, n, 66), rel=torch.zeros(b, n, n, 16),
             ptr=torch.zeros(b, a, 5, dtype=torch.long),
             entityMask=torch.zeros(b, n + 1, dtype=torch.bool),
             actionMask=torch.zeros(b, a, dtype=torch.bool))
    for i, s in enumerate(samples):
        ni, ai = len(s['entities']), len(s['pointers'])
        x['raw'][i, :ni] = s['entities']
        x['rel'][i, :ni, :ni] = s['relations']
        p = s['pointers'].long().clone()
        p[:, 0] = torch.where(p[:, 0] == ni, n, p[:, 0])
        x['ptr'][i, :ai] = p
        x['entityMask'][i, :ni] = True
        x['entityMask'][i, n] = True
        x['actionMask'][i, :ai] = True
    x['target'] = torch.tensor([s['policyTarget'].item() for s in samples], dtype=torch.long)
    x['weight'] = torch.tensor([s['weight'].item() for s in samples])
    x['quality'] = torch.tensor([s['source'].get('quality', 1.) for s in samples])
    x['valueTarget'] = torch.stack([s['valueTarget'] for s in samples])
    x['valueMask'] = torch.tensor([bool(s['valueMask'].item()) for s in samples])
    return x


def forward_batch(m, x):
    spatial, raw, players = x['spatial'], x['raw'], x['players']
    rel = x['rel'].clamp(-4, 4)
    b, n, _ = raw.shape
    fmap,gmap=map_forward(m.map,spatial,players,x['sizes'])
    scale = torch.ones(66, device=raw.device); scale[33:35] = 1 / 64
    local = fmap.permute(0, 2, 3, 1)[torch.arange(b, device=raw.device)[:, None], raw[:, :, 34].long(), raw[:, :, 33].long()]
    entity = F.relu(m.entity_norm(m.entity_proj(torch.cat([(raw * scale).clamp(-4, 4), local], -1))))
    glob = F.relu(m.global_norm(m.global_proj(torch.cat([gmap, players.flatten(1)], -1))))
    ent = torch.cat([entity, glob[:, None]], 1)
    bias = F.pad(m.rel2(F.relu(m.rel1(rel))).permute(0, 3, 1, 2), (0, 1, 0, 1))
    for block in m.blocks:
        q, k, v = block.qkv(block.ln1(ent)).reshape(b, n + 1, 3, 8, 24).permute(2, 0, 3, 1, 4).unbind(0)
        scores = (q @ k.transpose(-1, -2)) / (24 ** .5) + bias
        scores = scores.masked_fill(~x['entityMask'][:, None, None], -1e9)
        attention = scores.softmax(-1)
        ent = ent + block.proj((attention @ v).transpose(1, 2).reshape(b, n + 1, 192))
        ent = ent + block.ff2(F.relu(block.ff1(block.ln2(ent))))
    actor, tile, head, cls, target = x['ptr'].unbind(-1)
    bi = torch.arange(b, device=raw.device)[:, None]
    who = m.who(ent).squeeze(-1)
    query = m.tile_q(ent)
    keys = m.tile_k(fmap).flatten(2).transpose(1, 2)
    tile_keys = keys[bi, tile.clamp_min(0)] * (tile >= 0)[..., None]
    where = (query[bi, actor] * tile_keys).sum(-1) / 8
    semantics = m.what_entity(ent)[bi, actor] + m.what_tile(tile_keys)
    what = semantics.gather(-1, head[..., None]).squeeze(-1)
    what = what + semantics.gather(-1, (15 + cls.clamp_min(0))[..., None]).squeeze(-1) * (cls >= 0)
    tq = m.target_q(ent).reshape(b, n + 1, 4, 64)
    tk = m.target_k(ent).reshape(b, n + 1, 4, 64)
    head_index = torch.zeros(15, dtype=torch.long, device=raw.device); head_index[[1, 7, 8, 9]] = torch.arange(4, device=raw.device)
    hi = head_index[head]
    ts = (tq[bi, actor, hi] * tk[bi, target.clamp_min(0), hi]).sum(-1) / 8
    padded_rel = F.pad(rel.permute(0, 3, 1, 2), (0, 1, 0, 1)).permute(0, 2, 3, 1)
    ts = ts + (m.target_rel[hi] * padded_rel[bi, actor, target.clamp_min(0)]).sum(-1)
    logits = (who[bi, actor] + where + what + ts * (target >= 0) + m.headBias[head]).masked_fill(~x['actionMask'], -1e9)
    logprob = logits.log_softmax(-1)
    actor_prior = raw.new_zeros(b, n + 1).scatter_add(1, actor, logprob.exp())
    selected = (raw[:, :, 0] > .5)[:, None] & (raw[:, :, 24:30].transpose(1, 2) > .5)
    counts = selected.sum(-1)
    mean = (ent[:, None, :n] * selected[..., None]).sum(2) / counts.clamp_min(1)[..., None]
    maximum = ent[:, None, :n].expand(-1, 6, -1, -1).masked_fill(~selected[..., None], -1e9).max(2).values
    maximum = torch.where((counts > 0)[..., None], maximum, 0.)
    vectors = torch.cat([players, mean, maximum, ent[:, n, None].expand(-1, 6, -1), gmap[:, None].expand(-1, 6, -1)], -1)
    value_logits = m.value2(F.relu(m.value_norm(m.value1(vectors)))).squeeze(-1)
    army = players[:, :, 7].clamp_min(0) * x['active']
    value_logits = (value_logits + m.army_scale * army / army.sum(-1, keepdim=True).clamp_min(1e-12)).masked_fill(~x['active'], -1e9)
    return dict(logits=logits, logprob=logprob, actorPrior=actor_prior, valueLogits=value_logits, valueProbs=value_logits.softmax(-1))


def losses(out, x):
    rows = torch.arange(len(x['target']), device=x['target'].device)
    policy = -out['logprob'][rows, x['target']]
    actor = x['ptr'][rows, x['target'], 0]
    who = -out['actorPrior'][rows, actor].clamp_min(1e-30).log()
    value = -(x['valueTarget'] * out['valueLogits'].log_softmax(-1)).sum(-1)
    brier = (out['valueProbs'] - x['valueTarget']).square().mean(-1)
    pw = x['weight'] * x['quality']
    vw = x['weight'] * x['valueMask']
    total = ((policy + .25 * who) * pw).sum() / pw.sum().clamp_min(1e-12)
    total = total + ((value + brier) * vw).sum() / vw.sum().clamp_min(1e-12)
    return total, dict(policy=policy, who=who, value=value, brier=brier)


def collate(samples):
    sizes=[tuple(s['spatial'].shape[-2:]) for s in samples]
    height=((max(h for h,w in sizes)+3)//4)*4
    width=((max(w for h,w in sizes)+3)//4)*4
    padded=[]
    for row,(h,w) in zip(samples,sizes):
        item=dict(row)
        item['spatial']=F.pad(row['spatial'],(0,width-w,0,height-h))
        ptr=row['pointers'].clone()
        tile=ptr[:,1].clone()
        ptr[:,1]=torch.where(tile>=0,(tile//w)*width+tile%w,tile)
        item['pointers']=ptr
        padded.append(item)
    out=base_collate(padded)
    out['sizes']=torch.tensor(sizes,dtype=torch.long)
    return out
