# 原生快照投影只读审查

审查日期：2026-10-16。对象为同目录 `projection.ts`；审查时文件仍由主代理修改，最后一次完整读取版本SHA-256为 `ee41e5d2e7aeb95efcbf73c194c0ef2b2dbec1a19d094abc0c1eff94868759a0`。本报告不作为后续未读版本的自动背书。

本次只新增本文件；未改projection、consumer、规则或reader，未生成对局、训练或操作手机。对已有小fixture只做解析和字段比较。Java证据均位于 `APK/_analysis/jadx_output/java/p036c/p037a/p039b/`，下文简称Java路径。

## 结论

当前代码已经补上实时rules/definitions/联盟/单位上限差异及未知内部变量的阻断，方向正确。**仍不能仅凭comparableState一致宣称完整状态、完整候选mask或网络编码验收通过。** 主要未闭合项是突击后移动资格被supportLock归一化隐藏、离任单位资源差异对旧编码通道的影响，以及原生定义等于原config却不代表所有定义参数都受TS引擎支持。

已知initialGold与普通指挥官固定实体ID的问题，审查后一次读取中已见修复，不重复列作未修缺陷。

## 1. TURN_END与TURN_START规范化可接受的严格前提

**已证原生行为：**

- `p040a/C0586f.java:398–403`：TURN_END→`C0595l.m4453b`；TURN_START→`m4447c`。
- `C0595l.java:516–524`：对离任队伍单位调用`m4379A`，随后推进当前队伍。
- `C0600q.java:229–238`：`m4379A`恢复移动力f，i=false、j=false。
- 原生POST_TURN_START的`C0595l.m4472a:195–211`还在状态衰减后再次调用`m4379A`。
- TS `src/game/engine.ts:351–370`在新队伍TURN_START重置hasMoved/hasActed/support/postAttack及移动力，并未在旧队伍TURN_END同步重置。

所以在完整原生复合动作已经全部结算、事件队列已清空时，两端离任单位可以保留不同的暂存行动资源。当前仅比较当前队伍的acted/move/j相关锁，**可以作为受限规则语义比较**，必须同时满足：

1. 所有仍存活队伍的联盟互异；后续也没有动态改联盟、改归属、恢复单位行动或脚本读取被忽略字段。
2. 未丢失中间事件：每条复合动作的末态才比较；不把runtime a=2/3等中间选择/移动状态当稳定动作边界。
3. 当前队伍完整行动资源继续严格比较；下一次轮到某队时，其资源必须重新进入严格比较，不能跨整个轨迹永久忽略。
4. 不仅证明录制的那一个动作在TS合法，还应独立验证所有可能受该规范化影响的候选资格。

**联盟限制有真实代码依据，不是形式要求：**原生support条件`C0600q.java:1372`使用`m4299g`，后者`:1071–1073`调用`:876–884`按联盟判断。TS `rules.ts:331、402–413`只处理同owner单位。因此跨队联盟存在时，离任者acted/j可以影响另一队当前support候选，不能屏蔽。当前projection新增存活联盟唯一性检查对本批free-for-all有必要；整个原生族及各帧都须满足。

### 编码另有明确不等价

即使以上规则前提成立，**模型输入不等价**。`src/game/ai/spatial_tensor_encoder.ts:474–476`旧Ch21读取敌军hasMoved决定威胁范围：native离任者已恢复，TS离任者仍标hasMoved。因此comparable把敌军资源设null会隐藏实际输入差异。

建议本批把“规则转移规范化通过”和“encoder parity通过”分开。以后训练若统一从原生投影状态编码，明确记录该观察规范；若从TS连续重放状态编码，必须另行规范化并冻结schema，不能沿用旧同名编码的parity结论。

## 2. supportLock只够表达支援锁，不足以掩盖突击后移动资格

原生`C0595l.java:839–847`的完成待机设置i=true；CASTLE_CAPTOR或ASSAULT_FORCE还设j=true。原生支援重置`:878–882`设i=false、j=true并恢复移动。故原生j确实不是单纯“本回合被支援”。

对**支援候选**，当前派生表达式`hasBeenSupported || (acted && (castle_capturer || assault))`有依据：TS本来就把castle/assault排除于support目标。但不能因此认定全部可行动语义相同：

- projection.fromUnit对原生assault的i&&j设置hasPostAttackMoved=true。
- TS `engine.ts:754–797`的capture/repair/wait只设置hasMoved/hasActed，未设置hasPostAttackMoved。
- TS `rules.ts:320–338`对已行动assault、remaining>0、!hasPostAttackMoved继续生成post_attack_move。
- 因此某个assault完成wait后，原生已j锁定，而连续TS状态可能仍有post_attack_move；comparable的supportLock却把两边都算true，隐藏候选差异。

**必须阻断或专项证明：**至少额外比较“是否有post_attack_move资格/目标集合”，不能只比较supportLock。若出现差异，隔离对应状态/轨迹，不可仅因录制动作仍合法而接受训练mask。本审查只静态指出可达代码路径，没有新跑对局或把此反例频率当作已知数字。

同理，`hasMoved`从i或f<effectiveMove反推，依赖完整动作边界；原生runtime还承担移动阶段控制，状态或光环恢复f后仅靠f不足以普遍恢复历史“已移动”语义。runtime特殊值应有枚举式接纳门槛，未知组合应隔离。

## 3. 指挥官reserve屏蔽的边界

**已证：**`C0600q.java:924–936`重招募取r[team]或新建，恢复状态/HP，随后r[team]=null；TS`engine.ts:827–828、857–858`招募读取reserve但没有清空。TS以后真实指挥官死亡时`engine.ts:210–215`又以当前单位level/exp覆盖reserve。因此在存在有效存活指挥官时，旧reserve暂不参与招募；当前comparable只在无存活指挥官时比较reserveExp是可接受的受限归一化。

但须确保：native raw.k的指定指挥官和TS isCommanderUnit一致；每队普通commander类别数量与raw.k一致；不能把多名同类单位都误认为指定指挥官。原生初始化`C0600q.java:345–353`只把每队遇到的第一名配置v兵种标k=true，TS无ID覆盖时把所有unitClass=commander都当指挥官（`rule_config.ts:192–211`）。若存在第二名raw.k=false的commander类别单位，删除普通ID绑定并不能无损解决，需要拒绝该场景或独立支持。

无存活指挥官时应比较reserveExp及可派生level；其他reserve单位字段不是天然无关：原生重招募会复用对象（包括code等），而TS只取level/exp。普通SD无自定义code/head/类型变化可作为允许前提；非默认reserve body须隔离。价格→deathCount还应要求非负整数，不能只要求差值被100整除。

## 4. config.d与snapshot.players.c应逐字段核对

当前新增hash相等检查是必要的。原生`C0600q.java:327–345`在初始化把传入C0611d赋给players.c；读取快照后又会恢复这份实时规则。因此不能始终只信原config.d。

建议对34个序列化字段全部严格比较，并对差异输出字段名和值，而非仅输出hash不等。b、D未序列化的Java默认值在reader.derivedDefaults已单列，不应当原始字段变更。

**已实测的小范围：**s0001的initial和final全部34字段均与config.d一致；snapshot.definitions与config.b也完整相等。这仅覆盖已有fixture，不代表3000局全量。

另有第二道门槛：**snapshot规则等于config不代表TS实现支持这些参数。** `tools/apk_game_get_validate.ts:1046–1063`只把部分规则接入RuleConfig（攻防加成、上限、收入等）；原生其余参数也控制城堡灼烧、毒/治疗、经验、召唤兵种、持续时间和特殊倍率。对没有TS配置入口的字段，须验证其值等于当前公共引擎实际采用的默认常数，否则阻断，不能因strict replay只覆盖到未触发情形而收下。

## 5. definitions一致性还需公共引擎兼容验收

当前snapshot.components.c vs config.b完整hash相等，能阻止运行时定义变化。但公共导入器只将单位定义部分用作价格/HP等，`getEffectiveStats`仍从`UNIT_CONFIGS`取攻击、防御、移动、射程和技能；不能自动支持任意原生C0620c定义。

应保存完整definitions身份，并验证使用到的兵种定义在攻击/防御/成长/移动/射程/人口/技能/可招募旗标上匹配TS当前规则。terrain定义同样需覆盖kind、陆地、移动、防御、回血、摧毁/修理对应及可占领标记。未知或不等值必须隔离；不能只看存在APK_UNIT_ID_TO_CLASS映射。

当前importedConfig包装复用公共导入器本身可行，native reader保证字节完整消费；但公共C0620c解析会跳过一个int字段（`apk_game_get_validate.ts:633`附近），说明该入口并非“所有原始定义参数都已映射”的证明。完整原始数据仍由native_reader保留。

## 6. 变量、运行态和未映射字段的接纳表

|项目|本批可接受方式|必须隔离/标mask的情况|
|---|---|---|
|#S|保存为原始身份/随机来源，不作为TS规则或模型特征|类型不是long，或需要复现脚本随机而未实现|
|players.b随机long|保留raw sidecar；固定SD脚本不消费随机的前提下可不比较TS字段|脚本调用Stage.NextRandom等（C0598o:620–624）时不能声称随机连续性一致|
|#SC|必须类型string且值SD|SO/SR/其他mod不能套用本投影|
|#SN/#GS|验证预期类型和值/阶段，保存raw|不能仅因#前缀忽略未知阶段或脚本生命周期|
|#MVO<code><kind>|映射到apkMoveOverrides，或出现即隔离|直接改变进入地形代价（C0600q:306–312）|
|#STC<code>|映射/独立验收，或出现即隔离|直接控制原生机器人移动限制（AbstractCallableC0596m:66–67、C0595l:998）|
|#TGT<code>|保留教师策略语义，或隔离未支持教师状态|改变AI目标查询（AbstractCallableC0596m:102–103）|
|其他#变量|当前新增白名单外拒绝正确|未知者不能当metadata批量丢弃|
|非#bool/int变量|保留完整键值且核对控制脚本能表达|float/long/string/object变量或未知脚本目标必须阻断对应语义验收|
|players.n招募覆盖|null默认可接纳；支持时逐队映射|非null覆盖未映射须阻断，当前已有检查|
|players.o/p/q统计|保留raw；固定SD仅作统计时可不进入转移比较|改用评分/人类水平或value标签时须另解释；它们参与结算统计C1282f，不能擅自丢为无价值|
|players.i/j|i当前类型/淘汰，j原始可恢复类型|恢复队伍或disabled语义不能只用alive bool替代|
|unit.h/head|普通固定SD可作展示元数据，仍保存raw|脚本按head选择单位未验收时阻断|
|unit.l|删除/生命周期标志，保留raw|稳定快照中非预期值应拒绝或单独证明，不能无条件丢弃|
|runtime.a/b/c/d/e|对稳定0态和已证招募pending组合枚举接纳；路径缓存可独立保留|未知a/b、缺选中目标、pending与坐标/棋盘不一致、半结算状态不能放行|

原生`C0640d.java:45–56`明确#MVO/#STC/#TGT键构造，不能视作普通遥测。审查期间projection已从“全部#忽略”改成白名单拒绝，视为修复；后续建议继续做明确tag验证而非只验证值。

## 7. 对本次验收措辞和门槛的建议

允许称“原生序列化完整消费、已执行动作strict合法、在已列规范化前提下的结算字段一致”。在完成上述候选资格/定义兼容/编码差异门槛前，不能称“全部合法候选mask无损”“完整原生状态与TS逐字段一致”或“可直接训练”。

任何未知字段造成隔离，都要保留原局/续跑父血缘及具体原因。policy与value标签mask分别处理：原动作可合法并不代表候选集合完整，后续终局可真实也不代表训练观测无别名。禁止通过屏蔽新增差异无限放宽comparable来追求通过率。

## 更正此前本子任务格式文档的一处解释

我此前 `native_reader/FORMAT.md` 中“i初始队伍类型、j存活队伍类型”的解释写反。正确为**i当前类型/淘汰或禁用状态、j原始可恢复类型**，reader本身按a/b字段精确解码，不依赖这句解释。静态证据`C0600q.m4303g:1042`将i写5；`C0598o.SyncRestoreTeam`把j恢复到i；实测s0001 final i=[5,5,2,5,0,0]，j=[2,2,2,2,0,0]。按本次仅新增review文件的边界，未直接修改旧文档，主报告应采用本更正。

## 追加：完整候选比较与prefix释放策略

主代理随后明确准备在每个原生宏步后比较“原生快照投影状态”与“连续TS链状态”的完整合法动作语义集合，ID规范化为owner/class/pos/pending；所有checkedMacros才释放policy前缀，失败宏步不释放，任一失败使整个原始父局的value/return全部mask。**这一策略比仅comparableState检查充分，能抓到上文突击后移动与支援候选差异；以下是接纳边界，而非已运行该新增检查的通过结论。**

1. **必须准确命名证据。**两侧都调用TS getLegalActions，所以证明的是两种状态构造在同一TS规则下的完整候选一致。它没有直接枚举原生Java自己的完整候选，不能改名为“Java原生mask完全一致”。录制动作strict合法+所有宏步转移一致+两侧TS候选一致是一组较强但范围明确的证据，未执行过的原生候选仍未被穷尽证明。
2. **比较多重集并检查唯一性。**owner/class/pos/pending规范化须先检查实体键唯一；如重复就拒绝，不能用Set吞掉差异。同样规范化heal/support的行动者、attack的目标、summon的墓碑ID（坐标/归属/寿命），保留所有action字段：招募源城、落点、目标、post-move坐标和缺省目标语义。每类动作数和总候选数另核对；归一化不能把两个真实候选合成一个。
3. **闭合宏步后才释放。**一宏步需其后继原生快照（或经身份验证的final）提供结算闭合。只有该宏步的全部原子动作strict、最终字段及完整TS候选均通过，才将其policy标签标合格；失败宏步中较早已执行的原子动作也不能先释放。分段/续跑的第一个状态必须先与父段末状态链接，不可把新段当作独立通过样本。
4. **分清原生选择与适配器补步。**复合原生动作拆为TS原子序列时，建议逐原子保存labelOrigin和macroActionId。用于补齐状态、自动结算或推断出的wait/end_turn等，并不天然是原生AI独立决策；默认不得把它们当独立BC教师标签。若要教学“执行计划”，用显式结构化宏动作目标或另行验收，不能增加虚假的决策样本数。
5. **value全父局mask是正确的保守边界。**任一宏步失败，整原局及其续跑血缘的return/value不释放，即使原生最终结果已真实自然结束，也不能把未闭合的TS轨迹当同一个MDP的完整回报。未结束、循环停止和截断仍另有outcome mask，不因转移全部通过就生成胜负。
6. **policy前缀限定用途。**合格前缀仅可标为“在当前冻结TS引擎、指定投影规范和当前支持场景下的policy候选材料”；不据此宣布encoder验收或正式训练授权。下游必须读取版本/hash、prefix截止宏步及未通过原因，禁止只看到样本行便忽略父局失败状态。
7. **编码单独留证。**从统一初态+TS链得到的观察可以单独保存；明确这是连续TS观察，不是原生逐字段状态或两端网络输入等价。不要用候选集合相同替代输入hash/别名/schema验证。
