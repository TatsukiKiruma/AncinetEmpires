# 重大发现：SD 训练归档的胜负**主要由预设的策略分配决定**，不是由棋力决定

- runId `agent_upgrade_v12_b1` · 2026-09-24 · 基线 `9c6c1ab`
- 触发：查"我用的种子/座位是否有问题"时，反过来查到了归档本身
- 脚本：`v12/tools/diag_seat_asymmetry.py`、`v12/tools/diag_winner_vs_policy.py`（只读）
- 原始输出：`v12/out/training/seat_asymmetry.txt`、`winner_vs_policy.txt`

---

## 1. 现象：31 个场景里 26 个"≤2 个不同胜者"，多个只有 1 个

扫全部 11 个 episode 文件、1,003 条有胜负记录的对局，按场景统计 `winnerAlliance`：

| 场景 | n | 胜者分布 |
|---|---:|---|
| `sd-normal:(2) Liberty Port.aem` | 15 | **a1:15（100%）** |
| `sd-normal:(2) Swamplands.aem` | 15 | **a1:15（100%）** |
| `sd-normal:(4) Solitude.aem` | 16 | **a1:16（100%）** |
| `sd-normal:(2) Peak Island.aem` | 12 | **a1:12（100%）** |
| `sd-normal:(2) Crossed swords.aem` | 11 | **a1:11（100%）** |
| `sd-normal:(3) Midway.aem` | 11 | **a1:11（100%）** |
| `sd-normal:(2) The Crossing.aem` | 10 | **a1:10（100%）** |
| `sd-3p-normal-extra:(3) Midway.aem` | 22 | **a1:22（100%）** |
| `sd-normal:(4) Crossroads.aem` | 20 | a2:16 a3:4（**a0/a1 一局未胜**） |
| `sd-normal:(2) Duel.aem` | 17 | a0:5 a1:12 |

**26 / 31 个场景只有 ≤2 个不同胜者。**

---

## 2. 机制：胜者是不是 `heuristic` 玩家，决定了 3/4 的结果

把每条记录的 `policyByPlayer` 与 `winnerAlliance` 对上：

```
records analysed                : 1003
winner was a `heuristic` player : 755 (75.27%)
winner was an `apk-like` player : 248 (24.73%)
```

逐场景同样一边倒，例如 `sd-normal:(2) Icy Paths.aem`：heuristic 19 胜 / apk-like 1 胜；
`sd-3p-normal-extra:(3) Glu.aem`：heuristic 33 / apk-like 3；
`sd-normal:(2) Mourningstar.aem`：heuristic 15 / apk-like 0。

**所以这些对局的胜负在很大程度上是"这个座位分到了 heuristic 还是 apk-like"决定的。**
这与 SD 交接文档自己记录的"heuristic 裁定胜率 65% vs apk-like 35%"方向一致，
实际在这个归档里更极端（75/25）。

---

## 3. 为什么这是重大发现

### 3.1 它很可能是项目长期 0% 胜率的真正解释

如果评估协议是"让神经网络顶替 `apk-like` 那个座位去打 `heuristic` 座位"，
那么**它在结构上就要输掉约 3/4 的对局，与网络本身好坏无关**。
这与历史上"每个空间策略都是 0/10、0/40"完全吻合。

**这个 0% 更可能是评估/数据协议缺陷，而不是模型缺陷。** 我以前几轮把它读作"模型弱"，
现在看至少有很大一部分是协议造成的。

### 3.2 它污染了价值标签

价值标签由 `winnerAlliance` 决定。既然胜者主要由策略分配决定，
那么 value 标签学到的很大一部分是"这个座位是不是 heuristic 座位"，而不是"这一步下得好不好"。
这解释了 T12-04 里 `valueTarget` 的极端偏斜（**+1 占 80.2%**，−1 占 19.8%）——
在 4 人自由混战里本应接近 25/75 或 50/50。

### 3.3 它反过来解释了 BattleSearchAI 为什么能出成绩

> **⚠️ 本节第 3 条已于后续任务被更正。** 我原先写"BattleSearchAI 的 17/20 是在 `(2) Duel.aem`、
> **启发式内战镜像 2–2（无座位偏向）** 下取得的"——**这句话是错的**：
> 我引用的 `mirror_baselines.json` 只有 **4 局**（2–2），统计力不足以断言"无偏向"。
> 后续用全启发式镜像重测 `createDefaultAppGameState()` 的 Duel：**n=10 → P1 8 / P0 2**，
> 另一组独立种子 **n=8 → P1 7 / P0 1**。**Duel 有很强的 P1 偏向。**
> **17/20 依然成立，但理由不同**：两个座位各打 10 局，纯座位效应上界只有 10/20，造不出 17/20。
> 详见 `v12/V12_FOLLOWUP_REPORT.md` §3.1。

BattleSearchAI 的 17/20 是在 **`(2) Duel.aem`** 上取得的（座位偏向的更正见上）。
—— 一个干净的 1v1 交替座位对照，**没有这个混淆**。
所以"BattleSearchAI 比我们的模型好"这个结论**不受本次发现影响**，
反而因为协议干净而更可信。

---

## 4. 对"预算是否转化为棋力"的最终影响

**我此前所有基于 `(4) Crossroads` 的对局结论全部作废**（§2.1–§2.3 已标注）：
- 该场景在归档里 **a0/a1 一局未胜**，而我的模型只坐过 P0/P1；
- 我用启发式镜像验证了这一点：四个座位全启发式时，**P2 在 7/7 自然终局里全胜**（p≈0.006%）。

**所以"模型 0/4"既不证明也不否认任何事。** 预算是否转化为棋力，**目前没有有效读数**。

---

## 5. 下一步（按优先级）

1. **先修评估协议**，再谈任何棋力：
   - 用**镜像配对**：同 seed 下"模型坐 P*s* vs 启发式"与"四座位全启发式"逐座位对比；
   - 或者干脆换到**无座位偏向**的场景（`sd-normal:(2) Duel.aem` 的镜像基线是 2–2，
     但归档里 heuristic/apk-like 仍是 12/5，所以要先跑启发式内战镜像确认）；
   - 评估时必须**交替座位**并报告每座位分别的胜率。
2. **重估整个 SD 归档作为训练数据的价值**：如果胜负主要由策略分配决定，
   它作为**胜率/价值**来源是低质的；作为**动作模仿**来源仍可用，但要知道模仿的是谁。
3. **检查历史评估协议**（v6 五图基准等）是否也有同类混淆 —— 那些结果很可能同样被污染。
4. 未查证：为什么 `heuristic` 能稳定压过 `apk-like`（开局？经济？），以及
   `sd-normal:(2) Duel.aem` 上 heuristic 只赢 5/17 而 apk-like 赢 12/17 的反向情况是怎么回事。
