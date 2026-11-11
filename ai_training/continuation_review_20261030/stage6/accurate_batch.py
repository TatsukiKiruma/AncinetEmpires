"""沿用阶段三异尺寸地图边界，仅将归约和舍入边界对齐TypeScript运行时。"""
import torch
from torch.nn import functional as F
import ragged_map
from ragged_batch import collate
import accurate_ops as ops


def norm(x, module, mask):
    b, c, h, w = x.shape
    z = x.double().reshape(b, module.num_groups, c // module.num_groups, h, w)
    valid = mask[:, None].double()
    denominator = (mask.double().sum((2, 3)) * (c // module.num_groups))[:, None, :, None, None]
    mean = (z * valid).sum((2, 3, 4), keepdim=True) / denominator
    variance = ((z.square() * valid).sum((2, 3, 4), keepdim=True) / denominator - mean.square()).clamp_min(0)
    out = ((z - mean) / (variance + module.eps).sqrt()).reshape(b, c, h, w)
    return ((out * module.weight.double()[None, :, None, None] + module.bias.double()[None, :, None, None]) * mask).float()


def pool(x, mask):
    return (F.avg_pool2d(x.double(), 2) / F.avg_pool2d(mask.double(), 2).clamp_min(.25)).float()


# 只在第四阶段独立服务进程中替换数值原语，第三阶段文件保持逐字节不变。
ragged_map.norm = norm
ragged_map.pool = pool


def forward_batch(m, x, value_only=False):
    spatial, raw, players = x['spatial'], x['raw'], x['players']
    rel = x['rel'].clamp(-4, 4)
    b, n, _ = raw.shape
    fmap, _ = ragged_map.map_forward(m.map, spatial, players, x['sizes'])
    gmap = (fmap.double().sum((2, 3)) / (x['sizes'][:, 0] * x['sizes'][:, 1])[:, None]).float()
    scale = torch.ones(66, device=raw.device); scale[33:35] = 1 / 64
    bi = torch.arange(b, device=raw.device)[:, None]
    local = fmap.permute(0, 2, 3, 1)[bi, raw[:, :, 34].long(), raw[:, :, 33].long()]
    entity = F.relu(m.entity_norm(m.entity_proj(torch.cat([(raw * scale).clamp(-4, 4), local], -1))))
    glob = F.relu(m.global_norm(m.global_proj(torch.cat([gmap, players.flatten(1)], -1))))
    ent = torch.cat([entity, glob[:, None]], 1)
    bias = F.pad(m.rel2(F.relu(m.rel1(rel))).permute(0, 3, 1, 2), (0, 1, 0, 1))
    for block in m.blocks:
        q, k, v = block.qkv(block.ln1(ent)).reshape(b, n + 1, 3, 8, 24).permute(2, 0, 3, 1, 4).unbind(0)
        scores = (ops.matmul(q, k.transpose(-1, -2), True).double() / (24 ** .5)).float() + bias
        attention = ops.softmax(scores.masked_fill(~x['entityMask'][:, None, None], -1e9), -1, True)
        ent = ent + block.proj(ops.matmul(attention, v, True).transpose(1, 2).reshape(b, n + 1, 192))
        ent = ent + block.ff2(F.relu(block.ff1(block.ln2(ent))))
    if value_only:
        logits = raw.new_empty(b, 0)
        actor_prior = raw.new_empty(b, 0)
    else:
        actor, tile, head, cls, target = x['ptr'].unbind(-1)
        who = m.who(ent).squeeze(-1)
        query = m.tile_q(ent)
        keys = m.tile_k(fmap).flatten(2).transpose(1, 2)
        tile_keys = keys[bi, tile.clamp_min(0)] * (tile >= 0)[..., None]
        where = ops.dot(query[bi, actor], tile_keys, True) / 8
        semantics = m.what_entity(ent)[bi, actor] + m.what_tile(tile_keys)
        what = semantics.gather(-1, head[..., None]).squeeze(-1)
        what = what + semantics.gather(-1, (15 + cls.clamp_min(0))[..., None]).squeeze(-1) * (cls >= 0)
        tq = m.target_q(ent).reshape(b, n + 1, 4, 64)
        tk = m.target_k(ent).reshape(b, n + 1, 4, 64)
        head_index = torch.zeros(15, dtype=torch.long, device=raw.device); head_index[[1, 7, 8, 9]] = torch.arange(4, device=raw.device)
        hi = head_index[head]
        ts = ops.dot(tq[bi, actor, hi], tk[bi, target.clamp_min(0), hi], True) / 8
        padded_rel = F.pad(rel.permute(0, 3, 1, 2), (0, 1, 0, 1)).permute(0, 2, 3, 1)
        ts = ts + ops.dot(m.target_rel[hi], padded_rel[bi, actor, target.clamp_min(0)], True)
        logits = (who[bi, actor] + where + what + ts * (target >= 0) + m.headBias[head]).masked_fill(~x['actionMask'], -1e9)
        prob = ops.softmax(logits, -1, True)
        actor_prior = raw.new_zeros(b, n + 1, dtype=torch.float64).scatter_add(1, actor, prob.double()).float()
    selected = (raw[:, :, 0] > .5)[:, None] & (raw[:, :, 24:30].transpose(1, 2) > .5)
    counts = selected.sum(-1)
    mean = ((ent[:, None, :n].double() * selected[..., None]).sum(2) / counts.clamp_min(1)[..., None]).float()
    maximum = ent[:, None, :n].expand(-1, 6, -1, -1).masked_fill(~selected[..., None], -1e9).max(2).values
    maximum = torch.where((counts > 0)[..., None], maximum, 0.)
    vectors = torch.cat([players, mean, maximum, ent[:, n, None].expand(-1, 6, -1), gmap[:, None].expand(-1, 6, -1)], -1)
    value_logits = m.value2(F.relu(m.value_norm(m.value1(vectors)))).squeeze(-1)
    army = players[:, :, 7].clamp_min(0).double() * x['active']
    value_logits = (value_logits.double() + m.army_scale.double() * army / army.sum(-1, keepdim=True).clamp_min(1e-12)).float().masked_fill(~x['active'], -1e9)
    return dict(logits=logits, actorPrior=actor_prior, valueLogits=value_logits, valueProbs=ops.softmax(value_logits, -1, True))
