import fs from 'node:fs';
import path from 'node:path';
import { DIR, ROOT, read, save, sha, directoryBytes } from './io';
import { SCHEMA_ID, PLAYER_SLOTS, MAP_CHANNELS, ENTITY_DIM, RELATION_DIM } from '../../src/ai_runtime/dual_v2/contract';

const names = ['multiplayer-100units-gate', 'bijection-symmetry-gate', 'encoding-speed-gate', 'ts-python-bridge-gate', 'streaming-loader-gate', 'public-checks'];
const gates = Object.fromEntries(names.map(name => [name, read(path.join(DIR, name + '.json'))]));
const split = read(path.join(DIR, 'split-manifest-v2.json'));
const exceptionFile = path.join(DIR, 'acceptance-clarification.json');
const clarification = fs.existsSync(exceptionFile) ? read(exceptionFile) : { accepted: false };
const implementationGatesPassed = Object.values(gates).every(g => g.passed), literalDataCoverage = gates['bijection-symmetry-gate'].literalRealCoveragePassed;
const passed = implementationGatesPassed && (literalDataCoverage || clarification.accepted);
const identities: Record<string, string> = {};
for (const dir of [path.join(ROOT, 'src/ai_runtime/dual_v2'), DIR]) for (const file of fs.readdirSync(dir)) if (/\.(ts|py)$/.test(file)) identities[path.relative(ROOT, path.join(dir, file)).replaceAll('\\', '/')] = sha(fs.readFileSync(path.join(dir, file)));
for (const file of ['rules.ts', 'engine.ts', 'env.ts', 'map.ts', 'abilities.ts', 'rule_config.ts', 'terrain_rules.ts', 'clone_state.ts', 'ai/tactical_pathfinding.ts']) identities['src/game/' + file] = sha(fs.readFileSync(path.join(ROOT, 'src/game', file)));
save('source-identities.json', { schema: SCHEMA_ID, sources: identities, sourceContractsSha256: split.sourceContractsSha256, nativeReleaseIndexSha256: split.nativeReleaseIndexSha256, replayReleaseIndexSha256: split.replayReleaseIndexSha256 });
const stats = gates['bijection-symmetry-gate'], speed = gates['encoding-speed-gate'].results;
const replayCounts = [2, 3, 4, 5, 6].map(n => split.parents.filter((p: any) => p.source === 'replay' && p.configuredPlayers === n).length).join('/');
save('gate-summary.json', { schema: SCHEMA_ID, passed, implementationGatesPassed, originalLiteralRealDataCoveragePassed: literalDataCoverage, status: passed ? 'phase1_complete' : 'implemented_waiting_source_coverage_clarification', clarification, dimensions: { playerSlots: PLAYER_SLOTS, spatialChannels: MAP_CHANNELS, entityDimension: ENTITY_DIM, relationDimension: RELATION_DIM }, gates: Object.fromEntries(names.map(name => [name, { path: name + '.json', passed: gates[name].passed, sha256: sha(fs.readFileSync(path.join(DIR, name + '.json'))) }])), realStates: stats.realStates, uniqueRealStates: stats.uniqueRealStates, exclusions: split.exclusion.uniqueStates, sourceCoverage: split.counts, trainParentsOrResponses: split.parents.filter((p: any) => p.split === 'train').length, devParentsOrResponses: split.parents.filter((p: any) => p.split === 'dev').length, featureCacheBytes: 0, directoryBytesAtSummary: directoryBytes(DIR), diskLimitBytes: 100_000_000, trainingSteps: 0, selfPlayGames: 0, oldStage5Resumed: false, generatedAt: new Date().toISOString() });
const report = `# 双流 v2 阶段 1 报告

日期：2026-10-20（北京时间）。${passed ? '阶段1实现与验收完成。' : '阶段1代码及实现检查完成；原任务“所有动作类型均来自真实数据”的字面门槛仍需确认，不能声称原始硬门禁全部通过。'} 阶段2～5未启动，旧阶段5继续暂停；训练更新和自对战均为0。

## 实现与合同调整

新增公共目录src/ai_runtime/dual_v2：相对顺位、联盟价值、34通道空间流、66维实体流、16维成对关系、15个语义头的Who→Where→What动作指针及独立逆映射。运行时不依赖ai_training。没有修改UI或应用策略入口。

用户明确确认将最多4槽/4维价值扩展为最多6槽/6维价值，以支持真人5～6人对局。空间与实体维度相应增加，所有索引、mask和桥接一致。当前权威Action共14种（含投降），非投降13种；15是语义头编号数，包含投降保留位和显式摧城目标变体，不能称15种权威动作。

现行引擎不含指挥官攻防光环、水晶治疗光环、冰元素冻结减速；编码实际存在的鼓舞/净化/虚弱、圣骑治疗、德鲁伊support和召唤潜力。静态图不预测未来恢复和占位变化，细节见公共README。

## 数据与划分

来源清单完整登记3000原生父局、5012段，实际人数1944/528/528；另有255份合格真人响应，其中253份有policy标签、2份纯投降仅溯源。255份真人初态中，2/3/4/5/6人分别为${replayCounts}份（policy子集为4/6/42/39/162份）。原生22个零policy父局仍保留在清单，不制造样本。

按实际人数/地图族/计划/模式分层并保持父局续段完整；可证真人API家族不跨分区。共有3255个父局/响应登记，训练2609、开发646，377个分层；39个单组层无法双区分配，全部保留训练并在manifest列明。所有来源已被历史工作消费，因此开发分区不称独立最终评测。

永久排除阶段3～5的${split.exclusion.uniqueStates}个评测前态，1049份来源引用与SHA留存。来源beforeHash、当前完整stateHash与ruleStateHash均参与检查。没有修改封存源索引、模型或历史报告。

原生先用既有compact_reader完整预检，再流式读取压缩字节；真人包验证SHA/CRC、整包收据和原始摘要链。两者均对当前完整权威合法集合按encodeAction重映射。当前规则漂移单独记录，原生漂移后屏蔽value；当前规则拒绝标签时隔离该段/包尾部。只剩end_turn/surrender的平凡帧剔除。未重新运行全部9188210+484681条原子的当前规则验收，不将旧来源收据冒充全量新版规则重验。

## 验证结果

|门禁|结果|证据|
|---|---|---|
|全模式/大图|通过：1v1、3FFA、4FFA、2v2、6FFA、20×12矩形、32×32/100子、64×64/160子|multiplayer-100units-gate.json|
|双射/对称|${stats.uniqueRealStates}个不同真实状态，4种D2变换；真实12类、独立合法夹具补全第13类；字面真实全类型覆盖=${literalDataCoverage}|bijection-symmetry-gate.json|
|标准1v1性能|200次完整编码p95=${speed[0].p95.toFixed(4)}ms，门槛3ms|encoding-speed-gate.json|
|100子/1195候选性能|200次完整编码p95=${speed[1].p95.toFixed(4)}ms，门槛15ms|encoding-speed-gate.json|
|TS→PyTorch|10个变长批次、140数组、290098元素逐字节一致，误差0；另有3个真实样本直接IPC且不落盘|ts-python-bridge-gate.json|
|公共检查|npm run lint、388项测试、npm run build、本目录独立tsc全部通过|public-checks.json|

性能包含全新静态图、完整最短路表、实体关系和全部因子动作索引；完整合法集合的输入生成不计时。记录全部200次计时，预热60次，没有剔除尾部。公共寻路器复用同状态地形表、整数Dial桶，非整数/极端代价保留通用堆；共享路径表产生可停留格，复杂堆叠回退原权威查询。新增回归覆盖整数、零、小数、极端代价、全目标路径、堆叠及教师评分等价。编码不调用引擎clone/step的回归通过。

抽样读取实际访问${stats.stats.visited}行，平凡帧${stats.stats.trivial}行，当前状态摘要漂移${stats.stats.currentStateDrift}行，当前规则拒绝${stats.stats.currentRuleRejected}行；未将仅用于寻找稀有菜单的所有访问行都计为双射检查样本。双射收据只登记实际完整校验的320帧，各帧另验证动作集合、空间、实体坐标、关系矩阵、指针及真实目标动作的step几何交换一致。

## 真实覆盖的不可满足项

全量扫描5012原生分片和255真人初态均为commanderCastleRecruitUsesPending=true；权威getLegalActions在该模式不会产生recruit_and_deploy。不能通过篡改真实初态补出此类。独立合法夹具实际含764个候选，覆盖全部13类非投降动作；空城招募、指挥官同格招募/直接部署、pending及突击二动均在真实样本或独立夹具中验证并区分来源。source-action-coverage.json保存全量扫描和稀有菜单的实际原始动作见证。

${clarification.accepted ? '用户已接受以真实12类及独立合法夹具第13类替代不可能的真实全类型覆盖；确认内容见acceptance-clarification.json。' : '当前gate-summary.passed=false，implementationGatesPassed=true。需要确认是否接受“真实12类＋独立合法夹具第13类”的明确口径；未擅自把字面门禁判为通过。'}

## 磁盘、复跑与边界

本目录约${(directoryBytes(DIR) / 1e6).toFixed(2)}MB，小于100MB（十进制）。主要是17.78MB压缩排重集合和1.16MB桥接小样本；全量特征缓存0字节。TypeScript与Python可通过有背压的二进制管道逐批消费全部已准入数据，无解压临时文件。入口和命令见README.md，模型/schema/source身份见source-identities.json。

build仅报告既有大chunk提示。未启动训练、对战、手机/ADB操作、网络下载或发布；没有删除历史模型、对局、归档与已有修改。已有工作区大量迁移改动按原样保留，本报告不冒称对整个历史工作区做过事前逐文件SHA保全。未消费未来阶段的神经网络、Chrome前向或整回合搜索任务。
`;
fs.writeFileSync(path.join(DIR, 'REPORT.md'), report);
console.log(JSON.stringify({ passed, implementationGatesPassed, literalDataCoverage, bytes: directoryBytes(DIR) }));
