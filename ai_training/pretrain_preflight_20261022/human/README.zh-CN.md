# 真人前缀验收及二次过滤

`accept.ts`复用权威解析、动作展开、GameEngine、合法候选和状态摘要；完整回放与合法前缀分别准入。前缀证据逐原子保存`beforeHash/afterHash`、有序候选索引/摘要、macro/subAction及原始macro摘要，并从实存gzip重新读取、从原始响应重展开和重建。没有APK逐状态或自然终局见证，Value和return始终关闭。

初次2077是相对既有阶段3排重的前缀策略候选，其中真人控制者615。现已按`DATA_SPLITS.exclusionIndexes`绑定的14份真实索引完成全集过滤：4,222,726个唯一状态摘要中命中0条，最终仍保留2077条。最终收据为`human/filters/20261021T222122207549Z/result.json`，主索引为上级`HUMAN_DATA_INDEX_FINAL.json`。完整回放准入仍为0，Value/return关闭。

项目根目录执行：

```powershell
node ai_training/run.mjs node --openssl-legacy-provider --import tsx pretrain_preflight_20261022/human/accept.ts
python ai_training/pretrain_preflight_20261022/human/prepare_prefix_candidates.py
python ai_training/pretrain_preflight_20261022/human/filter_prefix.py --data-splits C:\code\AncinetEmpires\ai_training\pretrain_preflight_20261022\DATA_SPLITS.json
```

`PREFIX_CANDIDATE_MANIFEST.json`绑定`PREFIX_CANDIDATE_ROWS.jsonl.gz`的SHA。每行包含：

- `canonicalBeforeHash`：权威`ruleStateHash`，排除metadata，其余实值规则字段及数组顺序均参与规范摘要。
- `sourceStateHash`：兼容旧阶段3读取器的`sha256(JSON.stringify(state))`。
- `responseSha256/parentKey/atomic/macro/subAction/actionCode`：样本及动作映射身份。
- `packet.path/sha256/jsonlLine`：原始前缀证据的绝对路径、压缩SHA和解压后1起行号；包头为第1行，原子0为第2行。

二次过滤只读取指定状态摘要全集并核验每份文件SHA，不重新进行历史或游戏规则扫描。`DATA_SPLITS.exclusionIndexes`须为`[{"path":"绝对路径","sha256":"文件SHA256"}]`，也支持相对DATA_SPLITS目录的路径。每份可为gzip或普通文本，内容支持逐行64位SHA、SHA数组、`{"hashes":[...]}`或含明确状态哈希字段的JSONL。候选的任一状态摘要命中即永久排除。

每次二次过滤新建`human/filters/<UTC时间>/`，输出`admitted.jsonl.gz`、`excluded.jsonl.gz`及`result.json`；绑定DATA_SPLITS身份、输入候选、每份全集SHA、最终准入/排除数量。不会改写早先验收收据。主任务负责保证DATA_SPLITS已包含全部约定来源，再将该次结果作为最终训练准入。

`runs/2026-10-21T20-19-30-058Z`因验收期间下载器源码变化未封存；`runs/2026-10-21T20-23-59-821Z`记录前缀JSON序列化键省略检查的失败；`runs/2026-10-21T20-25-12-770Z`为修复后正式逐前态重建证据。三个尝试均保留。`checks/`保存最终TypeScript检查与5项回归日志。
