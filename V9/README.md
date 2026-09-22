# Ancient Empires V9 审查与执行包

审查分支：`path-b-spatial-ai`。固定提交：`e95b65366186dc55482d5db77346936aaf255ae6`。日期：2026-09-22。

## 文件

| 文件 | 用途 |
|---|---|
| `AncinetEmpires_AI_Review_and_Agent_Taskbook_20260922_v9.md` | 完整诊断、当前进度、V9-00～10任务、测试与训练验收标准 |
| `AGENT_START_PROMPT_v9.txt` | 直接交给agent的执行指令 |
| `agent_tasks_v9.json` | 机器可读的任务依赖和初始TODO状态 |
| `evidence_manifest.json` | 固定提交源路径、证据等级和审查边界 |
| `reviewed_metrics.json` | 从仓库报告整理的训练/评测数字，不是本次复跑 |
| `isolated_contract_probes_v9.cjs` | 四个源码公式/特征投影的独立检查 |
| `isolated_probe_results.json` | 本次独立检查输出 |
| `SHA256SUMS.txt` | 包内文件校验和（不包含该校验和文件自身） |

## 使用

把本目录放到项目根目录，或将任务书、任务清单和证据清单放到根目录，然后把启动指令全文发给agent。旧V8文件和历史工件不需要删除；agent按新任务书核对当前源码并继续执行。

运行独立检查：

```bash
node isolated_contract_probes_v9.cjs
```

检查会写入/更新同目录的 `isolated_probe_results.json`，重跑后的时间戳会使原校验和变化。这是正常行为；需要保留包内原始结果时，给出第二个参数指定新的输出路径。

```bash
node isolated_contract_probes_v9.cjs probe_results_rerun.json
```

## 边界

本次仅只读审查远端仓库并编写任务包，未修改GitHub代码、未push、未执行完整游戏对局或训练、未检查用户电脑正在运行的训练进程。仓库报告数字与本次独立检查已分开标记。

独立检查只验证四个源码局部问题：v1招募特征碰撞、地图/金币绑定、指挥官保留字段哈希遗漏、候选配额可被挤占。它们不是原项目回归测试，也不能替代真实模型评测。

下一轮agent必须将这些反例变成对真实模块的测试，统一训练、评测和前端模型身份，再开展有效数据扩量和学习曲线验证。
