# 双流资产与缓存清理审计

本报告前半为清理前只读审计；实际执行结果与删后保全回执见文末。没有启动训练。

核验时间：2026-10-21T20:19:26.726079+00:00。逐文件SHA-256核验24482份、合计2,362,815,237字节。审计前C盘空闲69,370,163,200字节（64.61 GiB）。

| 范围 | 文件 | 字节 |
|---|---:|---:|
| dual_stream_v2_phase1_20261020 | 36 | 20,565,537 |
| dual_stream_v2_phase2_20261020 | 91 | 25,070,388 |
| dual_stream_v2_phase3_20261020 | 557 | 142,677,637 |
| dual_stream_v2_phase4_20261020 | 844 | 81,646,454 |
| dual_stream_v2_phase5_20261020 | 19224 | 1,652,832,624 |
| dual_stream_v2_phase6_20261022 | 79 | 47,121,111 |
| dual_stream_v2_gen02_20261021 | 3008 | 212,663,875 |

## 模型保全

识别48组schema/权重配对，29种不同网络张量状态；安全解析22份检查点。全部模型文件与有效不同小模型保留，未晋升和失败尝试不构成删除理由。

每个完整包按schema、权重、同目录checkpoint、外置校准及训练身份/协议计量；100MB为100,000,000字节。全部小于门槛：True。父模型和数据/源码是共享引用，不复制入包。真实参数按张量shape逐项复算、校验offset/length、二进制字节数和有限性；检查点记录优化器、游标/RNG、来源身份及父权重SHA。详见MODEL_REGISTRY.json。

发现1186组字节相同文件；完整列出路径、SHA和物理文件身份，未把重复内容直接列为清理对象。

## 可执行清理候选

共2176文件、132,063,532字节（125.95 MiB）逻辑大小；实际释放量须由执行方实测。

| 类别 | 文件 | 字节 |
|---|---:|---:|
| evaluation-rule-cache | 2158 | 131,803,746 |
| python-bytecode | 18 | 259,786 |

规则缓存逐份解压核对schema、文件名身份、原动作轨迹SHA与现行排重索引包含关系；2158/2159份通过。未通过的缓存保留，细节见CLEANUP_MANIFEST.json/ruleCacheAudit。CPython缓存仅在原.py源文件实存时列入。

现行及历史排重索引共16份全部保留。post_evaluation_audit.ts、isolation_phase51.ts、isolation_phase52.ts与checkpoint/dataIdentity按索引内容SHA恢复训练输入，不能把evaluation-index-history与evaluation-exclusions当作缓存清理。阶段5.1两个校准归档也按历史清单SHA保留。

## 执行与删后保全核验

CLEANUP_MANIFEST.json/candidates提供绝对路径、原大小、原SHA、理由、重建说明与源轨迹。执行方仅用PowerShell Remove-Item -LiteralPath逐文件删除，预先校验所有父路径没有重解析点且位于allowedRoots；不递归删除目录。

```powershell
& 'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe' -X utf8 ai_training/pretrain_preflight_20261022/asset_inventory.py --verify --allow-cleaned
```

该入口重新核验ASSET_MANIFEST.json记录的全部文件；只容许CLEANUP_MANIFEST.json精确候选缺失，任何保留文件缺失或内容/大小变化均返回非零退出码。仍存在的候选也必须SHA相符。--verify不改清单；可通过--verification-output另存执行回执。

## 范围与限制

七个主目录全部实存普通文件，另含Phase 6交付清单明确文件、阶段5.1缓存归档和主入口第一层源码导入；不递归扩展到整个旧研究或来源封存库。
不遍历支持链接、APK、node_modules、captures或归档重解析点。对外部封存来源及全部历史版本不作完整审计声明。现存历史哈希引用只登记，不改写旧路径或将旧源码身份强行替换为当前版本。

## 精确历史依赖增补

另加入162份精确引用、2,991,569字节；最终保全清单为24644份、2,365,806,806字节。未扩大旧目录，也没有增加清理项。

## 需保留的特殊项

2,159份规则缓存中2,158份符合安全条件；其余1份虽然状态哈希均已进入当前索引，但原轨迹SHA在本范围无对应原件，故保留。18份有源文件的Python字节码列入候选。16份现行/历史排重相关文件共919,634,122字节全部保留，其中index-regression-6kqZJo下一个文件名SHA故意与内容不符，是evaluation_index_regression.ts写入的坏副本拒绝夹具，不是实存训练索引损坏。

## 已执行结果（北京时间2026-10-22 04:24）

`execute_cleanup.ps1 -Execute` 在全体文件与1,867个保留依赖摘要核验后执行逐文件删除，完整删除2,176份、132,063,532字节（125.95 MiB）；失败或跳过0份。未删除任何目录，也未递归处理链接。

执行采用的冻结清单SHA-256为 `6b951f2ca0687e01f3bab5cd58573afe263f58bd65bde9acddc76e255cd13dbd`。逐项删除回执为 `cleanup-deletion-ledger.jsonl`，摘要见 `CLEANUP_RESULT.json`。删除前后C盘可用空间分别68,884,598,784和69,017,759,744字节，观察到增加133,160,960字节（126.99 MiB）。这是磁盘实测变化，包含同时发生的系统/评测写入影响，不能把它等同于132,063,532字节逻辑文件大小或精确归因的物理释放量。

删后严格零变化回执为 `asset-verification-after-cleanup.json`，其中唯一变化是用户明确要求更新的 `ai_training/status/CURRENT.md`，所以原始 `passed=false` 如实保留。另由 `ASSET_PRESERVATION_RESULT.json` 核对：22,468份保留文件中22,467份SHA完全不变；CURRENT去掉本次唯一新增条目后，62,469字节历史内容的SHA与原清单完全一致，并保存为 `CURRENT-before.md`。意外变化0、缺失0、不安全路径0。清理清单保持执行前字节身份，不改写为执行结果。

最终模型登记还包括1份自含JSON历史对比小模型。22份checkpoint分为12份完整网络与10份局部策略参数恢复包，22份优化器均安全解析、所有参数有限；局部包同时登记父模型SHA。完整双流包最大42,795,346字节。检查点明确声明的数据/源码输入SHA均能在当前资产或保留快照中定位；不把当前源码变化改写为旧源码身份。脚本语法解析与四份JSON结构读取通过，候选路径与排重保全路径交集为零。
