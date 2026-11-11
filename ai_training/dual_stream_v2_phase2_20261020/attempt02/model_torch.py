"""双流阶段2：训练端网络；输入字节合同沿用阶段1。"""
import json
from pathlib import Path
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

MODEL_ID = 'dual-stream-v2-phase2-v1'
TARGET_HEADS = [1, 7, 8, 9]


class ResBlock2D(nn.Module):
    def __init__(self, channels):
        super().__init__()
        rank = {48: 16, 64: 16, 96: 24}[channels]
        self.reduce = nn.Conv2d(channels, rank, 1)
        self.norm1 = nn.GroupNorm(8, rank)
        self.depth = nn.Conv2d(rank, rank, 3, padding=1, groups=rank)
        self.norm2 = nn.GroupNorm(8, rank)
        self.expand = nn.Conv2d(rank, channels, 1)
        self.norm3 = nn.GroupNorm(8, channels)

    def forward(self, x):
        z = F.relu(self.norm1(self.reduce(x)))
        z = F.relu(self.norm2(self.depth(z)))
        return F.relu(x + .5 * self.norm3(self.expand(z)))


class ResUNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.stem = nn.Conv2d(34, 48, 3, padding=1)
        self.stem_norm = nn.GroupNorm(8, 48)
        self.stage0 = nn.Sequential(ResBlock2D(48), ResBlock2D(48))
        self.down1 = nn.Conv2d(48, 64, 1)
        self.stage1 = nn.Sequential(ResBlock2D(64), ResBlock2D(64))
        self.down2 = nn.Conv2d(64, 96, 1)
        self.stage2 = nn.Sequential(ResBlock2D(96), ResBlock2D(96))
        self.context = nn.Linear(66, 96)
        self.up1 = nn.Conv2d(96, 64, 1)
        self.decode1 = ResBlock2D(64)
        self.up0 = nn.Conv2d(64, 48, 1)
        self.decode0 = ResBlock2D(48)
        self.out = nn.Conv2d(48, 64, 1)

    def forward(self, spatial, players):
        z0 = self.stage0(F.relu(self.stem_norm(self.stem(spatial[None]))))
        z1 = self.stage1(self.down1(F.avg_pool2d(z0, 2, ceil_mode=True)))
        z2 = self.stage2(self.down2(F.avg_pool2d(z1, 2, ceil_mode=True)))
        z2 = z2 + self.context(players.flatten())[None, :, None, None]
        # 固定倍数复制后按跳连尺寸截取，禁止隐式半像素插值。
        z = self.decode1(self.up1(z2.repeat_interleave(2, 2).repeat_interleave(2, 3)[..., :z1.shape[2], :z1.shape[3]]) + z1)
        z = self.decode0(self.up0(z.repeat_interleave(2, 2).repeat_interleave(2, 3)[..., :z0.shape[2], :z0.shape[3]]) + z0)
        fmap = self.out(z)[0]
        return fmap, fmap.mean((1, 2))


class RelationBlock(nn.Module):
    def __init__(self):
        super().__init__()
        self.ln1 = nn.LayerNorm(128)
        self.qkv = nn.Linear(128, 384)
        self.proj = nn.Linear(128, 128)
        self.ln2 = nn.LayerNorm(128)
        self.ff1 = nn.Linear(128, 256)
        self.ff2 = nn.Linear(256, 128)

    def forward(self, x, bias):
        t = x.shape[0]
        q, k, v = self.qkv(self.ln1(x)).reshape(t, 3, 4, 32).permute(1, 2, 0, 3).unbind(0)
        attention = (q @ k.transpose(-1, -2) / (32 ** .5) + bias).softmax(-1)
        x = x + self.proj((attention @ v).transpose(0, 1).reshape(t, 128))
        return x + self.ff2(F.relu(self.ff1(self.ln2(x))))


class DualStreamModel(nn.Module):
    def __init__(self, seed=20261020):
        super().__init__()
        torch.manual_seed(seed)
        self.map = ResUNet()
        self.entity_proj = nn.Linear(130, 128)
        self.entity_norm = nn.LayerNorm(128)
        self.global_proj = nn.Linear(130, 128)
        self.global_norm = nn.LayerNorm(128)
        self.rel1 = nn.Linear(16, 16)
        self.rel2 = nn.Linear(16, 4)
        self.blocks = nn.ModuleList([RelationBlock(), RelationBlock()])
        self.who = nn.Linear(128, 1)
        self.tile_q = nn.Linear(128, 64)
        self.tile_k = nn.Conv2d(64, 64, 1)
        # 线性映射的拼接等于两个投影相加，按实体与地块预计算。
        self.what_entity = nn.Linear(128, 36)
        self.what_tile = nn.Linear(64, 36, bias=False)
        self.target_q = nn.Linear(128, 4 * 64)
        self.target_k = nn.Linear(128, 4 * 64)
        self.target_rel = nn.Parameter(torch.empty(4, 16))
        self.headBias = nn.Parameter(torch.zeros(15))
        self.value1 = nn.Linear(459, 128)
        self.value_norm = nn.LayerNorm(128)
        self.value2 = nn.Linear(128, 1)
        self.army_scale = nn.Parameter(torch.ones(1))
        for mod in self.modules():
            if isinstance(mod, (nn.Linear, nn.Conv2d)):
                nn.init.xavier_uniform_(mod.weight, gain=.5)
                if mod.bias is not None:
                    nn.init.zeros_(mod.bias)
        nn.init.xavier_uniform_(self.target_rel, gain=.5)

    def forward(self, sample):
        spatial, raw, relations, players = (sample[k].float() for k in ['spatial', 'entities', 'relations', 'players'])
        n = len(raw)
        fmap, gmap = self.map(spatial, players)
        # 缩放发生在网络内部；保持阶段1原始坐标、空间采样和槽位不变。
        scale = torch.ones(66, device=raw.device); scale[33:35] = 1 / 64
        tokens = (raw * scale).clamp(-4, 4)
        relations = relations.clamp(-4, 4)
        local = fmap[:, raw[:, 34].long(), raw[:, 33].long()].T
        entities = F.relu(self.entity_norm(self.entity_proj(torch.cat([tokens, local], 1))))
        global_token = F.relu(self.global_norm(self.global_proj(torch.cat([gmap, players.flatten()]))))
        ent = torch.cat([entities, global_token[None]], 0)
        bias = F.pad(self.rel2(F.relu(self.rel1(relations))).permute(2, 0, 1), (0, 1, 0, 1))
        for block in self.blocks:
            ent = block(ent, bias)
        ptr = sample['pointers'].long()
        actor, tile, head, cls, target = ptr.unbind(1)
        who = self.who(ent).flatten()
        query = self.tile_q(ent)
        keys = self.tile_k(fmap[None])[0].flatten(1).T
        tile_keys = keys[tile.clamp_min(0)] * (tile >= 0)[:, None]
        where = (query[actor] * tile_keys).sum(1) / 8
        semantics = self.what_entity(ent)[actor] + F.linear(tile_keys, self.what_tile.weight)
        what = semantics.gather(1, head[:, None]).flatten()
        what = what + semantics.gather(1, (15 + cls.clamp_min(0))[:, None]).flatten() * (cls >= 0)
        tq = self.target_q(ent).reshape(n + 1, 4, 64)
        tk = self.target_k(ent).reshape(n + 1, 4, 64)
        head_index = torch.zeros(15, dtype=torch.long, device=raw.device)
        head_index[TARGET_HEADS] = torch.arange(4, device=raw.device)
        hi = head_index[head]
        target_scores = (tq[actor, hi] * tk[target.clamp_min(0), hi]).sum(1) / 8
        padded_rel = F.pad(relations.permute(2, 0, 1), (0, 1, 0, 1)).permute(1, 2, 0)
        target_scores = target_scores + (self.target_rel[hi] * padded_rel[actor, target.clamp_min(0)]).sum(1)
        logits = who[actor] + where + what + target_scores * (target >= 0) + self.headBias[head]
        prior = logits.softmax(0)
        actor_prior = torch.zeros(n + 1, device=raw.device).scatter_add(0, actor, prior)
        conditioned = prior / actor_prior[actor].clamp_min(1e-30)
        slot_vectors = []
        for slot in range(6):
            selected = ent[:n][(raw[:, 0] > .5) & (raw[:, 24 + slot] > .5)]
            mean = selected.mean(0) if len(selected) else ent.new_zeros(128)
            maximum = selected.max(0).values if len(selected) else ent.new_zeros(128)
            slot_vectors.append(torch.cat([players[slot], mean, maximum, ent[n], gmap]))
        value_logits = self.value2(F.relu(self.value_norm(self.value1(torch.stack(slot_vectors))))).flatten()
        army = players[:, 7].clamp_min(0) * sample['active']
        value_logits = value_logits + self.army_scale * army / army.sum().clamp_min(1e-12)
        value_logits = value_logits.masked_fill(~sample['active'].bool(), -1e9)
        value_probs = value_logits.softmax(0) * sample['active']
        return dict(logits=logits, actorPrior=actor_prior, conditionalPrior=conditioned, valueLogits=value_logits,
                    valueProbs=value_probs, who=who, spatial=fmap, entities=ent)

    def export(self, destination):
        destination = Path(destination)
        data, entries = [], []
        offset = 0
        for name, tensor in self.state_dict().items():
            arr = tensor.detach().cpu().numpy().astype('<f4')
            data.append(arr.tobytes())
            entries.append(dict(name=name, shape=list(arr.shape), offset=offset, length=arr.size))
            offset += arr.size
        destination.with_suffix('.bin').write_bytes(b''.join(data))
        metadata = dict(model=MODEL_ID, schema='dual-stream-v2-phase1-v1', dtype='float32-le', parameters=offset, tensors=entries)
        destination.with_suffix('.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
        return metadata
