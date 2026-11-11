# AncientEmpires 独立审计与后续计划包

本包只包含本次审计结果、证据摘录、复核脚本和未执行的计划。没有训练权重、没有新增训练、没有新增arena对局。基于2026-10-14上传快照，不声称覆盖仓库外更新。

## 文件

- `AncientEmpires_独立审计与训练路线.md`：中文完整结论、工作核实、瓶颈与路线。
- `AGENT_后续任务合同.md`：执行agent分阶段合同、预算、验收、停止和失败分流。
- `agent_plan.json`：同一任务依赖与上限的机器可读版本。
- `EVIDENCE.md`：原始路径、行号、SHA和证据等级。
- `evidence/`：本次重算/重放/反例的JSON结果。
- `audit_tools/`：仅用于只读复核，不会执行训练。

## 复核

依赖Python 3、Node.js及可通过`npm root -g`找到的TypeScript。脚本不会自动安装依赖。TS loader仅在内存中转译原文件，适配import.meta路径样板，不修改项目字节。

在本包目录中，PowerShell示例（将解压目录换成实际路径，输出目录不能位于原源目录内）：

```powershell
python .\audit_tools\audit_snapshot.py "D:\AncientEmpires-audit-source" ".\evidence_rerun"
node .\audit_tools\replay_audit.cjs "D:\AncientEmpires-audit-source" ".\evidence_rerun\replay_audit.json"
node .\audit_tools\fixture_audit.cjs "D:\AncientEmpires-audit-source" ".\evidence_rerun\fixture_audit.json"
```

回放审计重放的仅是10份现存记录，共1043步，不是新增竞技评测。fixture审计只执行小型固定状态反例；零rollout反例局部固定Math.random以隔离回退逻辑，不能把该测试视为生产教师已完成全链seed修复。60实体测试为合成容量测试，不声称该状态已在正式轨迹出现。

`fixture_audit.json`的provenOptimal仅复述原题库标记，不替它背书。自定义计时会随复核机器改变，但原回放中记录的决策耗时不会重新测量。

原上传ZIP SHA256：`6b475d64baeaf2bfd0dbbee71bcdeda9911ab911d6d5febb34aa50a2e380fc2a`。
原干净环境ZIP SHA256：`323924ab76a8272322f4b122d64e4af4ff2574a85c6a4d996bf4cb9680bffea8`。
