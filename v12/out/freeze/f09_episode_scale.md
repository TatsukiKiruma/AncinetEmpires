# F09 补充证据：空间训练集的真实规模是"几十局"，不是"几万样本"

生成时间：2026-09-23 · runId `agent_upgrade_v12_b1`
原始数据：`v12/out/freeze/f09_split_leakage.txt`、`v12/out/freeze/f09_input_episodes.txt`
脚本：`v12/tools/audit_split_leakage.py`、`v12/tools/audit_input_episodes.py`（只读，不改数据）

---

## 1. 结论一：train/val 100% 同局泄漏（已实测证明）

对 `training_runs/spatial_dataset/spatial_train_scaled_30k.jsonl`（30,000 条）：

```
with rootFamilyId   : 0/30000
with episodeId      : 0/30000
non-null valueTarget: 20/30000  (0.067%)

trainer 实际分组    : 500 组，每组恰好 60 行（f"ep_{idx // 60}" 回退分支）
每个合成组混合的真实局数: min=1 max=2 mean=1.04
split (seed=42, val_split=0.1): train=27000 rows / val=3000 rows
val 中其所在局也出现在 train 的**行数**: 3000/3000 = 100.0%
```

因为 `rootFamilyId` 与 `episodeId` 都不存在，`python/train_spatial_resnet.py:480` 走了回退分支：

```python
ep_id = sample.get("rootFamilyId") or sample.get("episodeId") or f"ep_{idx // 60}"
```

于是"分组切分"退化成**按 60 行定长切块**。样本按局顺序写入，一个局跨多个 60 行块，
所以 val 里的每一行，其所属局都同时出现在 train 里。

**因此：V10/V11 报告过的 `val_acc ≈ 48.6%`、`OOD top-1 ≈ 29.5%` 不是泛化指标，是同局记忆读数。**

`valueTarget` 只有 20 条非空，正是"每局只在最后一步赋值"的直接后果。

---

## 2. 结论二（更重要）：整个空间训练输入池只有约 64 局

`episodeIndex` 在**每一条记录上都存在**（`missing_episodeIndex = 0`），所以下面的计数不是缺字段造成的假象：

| 文件 | 记录数 | 不同 episode key |
|---|---:|---:|
| `dataset_part_pvp.jsonl` | 25,884 | **20** |
| `dataset_part_00.jsonl` | 2,800 | 1 |
| `dataset_part_01.jsonl` | 2,800 | 1 |
| `dataset_part_02.jsonl` | 2,800 | 2 |
| `dataset_part_03.jsonl` | 2,800 | 1 |
| `dataset_part_04.jsonl` | 2,800 | 2 |
| `dataset_part_05.jsonl` | 1,122 | 2 |
| `dataset_part_08.jsonl` | 2,800 | 1 |
| `baseline_dataset.jsonl` | 48,714 | **37** |
| **合计** | **92,520** | **约 64**（跨文件键可能重叠） |

单个"局"的记录数极大：`dataset_part_pvp.jsonl` 里 episode 2 独占 **2,964** 条，episode 18 占 2,690 条。
这正是转换器注释里写的"真实人类 PvP 回放 **2.58万步**"——是 **步**，不是局。

而当前的 30,000 条空间样本 = `pvp`(25,884) + `part_00`(2,800) + `part_01` 的前 1,316 条
（25,884 + 2,800 + 1,316 = 30,000，与 `TARGET_SAMPLES` 上限精确吻合）。
即：**30,000 条样本来自约 22 局。**

---

## 3. 这对"扩大规模"意味着什么（修正前一版的建议）

前一版把 T12-04（提高 `TARGET_SAMPLES`、纳入 `baseline_dataset.jsonl`）列为高性价比杠杆。**这个判断需要修正。**

| 口径 | 现在 | 全池 | 倍数 |
|---|---:|---:|---:|
| 样本行数 | 30,000 | 92,520 | **3.1×** |
| 真实局数 | ~22 | ~64 | **~2.9×** |
| 独立轨迹多样性 | ~22 局 | ~64 局 | ~2.9× |

**行数与局数同步只涨约 3 倍，而且基数是个位数的十位量级。** 对一个要泛化的策略网络，
决定性的量是**独立对局轨迹数**，不是行数。把 22 局扩到 64 局仍然是"几十局"。

所以真正的数据杠杆是 **T12-05：把 1395 局（乃至服务器 2500 局）SD episodes 经 verified replay 转成空间样本**——
那才是数量级不同的轨迹多样性来源。T12-04 仍然值得做（免费、3 倍、且必须修 F09），
但它应当被明确定位为"**修正确性 + 小幅扩容**"，而不是"数据规模化"。

同时这也解释了一个此前的疑问：为什么 `val_acc 48.6%` 看起来"不算太差"却完全没有棋力——
因为它在记 22 局棋，而真实对局是另外的棋。

---

## 4. 未验证 / 边界

- 上表"约 64"是**按文件分别计数后相加**，`episodeIndex` 在每个输入文件内重新计数，
  因此跨文件键可能重叠，实际独立局数**可能少于 64**。精确的全局去重需要比较
  `scenario.id + seed + episodeIndex` 的全局集合——由 T12-04 的去重报告给出。
- `baseline_dataset.jsonl` 与 `dataset_part_*.jsonl` 是否互为超集/子集尚未确认，
  需 T12-04 的去重报告判定；本文件不做可加性假设。
- 本文只陈述**实测到的计数与切分行为**，不推断模型能力上限。
