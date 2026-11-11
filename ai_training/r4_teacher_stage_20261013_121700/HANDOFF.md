# r4 规则下的新 AI 研究基础与搜索教师阶段交接文档 (HANDOFF.md)

- **交接日期**：2026-10-13
- **工作区绝对路径**：`C:\code\AncinetEmpires\ai_training\r4_teacher_stage_20261013_121700`
- **规则版本**：`apk-4.2.5.1-rules-20261013-r4`
- **独立环境交付包 SHA-256**：`323924ab76a8272322f4b122d64e4af4ff2574a85c6a4d996bf4cb9680bffea8`
- **阶段核心结论**：研究环境、裁判与数据协议完全可靠（Gate A **PASS**）；搜索教师未能达到 Gate B 资格门槛（Gate B **FAIL**），具备完备证据与失败样本，**不具备**进入新数据生产与学生训练资格。

---

## 1. 交付物结构索引

本项目严格遵守安全隔离边界，全部产物仅存在于本独立工作区，主项目代码和历史资产零污染：

```
ai_training/r4_teacher_stage_20261013_121700/
├── env/                            # 从干净环境 ZIP 解压的只读冻结环境
│   ├── package.json
│   ├── src/                        # 冻结的权威规则与基线 AI (HeuristicAI, ApkLikeAI)
│   └── ...
├── research/                       # 全新实现的严格研究基础设施与测试
│   ├── action_protocol.ts          # 动作语义编码与解码器
│   ├── candidate_selector.ts       # 根动作覆盖与多样性候选选择器
│   ├── evaluate.ts                 # 配对对局竞技场与分层 Bootstrap 95% CI 统计
│   ├── evaluate.test.ts            # 配对评测统计单测 (PASS)
│   ├── feature_schema.ts           # 状态、实体、动作与 4 种 Mask 的契约定义
│   ├── features.ts                 # 权威特征提取器与动作/实体张量化
│   ├── features.test.ts            # 特征提取与重建一致性单测 (PASS)
│   ├── match_runner.ts             # 严格裁判与回合调度器（防吞错、防代理判胜）
│   ├── match_runner.test.ts        # 严格裁判、1157步重放与超时杀进程测试 (PASS)
│   ├── outcomes.ts                 # 自然终局判断与异常分类协议
│   ├── policy_worker.ts            # 支持硬超时强制杀灭的策略子进程 Worker
│   ├── search_teacher.ts           # 根候选试走统一行动相位搜索教师
│   ├── search_teacher.test.ts      # 搜索教师行为与消融单测 (PASS)
│   ├── state_evaluator.ts          # 固定 root 观察者联盟视角的叶值评估器
│   └── state_hash.ts               # 确定性状态哈希生成器 (SHA-256)
├── configs/
│   └── scenario_split.json         # 赛场划分（Train / Dev / Test 封存 / 隔离图）
├── eval/
│   └── tactical_suite.json         # 44 道严格战术题套件 (32 验收题 + 12 诊断题)
├── artifacts/
│   ├── source_manifest.json        # 交付包 62 文件哈希与 14 个主项目文件基线哈希
│   ├── environment.json            # 宿主系统软硬件环境规格与依赖版本
│   ├── features-v1.json            # 权威特征规范 (SHA256: 711019e84844...)
│   ├── golden/
│   │   └── golden_samples.json     # 269 份可完全精确重建的 Train/Dev Golden 样本
│   ├── gate_a.json                 # Gate A 工程正确性、微基准与 Pilot 判定
│   ├── ablation_results.json       # 5 组消融实验（战术题 + Arena Pilot）完整数据
│   ├── gate_b_verdict.json         # Gate B 资格正式裁决（FAIL，包含全部统计与门槛审核）
│   ├── failed_replays/             # 代表性失败与截断对局的完整轨迹回放记录 (JSON)
│   └── commands.jsonl              # 阶段所有环境命令、耗时、退出码记录
├── reports/
│   ├── T00_REPORT.md               # 环境解压与依赖构建报告
│   ├── T01_REPORT.md               # 严格裁判与 1000+ 步重放测试报告
│   ├── T02_REPORT.md               # 赛场划分与 44 道战术题套件报告
│   ├── T03_REPORT.md               # 特征表示与 269 Golden 样例重建报告
│   ├── T04_REPORT.md               # 微基准、算子验证与 Gate A 报告
│   ├── T05_REPORT.md               # 搜索教师实现报告
│   └── T06_REPORT.md               # 消融实验与 Gate B 教师资格判定报告
├── STAGE_REPORT.md                 # 完整阶段总报告与核心问题解答
├── HANDOFF.md                      # 本移交文档
├── reproduce.ps1                   # 一键全量验证与复现脚本
├── evidence_manifest.json          # 全部研究资产与受保护主项目文件的 SHA-256 清单
├── stage_status.json               # 阶段完成状态与下一阶段资格判定
└── cleanup_report.json             # 进程清理与临时数据归档审计
```

---

## 2. 核心特征规范与数据协议

- **特征协议 Schema 文件**：[features-v1.json](file:///C:/code/AncinetEmpires/ai_training/r4_teacher_stage_20261013_121700/artifacts/features-v1.json)
- **协议哈希**：`711019e84844d2b3a2f14e557ce8735efbf6ce98ceaf5c7d26d86ffae94fb658`
- **主要张量规范**：
  - `spatial_features`: `[C=28, H=15, W=15]` 空间特征平面（包含真实地形加成、城堡扣血、墓碑、视野、所有权）
  - `global_features`: `[D=16]` 全局标量特征（金币、人口、步数、行动相位、联盟编号）
  - `entity_features`: `[N=64, F=24]` 离散实体特征（完整保留同一格叠放单位、pending 状态、超上限 HP、致盲与状态标记）
  - `action_mask_spatial`: `[A_spatial=6, H=15, W=15]`
  - `action_mask_global`: `[A_global=4]` (包括 `end_turn` 等)
  - `action_mask_entity`: `[N=64, A_entity=12]`
  - `full_legal_candidates`: 完整字符串编码数组，绝不对 256 做静默截断。

---

## 3. 复现验证指南

在宿主 Windows/PowerShell 环境下，执行：
```powershell
cd C:\code\AncinetEmpires\ai_training\r4_teacher_stage_20261013_121700
.\reproduce.ps1
```

该脚本会自动执行：
1. `npm test` 在独立环境下回归 285 项规则测试；
2. 运行 `match_runner.test.ts` 验证 1,157 步精确重放与进程硬超时；
3. 运行 `evaluate.test.ts` 验证 Bootstrap 置信区间统计；
4. 运行 `features.test.ts` 验证特征契约与 Golden 样本 100% 精确重建；
5. 运行 `search_teacher.test.ts` 验证搜索教师核心行为与消融配置；
6. 比对主项目 14 个核心文件的 SHA-256，验证零污染。

---

## 4. 下一阶段推进建议 (基于 Gate B FAIL 结论)

由于当前搜索教师未达标（截断率过高、保守胜率未达 60%），**严禁直接启动大规模数据生产或盲目蒸馏学生网络**。
建议后续工作聚焦于以下方向进行单变量改进：
1. **宏观推进偏置 (Pushing Incentive)**：当前的叶值评估函数偏向守势（守家和守城镇有正收益），缺乏对敌方纵深防御线压迫和阵地推移的评估，导致双方均选择安全龟缩而截断。需引入控图面积（Voronoi 领地权重）或距离敌方城堡/指挥官的距离势场。
2. **多步换手展开 (Multi-Handoff Rollout)**：当前的试走仅模拟一次对手回应到下次行动相位，在战棋长线拉锯中深度不足以看到致命胜负。
3. **引入引导先验 (Prior Policy Guidance)**：探索分支若无先验概率分布引导，仅靠规则 heuristic top-1 容易错失战术组合拳。
