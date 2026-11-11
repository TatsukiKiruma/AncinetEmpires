# T04: 基线、性能与 Gate A 判定报告

- **执行日期**：2026-10-13
- **工作区绝对路径**：`C:\code\AncinetEmpires\ai_training\r4_teacher_stage_20261013_121700`
- **规则版本**：`apk-4.2.5.1-rules-20261013-r4`
- **工程状态判定**：**PASS**
- **算力环境判定**：**AVAILABLE_CPU_ONLY**（CPU 运行，不阻断 CPU 搜索教师验证）

---

## 1. 初态、中局、残局微基准分解

在 3 张典型地图（Duel、Liberty Port、Icy Paths）上采集了 240 次连续决策与引擎调用，统计真实延迟分位数（单位：毫秒）：

| 操作类型 | 均值 (mean) | p50 中位数 | p95 分位数 | p99 分位数 | 说明 |
|---|---|---|---|---|---|
| `engine.clone()` | 0.15 ms | 0.10 ms | 0.41 ms | 0.44 ms | 内存结构轻量，深拷贝极快 |
| `getLegalActions()` | 0.12 ms | 0.08 ms | 0.38 ms | 0.67 ms | 规则生成迅速 |
| `HeuristicAI` 决策 | 20.28 ms | 7.30 ms | 89.27 ms | 158.64 ms | 全候选启发式打分，受单位数影响 |
| `ApkLikeAI` 决策 | 5.85 ms | 2.90 ms | 19.91 ms | 26.85 ms | 调度更轻，速度更快 |
| 特征张量编码 | 0.61 ms | 0.47 ms | 1.34 ms | 1.66 ms | 空间/实体/全局/动作统一编码 |
| 规范状态哈希计算 | 0.32 ms | 0.23 ms | 0.76 ms | 0.85 ms | 稳定 JSON 序列化与 SHA-256 |
| 进程 RSS 内存 | 128.1 MB | - | - | - | 内存占用极其健康，远低于上限 |

## 2. 冻结基线配对 Pilot 对弈（20 对 / 40 局）

在 `(2) Duel.aem`、`(2) Liberty Port.aem`、`(2) Swamplands.aem`、`(2) Icy Paths.aem` 四张地图上，针对 `frozen_heuristic` vs `frozen_apklike` 各执行 5 对配对局（每对包含正反手交换，共 40 局）：

- **总对局数**：40 局（20 对配对赛）
- **运行错误数 (Errors)**：**0**（无非法动作、无崩溃、无 silent fallback）
- **自然胜负分布**：
  - `HeuristicAI` 自然胜：**20 局**
  - `ApkLikeAI` 自然胜：**1 局**
  - 规则自然平局：**0 局**
- **截断局数 (Truncations)**：**19 局**（占 47.5%，因 150 次换手上限触发）
- **有效独立轨迹数**：40 / 40（轨迹多样性 100%，无重复死循环复跑）
- **基线实力定性**：在自然终局中 HeuristicAI 取得 20:1 绝对统治性胜率，**确认 `HeuristicAI` 为本项目当前显著更强的冻结基线**，Gate B 将以其为核心比对标杆！

## 3. PyTorch 模型算子 Smoke 测试

- **执行设备**：CPU (`cpu`, AMD64 16 logical cores)
- **算子链路**：Conv2d (残差空间流) + Entity MLP + Global MLP + Action Scorer
- **前向与反向耗时**：112.41 ms / batch (B=4)
- **数值健康性**：CrossEntropy Loss 有限，梯度无 NaN/Inf，优化器权重正常更新，状态 **PASS**。

## 4. Gate A 正式决策与推荐参数

- **工程闭环状态**：**PASS**（T00–T03 全通过，0 错误，哈希可重放）；
- **GPU 状态**：**AVAILABLE_CPU_ONLY**；
- **后续教师与并行预算建议**：
  - 离线单步模拟步数：`maxSimulationSteps: 100`；
  - 根候选数量：`targetK: 4` 起步；
  - 推荐单机进程并发度：4 workers；
  - 允许正式进入 T05 与 T06 验证阶段！
