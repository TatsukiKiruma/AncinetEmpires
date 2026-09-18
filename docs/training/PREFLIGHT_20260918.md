# 2026-09-18 兼容性核对与小规模试训

后续补充：训练器已增加校验、训练与验证的实时进度。该日志变更会改变源码指纹，但不改变训练语义；本报告中的指纹对应补充前的快照。正式启动命令及验证说明见 [FORMAL_TRAINING_COMMAND.md](FORMAL_TRAINING_COMMAND.md)。

## 结论

第 1、2 步已通过：当前代码与完整归档数据兼容，数据读取、训练、模型保存、加载和对局流程正常。可以进入正式基线训练；本次模型仅为试训产物，不替换游戏默认模型，也不代表正式模型强度。

## 数据与版本证据

- 完整清单：`training_runs/server_archive_20260913/dataset/manifest.json`。
- 数据集 ID：`025ea72a667ff9b130db436b2d6c12beb02d7ef3eccf9081378fe6f2da43f0f8`。
- 本地生成器指纹与清单一致：`f317d56b7f2624c5e687c5f1ea008e241f3add9b8af32f3e08a31a83da8ce005`。
- 只读下载云端部署源码并按 `deployment_manifest.json` 逐文件核对：177 个文件与本地完全相同，包括游戏规则、引擎、教师策略、特征提取、候选采样及训练器。差异仅为服务器流水线入口；本地缺少服务器专用 `planned_jobs.jsonl`、`server_offloaded_migrate.ts`，不影响本地训练。
- 部署快照和比较清单：`training_runs/preflight_20260918/deployed-source/`、`source-comparison.json`。没有覆盖本地源码或修改云端服务。

## 工程与规则门槛

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm test` | 35 个文件、429 个测试全部通过 |
| `npm run build` | 通过 |
| APK language-rule / skirmish-rule / unit / terrain / script / map / dex / training 报告 | 8 项 `--check` 全部通过 |
| forced APK 回放 | 125 个输入文件，去重后 112/112 通过；重复跳过 13，失败 0，解析错误 0 |

类型检查最初将训练归档中的独立源码副本当作工程源码，造成相对依赖缺失。已在 `tsconfig.json` 的 `exclude` 中加入 `training_runs`，实际应用源码与 `tools` 仍正常接受类型检查。未修改游戏规则、特征算法或训练逻辑。

回放沿用既有 forced 验收范围；120 个唯一回放的覆盖目标仍缺 8 个样本，既有 strict 诊断分歧未作为本次阻塞条件。

## 试训结果

通过正式 `--dataset-manifest` 入口读取完整清单，入口首先执行完整数据验证；训练取按清单顺序的前 5,000 条训练样本及前 1,000 条验证样本，运行 1 epoch，learning-rate=0.1、objective=label、4096 维、hashed-action-v3、64 候选。

- 训练过程动作匹配率 35.92%，验证集动作匹配率 22.60%。训练指标为在线更新过程统计，不是训练结束后重新评估训练集。
- 两个集合跳过样本均为 0。
- 模型 `training_runs/preflight_20260918/smoke-bc.json` 已保存，4,096 个权重全部有限，非零权重 1,556；数据集 ID 和特征配置均正确。
- 模型 SHA256：`403cff1611e7effbf8c5ec3fefe6ec01d5c9b0e1dbdccab483b560946c75b955`。
- 该抽样用于流程验证，不覆盖 19 个方案的完整分布，指标不能外推为正式模型性能。

## 模型加载与对局

使用 `bc-vs-heuristic`，seed=20260918、max-turns=150，在 `SD:(2) Duel.aem` 和 `SD:(2) Crossed swords.aem` 各运行 1 局。

- 模型由 runner 正常加载并参与实际动作选择。
- 2 局全部自然结束；非法动作、超时、步数保护停止和停滞停止均为 0。
- BC 试训模型 0 胜 2 负，均输给启发式 AI；这只能确认执行流程通过，不能作为上线依据。
- 未运行正式全量训练或 120 局性能评估，未替换游戏默认模型。

## 证据目录与复现

所有本次产物在 `training_runs/preflight_20260918/`：`summary.json` 为机器可读总报告，`smoke-train.json` 为训练报告，`smoke-play.json` 为对局汇总，`smoke-episodes.jsonl` 为两局完整记录，`forced-replay.json` / `.md` 为规则回放结果，其余 `.log` 为工程与 APK 检查日志。

以下命令从工程根目录执行；再次试训时应改用新的输出目录，避免覆盖本次基线。

```powershell
node --openssl-legacy-provider --import tsx tools/skirmish_bc_train.ts --dataset-manifest training_runs/server_archive_20260913/dataset/manifest.json --feature-dim 4096 --feature-extractor hashed-action-v3 --max-candidates 64 --epochs 1 --limit-train-samples 5000 --limit-val-samples 1000 --out training_runs/preflight_20260918/smoke-bc.json --json
node --openssl-legacy-provider --import tsx tools/skirmish_training_runner.ts --preset bc-vs-heuristic --model training_runs/preflight_20260918/smoke-bc.json --mode SD --scenario 'SD:(2) Duel.aem' --scenario 'SD:(2) Crossed swords.aem' --episodes 1 --seed 20260918 --max-turns 150 --workers 2 --out training_runs/preflight_20260918/smoke-episodes.jsonl --no-temp-log --no-progress --json
```

下一步：使用同一完整数据集训练独立的正式基线模型，取消样本上限，再进行多地图、多随机种子和先后手对照评估。保留本次试训及历史模型，不以本次两局结果决定正式策略。
