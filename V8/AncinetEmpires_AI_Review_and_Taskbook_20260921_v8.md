# AncinetEmpires v8：实际策略调用、评测协议与后续训练审查

审查日期：2026-09-21。  
仓库：TatsukiKiruma/AncinetEmpires。  
本轮固定提交：`6e7b7e22d36597369e75a5f21f743bd2f5faab93`，分支 `path-b-spatial-ai`。  
比较基点：`55177b8ea9459d1b30a83e44eb412fb2f112a4c4`。  
性质：源码、已提交报告审查，加独立缩减复现；不是在用户训练机重新跑训练、80场比赛或完整 npm 测试。

## 0. 执行结论

本轮确有进展，不应推翻已修复的4块残差推理、best/last分离、policy-only空间训练和非法标签拒收。但是，暂不能接受 v7 NEXT_ACTION 中“已证明S00显著优于Heuristic、建议部署、替换全部教师”的结论。

下一轮顺序必须是：

**修正实际模型调用与数值接口 → 修正评测截断/随机流/模型身份 → 重评已有权重 → 修正搜索回合跨度和真实数据覆盖 → 学生访问状态纠错 → 有条件扩量/加深。**

保持当前默认 HeuristicAI，不自动替换生产策略或模型，不改游戏规则来改善成绩，不修改/删除历史报告以隐藏失败，不租算力、不自动 push。保留 Spatial-v2 32通道2残差块为主要学生，NET_A仅作修好数值后的低成本对照；暂停 NET_B 和临时BC的重复大规模重训。

v7的错误不是证明“神经网络无效”的证据；S00两次记录的自然胜，也不是证明“它已经总体更强”的证据。

## 1. 本轮报告到底显示什么

来源：`docs/training/reports/agent_upgrade_20260921_v7_01/comparison.json`。

| 策略 | 场次 | 自然胜 | 自然负 | 规则平 | 截断 | 引擎错误 | 报告平均决策ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| HEURISTIC | 20 | 0 | 2 | 0 | 18 | 0 | 33.4 |
| SPATIAL_V2 | 20 | 0 | 6 | 0 | 14 | 0 | 39.7 |
| S00_SEARCH | 20 | 2 | 4 | 0 | 14 | 0 | 202.7 |
| S10_SPATIAL_SEARCH | 20 | 0 | 4 | 0 | 16 | 0 | 222.4 |

80场中62场截断，占77.5%。这是源码存在协议缺陷的开发批次记录，不是可靠的正式棋力排序。不能把截断当作平局，不得只删除截断后报告“胜率33.3%”来宣布S00胜出，也不能将平均200ms当作最坏情况小于1000ms的证明。

另一个报告 `data-and-training-coverage.json` 记录生成2940条、一般状态2100条、课程840条；不是完成30,000条有效状态扩训。报告中的唯一状态数量、2395/545分区和消费证明还需按下述真实语义复核。

## 2. 已有修复，应保留

1. `src/game/ai/spatial_conv_net.ts` 已补齐残差块3/4的加载、缓冲区和前向执行。
2. `python/train_spatial_resnet.py` 已分开 best/last 和模型专属 metrics；空间训练入口传入 `--value-weight 0.0`。
3. v7生成器非法目标进入隔离逻辑，不再静默替换成第一个合法动作。
4. 多地图生成、状态去重、三路反事实、S00/S10和统一评测都有实现入口，已经不只是文档设想。
5. 零重招募机会返回null是正确方向；不过机会和成功事件的统计口径还没有正确统一。

以上是“存在并检查过相应代码”的判断，不等于所有端到端路径都已经验收合格。

## 3. P0：空间模型在实际对战路径里被错误调用

### 3.1 接口定义与调用不一致

真实接口在 `src/game/ai/spatial_conv_net.ts / SpatialResNetPredictor.predict`：

```ts
predict(encodedState: SpatialEncodedState,
        candidateActions: SpatialActionFeatures[]): SpatialInferenceResult
```

但是以下三个实际入口使用三个参数：

- `tools/v7_unified_evaluation.ts / PolicyAgent.selectAction`
- `tools/v7_heuristic_bounded_search.ts / getFilteredCandidateActions`
- `tools/v7_counterfactual_dagger.ts / predictStudentAction`

```ts
predictor.predict(encSpatial.spatialTensor, encSpatial.globalFeatures, candSpatial)
```

应该统一为：

```ts
const pred = predictor.predict(encSpatial, candSpatial);
```

JavaScript不会因为多传一个参数自动失败。当前实现把第一个Float32Array当作有spatialTensor/globalFeatures属性的对象，把第二个20维Float32Array当候选数组，真正的第三个候选数组被忽略。

独立缩减复现：正确调用读入9600个空间元素、20个全局元素、37个候选；错误调用读入0个空间元素、0个全局元素、20个“候选”，每个“候选”的语义向量长度为0。这个实验只验证参数绑定和输入转换，不冒充用户checkpoint的完整数值推理。

结果：现有SPATIAL_V2、S10及DAgger诊断结果不能作为“真实网络已正确参与决策”的证据。代码具有退化为错误候选打分/固定索引选择而不立即报错的风险，不能用 engineErrors=0 排除。

### 3.2 为什么跨语言parity通过没有阻止它

`tools/v7_cross_language_parity.ts` 使用正确的 `predict(encState, candSpatial)`，但没有穿过实际PolicyAgent/S10/DAgger包装层。已提交的 `inference-parity.json` 测的是v6目录下的两个checkpoint、demo上的26个候选，并非v7实际参赛模型及全部实际策略入口。

### 3.3 必须增加的断言和集成测试

- 输入空间元素9600、全局20、每候选语义32；结构、形状、所有数值必须合法。
- `actionLogits.length === legalActions.length`；每项finite；argmax必须在候选范围内。
- 1、7、20、37及大候选集合都要覆盖，不能只用恰好20个候选。
- 同一个真实fixture，通过原始predict、PolicyAgent、S10候选接口产生相同语义的分数/索引。
- 对候选置换，分数按同样置换对应，不能随列表位置错误改变；分数并列按稳定actionCode处理。
- 用可控权重/可控输出验证wrapper确实选择被模型赋予高分的动作，而不是始终选legal[0]。不要要求任意随机换权重都必须改变任意实战状态的argmax。
- 不得通过新增three-argument any重载、吞掉维度错误、补零绕过断言来“修复”。
- 必须运行覆盖tools的 `tsc --noEmit`，不是只执行tsx或Vitest。

## 4. P0：NET_A的policy-only路径仍能产生NaN

v7生成器为NET_A写入 `valueTarget: undefined`，JSON序列化会省略该字段。`tools/skirmish_dual_head_net.ts / trainStep` 却只判断：

```ts
if (sample.valueTarget !== null) {
    const dValScalar = opts.valueWeight * 2 * (predictedValue - sample.valueTarget);
    // ... value及共享trunk的反向传播
}
```

因此undefined仍进入分支；当valueWeight=0时，`0 * (prediction - undefined)` 仍然是NaN。不能把“loss权重为0”当成“不会计算或传播无效梯度”。

处理要求：生成器统一缺失目标为null；运行时校验输入schema；只有valueWeight>0且目标为有限数时才执行value损失/梯度。对于意外的非法目标应显式拒收或报错，不得静默吞掉异常。训练首个batch、每个epoch和导出之前都检查loss/梯度/权重finite。

另一个接口错误：`predictDecision` 返回 `topIndex`，统一评测器却读取 `pred.bestActionIndex`。应统一返回字段，并把传入网络的状态/动作向量规范化为接口要求的number[]。

v7默认80场名单没有NET_A，因此不能用这些比赛中的0引擎错误证明NET_A可用。这些结论来自代码和算术复现，不是已经检查过未上传NET_A checkpoint的权重。

## 5. P0：评测协议会把正常推进提前切断

### 5.1 单位总数不是停滞判据

`v7_unified_evaluation.ts` 在单位数组长度连续25个底层动作不变时退出。移动、占领、削血、治疗、调兵、围城都可能不改变单位数。军队扩大后，25个底层动作甚至不足以覆盖一个完整轮次。

建议第一轮复测直接禁用此自动截断，只保留为诊断计数。随后需要的循环检测应基于能决定后续规则的状态和玩家/回合阶段，并将真正重复与持续经济/血量/地形变化区分。所有资源上限仍必须保留，但独立分类为MAX_TURNS、MAX_ATOMIC_STEPS、WALL_TIME_LIMIT等，不计作自然平局。

### 5.2 动作上限另有隐性缩短

默认maxTurns=45，同时检查 `steps < maxTurns * 10`，实际最多450个底层动作。应分离完整轮次和底层动作上限；回合多单位制不应使用固定乘10推导。正式棋力复测可从足够覆盖收官的轮次/动作预算开始，并公开残余截断比例；具体预算由实际推进日志调整，不宣称任何固定数一定足够。

### 5.3 seed只是记录，并未控制真实随机流

`runBenchmarkMatch` 的seed用于名称/记录，但双方HeuristicAI未注入该seed；构造器默认Math.random。搜索和反事实还会额外调用同一个随机源。因此这不是可重放的配对种子实验。

建议每场为环境、每名策略、搜索模拟建立独立且可保存/恢复的随机流；不要让多做一个搜索分支改变真实对手下一步的随机数。配对的是相同初态/规则/环境随机边界，而不是要求策略分歧以后仍有完全相同轨迹。确定性回归使用固定节点预算，并将墙钟预算引发的实际展开差异写入trace。

### 5.4 重招募指标也需改口径

新评测仍用“金币>=250、首个城堡为空”等手写近似判断机会，与动态400/500/600等实际费用不一致，且可能忽略其他城堡或合法的组合招募动作。成功计数发生在执行动作之前。

应由引擎合法动作集合判定机会；执行动作后通过单位/金币/pending状态变化确认成功。分别报告：

- decisionOpportunityCount：每次决策中可招募；
- recoveryWindowCount：同一次死亡后的连续可恢复窗口；
- recoveryCompletedCount及恢复延迟。

不要把同一恢复窗口中的二十次普通单位动作都算二十次独立失败。报告中存在0机会却1次成功的记录，说明当前分母/分子不一致；不能据此说启发式重招募也极差。

### 5.5 模型缺失必须终止相应评测

目前空间模型缺失时可以返回legal[0]；DAgger模型缺失时可以使用普通空间模型替代；S10缺失空间模型时可以退化为S00，但标签不变。这些都必须改成MODEL_LOAD_ERROR/NOT_RUN，不能在榜单上继续使用原模型名称。

报告应保存请求策略、实际策略、模型SHA-256、编码版本、规则摘要、seed流信息、初态hash、节点/耗时统计、fallback次数、终止原因。错误分支也要在finally保存轨迹，不能返回一个没有写出的trajectoryLogPath。

## 6. 搜索方向可以继续，但当前实现不是完整对抗规划

### 6.1 跨度仍过短

当前每个候选最多：己方动作→一个己方follow-up→仅当此时轮到对手才给对手一个动作。大多数多单位回合根本尚未交接；即使交接，对手一步move也未必含attack。`maxDepth`参数未实际控制搜索。

下一步需要的是“有预算的完整关键回应”，不是盲目加节点。采用短候选动作段/beam或由启发式补完余下合法回合，直到自然交接，再覆盖对手移动后攻击/集火/反占等关键回应。不能非法强制end_turn跳过pending，也不能为了凑深度改变规则。

应记录每根候选是否达到对手、对手动作数、移动后攻击是否覆盖、真正回合交接次数。不同候选尽量比较同一视角/同一阶段的叶值；未完成分支不得伪装成已充分评价，时间不够时保留原Heuristic动作。

### 6.2 叶值缺少推进和威胁信息

冻结叶值目前主要使用材料/血量折扣、归属、金币、指挥官存活或低血阈值，不评估到目标的可达距离、未来收入、实际威胁覆盖和移动后的反击风险。许多移动会因此同分；增加无信息的搜索层数不能解决。

先用引擎验证的短期交战结果、路径距离/占点进度和指挥官风险设计可解释小幅增量，并做消融。保持终局优先于任意非终局分数，非终局分数应显式限幅或使用词典序终局判定。禁止用尚未合格的学习value替换叶值。

### 6.3 S10目前不是报告所说的全候选按网络分数粗排

代码先插入Heuristic最佳、全部attack/capture和部分commander recruit，再追加空间top-K，最后在候选不足时补启发式。网络分数不是对整个搜索队列统一排序，且有限节点可能耗尽在前半段。修复调用前，所谓“网络把斩杀排后导致失败”的归因没有代码和trace支持。

改为显式候选集合/优先级/配额，包含Heuristic原动作、关键战术、重招募两种形式及pending解锁；神经先验只在其余空间内提供补充。比较Heuristic动作、S00、S10在同节点和同墙钟预算下的候选覆盖，不能只比较名字。

### 6.4 教师资格

S00当前只能列为候选教师。可以保留其已发现的胜局供复盘，但不立即替换全部Heuristic示范。只有在修正协议后，跨地图、换边、固定开发/留出配置的收益有一致证据，才扩大其样本生成或考虑部署。

## 7. 数据还没有到“可以只靠扩大规模解决”的阶段

### 7.1 当前是小规模开局为主试验

报告2940条、空间模型2轮训练；生成器每局最多90个底层动作，学生诊断入口更只有每局60步、固定学生P0。应先收集完整对局，再按开局/接触/中盘经济/指挥官恢复/优势收官分层抽样，而不是把每局前90步堆到30k。

8个地图索引和8档金币偏移使用同一取模索引，每张地图重复时金币组合被绑定。应将地图、座位、初始合法扰动和策略随机性解耦。保持专门的未改初态标准地图评测；训练中初态金币扰动不能混称标准测试。

### 7.2 去重hash同时会错删和漏删

getStateHash忽略hasMoved/hasActed、pendingUnitId、指挥官死亡数/保留状态、建筑归属等能影响规则的字段。相同单位位置血量和金币，但可行动权/费用完全不同的状态可获得相同hash。另一方面手工生成的u_blocker_i等ID不同，又会把同构状态分开计数。

至少建立完整行为状态hash和单独的可选规范化去重hash。规范化ID必须同步修复动作引用，不能简单删除id字段。rootFamily须反映真实初态及派生关系，而不是仅换名字保证“独立”。

### 7.3 已生成不等于已消费，manifest分区未约束训练器

`consumed_ids.jsonl` 在addSample写出时生成，并不是优化器真正读过的名单。

TypeScript manifest按15% root划分；Python训练器又按默认10%样本目标独立shuffle root重新划分；NET_A使用全部双头数据，未执行同一隔离划分。因此2395/545只是生成器侧统计，不能视为所有模型的实际训练验证分区。

必须输出一个持久化split manifest，Python/NET_A/DAgger统一读取；优化器实际迭代时写train/validation ID或可核验摘要与课程直方图。断言新纠错样本确实进入train。

### 7.4 课程合法不等于课程目标成立

最新E_PENDING仅在城堡放置普通士兵并选move，没有创建真正pendingUnitId的重招募状态；这是普通腾城，不是pending恢复闭环。应让引擎执行真实recruit产生pending后采样，再检查完成后的pending清除和单位身份。

A/B/C/D大多仍为P0；saving仅任选合法move，不证明后续真的保住资金；G只确认attack合法，没有执行后检查真实自然胜利。课程必须验证后置条件/短动作链，不再用课程名称充当标签语义证明。

## 8. DAgger要保留，但须修正入口、样本和评测

本轮已写出学生访问状态和教师标注的框架，值得保留。DAgger不是只能微调：在聚合数据上从头训练也是合法实现路线；但是当前Python入口每次重新初始化模型，未读取旧checkpoint，不应称为已验证的“续训微调”。

当前还存在以下限制：

- 学生预测沿用错误空间接口；先修，再重新采集，旧诊断结果隔离为legacy。
- 反事实A/B/C使用同一个未恢复状态的随机源，不能称相同RNG边界。
- 默认学生固定P0，4局×60步，覆盖不足。
- 新样本全部用一个dagger_root，独立重新划分时有整组被分到validation的风险。
- 原始数据只取前3000行，是前缀采样，不是按训练分区/阶段/课程分层回放；不得把原validation一起混回新train。
- 默认80场没有SPATIAL_DAGGER；模型缺失时还可退回普通空间模型。因此本轮没有可核实的同协议DAgger前后棋力对照。

先执行1轮覆盖两座位的纠错闭环，明确选择“旧权重warm-start”还是“聚合数据从头训练”，保留固定验证/留出集合。训练后用不同checkpoint SHA在同协议下比较SPATIAL_BASE与SPATIAL_DAGGER。未经这些步骤，不扩到多轮自动流水线。

启发式可以继续用来教学生接近其能力，不需要先让Heuristic战胜自己；要宣称超越基线，则需要合格搜索改进标签或后续真实策略改进证据。

## 9. 建议的最小实验顺序

### 阶段A：不重训，先回答旧权重真实能做什么

完成R8-01/R8-02后，先在小组fixture和少量完整开发局验证加载/终止/预算，再比较Heuristic、现有Spatial-v7、现有S00、现有S10。使用相同规则、可复现初态和独立随机流。若现有checkpoint缺失则NOT_RUN，不能替代。

这是本轮最优先且信息价值最高的动作，不先生成新30k数据。

### 阶段B：构建可信空间学生

先在64—128个合法、可区分、标签一致的样本上做过拟合自检；无法学会时检查输入冲突、随机并列标签、loss和梯度，不立即加深。

随后建议做10k有效状态预试验，再做30k跨阶段/跨地图状态的主试验，保持32ch/2 blocks。样本配比按实测缺口调整，可从一般完整对局60%、专项课程20%、学生访问状态20%起步；这是建议初值，不是已经验证的最优配比。并列优质动作可使用集合标签或经校准的排序目标，不要求无意义的单一argmax匹配。

训练时固定验证集合，使用早停；不固定两轮作为“容量已足够/学习已结束”的证据。棋力验收独立于离线准确率。

### 阶段C：搜索与学生共同提升

先比较Heuristic与修正后的S00，确认跨回合回应和推进效果；再以空间先验加入同一搜索器做S10消融。不要将两个不同搜索器误叫policy先验A/B。

合格后再收集搜索改进样本，先保留原教师数据作稳定回放，避免一口气把全数据换成未经验证的新教师。

### 阶段D：扩量/加深的条件

| 观察 | 行动 |
|---|---|
| 训练好、开发或留出差 | 增加独立地图、阶段及学生访问覆盖，检查泄漏 |
| 训练与开发都差 | 先检查标签/编码/数值，再做容量对照 |
| 动作拟合好、完整棋力差 | 检查关键动作遗憾、分布偏移与搜索跨度 |
| 搜索从未到对手或推进同分 | 改规划/叶值，不加网络深度 |
| 干净30k的2块基线稳定 | 再做2块vs4块，保持相同样本/分区/协议 |
| 新增独立数据稳定改善 | 再试100k—150k有效状态，拒绝复制扩量 |

当前不建议立刻做6/8块、不建议把四种旧模型再一起训一遍、不建议换PPO来绕开工程问题。

## 10. 可直接给Agent的任务清单

| ID | 优先级 | 工作 | 验收证据 |
|---|---|---|---|
| R8-01 | P0 | 统一空间/NET_A调用、value null与finite检查、模型缺失拒绝 | 实际wrapper集成测试；tsc；first-batch有限性；模型SHA |
| R8-02 | P0 | 修复评测截断、seed、恢复窗口和轨迹错误分支 | 正常移动/削血不截断；同节点预算回放；机会/成功不矛盾 |
| R8-03 | P0 | 不重训重评现有checkpoint，撤销过度结论 | corrected_v7_rerun.json；NOT_RUN/ERROR明确；未替换默认 |
| R8-04 | P1 | 同回合阶段搜索、对手回应、候选配额、可解释叶值 | 对手move→attack测试；response coverage；节点/墙钟两种消融 |
| R8-05 | P1 | 完整局采样、完整hash、统一split/真实消费、课程后置条件 | data_manifest/split_manifest/consumption；两座位课程链 |
| R8-06 | P1 | 空间2块10k→30k试验，保留NET_A小对照 | 不同root验证；有限梯度；未见地图或固定留出成绩 |
| R8-07 | P1 | 一轮正确学生状态纠错与pre/post评测 | 明确warm-start或retrain；不同SHA；同协议paired结果 |
| R8-08 | P2 | 通过条件后扩量或2/4块对照 | 数据固定的深度对照、深度固定的数据对照；独立留出 |

不要把“没有执行”写成COMPLETED。任务状态应区分 IMPLEMENTED、TESTED、MEASURED、QUALIFIED、BLOCKED/NOT_RUN。局部源码测试通过不等于策略能力合格。

## 11. 建议的回归测试（应调用生产/实际工具函数）

1. 空间wrapper实际传入二参数结构；候选数量37时输出37个logits。
2. 模型缺失、weights含NaN、logits非有限、wrong shape必须明确失败。
3. NET_A无value监督batch中，全部梯度/权重仍有限；null缺失字段按schema规范。
4. 预测字段为topIndex，选择真实候选；float向量按模型接口规范转换。
5. 25个动作单位数不变但移动/伤害/占点持续时，不触发“停滞”。
6. maxTurns与maxAtomicSteps独立，不再有隐藏乘10上限。
7. 固定节点预算与恢复后的随机流可重放；搜索模拟不改变真实对手随机流。
8. 动态费用不足、城堡多个、两种招募形式、pending等机会/成功统计一致。
9. 三个剩余友军行动后才能交接的fixture，搜索须如实记录未到对手或继续完成合法交接；不得伪报对手覆盖。
10. 对手需move后attack才能惩罚危险站位的fixture，搜索能覆盖该回应。
11. 不同hasMoved/hasActed/pending/deathCount/building owner的状态hash不同；规范化同构ID测试独立。
12. 真正recruit→pending→deploy课程执行后，pending正确解除；G课程若不终局不能标NATURAL_WIN。
13. Python、NET_A、DAgger使用相同split manifest，新增纠错组实际进入train；旧validation不混入训练。
14. SPATIAL_DAGGER没有其专用checkpoint则NOT_RUN，不可回退SPATIAL_V2仍沿用标签。
15. ENGINE_ERROR不得被一个“终止原因属于枚举”的测试视为功能通过。

## 12. 审查范围与证据限制

本轮通过GitHub读取了固定提交及新旧差异、v7报告、训练器、推理器、实际策略包装层、DAgger、搜索和相关测试。远端路径 `training_runs/agent_upgrade_20260921_v7_01` 读取返回404；报告中的checkpoint/dataset/trajectory指向本地C盘。未能核对这些未随该路径公开的实际字节或复跑80场。这不证明用户没有在本地训练或测试；只表示远程代码审查尚不能核验相应产物。

无需把所有大数据塞进Git。至少提供可定位的模型与数据manifest、SHA、训练命令/日志、少量实际fixture和失败轨迹即可提升可复现性。

本包的 `isolated_v7_contract_probes.cjs` 仅复现JavaScript参数转换、null/undefined算术、状态hash和停滞判据；没有引擎、真实权重或训练。`type_contract_probe.ts.txt` 是有意错误的最小类型示例，扩展名避免误被项目tsconfig纳入；其diagnostics不是完整仓库tsc输出。

## 13. 源码证据索引

全部路径相对于本轮固定commit：

- `tools/v7_unified_evaluation.ts`：PolicyAgent、runBenchmarkMatch、runFullV7BenchmarkSuite。
- `tools/v7_heuristic_bounded_search.ts`：getFilteredCandidateActions、runBoundedSearch、evaluatePositionHeuristic。
- `src/game/ai/spatial_conv_net.ts`：SpatialResNetPredictor.predict、2/4块前向与加载。
- `tools/v7_counterfactual_dagger.ts`：predictStudentAction、runCounterfactualReplay、数据导出/训练调用。
- `tools/v7_training_pipeline.ts`：getStateHash、addSample、MAX_STEPS、课程E、split和NET_A训练。
- `python/train_spatial_resnet.py`：独立分组划分、模型初始化、policy-only、best/last导出。
- `tools/skirmish_dual_head_net.ts`：trainStep的null判定；Decision.topIndex。
- `tools/v7_cross_language_parity.ts`：直接predict调用、v6checkpoint默认路径、单demo测试。
- `tools/v7_unified_evaluation.test.ts`、`tools/v7_heuristic_bounded_search.test.ts`、`tools/v7_defect_exposure.test.ts`：测试覆盖边界。
- `src/game/ai/heuristic_ai.ts`：可注入RNG，但默认Math.random。
- `docs/training/reports/agent_upgrade_20260921_v7_01/`：comparison、data-and-training-coverage、inference-parity、task-status、NEXT_ACTION。

外部方法背景：tsx官方TypeScript说明指出其不自动类型检查，应独立执行tsc；Ross/Gordon/Bagnell (AISTATS 2011)讨论学生行为改变访问分布的模仿学习问题。新建议主要由上述项目源码推导，未将这些方法论文当作本项目已经取得收益的证据。
