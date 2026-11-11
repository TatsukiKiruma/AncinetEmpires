# 阶段5.4接续记录

## R3整轮已完成并按用户指令停下（终态，覆盖以下全部运行中记录）

- 当前无本任务对局、协调或后处理进程：98473与74583均已实际返回exit_code=0。**不自动启动R4、额外诊断对局、训练或新候选。** `v5-deep-r3/round-stopped.json`已登记完成60+56+56、停止边界及报告快照SHA。
- 终局：pure gen03 **41/56（16/15/10）**，R3 gen00搜索 **42/56（15/15/12）**，R3 gen03搜索 **40/56（15/14/11）**。gen03多人细分3FFA4胜、4FFA5胜1负2截、2v2 2胜2负。较R2搜索42（17/16/9）回退至40，不宣称棋力提升。
- 127639实际动作/488721见证全strict，身份错0、两类超时0、执行错/墙钟截断0；**51778/51778反扑完整**，真实链195803/核心112671，延伸自适应收口19。工程60、冠军56、候选56均完整结束；“engineering60门禁”仍因队列延迟false，不能混淆“对局跑完”与“门禁通过”。
- queue共66688步：工程23624步max**2.5927ms**，冠军22175步max1.6618ms，候选20889步max .3655ms；根最高810.1592ms。不得扣除尖峰或借候选自身<.5宣称全轮通过。
- 最终失败：searchNoRegression（扩展14<15、多人11<12）、searchMatchesEveryPurePanel（固定15<16、扩展14<15）、search42Plus、search43Plus、queueBelow1ms、queueBelowPoint5ms、engineering60，以及promotion。**promoted=false，冠军保持gen00 SHA843fea9a...，没有更新冠军模型副本。**
- 其它门禁最终通过：runtimeIdentity、allAttemptsStrict、pure41/保留gen3、零超时、51,778反扑100%、deep合同、453状态精确排序、全部公共检查（493通过/20既有依赖缺失跳过、Python30合同），89三端/16切片按SHA复用，训练隔离base19127/expert8520重叠均0。
- 最终保全17422文件passed，changed/missing空。GUI用户确认后外部基线protectedPassed=true、开工原始originalProtectedPassed=false明确保留，本任务未改GUI；归档内同名phase54.py亦经最终SHA核验。
- 根REPORT/BATTLES/gate-summary和CURRENT已更新；稳定副本在`v5-deep-r3/completion-snapshot/`（报告/战报/机器门禁/RUNTIME/league-state/冠军JSON/CURRENT）。`round-stopped.json`绑定副本SHA与冻结SHA。`complete_round_phase54.py`已exit0，报告通过open_in_codex排队显示。
- **下一步只有向用户交付最终报告并结束回复。不要因原目标尚未达成继续工作，用户已明确要求本整轮后停止。**

## 2026-10-22 00:40 第三修订实时状态（覆盖以下旧状态）

- **01:40 R3全部60+112正式对局已结束**。协调会话98473已exit0关闭；post会话74583仍运行，stage=post_evaluation_isolation（startedAt1792604411）。候选**40/56：固定15胜4负1截、扩展14胜6负、3FFA4/4、4FFA5胜1负2截、2v2 2胜2负（多人11）**；candidate queue20889步max .3655ms（其自身<.5，但冠军1.6618/工程2.5927使整轮失败）。冠军42（15/15/12），pure41（16/15/10），因此searchNoRegression、searchMatchesEveryPurePanel、search42/43Plus均失败；queue<1/<.5、engineering60亦失败，不能晋升。候选全量strict/反扑计数待post最终汇总。
- 收尾辅助finish_phase54.py在运行中只改了文档说明和保全过滤：当前阶段根目录phase54.py可更新，**归档内同名脚本仍按SHA核验**；preservation两合同已再次通过（preservation-contract-final.log）。公共runtime/harness从冻结后未改。报告将明示R2 42→R3 40及逐面板回退，不把热点提速/排序等价当作棋力证明。用户停止要求另存r3/stop-after-round-request.json，协议冻结不改。
- **现在只需等74583收尾**：检查r3/{post,isolation}.log、gate-summary.json、promotion.json、preservation.json，若仅审计/报告脚本错误允许修正完成本轮，不改原始对局或冻源。完成后保存本轮REPORT/BATTLES/CURRENT副本和停止收据、确认本任务进程结束、向用户给最终报告并停止。**不得自动R4/额外诊断对局/训练。**

- **R3冠军完整56结束，候选gen03开始**（UTC17:22:56即本地01:22:56）：冠军**42/56（固定15胜4负1截、扩展15胜5负、3FFA4/4、4FFA4胜4截、2v2 4/4；多人12）**。43426实际/176842见证全strict，身份错0，两类超时/执行错0，**17510/17510反扑完整**，queue22175步max1.6618ms（p50 .038/p95 .0643），rootmax563.56。候选当前stage candidate-search-arena launcher PID49356/11492；协调98473、post74583仍运行。候选逐面板门槛变为fixed>=16/expanded>=15/multiplayer>=12，至少43总胜；已知queue门禁失败所以最终仍不得promoted=true。用户要求整轮后停下，不能再改算法/开下一轮。

- **01:04工程60已全完成，冠军搜索56正在运行**，协调98473/post74583仍有效，源码保持冻结。新stage champion-search-arena，launcher PID32344/17196。工程42403实际/154191见证全strict，身份错0、两类超时/执行错0、**17477/17477反扑完整**，adaptiveClosures19（延伸收口单列）。23624 queue p50 .0412/p95 .073/p99 .0989/**max2.5927ms**，rootMax810.1592ms。queue<.5、<1以及engineering60门禁失败，**不能晋升**；仍完整双方112后如实报告并停下，用户明确禁止自动下一轮。

- **用户最新明确要求：完成当前整轮以后停下并报告。** 当前整轮指已启动R3工程60+冠军56+候选56、post排重隔离和全部门禁/晋升判定；完成后必须停下，无论通过与否都不得自动开R4、额外诊断对局、训练或新候选。现有排队时延门禁已失败也继续完整R3，最后如实报告，不虚报晋升。
- R3前20局正式原始汇总：6482 queue p50 .0395/p95 .0653/p99 .0849/**max2.1282ms**（league-4-008第85步capture:native_u2，before86f8dd...），因此queue<.5及<1本轮失败。5273/5273反扑完整，13010实际/45675见证strict全过，0身份错误/决策超时/执行错；rootmax617.82ms。到后续只读进度27/60，24双人+3fork均自然终局。不改冻结、不扣尖峰。

- **00:42已启动R3正式全量**：run_phase54.py会话**98473**，post_phase54.py会话**74583**，均Python312。当前stage=engineering60，双lane PID29020/1472（实际子Node可由进程树查看）；先60再冠军56/候选56。禁止改已冻runtime/harness、不要增加CPU密集诊断干扰。post等待完整后登记排重、隔离、全部门禁合取及如实文档/晋升。
- 76807已exit0：保全**17422文件**全部passed、changed/missing空；用户确认后GUI基线protectedPassed=true，开工原始originalProtectedPassed=false明确保留；压力4组**12/12完成、queueMax .1528ms/rootMax128.8363ms**，四协同夹具passed。不能把这些小样本当正式60+112结果。

- R3已经创建并冻结：`phase54-audit/v5-deep-r3`，`RUNTIME_REVISION.v5AuditRoot`已切至此。**正式60+112尚未启动**。本轮无权重变更，仍gen03原SHA；旧R2完整失败证据与2580文件清单不可改。
- 新公共源码：`retaliation_order.ts`按最高immediate及严格6.5分上界预筛；`retaliation_paths.ts`整数地形反向目标距离缓存、非整数/极端地形回退原TacticalPathfinder；`retaliation_combat.ts`向原权威estimateCounterDamage传双单位与两处地形的稀疏视图，避免其内部JSON克隆全图。共享tactical_prior/encoder/reachability/rules没有修改。原反扑严格过期、五/八链、880/950、260、四/三案、220/70保留。
- `turn_search_ai.ts`接管执行全部被评估队列；`recruitment_policy.ts`根神经每城堡兵种优先序仅约束启发式挑战（包括初始多根），保留所有落点、不可负担退次选；神经primary后续单根仍自行选择、敌方反扑独立。新增真实完整占村队列回归及神经基准独立回归。
- 初轮预筛/反向缓存对复杂根仍0/3，原始诊断保留在r3/core-diagnostic及core-diagnostic-v2。CPU profile精确定位estimateCounterDamage全图JSON克隆占2054ms采样，见core-diagnostic-cpu/core.cpuprofile；此前“路径为主”猜测已修正。加入稀疏权威反击视图后`core-diagnostic-v3`独立三次根525/345/323ms，**每次3/3候选全部8真实链/6核心完整**，不是正式SLA。
- 新旧排序最终**453状态、9831 strict前缀动作、60训练初态全部等价**（首选、immediate、完整prior、状态/RNG），诊断总排序2500→783ms；`retaliation-order-equivalence.json`绑定3新helper与旧tactical_prior源码。两份旧收据另保留-v1/-v2。反向距离17280组格对、360种战斗状态与完整权威输入等价单测通过。
- 全公共检查完成：**493 passed、20既有依赖缺失skipped**；lint/build/阶段tsc通过；Python312 **30合同**在沙箱外硬链接支持下全部通过。`verification.json`已绑定日志。源码冻结已完成，不要在正式运行中修改公共runtime/harness。
- 正在执行冻结后保全/压力/协同串行检查，会话**76807**：preservation()对所有历史文件做SHA，可能需几十秒；通过后跑stress输出r3/stress.json，再combo输出r3/combo.json。查看r3/{preservation-check,stress,combo}.log。上一个Python包名导入失败仅工具调用，已改sys.path正确导入。不能默认跑R2。
- 外部GUI原用户明确授权保留；协议绑定r2/external-gui-change/authorization.json SHA。preservation新增 originalProtectedPassed（仍false）与用户确认外部基线protectedPassed分开记录，并校验授权human、原SHA、授权SHA、当前observed SHA。本任务不改GUI。两项Python回归验证授权篡改和后续GUI再改均拒绝。
- R3 Node额外`--retain-maps-for-n-gc=100000`（其余expose/min128/max128/yield不变）。这是此前12局对照中的候选参数，**尚未全量证明queue<.5**，不能先宣称晋升或全部工程通过。
- 接下来：确认76807 exit0及preservation passed/protectedPassed、stress全完成且队列<.5、combo passed，然后用Python312/LEAGUE_PHASE54_ROOT=r3启动run_phase54.py到r3/pipeline.log（先60再双方112）与post_phase54.py到r3/post.log。post初次可能status未存在，先保证run写了status再启动。全量完成前不改冻源，不用旧胜率替代新战绩；目标仍纯41、搜索43且逐面板≥champ和pure、原始queue<.5及核心100%，全部合取后才晋升。

## 2026-10-22凌晨实时状态（优先于下面全部旧内容）

- **无正式对局/诊断进程在运行**。r2完整60+112、post隔离已结束：协调会话10036、后处理2257均exit0；GC比较95438、两条JIT追踪58773/70083、布局保留31073均已exit0关闭。下一轮r3尚未创建/冻结/启动，**公共runtime/harness目前仍是r2源码，尚未做新算法编辑**。
- **最终r2候选42/56（固定17/20、扩展16/20、3FFA4/4、4FFA2/8含1负5截、2v2 3/4含1截），冠军40/56（18/14/8）**；pure原gen3仍41（16/15/10，细分3FFA4/4、4FFA4/8、2v2 2/4）。没有晋升。`REPORT.md`、`BATTLES.md`、`CURRENT.md`、根及r2/gate-summary均已如实写promoted=false。
- 合计**141288实际动作/601179见证全strict**、身份错误0、两类决策超时/执行错/墙钟超时0；反扑**65048/65051**（唯一工程league-4-051第46步的3案失败）；队列总max**2.2697ms**。最终失败门禁：固定<champ18、多人<pure10、总42<43、queue<1/<.5、反扑100%、engineering60，另GUI外部修改导致旧全局SHA保护false（下条已有用户授权，下一轮可明确换外部基线，不改r2历史）。
- **用户已回复明确授权保留外部GUI改动、单独登记，本任务继续不改GUI**。App.tsx与neural_ai_adapter.ts于10月21日23:55:26并行加入OriginalApkLikeHardAI入口；本任务未编辑。只移除新增hard片段的内存重构，与开工SHA完全一致：App旧0a3fe83e…/现5ad83010…；adapter旧604a5993…/现a9a29cfd…；ai_worker仍b9b310f7…。取证`r2/external-gui-change/{receipt.json,authorization.json,changes.patch,before-reconstructed/,observed-current/}`。authorization.json保存用户原答，authorizedByHuman=true；不要再问，不要恢复这些改动。下一轮协议绑定该收据，保护以observedSha作为已获用户确认的外部基线，同时保留旧SHA与r2 false记录，不能冒称全局GUI从开工未变。
- **r2已正式不可变封存**：运行`archive_deep_r2_phase54.py`成功，`r2/superseded-summary.json`及`r2/superseded-evidence-manifest.json`合并2580文件，包含旧双链112、首深度60、r2全部60+112+26局诊断、辅助源快照、结论/冠军/RUNTIME/CURRENT副本、GUI前后取证。**不要再改r2目录任何已入清单文件或重跑其收尾/覆盖audit-summary/status**。后续所有诊断/尝试另开r3目录，下一轮previousPhaseSummary和previousEvidenceManifest指这两个r2文件。
- 新辅助程序均在阶段5根：`run_gc_threads_phase54.py`、`run_map_retention_phase54.py`、`diagnose_queue_jit_phase54.ts`、`diagnose_core_phase54.ts`、`compare_first_divergence_phase54.py`、`diagnose_takeover_witness_phase54.ts`、`record_external_gui_phase54.py`、`archive_deep_r2_phase54.py`。都已按现状复制进r2/diagnostic-source（部分archive脚本自身不在复制列表）。阶段tsc新诊断在`diagnostic-scripts-tsc-final.log`通过（之前尝试npx失败日志保留，Windowsrun.mjs shell:false不能spawn npx，正确命令`node ai_training/run.mjs node node_modules/typescript/bin/tsc --noEmit -p dual_stream_v2_phase5_20261020/tsconfig.json`）。

### 反扑核心热点已实测定位

- `diagnose_core_phase54.ts`在实际训练初态league-4-051第46步复原strict，独立3次均复现全部3案核心不完整，root935.84/882.32/842.32ms。最后一次：非神经ranked **771.03ms**，其中全场20次 **727.86ms**（单次max50.32ms），单actor40次仅43.17ms；全部clone64次只有1.389ms、step102次6.196ms。故**不要优先做原地clone优化或改变规则API**，那不是主要热点。profile在r2/core-diagnostic/profile.json。
- 下一步优先实现**严格等价的反扑首动作快速筛选**，只改turn_search及新search专用helper，不改tactical_prior/encoder/model等数值纯策略源：先对权威legal廉价计算与tactical_prior完全相同的immediate（attack/capture/repair/heal/support，move投影调用权威getLegalActions并calculateDamage/estimateCounterDamage），若有正收益，只对最高immediate并列动作计算完整tacticalActionPriors、原先序稳定按prior取top1。原retal排序本来`immediate>0`、immediate、prior，因此可逐状态动作等价验证。这样跳过大量无关移动的全图路径/风险计算。
- 可额外严格剪枝：若无正immediate，先评估从己方城堡让位的全部move/post_attack_move；若最佳prior严格>**6.5**，其余不清城堡动作最多progress上限5*1.3=6.5（招募3、wait<=0等），可精确选它；否则回退全量原排序。使用同一ReachabilityContext复用路径缓存。不要把启发式近似当等价，须默认图/地形/攻击/占领/治疗支援/多状态对照旧完整排序测试。若只做第一正收益筛选已够，也可不加第二剪枝。
- 原retal核心两链过期失败、延伸收口、后续70ms留窗口、220ms挑战入场、5/8链、880/950/260/42%、双人4/多人3案保持，不把失败改完成。新快排后先用同训练根做独立热点复测，应真正走全6核心并显著缩时，再全量。

### 队列时延的诊断与当前最优候选参数

- 双进程GC对照完整12局（两组各6）：parallel queue2232步max1.2455ms、serial(`--single-threaded-gc`)2232步max1.1297ms，全部485步、动作/状态/RNG逐条相同，所有慢调用无本进程/另一lane GC事件重叠。不支持“并行GC干扰”假说，**不要选single-threaded-gc说已修复**。典型重复第133步attack:u_10:u_20，profiling index121，偏移6为预热调用；有少数第250move/270wait尖峰。原始comparison与profile全封。
- 两局`--trace-opt --trace-deopt`（jit-trace）显示`gameStateEquals`反复因**weak objects**失效及wrong map再优化，编译并发4~6ms；未证明每个尖峰都是它，日志插桩改变时间，不能作SLA。Node本机实际`--v8-options`：`--retain-maps-for-n-gc`默认2。每根global.gc会频繁老生代回收，可能把布局和优化代码弱引用丢掉，虽无计时区内GC仍触发后续慢路径。
- **布局保留12局对照完成**（map-retention-comparison）：baseline queue**2246步**p50 .0552/p95 .0987/max**1.3211ms**；添加`--retain-maps-for-n-gc=100000`的retained组**2232步**p50 .0422/p95 .0738/max**.4636ms < .5**。retained全6局485动作，baseline至少一局轨迹不同，所以`allActionStateRngSequencesEqual=false`，不可声称行为完全不变；这是时间限制搜索受JIT参数影响，全部严格合法。这是**值得下一轮正式工程验证的参数，不是已完成全量SLA**，也没达到用户愿景<.35。建议r3保留expose-gc/min128/max128/yield=true，增加retain-maps=100000，不要改计时或扣样本，仍完整新60+112检验；需要额外工程预检可在新r3目录针对最坏initial16，不能写旧r2封存目录。
- 此轮没有设置进程优先级/亲和性，也没有已证明OS调度归因。可先不改warmup（仍3动作），避免无根据加1万次假预热；若新旗标全量仍失败再作针对诊断。前述拆getAction小快路径也是未验证想法，当前trace主要是gameStateEquals，不要声称已定位getAction退优化。

### 棋力线索与建议下一步（均未实现）

- `compare_first_divergence_phase54.py`只读比较pure胜/搜索不胜，保存r2/pure-win-regressions-first-divergence.json。固定唯一pure胜而本次搜索负是heuristic-m0-s0，第19步同beforeHash de13b6... pure capture:u_2、搜索move:apk_u1:4,8，真实takeover、4案各5链、全完整、root222.67ms。4FFA1与5第35步把pure slime改archer，4FFA2第15步把mermaid改archer，均takeover，非veto。首分歧不是最终因果证明，不能按地图写分支。
- `diagnose_takeover_witness_phase54.ts`已用权威引擎strict前缀+真实witness初态算账本，结果r2/takeover-witness-ledgers.json。**固定第19步评估完整3单位候选ledgerScore最高7.6709（3town、ghost招募、实际伤害），但实际只执行[move:apk_u1:4,8,capture:apk_u1]后就重新根搜，已执行ledger仅4.6667（2town），不匹配任何完整评估前态**。原因takeover用cooperativeQueueEnd仅保留显式依赖前缀，完整方案评分收益未全部兑现。这是很强的通用执行一致性线索，可考虑让胜出接管也完整兑现被评估的3单位队列（和primary相同），或严格按实际执行前缀重新评估；后者须同深度公平，直接全队列更简单。现有queue_dependencies模块/历史保留，测试要验证真实被选方案后半战果确实执行，不能镜像实现。
- 但FFA1/2/5实际已执行完整3单位计划，不能用“裁切”解释全部拖延。FFA1/5 archer确实获得比slime多1次真实击杀（ledger .9824→2.4248、risk0），非单纯凑招募军力；FFA2双archer花500相对双mermaid400，真实伤害更高（.793→1.525）但无斩杀。是浅层战术收益取代NN长期兵种选择的线索。
- 一个较小且通用的棋力方案可探索：在根神经ranked结果按每个己方城堡建立完整**兵种优先序**，非神经挑战根/深层招募只允许该城堡当前可负担的最高NN兵种，仍搜索部署落点、单位顺序、战术动作；完整NN primary不受限制、敌方反扑不借己方偏好，不影响pure管线。这样保留已41胜策略的战略招募选择，避免非神经prior把同价archer/高即刻伤害强行替换slime/mermaid。必须预登记开发合同/回归，不能按固定地图硬编码、也不能预称肯定改善。固定m0的NN最高招募兵种尚未计算，该方案是否恢复固定1胜未知。
- 父代gen0神经3友军方案加入额外挑战、改己方深度5、凸组合gen05等都是更早想法，**未选择、未实现**。优先小而可解释的执行一致性/NN招募偏好修复，比一次改多种探索更可审计。若新权重必须完整新pure112、真实dev选型和三端/16切片；当前无gen05/无训练。gen3仍SHA e29d75abafda78c4e15ea523e785878c70027e0a5a5650ed92bb085bc574e39d。

下一步：在新r3预登记目录与源快照中实施已依据证据选择的修复，保持旧R2封存；专项排序等价/热点核心与执行队列回归、完整公共lint/test/build/阶段tsc/Python合同（硬链接仍需require_escalated）后冻结，增加retain-maps参数，再新60+112。根据用户确认对外部GUI基线单独绑定授权取证，继续不改GUI。**仍不得在棋力或工程未全过时promoted=true。**

## 当前实时接续要点（2026-10-21晚，优先级最高）

- **候选最新44/56**：固定**17胜3负**、扩展**16胜4负**、3FFA**4/4胜**，累计37胜；剩8场4FFA和4场2v2。队列max1.6554ms。固定已低于同版冠军18，所以即使总分达到43也不能晋升。仍继续完整剩余12，post2257结束后会如实写promoted=false。源未改。当前候选lane PID42476、23644；总协调会话10036、后处理2257。
- 已只读比较候选失利局与原pure：固定唯一本轮pure胜而搜索负的是`heuristic-...-m0-s0`；其它两负pure分别负/截。保存`r2/fixed-first-divergence.json`，首分歧**第19步、beforeHash de13b6...**，pure=`capture:u_2`，搜索=`move:apk_u1:4,8`，telemetry.takeover=true、4案/各5反扑/全部完成、root222.67ms、rootValue .54488。这只证明第一个分歧来自真实接管，不能认定它就是最终败因；后续应核查同根4个witness初态（各为己方分支后的状态）的账本，再做通用修复，不按单地图特判。扩展4负全为pure原有负；本轮16胜比pure15更好。
- 仅做二进制字段核对（未跑训练/dev选择）：gen0与gen3变化的张量为target_rel、who的weight/bias、tile_q的weight/bias、tile_k的weight/bias、what_entity的weight/bias、what_tile.weight、target_q的weight/bias、target_k的weight/bias；均策略头，骨干/价值/校准冻结相同。`calibrate_frozen.py`给出34763全dev与8520纠错审计逻辑，`gen4_policy_audit.py`可复用。现无gen05、无插值候选已选、无新训练。
- 后续算法想法（均**未实现/选择**）：①complete的maxBranch=1可在初始clone后逐后续动作原地推进这个私有clone；retaliation已算出best.engine后可直接令counter=best.engine并收集q.action，避免又在counter上重放同链。须克隆隔离/逐动作strict等价证明。②除了ordinary exposedDamage，commander静态预测当前仍跨不同敌方顺位累加`min(hp, defender.hp)-hits`，有可能造成多阵营指挥官过度悲观；可把真实已受伤保持累计，仅剩余静态投影跨敌对联盟取最大，最高优先级真实指挥官保护不放松，须数据和回归支持。③父代gen0已作为parentValueModel加载，若gen3搜索候选覆盖不足，可探索明确parentPolicyModel的神经候选组合：保留gen3纯基准，额外完整推进gen0神经三友军方案作为通用挑战案（同最大深度/反扑/最终3~4案），champion自身gen0则重复去重。这可保留pure41而不新权重，但需明确runtime配置及父模型SHA依赖、开发审计与全量新验收；目前只是想法，未授权宣传已完成或能过43。④若用凸组合gen05，只按预登记dev选，不能按本轮对局反选alpha；其新pure需全112，三端/切片等重新验收。
- **当前冠军搜索56已全部完成，候选开始**：gen0深度r2=**40/56**（固定18胜2负；扩展14胜5负1截；3FFA3胜1截；4FFA2胜1负5截；2v2 3胜1截），队列26668步p50 .0445/p95 .0827/max **.9783ms**。候选gen3已1/56首胜，完整目标门槛确定为固定18、扩展15、多人10=至少43。不要把原双链44胜当新基准，五单位深度确实使本基准多人从12掉到8，后续棋力优化须看候选完整数据。run会话10036和post2257仍有效，源码仍冻，继续完整候选56。
- 新增`diagnose_core_phase54.ts`，尚未执行。强制r2 gate-summary存在后才启动，复原engineering60唯一失败根前态（league-4-051第46步，trainSplit=true），逐前缀strict；独立3次运行，实例包装ranked/complete/retaliationRollout记录包含耗时，采样有开销、不认正式SLA，输出r2/core-diagnostic/profile.json。可在全量正式结束后与GC诊断先后运行，不同时抢CPU。潜在优化想法（尚未实现/选择）：反扑首动作先廉价计算immediate，仅对最高immediate>0的并列动作运行完整战术prior，因原排序本来immediate优先，可保持排序精确等价并省去大量无关路径风险；须专门等价测试。另可在独立克隆的真实queue头上重复快返1万次（反复补回相同合法head、不step），让matchesState/hasLegalAction/getAction进入稳定JIT；只改预热且正式实例/随机流隔离，须诊断证明，当前warmup尚未改。不要先认定这些想法能解决门禁。
- **23:04左右工程已全部完成，冠军搜索运行中**：60局48634实际/181727见证动作全部strict、身份错误0、两类决策超时/执行错0。队列28291步p50=.0494/p95=.0886/p99=.1177/max=**2.2697ms**（league-4-016第193步capture:u_42）；root max926.4938ms。反扑**22761/22764**，仅1根步涉及3个不完整候选：league-4-051第46步，3案coreChains=[5,5,4]、expanded=[6,6,4]，每案opportunity253.377ms，总根856.6484ms，staticComplete均true，真实核心未完没有被掩盖。候选预留220ms和后续70ms还不足以保证所有复杂4FFA核心。继续完整112，不中止或改冻结。
- **22:58左右实时补充**：r2工程已57/60（五场4FFA全部结束，剩2v2），暂无两类决策超时/执行错误。新增独立`run_gc_threads_phase54.py`已语法检查但未执行；它强制r2全部正式对局及最终gate-summary完成、源码仍匹配冻结后才允许执行已登记的12局GC配对，逐波双进程，拒绝覆盖未完成尝试，汇总本/跨进程GC重叠与原始queue时延。不在本轮正式面板中启动。发现warmup.ts现只走3个隔离动作，可能不足以预热复杂路径；这是待检假说，未改冻结warmup，未宣称JIT或GC归因。
- **正在执行第二深度修订完整60+112**，默认证据根已切到`phase54-audit/v5-deep-r2`（RUNTIME_REVISION的v5AuditRoot）。run_phase54.py会话**10036**，post_phase54.py纯等待/后处理会话**2257**。不要重复启动，不要改已冻结的公共runtime或harness；本次将完整跑工程60、冠军56、候选56，而不因早期队列失败停止质量面板。
- r2完整检查实际通过：**466公共测试、20既有依赖缺失跳过**，lint/build/阶段tsc；**28项Python合同**在沙箱外实际通过（硬链接测试需要）。首次完整Python抓到旧临时联赛无RUNTIME文件兼容回归，已修run_league.promote：无v5协议的旧夹具可走旧合同，有v5协议而缺RUNTIME仍严格拒绝。失败python-all.log保留，成功python-all-final.log已绑定verification。
- r2源码包含：5单位反扑（可选maxRetaliationUnits，默认5最大6）、多人总8链且后续各2核心、880ms主预算/950ms反扑上限/260节点/一级42%、最多双人4案/多人3案；候选入场须剩220ms，未入场单列budgetSkippedCandidates；延伸链收口需`25 + remainingEnemies*70 ms`，给后续核心留时间；核心已启动却过期严格失败。三个前端入口未动。
- r2加入计时前`await setImmediate`（executionContract.yieldBeforeDecision=true），Node固定--expose-gc --min-semi-space-size=128 --max-semi-space-size=128、双lane。队列仍严格原始计时，未扣任何尖峰。
- **r2工程前10局：2697/2697反扑完成、0strict/身份错误，但2904队列步max=1.7403ms，仍失败。** 首个失败slot还是league-4-000。此结果不能隐瞒，不能放宽0.5。当前最近进度41/60，无decision_timeout或执行错误；后续读audit_phase54.py即时结果。
- 仍让r2全部完成质量面板，以得到五单位深度版的实际棋力，不能再只跑工程而没有正式质量结果。当前从未完成任何五单位深度版56/112质量面板；最初双链冠军44/候选40不可当本版成绩。
- 新准备但**尚未执行**：`v5-deep-r2/gc-threads-comparison/protocol.json`。假说是另一个lane的后台GC/内存带宽可干扰本进程，故“本进程无GC重叠”不能排除跨进程干扰。Node v22.18.0、16逻辑CPU；本机`--v8-options`确认`--single-threaded-gc`可用，描述disable background gc tasks，默认关闭，concurrent-marking-max-worker-num默认7。只是假说，不宣称已证实。
- 该新诊断每配置6局，3轮，每波2个同配置进程，parallel/serial的顺序为[[parallel,serial],[serial,parallel],[parallel,serial]]；仅serial增加--single-threaded-gc，均yield=true，同一首个失败初态/seed/model/gen3/预算。计划位于`gc-threads-comparison/{mode}/round-{r}/lane-{lane}/plan.json`，每个plan只有一槽。**等r2正式全量结束后再运行，不能增加CPU负载干扰当前质量面板。** 入口diagnose_gc_phase54.ts，LEAGUE_GC_TARGET=engineering，LEAGUE_ENGINEERING指每个plan根，参数0 1，LEAGUE_GC_DIAGNOSTIC_OUTPUT为每个根/profile.json；nodeArgs取该plan。每波两个独立输出并行，波次顺序串行。
- diagnose_gc_phase54.ts（非冻结harness，修改不影响正在运行的正式进程）现在保存`timeOrigin`，可把一lane的slow[].start和另一lane的events[].start对齐，验证跨进程GC重叠；它还保存实际AI源码SHA。采样包含预热，正式队列max以逐动作raw ms为准。不要把诊断结果直接当正式SLA。
- Node没有process.threadCpuUsage（已实际查询undefined），有process.cpuUsage；不要臆称已有准确线程CPU归因。尚未设置进程优先级/CPU亲和性，没有更改系统配置。
- 下一步等待r2完整工程+双方112，检查post.log/isolation.log与真实门禁。若post失败修复审计后收尾，不改原始结果。若未达全部棋力/时延门禁，继续基于证据改进，不能假称promoted=true。用户明确目标纯≥41、搜索≥43且逐面板≥同运行时gen0和自身pure，所有质量工程门禁全绿再正式晋升。
- 历史链已保全：最初双链112槽44/40、首轮深度60（queue1.9464、26537/26569反扑、32未完成/27根步、0两类超时）、6局GC direct/yield诊断都在不可变清单，r2冻结绑定了前次summary/manifest SHA。真实三次GC配对：两组各1116 queue，direct1.7842/yield0.2602，三局各485动作、状态/RNG完全一样，整局约30~32s相同；大尖峰本进程无GC重叠。因此yield并未证明能普遍消除毛刺，r2正式又失败已明确披露。

下方为更早过程细节，遇到状态冲突以上述当前要点和实时JSON为准。

## 最新追加指令与当前执行（优先读取本节）

### 最新工程阻断与接续

#### 当前已完成与下一步（覆盖下方旧状态）

首轮深度60已完整收尾：51236实际动作/206895反扑见证全部strict，0决策超时/0执行错误；队列33081步max1.9464ms，反扑26537/26569，27根步涉及32次未完成。已停止纯等待器PID36488，会话43199已exit=-1；协调器会话28000已因版本身份保护exit=1，没有启动质量面板。所有原始结果保留。

GC三次配对诊断两组均完成，会话28546/80487均exit0。每组1116正式队列步：direct max1.7842ms，yield max0.2602ms；三局各485实际动作，动作/前后状态/RNG逐条完全相同，整局各约30~32s两组基本相同。大尖峰无GC事件重叠，不能归因MinorGC。gc-comparison/comparison.json记录工程选择yield，两个profile含实际AI源码SHA（当时含220ms入场guard、不含后续70ms预留），采样包含独立预热，SLA以逐动作原始ms为准。

首轮32未完成分布：第4案0链21次、第3案0链1次，其余10次是多方前部延伸耗尽后续核心窗口（expanded/core=7/5、6/4、6/3）。已加extensionReserveMs=25+remainingEnemies*70，为后续敌方核心链保留时间；1v1仍25ms。新真实四人边界回归通过，充足预算仍4+2+2八链/六核心。当前公开源码包含此预留与220ms候选入场，尚待新正式验收。

archive_deep_engineering_phase54.py已把首轮60+6诊断与旧112搜索合成1145文件不可变清单v5-deep/superseded-evidence-manifest.json；superseded-engineering-summary.json明确工程失败、未晋升。R1的原RUNTIME_FROZEN.json、源快照、协议与pipeline失败日志均保留。

第二修订目录phase54-audit/v5-deep-r2已登记：同一gen3 SHA e29d75ab…，五单位/880-950ms/260节点/3-4案不变；candidateAdmissionMinWindowMs=220、extensionReservePerRemainingEnemyMs=70、executionContract.yieldBeforeDecision=true。新60+112计划已生成。**尚未冻结、尚未启动新正式评测**。

当前正在做第二修订公共验证：npm test会话41882、build会话31092；lint及阶段tsc已exit0。Python312全部28合同在require_escalated下刚启动（含硬链接测试），日志v5-deep-r2/python-all.log，检查工具返回session与结果。公共测试预期466通过/20既有跳过，但必须读实测结果，不能预先宣称通过。

紧接着：1)确认这轮全部验证通过；2)设LEAGUE_PHASE54_ROOT=phase54-audit/v5-deep-r2运行record_deep_verification_phase54.py与freeze_phase54.py；后者会绑定当前全部runtime/harness、前次清单及汇总SHA并更新RUNTIME v5AuditRoot；3)在新Node参数下跑stress_frozen_phase53.ts（输出r2/stress.json）与combo_regressions.ts（输出r2/combo.json）；4)必要时先preservation()确认模型/旧证据/三前端入口SHA保持；5)启动r2的run_phase54.py（Python312、env root同上，先新60工程再双方112搜索），以及新post_phase54.py等待完整后排重/隔离/晋升。不要复用已结束的旧会话。

最终finish_phase54.py已要求深度参数、220/70预留与yield=true，并检查前次清单/汇总SHA。promote_phase54.py全部门禁合取且原子替换模型防硬链接损坏。后处理会登记前次根目录（旧r1的搜索目录为空无动作）和本次r2搜索；最初双链112已提前加入共享evaluation-archives.json，须保留。

下一轮仍可能有实际门禁失败，必须据实诊断继续；绝不能把旧失败删除、把核心失败改成完成、放宽0.5ms/1000ms，或不满足逐面板与≥43胜就晋升。当前尚未跑过任何五单位深度版正式质量56/112面板。旧双链冠军44/候选40不可充当新深度基线。

截至39局完整raw汇总，反扑14160/14172，12次失败**全部是第4候选、expandedChains=0/coreChains=0**（已逐条直方图核对），不是把延伸收口当失败。已在公开turn_search_ai.ts加决赛入场检查：基准始终实际评估；后续挑战若硬上限剩余不足220ms则不启动。telemetry新增plannedFinalists、budgetSkippedCandidates，comparedUnits只记录实际评估。严格过期私有反扑测试保持失败判定，已启动核心失败绝不改完成。新增此回归后5份专项测试通过。此source变更仍不影响已载入旧模块的首轮60；之后新冻结必须包含它。

现在首轮60已完成47局，尚无模型/对手decision_timeout或执行错误。等待完整60后归档成“被工程修订替代”的首轮深度尝试，必须保留1.5512ms及全部核心失败记录。再诊断和新60+112，不跑首轮深度的质量面板。

GC配对计划已准备：v5-deep/gc-comparison/protocol.json，固定首个失败slot league-4-000（第139步 wait:u_14，beforeHash=8de83a537127c417d6a991ee4325a0e95c4a68753f3efd463611173c6c0a0a09），各3次、direct/yield，两组并发总量2。两组plan在direct/plan.json、yield/plan.json，ID已独立，初态/seed/权重完全相同。等60停止后才执行，避免诊断负载干扰正式记录。运行前另记录当前诊断source SHA（含新入场guard），不要把诊断误称原旧源码完全复现。

深度版首轮60工程前6局：1721/1721反扑完成，1850队列步max=1.5512ms，仍不合格。已在battle.ts及engineering_gen4_phase53.ts新增**默认关闭**的executionContract.yieldBeforeDecision选项：若登记true，在t0之前await setImmediate，把事件循环任务留在计时外，整局墙钟照计。尚未证明有效，不能宣称修复成功。

此harness源码改动不影响已经载入旧模块、正在跑的60工程；旧协调器在60局全部完成后进入下一阶段前，会因harness SHA不一致自动拒绝启动质量面板。这是有意的版本隔离，保留完整60证据。会话43199仍等待full_evaluation_complete，将不会自动完成，需后续精确停止这个纯等待器（不可中断对局）。

在首轮60收尾后，先从其raw actions找最慢队列的slot，复制只含该slot的工程plan到两个独立诊断目录，分别yieldBeforeDecision缺省/true。同源模型、初态、seed、880ms/260节点/5反扑、min/max128。使用diagnose_gc_phase54.ts，LEAGUE_GC_TARGET=engineering，LEAGUE_ENGINEERING指诊断目录，参数0 1，LEAGUE_GC_DIAGNOSTIC_OUTPUT分别独立文件。该脚本已支持工程入口，预分配时间数组并关联PerformanceObserver GC事件。不把诊断当正式SLA或棋力。

根据诊断证据决定是否启用事件循环边界；新配置必须另建冻结目录并重跑60工程+112搜索，不能覆盖v5-deep失败1.5512ms。当前冻结深度算法已经实现，不再改公开算法来躲门禁。最终目标与门禁仍全部保留，不能谎报promoted=true。

用户在运行中追加：默认每敌方最多5条真实反扑链；多人全局6~8链，前2条核心必须完整，延伸第3~5条可在25ms边界交给完整静态覆盖；内部880ms/反扑950ms、260节点、一级42%、双人四案/多人三案。已全部实施并实测。

- 当前活动目录为phase54-audit/v5-deep，RUNTIME_REVISION已登记v5AuditRoot，因此audit_phase54.py默认读新深度版。
- 新运行会话28000：run_phase54.py，先60初态工程（正在执行），再冠军56及候选56搜索；日志v5-deep/pipeline.log。
- 新后处理会话43199：post_phase54.py等待全部完成后做永久排重/隔离与合取晋升；日志v5-deep/post.log。
- 原等待脚本Python PID50028已精确停止（自动审核批准）；原对局未被中断。旧协调器在112槽完整收尾后因源码身份防混用保护退出，旧60工程未启动。
- 原双链版112槽已完整：冠军44胜（18/14/12），候选40胜（18/15/7，其中4FFA仅1胜5截断）。全部strict。superseded-summary.json及708文件superseded-evidence-manifest.json保全。不能以此满足新深度版验收。
- 不再执行旧min配置v5r2计划，它保留且NOT_EXECUTED.json标明被新指令替代。新深度版已经合并--min-semi-space-size=128及--max-semi-space-size=128、--expose-gc。
- 多人采用全局8链，为后续敌方预留各2条核心；四人真实夹具分配4+2+2，共8链/6核心。1v1默认5链；maxRetaliationUnits可配置至6。延伸自适应收口计入adaptiveClosures，核心过期仍严格失败。未完成风险不再浪费叶网络前向。
- 公开完整检查最终464通过/20既有依赖缺失跳过，lint/build及阶段tsc通过；原26+晋升2项Python合同通过。晋升2项硬链接测试沙箱外重跑通过。新深度版verification.json有日志SHA。旧失败测试日志保留，旧断言的2案上限已随用户要求更新为4案，原一圈反扑2链上限更新为5，未弱化过期测试。
- 新冻结压力探针4组：12/12反扑完成、队列max0.1021ms、root max168.0331ms；四协同夹具通过。新旧15550文件保持、3前端入口SHA保持（v5-deep/preservation.json）。
- 新public source/harness已经冻结，不要在正式运行中再改。辅助审计脚本可修正，但不能改任何原始对局、模型、旧收据。
- post脚本源码已补齐新旧搜索面板登记。当前等待器在补丁前载入，已通过register_superseded_phase54.py提前把旧双链112槽加入共享registry，等待器后续读取即可；registry-preaddition.json及原件副本保全。正式完成后仍核查永久排重同时包含新旧四个面板目录。

接下来持续查看v5-deep/status.json与audit_phase54.py；完成后确保全部门禁通过才promoted=true。最重要的门禁包含纯41、搜索43+、逐面板同时不低于同运行时冠军与自身pure、队列<0.5、核心反扑100%、工程60、两类超时0、16切片/89三端、全部strict、永久排重/训练隔离、保护入口。旧双链冠军44并不自动等于新深度基准，必须重跑。

下方为追加指令前过程记录，后续顺序已被本节替代。

全程中文，保留全部历史证据；不修改App.tsx、neural_ai_adapter.ts、ai_worker.ts。禁止以未通过门禁冒充晋升。未请求子代理，不使用子代理。

## 已完成

- 已读用户指定的根目录、环境及训练入口、阶段5.3报告和战报。工作区原本存在大量修改/删除/未跟踪文件，均保留。
- 工作区已有一部分5.4修改，已核实并补齐：战果约束普通单位避险否决；敌方联盟最大前三击；各顺位暴露最大值与0.25系数；反扑top-1完整单位链；220ms借用/920ms根硬上限；惰性队列哈希；hasLegalAction冷缓存定向查询；地图见证轻量字段比较；根步骤动作及见证日志后计时外global.gc。
- 候选固定为第3代，SHA e29d75abafda78c4e15ea523e785878c70027e0a5a5650ed92bb085bc574e39d，不重训、不按新对局选权重。纯策略原56槽当前引擎strict全量复放完成，41胜（16/15/10）。收据pure-strict/。
- 89状态三端与16切片通过模型/校准/纯策略数值管线SHA证明复用，numeric-reuse.json明确本轮未新跑Chrome。
- 公共lint、457测试通过/20既有依赖缺失跳过、build；阶段TS检查通过；原26项Python合同通过。新增2项晋升保护测试在沙箱外实际通过（沙箱禁止创建硬链接），日志promotion-test-final.log；verification.json登记共28项Python测试。后续改了phase54_paths.py辅助路径解析，应在最终晋升前再跑这2项测试并更新收据。
- 惰性哈希补强测试通过：根入队及队列快返0次queueStateKey，诊断getter两读只计算一次。
- 权威35个原有方法逐源码保持，只读扩展证明read-only-engine-equivalence.json通过；3个前端入口SHA保持。
- 历史14842文件SHA清单historical-manifest.json；旧v4结论与冠军副本在v4-conclusion；before/为开工前小型源码备份。其它旧对局保持原位，不覆盖。

## 当前正在执行

工具exec会话93260：run_phase54.py（Python312环境）依次跑冠军56搜索、候选56搜索、同60初态工程复测，双lane。日志pipeline-attempt02.log；首次PATH Python无torch在任何正式开局前失败，pipeline.log保留。

工具exec会话57308：post_phase54.py等待上述完成，随后更新永久排重索引、运行isolation_phase52.ts（输出到本尝试，不改旧阶段收据），再调用finish_phase54.py合取门禁。实时status.json。不要重复启动。

最近状态：冠军56槽完成44胜（固定18/20，扩展14/20，多人12/16：3FFA3/4、4FFA5/8、2v2 4/4）。25595队列步max=0.9439ms，工程0.5ms门禁失败。11194/11194反扑完成；45486实际动作和75005反扑见证动作strict，超时0/0。

候选最新24/56：固定18胜2负，扩展4胜0负。队列已有0.5144ms失败。工程60尚未开始。使用audit_phase54.py可读取完成槽进度，注意partial模式工程不含队列统计。完整collect()才解压原始动作统计反扑。

当前同运行时冠军多人12胜，因此候选逐面板要求至少18固定、15扩展、12多人，即45胜；正式协议还保留search42Plus和search43Plus门禁。

## 已准备的工程后续修订

独立探针gc-space-probe.json证明：只有max-semi-space-size=128时显式GC后new_space只有2MB；同时min/max=128时保持256MB。尚未证明具体尖峰与GC事件重叠，不要直接断言已证实。诊断脚本diagnose_gc_phase54.ts使用预分配时间数组和PerformanceObserver关联GC与getAction区间，不修改公共源码；正式评测结束后再运行，避免并发干扰。

prepare_gc_revision_phase54.py已预登记phase54-audit/v5r2/protocol.json，唯一配置变化为新增--min-semi-space-size=128，模型与搜索源码不变。已复制原历史清单、纯strict、numeric-reuse、selection、verification及v4-conclusion，生成新112搜索及60工程计划。尚未冻结、尚未启动v5r2。

所有Python新流程已支持LEAGUE_PHASE54_ROOT；phase54_paths.py默认读取RUNTIME_REVISION.json的v5AuditRoot（未设置时phase54-audit）。当前正在跑的原进程早已载入旧代码，路径仍是原尝试，不会被这些辅助脚本改动改变。不要在原post完成前改变RUNTIME_REVISION，避免原最终收尾读错路径。

## 后续顺序

1. 等原v5双方112搜索及60工程全部完成并strict收尾，等post到quality_unmet（已知队列失败，不会晋升）。若post异常，读post.log与isolation.log修复收尾，不覆盖任何失败前缀。
2. 将原v5最终REPORT/BATTLES/gate-summary/league-state/RUNTIME复制到v5r2/v5-conclusion，保留v5原结论。
3. 需要时对multi-3ffa-0单槽建独立diagnostic plan（原冠军plan只保留该槽），分别以默认max参数和min/max参数运行diagnose_gc_phase54.ts，参数play 0 1、LEAGUE_ARENA指独立新目录、LEAGUE_PHASE54=1、LEAGUE_GC_DIAGNOSTIC_OUTPUT独立文件。诊断不是正式质量结果。
4. 再跑晋升保护2项测试（需要require_escalated，因为沙箱不允许创建工作区临时硬链接；此前自动审核已批准过同一测试）。更新verification及v5r2副本。
5. 设置LEAGUE_PHASE54_ROOT=phase54-audit/v5r2，调用freeze_phase54.py。它将登记v5AuditRoot、执行参数并复制源码快照。源代码及harness无需再改，保持相同搜索器，只修订Node配置。
6. 同参数重新执行stress_frozen_phase53.ts，LEAGUE_STRESS_OUTPUT=phase54-audit/v5r2/stress.json；再启动run_phase54.py和post_phase54.py（均用相同LEAGUE_PHASE54_ROOT），完整重测双方112搜索与60工程。
7. 最终finish_phase54.py严格合取全部门禁，包括≥43胜、逐面板、纯41、0.5ms、反扑100%、工程60、两类超时0、16切片、89三端、全部strict、隔离及保护入口。promote_phase54.py使用新临时文件原子替换冠军，防止历史硬链接被原位改写。所有失败证据保留。
8. 若结果未达标如实报告，绝不能写promoted=true。用户目标仍是全部通过；在此之前不要以部分进展结束任务。

常用根目录启动：node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -B -X utf8 dual_stream_v2_phase5_20261020/run_phase54.py。PATH python不含torch，只适合不导入arena_summary/calibrate的轻量工具。
