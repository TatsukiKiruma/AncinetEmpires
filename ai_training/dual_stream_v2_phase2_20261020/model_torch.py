"""双流阶段2：训练端网络；输入字节合同沿用阶段1。"""
import json
from pathlib import Path
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
import accurate_ops as ops

MODEL_ID = 'dual-stream-v2-phase2-v1'
TARGET_HEADS = [1, 7, 8, 9]


class ResBlock2D(nn.Module):
    def __init__(self, channels):
        super().__init__()
        rank = {48: 8, 64: 8, 96: 16}[channels]
        self.reduce = ops.Conv2d(channels, rank, 1)
        self.norm1 = ops.GroupNorm(8, rank)
        self.depth = ops.Conv2d(rank, rank, 3, padding=1, groups=rank)
        self.norm2 = ops.GroupNorm(8, rank)
        self.expand = ops.Conv2d(rank, channels, 1)
        self.norm3 = ops.GroupNorm(8, channels)

    def forward(self, x):
        z = F.relu(self.norm1(self.reduce(x)))
        z = F.relu(self.norm2(self.depth(z)))
        return F.relu(x + .5 * self.norm3(self.expand(z)))


class ResUNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.stem = ops.Conv2d(34, 48, 3, padding=1)
        self.stem_norm = ops.GroupNorm(8, 48)
        self.stage0 = nn.Sequential(ResBlock2D(48), ResBlock2D(48))
        self.down1 = ops.Conv2d(48, 64, 1)
        self.stage1 = nn.Sequential(ResBlock2D(64), ResBlock2D(64))
        self.down2 = ops.Conv2d(64, 96, 1)
        self.stage2 = nn.Sequential(ResBlock2D(96), ResBlock2D(96))
        self.context = ops.Linear(66, 96)
        self.up1 = ops.Conv2d(96, 64, 1)
        self.decode1 = ResBlock2D(64)
        self.up0 = ops.Conv2d(64, 48, 1)
        self.decode0 = ResBlock2D(48)
        self.out = ops.Conv2d(48, 64, 1)

    def forward(self, spatial, players):
        accurate = self.stem.accurate
        def pool(x):
            return F.avg_pool2d(x.double() if accurate else x, 2, ceil_mode=True).float()
        z0 = self.stage0(F.relu(self.stem_norm(self.stem(spatial[None]))))
        z1 = self.stage1(self.down1(pool(z0)))
        z2 = self.stage2(self.down2(pool(z1)))
        z2 = z2 + self.context(players.flatten())[None, :, None, None]
        # 固定倍数复制后按跳连尺寸截取，禁止隐式半像素插值。
        z = self.decode1(self.up1(z2.repeat_interleave(2, 2).repeat_interleave(2, 3)[..., :z1.shape[2], :z1.shape[3]]) + z1)
        z = self.decode0(self.up0(z.repeat_interleave(2, 2).repeat_interleave(2, 3)[..., :z0.shape[2], :z0.shape[3]]) + z0)
        fmap = self.out(z)[0]
        return fmap, ops.mean(fmap, (1, 2), accurate)


class RelationBlock(nn.Module):
    def __init__(self):
        super().__init__()
        self.ln1 = ops.LayerNorm(128)
        self.qkv = ops.Linear(128, 384)
        self.proj = ops.Linear(128, 128)
        self.ln2 = ops.LayerNorm(128)
        self.ff1 = ops.Linear(128, 256)
        self.ff2 = ops.Linear(256, 128)

    def forward(self, x, bias):
        t = x.shape[0]
        q, k, v = self.qkv(self.ln1(x)).reshape(t, 3, 4, 32).permute(1, 2, 0, 3).unbind(0)
        scores = ops.matmul(q, k.transpose(-1, -2), self.qkv.accurate)
        # 非二进制精确常数的除法也在double累加模式中完成，再回写float32。
        scores = (scores.double() / (32 ** .5)).float() if self.qkv.accurate else scores / (32 ** .5)
        attention = ops.softmax(scores + bias, -1, self.qkv.accurate)
        x = x + self.proj(ops.matmul(attention, v, self.qkv.accurate).transpose(0, 1).reshape(t, 128))
        return x + self.ff2(F.relu(self.ff1(self.ln2(x))))


class DualStreamModel(nn.Module):
    def __init__(self, seed=20261020):
        super().__init__()
        torch.manual_seed(seed)
        self.map = ResUNet()
        self.entity_proj = ops.Linear(130, 128)
        self.entity_norm = ops.LayerNorm(128)
        self.global_proj = ops.Linear(130, 128)
        self.global_norm = ops.LayerNorm(128)
        self.rel1 = ops.Linear(16, 16)
        self.rel2 = ops.Linear(16, 4)
        self.blocks = nn.ModuleList([RelationBlock(), RelationBlock()])
        self.who = ops.Linear(128, 1)
        self.tile_q = ops.Linear(128, 64)
        self.tile_k = ops.Conv2d(64, 64, 1)
        # 线性映射的拼接等于两个投影相加，按实体与地块预计算。
        self.what_entity = ops.Linear(128, 36)
        self.what_tile = ops.Linear(64, 36, bias=False)
        self.target_q = ops.Linear(128, 4 * 64)
        self.target_k = ops.Linear(128, 4 * 64)
        self.target_rel = nn.Parameter(torch.empty(4, 16))
        self.headBias = nn.Parameter(torch.zeros(15))
        self.value1 = ops.Linear(459, 128)
        self.value_norm = ops.LayerNorm(128)
        self.value2 = ops.Linear(128, 1)
        self.army_scale = nn.Parameter(torch.ones(1))
        for mod in self.modules():
            if isinstance(mod, (nn.Linear, nn.Conv2d)):
                nn.init.xavier_uniform_(mod.weight, gain=.5)
                if mod.bias is not None:
                    nn.init.zeros_(mod.bias)
        nn.init.xavier_uniform_(self.target_rel, gain=.5)

    def forward(self, sample):
        accurate = self.entity_proj.accurate
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
        where = ops.dot(query[actor], tile_keys, accurate) / 8
        semantics = self.what_entity(ent)[actor] + self.what_tile(tile_keys)
        what = semantics.gather(1, head[:, None]).flatten()
        what = what + semantics.gather(1, (15 + cls.clamp_min(0))[:, None]).flatten() * (cls >= 0)
        tq = self.target_q(ent).reshape(n + 1, 4, 64)
        tk = self.target_k(ent).reshape(n + 1, 4, 64)
        head_index = torch.zeros(15, dtype=torch.long, device=raw.device)
        head_index[TARGET_HEADS] = torch.arange(4, device=raw.device)
        hi = head_index[head]
        target_scores = ops.dot(tq[actor, hi], tk[target.clamp_min(0), hi], accurate) / 8
        padded_rel = F.pad(relations.permute(2, 0, 1), (0, 1, 0, 1)).permute(1, 2, 0)
        target_scores = target_scores + ops.dot(self.target_rel[hi], padded_rel[actor, target.clamp_min(0)], accurate)
        logits = who[actor] + where + what + target_scores * (target >= 0) + self.headBias[head]
        prior = ops.softmax(logits, 0, accurate)
        actor_prior = torch.zeros(n + 1, device=raw.device, dtype=torch.float64 if accurate else torch.float32).scatter_add(0, actor, prior.double() if accurate else prior).float()
        conditioned = torch.empty_like(prior)
        for actor_index in range(n + 1):
            mask = actor == actor_index
            if mask.any():
                conditioned[mask] = ops.softmax(logits[mask], 0, accurate)
        slot_vectors = []
        for slot in range(6):
            selected = ent[:n][(raw[:, 0] > .5) & (raw[:, 24 + slot] > .5)]
            mean = ops.mean(selected, 0, accurate) if len(selected) else ent.new_zeros(128)
            maximum = selected.max(0).values if len(selected) else ent.new_zeros(128)
            slot_vectors.append(torch.cat([players[slot], mean, maximum, ent[n], gmap]))
        value_logits = self.value2(F.relu(self.value_norm(self.value1(torch.stack(slot_vectors))))).flatten()
        army = players[:, 7].clamp_min(0) * sample['active']
        if accurate:
            value_logits = (value_logits.double() + self.army_scale.double() * army.double() / army.double().sum().clamp_min(1e-12)).float()
        else:
            value_logits = value_logits + self.army_scale * army / army.sum().clamp_min(1e-12)
        value_logits = value_logits.masked_fill(~sample['active'].bool(), -1e9)
        value_probs = ops.softmax(value_logits, 0, accurate) * sample['active']
        return dict(logits=logits, actorPrior=actor_prior, conditionalPrior=conditioned, valueLogits=value_logits,
                    valueProbs=value_probs, who=who, spatial=fmap, entities=ent)

    def accurate_reductions(self, enabled=True):
        for module in self.modules():
            if hasattr(module, 'accurate'):
                module.accurate = enabled
        return self

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
