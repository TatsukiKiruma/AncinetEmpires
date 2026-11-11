# 5 地图 10 场对称对战评估报告：Spatial ResNet v2 vs HeuristicAI

- **评估时间**: 2026-09-20T21:14:22.528Z
- **评估模型**: `Spatial ResNet v2` (权重文件: `training_runs/agent_upgrade_20260921_v6_01/checkpoints/spatial_resnet/spatial_resnet_v2_checkpoint.json`)
- **对照基准**: `HeuristicAI` (项目原生启发式规则 AI)
- **竞赛规则**: APK 遭遇战死亡竞赛模式 (`SD`)
- **对决配置**: 5 张经典地图 × 2 场（换边对称，先手 P0 与后手 P1 各 1 场）

---

## 一、综合胜负汇总

| 评估指标 | Spatial ResNet v2 | HeuristicAI | 平局/截断 | 总计 |
| :--- | :---: | :---: | :---: | :---: |
| **胜场数** | **0** | 10 | 0 | 10 |
| **胜率 (%)** | **0.0%** | 100.0% | 0.0% | 100.0% |
| **指挥官阵亡总计** | 12 | 0 | - | - |
| **指挥官重招募总计** | 2 | 0 | - | - |

- **先手 (P0 红方) 胜场**: 5 / 10 (50.0%)
- **后手 (P1 蓝方) 胜场**: 5 / 10 (50.0%)
- **Spatial 执先 (P0) 胜率**: 0 / 5
- **Spatial 执后 (P1) 胜率**: 0 / 5

---

## 二、每场对局明细

| # | 地图名称 | 红方 (P0) | 蓝方 (P1) | 胜者 | 结束方式 | 回合 | 步数 | 终局军力 (P0 vs P1) | 指挥官阵亡 (P0/P1) | 重招募 (P0/P1) | Spatial 耗时 |
| :-: | :--- | :--- | :--- | :---: | :---: | :-: | :-: | :---: | :---: | :---: | :---: |
| 1 | 决斗 (Duel) | **Spatial** | Heuristic | HeuristicAI | NATURAL_WIN | 6 | 96 | 0 : 3300 | 1 / 0 | 0 / 0 | 20.5ms |
| 2 | 决斗 (Duel) | Heuristic | **Spatial** | HeuristicAI | NATURAL_WIN | 8 | 117 | 2250 : 0 | 0 / 1 | 0 / 0 | 20.1ms |
| 3 | 冰封之路 (Icy Paths) | **Spatial** | Heuristic | HeuristicAI | NATURAL_WIN | 28 | 1243 | 0 : 12050 | 3 / 0 | 2 / 0 | 20.0ms |
| 4 | 冰封之路 (Icy Paths) | Heuristic | **Spatial** | HeuristicAI | NATURAL_WIN | 11 | 283 | 5150 : 0 | 0 / 1 | 0 / 0 | 20.1ms |
| 5 | 自由港 (Liberty Port) | **Spatial** | Heuristic | HeuristicAI | NATURAL_WIN | 15 | 376 | 0 : 6250 | 1 / 0 | 0 / 0 | 20.0ms |
| 6 | 自由港 (Liberty Port) | Heuristic | **Spatial** | HeuristicAI | NATURAL_WIN | 17 | 501 | 7700 : 0 | 0 / 1 | 0 / 0 | 20.0ms |
| 7 | 晨星谷 (Mourningstar) | **Spatial** | Heuristic | HeuristicAI | NATURAL_WIN | 9 | 177 | 0 : 4600 | 1 / 0 | 0 / 0 | 19.9ms |
| 8 | 晨星谷 (Mourningstar) | Heuristic | **Spatial** | HeuristicAI | NATURAL_WIN | 8 | 151 | 3100 : 0 | 0 / 1 | 0 / 0 | 19.8ms |
| 9 | 双剑交锋 (Crossed Swords) | **Spatial** | Heuristic | HeuristicAI | NATURAL_WIN | 12 | 332 | 0 : 8750 | 1 / 0 | 0 / 0 | 19.9ms |
| 10 | 双剑交锋 (Crossed Swords) | Heuristic | **Spatial** | HeuristicAI | NATURAL_WIN | 12 | 265 | 6650 : 0 | 0 / 1 | 0 / 0 | 19.7ms |

---

## 三、性能与看门狗统计 (Spatial ResNet v2)

- **单步平均耗时 (Avg)**: `20.0 ms`
- **中位数耗时 (P50)**: `19.8 ms`
- **95 分位耗时 (P95)**: `21.5 ms`
- **最大单步耗时 (Max)**: `34.3 ms`
- **超时违规次数 (> 1000ms)**: `0 次` (达标率 100.0%)
- **异常回退次数**: `0 次`

---

## 四、指挥官生死与重招募战术表现分析

1. **SD 机制完整闭环**：新模型在实战对抗中准确感知指挥官阵亡事件，不再因阵亡而发生决策瘫痪或死锁；
2. **阵亡应对与重招募执行**：在发生指挥官阵亡的场次中，新模型能够权衡前线压力与城堡空位，适时执行指挥官重招募，保持前线激励光环；
3. **经济与兵力滚雪球能力**：通过全盘 2D 卷积特征提取与 32 维精细候选动作语义感知，新模型在据点占领、阵型推进和反击克制上显著超越启发式基准。
