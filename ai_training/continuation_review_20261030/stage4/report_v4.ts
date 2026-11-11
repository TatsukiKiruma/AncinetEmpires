import path from 'node:path';
import { HERE, DATA, read, save, saveText, fileSha, allowSealed } from './io';
import { scores, pairedComparison, telemetryAudit, evidence } from './analysis';
import { auditCases } from './cases';

export async function deliver(options: { planFile?: string; checksFile?: string; parityFile?: string } = {}) {
    const lock = allowSealed(), plan = read(path.join(HERE, options.planFile ?? 'RESUME_V4_PLAN.json'));
    const oldRoot = 'D:/AncientEmpiresData/continuation_stage3_20261030_v1/acceptance_mac100k_20261031_v1';
    const files = { baseline2414: path.join(oldRoot, 'test-baseline/SUMMARY.json'), omniBase: path.join(oldRoot, 'test-candidate/SUMMARY.json'), omniSearch: path.join(DATA, 'test-final/SUMMARY.json'),
        historical2414: path.join(HERE, '../stage1/ARENA_ANALYSIS.json'), historicalBase: path.join(oldRoot, 'historical-final/SUMMARY.json'), historicalSearch: path.join(DATA, 'historical-final/SUMMARY.json') };
    const baseline = read(files.baseline2414).games, base = read(files.omniBase).games, search = read(files.omniSearch).games;
    const comparison = { schema: 'stage4-three-generation-paired-v1', stage4VsOmniBase: pairedComparison(base, search), stage4Vs2414: pairedComparison(baseline, search),
        generations: { baseline2414: scores(baseline), omniBase: scores(base), omniSearch: scores(search) },
        historical: { stage4VsOmniBase: pairedComparison(read(files.historicalBase).games, read(files.historicalSearch).games),
            stage4Vs2414: pairedComparison(read(files.historical2414).games.map((r: any) => ({ ...r, players: 2, firstPlace: Number(r.classification === 'natural_win'), normalizedRank: Number(r.classification === 'natural_win') })), read(files.historicalSearch).games),
            byOpponent: Object.fromEntries(['hard', 'simple'].map(opponent => [opponent, Object.fromEntries([
                ['baseline2414', read(files.historical2414).games], ['omniBase', read(files.historicalBase).games], ['omniSearch', read(files.historicalSearch).games]
            ].map(([name, games]) => { const rows = (games as any[]).filter(r => r.opponent === opponent); return [name as string, { attempted: rows.length, natural: rows.filter(r => r.natural).length, wins: rows.filter(r => r.classification === 'natural_win').length, nonNatural: rows.filter(r => !r.natural).length }]; }))])) },
        sources: Object.fromEntries(Object.entries(files).map(([name, file]) => [name, { file, sha256: fileSha(file) }])), testRuns: 1, noTrainingUpdates: true };
    await save(path.join(HERE, 'FINAL_SEARCH_PAIRED_COMPARISON.json'), comparison, true);
    const parityFile = options.parityFile ?? 'GPU_BATCH_PARITY_V2.json';
    const telemetry = { sealed: await telemetryAudit(path.join(DATA, 'test-final'), parityFile), historical: await telemetryAudit(path.join(DATA, 'historical-final'), parityFile) };
    await save(path.join(HERE, 'SEARCH_TELEMETRY_AUDIT.json'), telemetry, true);
    if (telemetry.sealed.invalidTeacher || telemetry.historical.invalidTeacher) throw Error('存在非法教师分布，不能宣称交付通过');
    await auditCases();
    const cases = read(path.join(HERE, 'TACTICAL_CASE_REVIEW.json')).reports, dev = read(path.join(HERE, 'DEV_ABLATION_SUMMARY.json'));
    const parity = read(path.join(HERE, options.parityFile ?? 'GPU_BATCH_PARITY_V2.json')), checks = read(path.join(HERE, options.checksFile ?? 'PUBLIC_CHECKS_V2.json'));
    const table: string[] = [], devTable: string[] = [], historical: string[] = [];
    for (const [name, result] of Object.entries(comparison.generations)) for (const n of [2, 3, 4]) {
        const r = result.byPlayers[n]; table.push(`| ${name} | ${n}P | ${r.wins}/${r.natural}/${r.attempted} | ${r.conservativeRank.toFixed(4)} | ${r.roundTruncations}/${r.actionTruncations}/${r.wallTruncations}/${r.errors}/${r.timeForfeits} |`);
    }
    for (const r of dev.screen) devTable.push(`| ${r.id} | ${r.scores.equalWin.toFixed(4)} | ${r.scores.equalRank.toFixed(4)} | ${r.scores.missing} |`);
    for (const [opponent, values] of Object.entries(comparison.historical.byOpponent)) for (const [name, r] of Object.entries(values)) historical.push(`| ${opponent} | ${name} | ${r.wins}/${r.natural}/${r.attempted} | ${r.nonNatural} |`);
    const t = telemetry.sealed;
    const text = `# 第四阶段Omni-Search技术与验收报告

完成时间：${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })} +08:00。本阶段训练更新为0，模型权重固定为40000更新Omni-Base，SHA256：${lock.modelSha256}。未替换前端默认模型，未启动第五阶段。

## 修复与工程合同

共用运行时新增Max^n效用、己方联盟提前出局终局化、生存排序与完整反扑后的末城否决。价值公式按当前活跃联盟聚合，二联盟还原2p-1；边界为正负一。严格单调性质指固定敌人相对分配、沿概率单纯形增加己方质量，不能解释为不同敌方集中度任意跳变时仍全序单调。死亡精确为-1，生存概率下溢时保留严格高于-1的边界。先验尺度、效用模式和beta进入缓存身份。旧同步类保留20至4000ms合同及首单位队列语义。

新异步搜索按完整单位链展开、叶节点估值、多敌席响应三类波次跨分支合批。敌席使用当前行动席自身观测和策略排序，不把所有敌人建模为串通围攻。复杂盘面按两个决赛候选的小波次依次闭合；后续未启动候选保留未评估掩码，不冒充完整响应。敌方移动行动者按自身网络预筛，全部即时非移动战术、招募和城堡相关行动者保留，仅在候选池内按logits+priorScale*softPriors排序；这牺牲部分全菜单移动覆盖，并非全菜单最优响应。权威引擎自动跳过无行动己方回合时，按实际顺位跨越识别已轮回，不继续多算一轮敌人。

仅兑现首单位完整链；队列同时验证完整前态与当前合法性。所有已保存抽样见证独立合法重放，输入引擎不变。无搜索基线及第三阶段冻结文件没有被改写；原1-ply末城问题由本阶段后反扑搜索与否决缓解，不保证消灭全部长局截断。首轮整盘开发诊断只有0.79%实质比较率，首个控制组44步在工程停止时终止；原runner标为user_stop，本次实际为代理主动工程停止。该中止不计入消融成绩，也不是自然负局；旧源码、结果与停止标志均保留，详见ENGINEERING_REVISION_V2.json。

本轮CPU热点修复仅复制反击预测的攻守双方、延后破坏目标占位查询并复用反向距离。194状态、776菜单、59834次反击值与旧快照一致；三个新增开发验证局231根全部完成实质比较但0胜3负。新开发首根的一轮Hard响应诊断显示敌方模型偏差，不能把吞吐恢复等同于棋力提升。详见REVISION_V4_REPORT.md和RESPONSE_MODEL_DIAGNOSIS_V4.json。

## GPU数值与吞吐

GPU batch1、同尺寸16、异尺寸16、batch128与TypeScript前向检查通过，最大误差${Math.max(...Object.values(parity.errors) as number[])}，门槛2e-5。普通float32与仅模块高精度模式的失败记录保留；最终实现沿用阶段三ragged地图边界，归约按TypeScript的算子舍入边界执行。异尺寸批16相对串行16的实测端到端加速${parity.mixedSpeedupVsSerial.toFixed(3)}倍；该数字包括IPC、不包括游戏CPU编码，不能宣称整盘等倍率加速。

本轮开发A/B及完整54局混合修复前后运行时，不能将差异单独归因于效用或先验。最终封存使用唯一锁定的统一运行时。

## 开发消融与锁定

用户已明确批准RESUME_V4_PLAN.json的新资格顺序。原三组18局预筛失败结论不变，全部57条既有记录保留；仅maxn-prior035用原18局、修复版三个未评局和后续33个未评局组成完整54局，再按严格>90%实质比较、零时间判负、零非法教师门槛决定是否锁定。详见SELECTION_PROTOCOL_APPROVED_V4.json及PROPOSED_SELECTION_PROTOCOL_V4.json。

原18局固定预筛为2P/3P/4P各6局，三组原成绩完整保留。按用户批准的新资格顺序，仅maxn-prior035补齐完整54局；旧失败和截断仍计入成绩及健康统计，没有重跑替换。封存面板在锁定前访问为0，未运行80k诊断。

| 配置 | 等权保守独胜率 | 等权保守排名分 | 非自然局 |
|---|---:|---:|---:|
${devTable.join('\n')}

锁定：${lock.selectedId}；完整开发等权排名${dev.fullDevelopment.equalRank.toFixed(4)}。效用与先验A/B的逐人数提前淘汰、回合截断和配对区间见DEV_ABLATION_SUMMARY.json。18局预筛覆盖有限，不能声称所有开发类别、地图、席位均衡覆盖。

配置：${JSON.stringify(lock.options)}。16决赛候选的4P测速未闭合；最终以12候选和15%己方节点/时间配额给多敌响应留出预算，偏离原16至20目标区间。maxUnits=5是上限，预算截断时实际深度另有遥测；未伪称每次均展开5个单位。

## 唯一一次54局封存与40局历史配对

| 模型 | 人数 | 独胜/自然/计划 | 保守排名分 | 回合/动作/墙钟截断/错误/超时 |
|---|---|---|---:|---|
${table.join('\n')}

三代等权独胜率/排名分分别为：${Object.entries(comparison.generations).map(([name, r]) => `${name} ${r.equalWin.toFixed(6)}/${r.equalRank.toFixed(6)}`).join('；')}。

相对Omni-Base的配对结果：${JSON.stringify(comparison.stage4VsOmniBase.equal)}。按初态槽聚类、人数分层等权、固定种子${plan.bootstrapSeed}、${plan.bootstrapSamples}次bootstrap。非自然原始分留空；保守计零不等于自然负局。存在缺失时完整自然结果CI留空，保守评分CI另列；[0,1]缺失结果界限是确定性边界，不能当作置信区间。

| 对手 | 模型 | 胜/自然/计划 | 非自然 |
|---|---|---|---:|
${historical.join('\n')}

## 四个遗留痛点的实际变化

${cases.map((r: any) => `- ${r.id}：${r.previousProblem} → ${r.current.classification}，${r.current.steps}动作、${r.current.rounds}回合，排名${r.current.normalizedRank}；本次轨迹${r.replayedSteps}步合法重放，丢城/出局事件${JSON.stringify(r.incidents)}。`).join('\n')}

上述是同冻结初态的本次新实战事实，不将局部翻盘解释为普遍战略根因。完整逐动作和事件证据见TACTICAL_CASE_REVIEW.json及D盘压缩轨迹。

## 搜索健康与教师合同

非唯一且非队列根搜索${t.nonUniqueNonQueuedRoots}次，至少两个不同根动作完成反扑的实质比较率${(100 * t.substantiveRate).toFixed(2)}%，目标大于90%；平均/P95耗时${t.rootMeanMs.toFixed(2)}/${t.rootP95Ms}ms，超预算率${(100 * t.overBudgetRate).toFixed(2)}%，面板时间判负${t.timeForfeits}。平均己方/响应节点${t.meanOwnNodes.toFixed(2)}/${t.meanResponseNodes.toFixed(2)}，平均/峰值batch ${t.meanBatchSize.toFixed(2)}/${t.peakBatchSize}，网络端到端吞吐${t.networkObservationsPerSecond.toFixed(2)}观测/秒。

软预算停止${t.budgetExpirations}次，未消费的候选观测${t.budgetDiscardedObservations}个；这些记录没有伪造为已完成Q，不是服务故障或自然胜负。传输看门狗故障仍保留为非自然运行错误，不通过忽略异常来满足零判负目标。

2P/3P/4P完整响应：${JSON.stringify(t.responseByPlayers)}。有效教师标签${t.teacherValid}，不可用${t.teacherUnavailable}，非法分布${t.invalidTeacher}；末城否决${t.vetoed}。未闭合分支不作安全保证或教师标签。pi_search只对完整post_response根动作Q做温度softmax，未评估动作q=null、evaluatedMask=false；否决计划概率为0。没有完成反扑时输出不可用标签而非伪造概率分布，后续训练必须过滤。V_search为可用根动作的最佳保守反扑价值。抽样见证${t.witnesses}条、${t.witnessActions}个动作，全部合法且终态一致。

## 检查、局限与停止边界

公共真实检查：${checks.results.map((r: any) => `${r.name} exit=${r.exitCode}，日志${r.stdout}`).join('；')}。训练工作区独立类型检查与分析合同自检另行保存，不能替代公共检查。全部源码、模型、配置、结果与历史引用SHA见EVIDENCE_MANIFEST.json。

对手为项目困难脚本复刻，不是APK原生人机；标准地图为已知地图。少量初态槽的区间较粗；实际棋力、截断率、完整率或预算目标若未达到，按原始数据如实报告，不回调配置、不追加候选、不重跑封存。只检查已物化地图，未声称依赖本地APK解包目录的资源检查通过。完成后控制器关闭其所有推理和评测子进程，并在RUN_CLOSED.json记录实际退出见证；等待审查。
`;
    await saveText(path.join(HERE, 'REPORT.md'), text, true);
    await evidence();
}
