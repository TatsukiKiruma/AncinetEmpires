> 最新决胜授权：Gen1 K1按4P≥11审定晋级，跳过Gen2，执行唯一一次Phase E。先读 FINAL_ADVANCE.md；不得恢复Gen2或重启已打开的封存会话。

> 最新紧急纠偏：先读 FALLBACK_FIX.md。Gen1 K1/K2复用训练资产恢复评测；C/D/E回退只记诊断，Dev18门槛13；Dev54至少39胜且3P≥11或总胜≥40，保留2P/4P及健康门。

> 最新推进授权：P1继承倍率门槛2.4；B-G4/P2明确豁免、不得启动；Phase C并发wire上限35ms。立即接C→D→条件式E。详见PHASE_C_ADVANCE.md。

> 最新用户在线纠偏已生效：先读 ONLINE_CORRECTION.md。禁止恢复额外P1扫描或legacyV6重跑；P2仅6局，并发wire上限35ms。

# 后台完整任务接手

用户已明确要求：完整任务下发后台，不实时等候；本聊天每小时检查一次。你的职责是实际完成剩余实现和运行，不是再次只写计划或定时检查。必须先读BACKGROUND_FULL_TASK.md、AGENTS.md、ai_training/AGENTS.md及CONTINUATION_PROTOCOL.md。

## 已完成

- 公共646文件锁定，PUBLIC_SOURCE_LOCK.json SHA df20a853edcf031f2ae8da1ae379e3dd84ac3f19d77c0765c0dcacef205cb8d1。Phase A passed，勿改src/tools/docs，勿重跑Phase A。
- B-G1/G5已修复通过，默认Find模式。FP32关系MLP按262144行分块；正常EOF释放锁、flush、os._exit(0)。valueOnly轻量打包。详情B_G1_G5.json。
- B-G2原先位级完全相等被额外加严，用户要求继续原任务后已纠正。determinism_gate.ts实跑72单独根对8局负载，选招72/72一致，教师概率最大差中位5.982747686150702e-8，健康门通过。详情B_G2.json及D盘attempt4-determinism.jsonl。不要再因1e-7微差停机。
- BatchMux六种组合扫描已完成；选定2服务、2ms，纯前向约259.5请求/秒，不能当自然局吞吐。节点预算教师teacher_search.ts由公共引擎适配，没有S2/S3/S4，priorAnchor=.1，maxNodes2500，finalists8，budgetMs60000，castle penalties公共实现默认启用。

## 当前必须先接管的在途任务

`node .../stage7/throughput_gate.ts P1` 正在运行。**先核验进程，不要重复启动**。日志throughput-P1-attempt4.log。12局全座位完整教师，2P/3P/4P各4局，4 worker×2异步游戏，2推理服务，2ms窗口。最近已自然完成2局，其余在途。

大文件在D:/AncientEmpiresData/continuation_stage7_20261108_v1/throughput-P1/game-N.sqlite。事务式progress主键和steps表，每步原子提交，支持断点；无rglob进度扫描。只读观察脚本observe_selfplay.py P1（Windows WAL可能需要宿主权限）。进程结束会写B_P1.json，完成局逐个追加throughput-P1-receipts.jsonl。来源模型H1，封存访问0。

注意：当前运行版的teachers计数只统计teacher.available，含单候选。结束后必须运行audit_teacher_counts.py P1，按至少2个已估值且未否决候选复核“有效教师”数，不能直接拿available当高质量标签。原始teacher全部在SQLite，可复核，不需要重采。

throughput_gate.ts当前磁盘版本新增可选JSON profile参数（tag/workers/games/services/window），可以在独立目录比较配置；在途进程使用原始默认版本，勿因为磁盘增加了参数就重启当前任务。game_worker.bundle.mjs自P1开始以来保持不变。若修改worker源码/构建，先存当前bundle和源码以绑定在途身份。旧完整数据和尝试绝不删除。

## 后续真实待办

1. 等当前固定P1组完成；复核有效教师计数及健康，按用户最新任务书和原任务要求开展必要的配置比较。指标要区分物理meanWireMs（与Stage6 InferenceTransport同口径，排除预热）和含排队的logicalRequestMs。若续跑，整体墙钟包含恢复间隔，不能虚增吞吐。
2. P2入口同脚本参数P2，18局、25%完整T+75%1-ply。需真实跑完并复核。当前完整P1/部分P2执行器不是整个B～E自动流水线！
3. **Phase C、D、E剩余实现尚未完成，需要你补齐后执行**。可复用stage5/stage6权威评测、训练和隔离实现，只在stage7落地。B全通过后才跑C并发竞争审计及H1新引擎Dev18/54基线；D按最近任务书1～2代、人数25/45/30、对手50/35/15、180自然局或6000有效根加完整价值轨迹、60%新40%回放、K1/K2双轨；仅Dev54晋级后条件式E。原任务门禁被后续明确修订的以后续为准，不额外添加会阻断任务的位级相等条件。
4. 继承既有train/dev父局分区名单过滤，不打开封存内容。stage5/isolation.py是数值梯度检查，不是训练排除名单；实际Stage5/6用stage1/PARTITIONS.json过滤admitted与split，再读选中父局（见stage5/anchor_samples.ts和stage6/distill_collect.ts）。sealed_guard.py只控制终验入口，不要提前执行终验。
5. 基准P1/P2用了Dev初态，**禁止把这些SQLite轨迹当D阶段训练数据**。D重新从官方初态及自己上代训练轨迹建立数据源。
6. 新任务书B吞吐目标2.5x及meanWire<=12，报告需说明基线工作负载；原任务S0~1200根/h、P0~.95步/s只是已给诊断参照，不伪称同工作负载Stage6自然局倍率。真实门禁失败写实测、保留现场并清理；普通开发期类型/导入故障可按授权修复。

全程持有防休眠锁，代码与报告在stage7，大文件在指定D盘。用户不要聊天实时等待。后台代理可以持续执行和按需等待子进程，但不要为了“已下发”就提前结束；在真正完成或真实门禁停止后出完整报告、SHA清单、公共锁核验、进程清零。不得部署新默认冠军或覆盖历史权重。每个阶段及时写RUN_STATUS/GATES供小时检查。绝不调用旧closeout脚本冒充当前结论（里面是历史固定数字）。
