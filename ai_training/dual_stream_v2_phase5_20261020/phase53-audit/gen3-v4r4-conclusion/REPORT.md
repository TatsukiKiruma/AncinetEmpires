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
