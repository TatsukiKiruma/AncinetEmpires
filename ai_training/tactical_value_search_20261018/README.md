# 阶段4：集火、价值头与有界战术搜索

范围与预注册见[设计](DESIGN.md)、`preregister.json`、`selection.json`和`search-contract.json`。最终结论以`REPORT.md`、`BATTLES.md`及`DELIVERY_MANIFEST.json`为准，`TASK_STATE.json`只记录本阶段最近一次实际执行阶段。

所有命令从项目根目录运行，统一使用`node ai_training/run.mjs`。Python解释器为本机已安装PyTorch的`C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe`。不执行手机训练、ADB、模型晋升或应用接入。

入口顺序为`bootstrap.py`冻结选择与保全身份，`run_prepare.py`生成600父局分片与无损缓存，`gates.ts`/`parity.py`/`browser_runner.mjs`完成初始门禁，`pipeline.py`依次执行数据审计、策略训练、五类校准、同开发集比较、价值头训练、最佳数值门禁与200槽配对实战。Chrome需本机loopback访问权限，最佳浏览器收据生成前控制器会等待，不跳过门禁。

目录中的分片、模型、检查点、失败现场和中断前缀均应保留。入口拒绝覆盖已完成训练；恢复前核对退出收据和实际进程，不能仅凭状态文件宣称任务仍在运行。重新训练应创建独立输出目录。

`features.ts`只负责新增特征；`focus_threat.ts`负责可重放的三单位集火；`group_model.ts`和`value_model.ts`为独立TS前向/解析反向；`value_runtime.ts`为等价价值叶子快速路径；`model_battle_search_ai.ts`移植公共BattleSearchAI框架；`search.ts`只作评测适配；`policy_runtime.ts`与`leaf.ts`分别提供模型先验和叶子评估；`battle.ts`负责配对评测和strict重放。所有实际规则结算复用公共GameEngine。

本次原定9组校准未过，在保持门禁阈值不变后追加4组开发探索，选中wait=0.6/end=0.35；失败记录和追加协议全部保留。追加入口calibrate_extension.py复用完整缓存与原L-BFGS目标。已完成数据/策略且校准通过后，可用pipeline.py after-calibration继续后续阶段；恢复前仍需核对收据与实际进程，并保留原日志。

实际Value追加路径：train_value_army.py initialize/train（army-initial三端门禁在训练前完成）→calibrate_value_output.py（未过）→train_value_residual.py initialize/train（residual-initial三端门禁在拟合前完成）→pipeline.py after-value。原/追加MLP失败报告、所有候选及协议均保留。最终为285维输入、64维MLP基底加六个可学习军力跳连参数；策略骨干不变。

原四臂ApkLike实验显示Value重排与初版搜索有回退，静态审查发现通用Value接管没有强制用户要求的实际事件。因此追加独立事件守卫50槽，不替换原200。verified_gate.ts、response_verified_regression.ts best与purity_verified_gate.mjs通过后，plan_verified.py冻结相同初态/种子；complete_verified.py会等待complete_battles.py完成原200全量strict及归档前缀审计，再8并发追加50、6并发strict、summarize.py all汇总250。不得将两组实战并发启动到16进程，也不得在原200完成时提前调用deliver。所有新增判定仅看权威引擎真实事件和原NN分差，不调用HeuristicAI评分。
