# 真实 APK 回放转换与验收

本目录只处理现有 `captures/mitm_replay` 与 `captures/cloud` 的 `game_get_*.bin`。不连接网络、手机、ADB或Frida，不生成对局，不调用对局策略，不启动训练。全部新增产物仅写本目录，旧研究和原始响应不覆盖。

**计数单位是唯一响应SHA，不是统计独立对局。** 本文“每局分片/轨迹”仅指单份响应重建的轨迹单元。257份唯一响应不能直接称为257局独立、完整、高水平对局；标识家族与严格独立性见收尾`families.json`。

## 状态与完成条件

本轮全量结果已完成：270路径、257唯一响应；255份通过、2份SR隔离，484,681条非投降policy标签，172条投降行屏蔽；全部真实value/return关闭。完整性审计覆盖全部257份封存分片及270个原始路径。API来源映射145份已证、112份未知，不能把响应数当作独立对局数。具体网络schema仍未解锁。最终机器结果与用途索引见`final-summary.json`和`policy-release-index.json`，封存以`EVIDENCE_MANIFEST.json`为准。

实际人数按配置`playerTypes>0`推导，并额外核对本批导入器队伍集合相等，详见`player-config-verification.json`。本批合格真实轨迹大多为多人配置，双人SD只有2份、445条非投降标签，首个双人模型的数据主体是原生桶。

- `manifest.json`：不可变的输入、公共源码、转换器及运行时身份；270路径按响应SHA去重为257份。以实际盘点为准，不预设通过255份。
- `status.json`：本转换worker当前阶段与逐局进度。只有它的时间戳与本地worker一致时才是实时状态。
- `summary.json`：逐局receipt汇总。**只有status=COMPLETE、completed=257、pending为空且sourceStableAtSummary=true才表示全量转换已结束。** 其中rejected不是合格数据，不能合并进acceptedGames。
- `receipts/<响应SHA>.json`：每局不可变验收单，保存开始/结束时间、源码身份、严格结果、可验前缀、标签、耗时、统计和压缩分片SHA。
- `accepted/`：整局严格无损通过的紧凑候选分片；只有被summary.acceptedGames与对应receipt.accepted=true同时列入的分片可消费。
- `rejected/`：mod、未实现或严格失败的诊断前缀，全部隔离，不因为前缀合法而默认整局合格。
- `attempts/`：因空间、身份变化或进程中断而未形成receipt的尝试，不能训练；恢复从该局开头重做，保留旧尝试。

已完成的receipt会按源码/响应/压缩SHA核对后跳过，因此可逐局恢复。输入、源码、Node版本或转换器身份改变时拒绝沿用旧manifest，需另立有身份的新运行目录；不得直接改写manifest来伪装连续。

## 已执行小规模验证

`tests.log`：6项小测试通过，覆盖终局后动作拒绝、替换事件阻断、pending完整规则态哈希、初次收益/克隆、gzip流和预算阻断，以及真实SO159条与权威`validateApkReplay`的终态/动作数量一致。篡改候选索引和value mask均能被读取器拒绝。

`typecheck.log`：按项目现有TypeScript非strict配置检查本目录代码及其公共依赖通过。这里的“严格验收”指游戏合法动作和信息无损门槛，不是声称公共源码已开启TypeScript strict。

`benchmark.json`：3局2201个原生macro展开3695个原子动作，转换14.61秒，gzip共487926字节。按全301844条记录线性外推约33.4分钟、约64MiB；地图与单位数量会使合法动作枚举非线性增加，实际预算预留约1–3小时。基准是小样本，不能将它当最终耗时承诺。

`reader-verification-sample.json`：基准3局由独立流读取器从初态重新执行全部3695个原子动作，重新检查候选顺序/索引、原子展开、状态hash链和标签，通过。全量生产转换本身对每个动作执行同样的严格权威检查；这份独立读取器报告的范围始终只是所列样本，不伪称全量独立重放。

## 分片schema与恢复语义

每局一个gzip JSONL，schema为`replay_candidate_stream_v1`。不保存逐步全状态和dense张量。

冻结header中的`identity.gameIdHash`和receipt中的`lineage`沿用了旧研究命名，实际来源是C1258d首个nullable字符串的散列。新侧车统一称`opaqueEmbeddedObjectIdHash`，并逐响应核对语义：cloud的145份通过`download_report.id`散列与响应SHA绑定实际API请求ID；July无可证API映射保持unknown，不猜父局或独立性。冻结分片不因元数据语义更正而改写。

cloud文件名中的24位十六进制标识是API ID的SHA256截断，不等于API原始ID。证据并非只凭metadata字段名：`tools/aeii_download_finished.py`第92、99、106、108–109行用同一个`game_id`变量发送`/api/game_get`、生成散列文件名并写入下载清单的id、响应SHA和字节数；请求编码器将ID写入请求`i`字段。`families.json.downloaderEvidence`绑定下载器、helper加载器及编码器的源码SHA和行号。这里只读这些源码，未执行下载程序或读取本机会话凭据。

1. `kind=game`：原始响应SHA、全部重复路径、游戏/玩家身份散列、种子、场景、玩家类型/联盟、初始规则态、来源元数据、源码与转换器身份、原动作数组身份。
2. `kind=macro`：原始解析记录、原生macro序号、严格展开数量及动作前hash。`NONE`不被当成无操作，含招募字段时仍由权威展开器解释。`GAME_START`可合法展开为零动作并单独留痕。
3. `kind=atomic`：结构化原子动作、`actionCode`、未排序的权威合法候选中的`candidateIndex`、候选数量/顺序hash、前后完整规则态hash、macro/子动作归属、前后当前玩家/回合、控制者类型/身份散列/联盟、实际演员兵种及标签mask。
4. `kind=end`：整局资格、实际消费数、最后规则态hash、拒绝原因、项目重建结果、席位投降事件、标签证据。

恢复初态时使用game行的`initialState`和`engineOptions`。初态是**初次收益之前**的权威导入配置；`applyInitialTurnStart=true`只在首次构造时执行一次。`effectiveInitialStateHash`校验收益后的有效初态。`engine.clone()`及恢复中间快照不再次执行初次收益。

规则态SHA为`sha256(canonical(GameState除metadata外的全部字段))`；数组保留顺序，覆盖单位ID、墓碑、pending、储备、玩家、规则、脚本态和计数器，不能换成仅棋盘指纹。`GameState.metadata`按公共类型约定不参与规则，原始元数据另存，避免文件路径污染规则态身份。

候选SHA为`sha256(canonical(ordered legal.map(encodeAction)))`，**不排序候选**。索引不是固定动作空间的整数mask下标。读取者必须按同一初态、动作链、规则与运行时重建有序候选，核对数量/hash后取索引；不得仅凭actionCode字面内容猜索引。选中动作码须能encode/decode往返且在候选中恰好出现一次；任何候选码碰撞都会拒绝该局。

## 合法性与信息损失门槛

转换器通过公共`parseRemoteReplay`加载，按SD/SO选择规则；原始对象与动作数组须完整消费、地形映射须精确。SR/mod及未知场景隔离，即使某前缀能在SD规则下执行也不成为标准数据。

复用公共`createRecordExpansionOptions`、`expandApkReplayRecordToProjectActions`、`getLegalActions`（经GameEngine接口）与`GameEngine.step`；不复制游戏规则。每个skipped/replaced/ambiguous通知立即抛错，禁止模糊招募取首项、缺源/缺目标当no-op或forced。转换前后都校验源码和原始响应SHA，初始及最终核对clone状态hash。

**终局后动作先于引擎调用被拒绝。** 引擎的`Game already ended`不能被误计为已执行。新包不沿用旧研究的中文匹配计数器；terminalIgnored=0来自主动禁止该路径，而不是错误的字符串计数。若复合macro的前一个原子动作已终局而后一个仍要求移动，同样拒绝后续动作，不静默略过。

成功转换证明的是当前权威TS引擎上的动作、候选和规则状态链自洽；没有把它升级成APK每个字段逐项等价、原版脚本身份一致或最优教师证明。载荷schema100不是APK版本号。

## 标签与全部合格数据使用

本次不从合格真实回放中预留最终评测集；全部合格policy候选进入未来训练候选manifest。另备独立评测协议，后续用户明确授权时才生成或收集独立评测对局。旧R8–R12和已研究的真实回放不重命名为独立最终验收。

- `labels.policyMask`：局部候选资格，非投降原子动作为true；**还必须整局receipt.accepted=true**。失败前缀中的局部true不能越过整局隔离。
- `valueMask=false`、`returnMask=false`、`nativeOutcomeVerified=false`：对所有真实回放恒定关闭。原始载荷没有可独立核实的原生最终状态或胜负真值，不能按CLOSED、TS胜者、军力或长局截断补标签。
- `outcome.projectWinner`单列TS规则重建的联盟胜者，`nativeWinner=null`。区分未结束前缀、席位投降触发终局、其他规则动作触发终局，保留此前发生过的席位投降。
- `seatSurrenders`记录动作时实际座位、控制者散列、联盟和淘汰席位。一个账号可控制多个席位，席位投降不能被称为“整个人退出”；`personalAccountExitVerified=false`保留未知。
- type1与type2分别保留，不把混合AI席位动作全叫人类教师。共享玩家身份、地图族、来源和长局重复权重仍应由训练采样器显式处理。

这个包是可重建的规则态/动作候选格式，不是已通过某个具体模型编码器的张量。TS/Python观测编码、模型候选特征与前向一致性须在接入具体训练器时另验，不能用本次规则链验收替代。

机器口径进一步分为：`sourceTraceAccepted`表示整局规则态链通过，`policyLabelEligible`还要求至少存在一个未屏蔽policy行；`modelSchemaAccepted=false`表示具体网络输入尚未验收，因此总`policyGateSatisfied=false`。**紧凑完整状态＋有序动作不等于旧34通道网络可以直接消费。** 最终`final-summary.json.sourceAdmission`逐来源记录这些门槛：合格轨迹来源全部归属`train`，异常归属`quarantine`，现有库不保留最终评测局；`trainingAuthorized=false`始终明确本次只转换验收、没有获准启动训练。

`policy-release-index.json`是用途索引，只有`candidateSources`中的非空来源及满足`release_contract.ts::policyRecordEligible`的原子行才是policy标签候选。`PURE_SURRENDER_POLICY`明确纯投降来源留作train用途的溯源记录，但0个policy示范；这些来源列于`emptyPolicySources`，不混入policy候选列表。含正常前缀和末尾投降的合格来源保留前缀，投降行全部mask。最终汇总单列`maskedSurrenderRows`、纯投降来源和零policy来源数，`release.test.ts`用真实封存分片回归该合同。

## 资源限制与运行

默认1个本地转换worker，zlib线程池通过该进程的`UV_THREADPOOL_SIZE=1`设置。每250个原子动作检查C盘空闲并更新本目录状态；每局检查累计产物，gzip输出本身也受剩余预算约束。C盘空闲低于12GiB或本目录总产物达到256MiB时以`PAUSED_GUARD`停止自己的工作，不操作采集进程，不删除历史数据。

在仓库根目录运行：

```powershell
node --openssl-legacy-provider --import tsx --test ai_training/data_acceptance_20261016/replay/core.test.ts
node node_modules/typescript/bin/tsc -p ai_training/data_acceptance_20261016/replay/tsconfig.json
$env:UV_THREADPOOL_SIZE = '1'
node --openssl-legacy-provider --import tsx ai_training/data_acceptance_20261016/replay/convert.ts --benchmark
node --openssl-legacy-provider --import tsx ai_training/data_acceptance_20261016/replay/convert.ts
```

已有有效receipt的局会恢复跳过。`worker.lock.json`防止同目录多worker争用；异常中断后先验证锁里PID/命令行身份，不能随意停止其他进程或清除运行中的锁。

显式读取器复验：

```powershell
node --openssl-legacy-provider --import tsx ai_training/data_acceptance_20261016/replay/verify.ts --sample 3
# 只有确需额外全量独立重放时才运行；其CPU耗时与动作数及局面复杂度相关。
node --openssl-legacy-provider --import tsx ai_training/data_acceptance_20261016/replay/verify.ts --all
```

`--sample`报告只证明列出的样本，`--all`完成后才会产生全量独立重放报告。不要将进行中的summary或历史通过率当作最终数量。

全量转换结束后，按顺序完成全部压缩/结构/mask/原始macro重解码验收、覆盖汇总和不可变证据封存：

```powershell
node --openssl-legacy-provider --import tsx ai_training/data_acceptance_20261016/replay/integrity.ts
node --openssl-legacy-provider --import tsx ai_training/data_acceptance_20261016/replay/families.ts
node --openssl-legacy-provider --import tsx ai_training/data_acceptance_20261016/replay/aggregate.ts
node --openssl-legacy-provider --import tsx --test ai_training/data_acceptance_20261016/replay/release.test.ts
node --openssl-legacy-provider --import tsx ai_training/data_acceptance_20261016/replay/seal.ts
```

`integrity-report.json`明确该全量审计不冒充第二次全量独立规则重放；生产转换已逐步验合法动作与候选，额外独立规则重放的样本范围单独记录。`final-summary.json`给出最终来源层资格、具体模型门槛、真实标签mask、分来源覆盖和全部拒绝项。`EVIDENCE_MANIFEST.json`封存本目录产物SHA；封存后重新运行可变汇总会改变文件身份，应另保存新快照，不改写封存清单。

`families.json`另记270路径/257响应SHA、同SHA别名、可证API父组及版本/宏前缀关系、未知父局响应，以及跨响应原始macro内容相同组。绑定下载metadata文件SHA、mtime与读取截止；只对有映射的API ID版本作结论，July未知映射时不能排除跨批同父局。`independentGameCount=null`明确独立对局数未证实，谱系未知不能用于将来“严格独立评测”的证明。当前合格来源均归属train，该元数据限制不自动将合法policy轨迹作废，也不授予训练许可。
