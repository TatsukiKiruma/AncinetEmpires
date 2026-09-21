# v8 审查与后续任务包（资产索引）

审查提交：`6e7b7e22d36597369e75a5f21f743bd2f5faab93`。

## 说明

本目录原先包含 V8 任务书、执行补充和派工启动文件。这三份**指导性文档已按操作者要求删除**（它们是未跟踪文件，不属于仓库历史），其 SHA-256 与被删记录保存在：

```
docs/training/reports/agent_upgrade_20260922_v8_reeval_02/execution_manifest.json
  -> removedGuidanceDocuments
```

它们提出的全部约束（不自动 push、不改游戏规则、不替换默认 AI、不租算力）与 R8-01~R8-08 任务清单，已被承接至：

```
docs/training/reports/agent_upgrade_20260922_v8_reeval_02/NEXT_ACTION.md
docs/training/reports/agent_upgrade_20260922_v8_reeval_02/task-status.json
```

## 本目录保留的内容（缩减复现资产）

- `isolated_v7_contract_probes.cjs` 与 `isolated_probe_results.json`：独立缩减复现，**不是**完整仓库测试，也不是用户 checkpoint 测试。
  执行：`node isolated_v7_contract_probes.cjs output.json`
- `type_contract_probe.ts.txt`：有意错误的类型示例；保留 `.txt` 后缀以免被项目 tsconfig 自动编译。
- `type_contract_diagnostics.txt`：针对上述缩减示例的 tsc 输出，**不是**完整项目构建日志。
- `MANIFEST (2).json`：本包生成时的文件清单与 SHA-256（含已删三份指导文档的哈希，作为历史记录保留）。
