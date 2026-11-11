# 阶段5.3第4代自动续跑结果

第4代纯策略38/56，搜索40/56。晋升=False，当前冠军第0代。未通过项：pureRetainsGen3, searchNoRegression, searchMatchesEveryPurePanel, search42Plus, queueBelow1ms, queueBelowPoint5ms, retaliationComplete100, engineering60, promotion。逐面板自然胜：`{"fixed": {"championSearch": 18, "warmPure": 16, "candidatePure": 15, "candidateSearch": 17}, "expanded": {"championSearch": 15, "warmPure": 15, "candidatePure": 14, "candidateSearch": 13}, "multiplayer": {"championSearch": 9, "warmPure": 10, "candidatePure": 9, "candidateSearch": 10}}`。完整自然胜负和截断见[BATTLES.md](BATTLES.md)。

第3代固定图17胜比同运行时冠军18胜少1，触发用户的自动第4代授权。第3代权重SHA仍为e29d75abafda78c4e15ea523e785878c70027e0a5a5650ed92bb085bc574e39d，完整搜索39胜与0.9452ms失败峰值未被删改。原结论、门禁与战报按SHA存于phase53-audit/gen3-v4r4-conclusion。

第4代从第3代副本热启动，以冠军第0代固定v4r4搜索采样60局，纠错标签逐状态相对第3代纯策略核验。仅用本代真实原子纠错与永久排重后的基础池训练，wait/end不作专家硬标签。先验禁止或机会待机冲突的基础标签跳过硬监督，保留参考KL。

先完成一次策略头监督蒸馏，再运行预登记8组联合语义网格。全部8组权重、检查点和开发审计均保留；选中`lr2e-05-head1-ep20`，只按固定开发集动作头准确率、无谓待机数与候选ID排序，未按实战换模型。骨干、价值、内置headBias与校准配置保持冻结；34763个开发状态价值logits严格零漂移，非策略导出张量逐字节相同。价值16切片依据冻结证明继承，新权重的89状态Python/Node/真实Chrome三端一致性重新实跑。

新运行配置下相同60初态的工程复测及双方正式面板队列最大1.402200ms，反扑35584/35605完成，模型/对手决策超时0/0。这些统计包含GC和调度。冻结压力探针队列最大0.353300ms。逐步最慢收据和未完成明细均保存在gate-summary.json。Node参数固定`--max-semi-space-size=128`，双lane并行，外部1000ms门槛未放宽。

启发式对手逐格威胁评估原先反复JSON复制整张地图，CPU采样显示约九成开销在此。现在同一评分器复用一次原样JSON投影并在每次计算后恢复位置及虚拟单位；全部224槽187276个动作、69595个对手决策的动作、完整状态与随机游标均保持。旧冠军搜索完整归档，再在优化后的相同运行配置重测56槽；原60局训练数据保持不动，另对相同60初态进行不训练、不计质量胜率的工程复测。原训练采样的0.807ms队列失败与1050.334ms对手超时均原样保留。

实际消费基础/专家/训练待机约束ID完整落盘并核对新增及全部历史评测完整SHA和权威等价态，隔离通过=True。全部实际动作和反扑见证strict复核；不将forced等同strict。训练证据原预登记1.2GB保持；因对手瓶颈修复后追加56槽基准、60初态工程复测和95.7MB旧索引保全，另登记1.35GB证据保留扩展，仍保留12GiB系统空闲守卫，未放宽质量或时延门禁。

公共450项测试通过、20项因既有原始APK等依赖缺失跳过，lint/build通过；阶段TS与26项Python合同通过。GUI入口、手机、独立最终盲测与部署均未操作。

第4代首次Chrome验收因沙箱内crashpad子进程启动失败而退出，失败日志及原收据保存在phase53-audit/gen4-chrome-launch-failure。随后在沙箱外运行同一验收脚本，89状态的logit、actor、value及Node差异均为0，专属临时目录已清理；浏览器尝试记录保留在本代browser-attempts.jsonl。

按用户最新要求，本轮训练、既定评测与门禁判定至此结束，无论是否晋升均停止，不追加训练、不重开网格、不启动下一代。

以下为完整保留的第3代修复结论：

# 双流v2阶段5.3搜索修复与重测

第3代模型未训练，SHA `e29d75abafda78c4e15ea523e785878c70027e0a5a5650ed92bb085bc574e39d`。v4搜索面板完整结束，晋升=False，当前冠军第0代。未通过项：searchNoRegression, searchMatchesEveryPurePanel, search42Plus, queueBelowPoint5ms, promotion。

纯策略按SHA和strict复核复用：第0代34/56，第3代41/56。v4第3代搜索39/56。逐面板比较：`{"fixed": {"championSearch": 18, "candidatePure": 16, "candidateSearch": 17}, "expanded": {"championSearch": 15, "candidatePure": 15, "candidateSearch": 14}, "multiplayer": {"championSearch": 9, "candidatePure": 10, "candidateSearch": 8}}`。自然胜负、截断与异常详见[BATTLES.md](BATTLES.md)，不能把截断计成自然胜利。

默认神经基准完整推进至最多3个单位或回合结束；挑战方案使用相同行动深度，允许已经真正结束回合或规则终局的短分支。廉价先验只用于束排序，最终证据分数不再累加prior。德鲁伊刷新需要的三次单位链与提前结束的两单位基准均使用相同回合边界。

搜索节点只存前态和动作，只有最终缓存步骤构造队列身份；状态键复用扁平地形缓冲。敌方优先展开具有即时战术收益的链，剩余未行动敌军对参战单位的静态威胁另行计入惩罚。真实反扑借用160ms安全窗口，反扑期限上限为根搜索起点加880ms；人为过期预算仍严格失败。额外修复己方席位淘汰后重复展开敌方回合的问题。

队列切分比较保存在phase53-audit/combo-first.json、combo-full.json与combo-full-v2.json。只缓存首单位不能通过既有协同夹具；完整神经队列最终4/4通过，因此实战前冻结选择full。真实失败前态的两种队列切分均保留在retaliation-stress-certified.json；8/8反扑完成，队列最大0.353300ms。第一次压力探针暴露顺位循环，失败收据retaliation-stress-v4.json保持原件。

正式新搜索队列51284步，最大0.945200ms；反扑完成25308/25308。全部复核实际/反扑动作187276/175346；最慢队列、未完成反扑及异常详情全部保存在gate-summary.json。历史失败不被新结果覆盖。

另新增只读快照比较与布尔合法性查询，原35个权威方法逐个源码保持；快返不复制快照和菜单，仍核对完整状态及当前权威合法性。普通接管只缓存首单位，集火、刷新、让位和出城招募等跨单位依赖保留必要协同前缀；默认神经方案保留全链。

开局预热在克隆引擎、独立策略实例及独立随机流上执行，正式队列重新创建；正式初态SHA与对手随机调用数0有运行断言。历史策略同样经预热。公共448测试通过、20跳过，lint/build/阶段类型检查通过，23项Python合同通过。APK原始资源跳过不计通过。旧v3搜索673文件按SHA归档；模型、纯策略、战术先验、旧代与另一合同保全详情见phase53-audit/preservation.json。

晋升函数新增本轮全部门禁的合取保护，未满足42胜、逐面板、队列0.5ms等任一要求均不会替换冠军。双方致死风险改为监控根态同一批现有己方与盟友单位，避免只换actors名单就虚构风险降低。相同物理终态回归的红/绿日志均保留；v4r3双方完整结果另存v4r3-search-archive。没有修改GUI入口、操作手机、部署或独立最终盲测。

时延结论适用于本次登记的Node配置：`--max-semi-space-size=128`，并发数2。墙钟包含GC与调度。默认堆完整基准的1.1017ms队列失败按原值保存在v4r2-baseline-archive；首版v4完整双方尝试也保留在v4-attempt01-search-archive。固定失败前态9900次单独复测的p95/最大为0.0359/0.3700ms，不能据此抹去正式失败峰值。
