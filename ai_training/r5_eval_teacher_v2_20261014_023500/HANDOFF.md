# T07–T12 阶段交接文档 (HANDOFF.md)

- **交接日期**：2026-10-14
- **工作区绝对路径**：`C:\code\AncinetEmpires\ai_training\r5_eval_teacher_v2_20261014_023500`
- **规则版本**：`apk-4.2.5.1-rules-20261013-r4`
- **交付包 SHA-256**：`323924ab76a8272322f4b122d64e4af4ff2574a85c6a4d996bf4cb9680bffea8`
- **阶段核心裁决**：Gate B **FAIL**。已完整归档证据与 10 份失败回放，**严禁启动学生蒸馏或大规模数据生产**。

---

## 1. 交付物结构索引

全部产物仅存在于本独立工作区，主项目代码和历史资产 100% 零修改：

```
ai_training/r5_eval_teacher_v2_20261014_023500/
├── env/                            # 冻结的权威规则与基线 AI (285 项单测 100% PASS)
├── research/                       # 全新实现与审计修正的研究基础设施与测试
│   ├── action_protocol.ts          # 动作语义编码与候选集构建
│   ├── candidate_selector.ts       # 探索配额保证与确定性候选选择器 (T08)
│   ├── openings.ts                 # 真实换手开局生成器 (零静默回退，T07)
│   ├── statistics.ts               # 分层 Bootstrap 95% CI 与全轨迹 SHA-256 哈希 (T07)
│   ├── match_runner.ts             # 严格裁判与硬超时监管器
│   ├── match_runner.test.ts        # 严格裁判与 1,157 步重放测试 (PASS)
│   ├── outcomes.ts                 # 自然终局与精细截断分类协议
│   ├── evaluate.ts                 # 配对竞技场调度与分层抽样评测器
│   ├── evaluate.test.ts            # 开局与分层统计单测 (PASS)
│   ├── search_teacher_v1.ts        # 修复版基准 v1 搜索教师 (统一相位，完整 Trace，T08)
│   ├── search_teacher_v1.test.ts   # 搜索教师正确性与边界测试 (PASS)
│   ├── state_evaluator_v2.ts       # 支持真实地形通行成本与控图的叶值评估器 (T10)
│   └── search_teacher_v2.ts        # 最终冻结搜索教师 v2 实现 (T10/T11)
├── configs/
│   └── scenario_split.json         # 赛场划分 (Train / Dev / 隔离图 / 封存图)
├── eval/
│   ├── tactical_suite_original.json # 旧版 44 题战术用例套件 (保留历史法定口径)
│   └── tactical_suite_v2.json       # 修订版 54 题战术套件 (含 10 题独立 OOD 回归)
├── artifacts/
│   ├── source_manifest.json        # 交付包文件与主项目受保护文件基线清单
│   ├── tactical_diagnosis.json     # 战术题逐题归因诊断数据
│   ├── t10_ablation_results.json   # 6 组单变量消融实验完整实测记录
│   ├── frozen_candidate_manifest.json # 冻结候选教师、赛制与停止规则清单
│   ├── gate_b_verdict.json         # Gate B 正式裁决 JSON (FAIL)
│   └── failed_replays/             # 10 份代表性失败/截断对局的完整轨迹回放 (JSON)
├── reports/
│   ├── T07_REPORT.md               # 证据、裁判与评测协议审计报告
│   ├── T08_REPORT.md               # 搜索正确性、预算与可复现性报告
│   ├── T09_REPORT.md               # 战术题审计与候选覆盖诊断报告
│   ├── T10_REPORT.md               # Teacher v2 单变量改进报告
│   ├── T11_REPORT.md               # 开发集筛选与候选冻结报告
│   └── T12_REPORT.md               # Gate B 正式复验报告
├── TASK_PLAN.md                    # 阶段任务计划书
├── AUDIT_REPORT.md                 # 历史缺陷审计与更正报告
├── EXPERIMENT_REPORT.md            # 单变量改进与消融实验报告
├── STAGE_REPORT.md                 # 最终阶段总报告
├── HANDOFF.md                      # 本移交文档
├── reproduce.ps1                   # 一键自动化回归复现脚本
├── evidence_manifest.json          # 全部证据文件 SHA-256 清单
├── stage_status.json               # 机器可读的阶段状态与准入判定
└── cleanup_report.json             # 进程与受保护文件完整性审计
```

---

## 2. 复现验证指南

在宿主 Windows/PowerShell 环境下，执行：
```powershell
cd C:\code\AncinetEmpires\ai_training\r5_eval_teacher_v2_20261014_023500
.\reproduce.ps1
```

该脚本将自动执行：
1. `npm test` 在独立环境下回归 285 项规则测试；
2. 运行 `match_runner.test.ts` 验证 1,157 步精确重放与进程硬超时；
3. 运行 `evaluate.test.ts` 验证真实换手开局与分层 Bootstrap 统计；
4. 运行 `features.test.ts` 验证特征契约与 Golden 样本 100% 重建；
5. 运行 `search_teacher_v1.test.ts` 验证统一相位与边界鲁棒性；
6. 校验 14 个受保护核心文件的 SHA-256，验证零污染。

---

## 3. 剩余问题与后续建议

### 3.1 剩余核心难点
仅依赖“规则基线前向展开 + 手工启发式叶值”的浅层搜索教师，无法突破战棋游戏固有的“守势价值陷阱”与长盘拉锯超时，无法战胜冻结规则 AI。

### 3.2 下一步行动禁令与建议
1. **严格禁令**：由于 Gate B **FAIL**，依《AncientEmpires AI 战略方案》硬性规定，**严禁启动学生网络蒸馏或大规模数据生产**。
2. **后续建议**：
   - 若要实现根本破局，需跳出纯规则推演展开的浅层教师框架，探索基于神经网络的价值网络评估（如轻量级离线拟合值函数引导搜索），或引入深度强化学习自对弈（Self-Play MCTS）；
   - 保留本阶段全部严格裁判、真实换手开局生成器与分层 Bootstrap 评测协议，作为未来一切新算法的法定试金石。
