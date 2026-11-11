import path from 'node:path';
import { HERE, DATA, allowSealed, read, save, saveText } from './io';
import { scores, pairedComparison, telemetryAudit } from './analysis';
import { auditCases } from './cases';

const lock = allowSealed();
const old = 'D:/AncientEmpiresData/continuation_stage3_20261030_v1/acceptance_mac100k_20261031_v1';
const sealed = read(path.join(DATA, 'test-final/SUMMARY.json')).games;
const historical = read(path.join(DATA, 'historical-final/SUMMARY.json')).games;
const base = read(path.join(old, 'test-candidate/SUMMARY.json')).games;
const baseline = read(path.join(old, 'test-baseline/SUMMARY.json')).games;
const historyBase = read(path.join(old, 'historical-final/SUMMARY.json')).games;
const history2414 = read(path.join(HERE, '../stage1/ARENA_ANALYSIS.json')).games.map((r: any) => ({ ...r, players: 2, firstPlace: Number(r.classification === 'natural_win'), normalizedRank: Number(r.classification === 'natural_win') }));
await auditCases();
const comparisons = { generations: { baseline2414: scores(baseline), omniBase: scores(base), omniSearch: scores(sealed) },
    sealedVsBase: pairedComparison(base, sealed), sealedVs2414: pairedComparison(baseline, sealed),
    historicalVsBase: pairedComparison(historyBase, historical), historicalVs2414: pairedComparison(history2414, historical),
    bootstrap: { samples: 10000, seed: 20261101, unit: '初态槽聚类、人数分层' } };
const telemetry = { sealed: await telemetryAudit(path.join(DATA, 'test-final')), historical: await telemetryAudit(path.join(DATA, 'historical-final')) };
await save(path.join(HERE, 'FINAL_SEARCH_PAIRED_COMPARISON.json'), comparisons, true);
await save(path.join(HERE, 'SEARCH_TELEMETRY_AUDIT.json'), telemetry, true);
await saveText(path.join(HERE, 'REPORT.md'), `# V7正式验收报告\n\n训练更新0；固定Omni-Base权重${lock.modelSha256}。唯一配置${lock.selectedId}在通过完整Dev-54健康及棋力门禁后，执行一次封存54局与历史40局。\n\n搜索使用首单位原子链、己方回合余量贪心补全、主干优先双梯队敌席响应以及先验锚定J评分；每步重新进入真实根搜索，禁止自动跟进队列。教师纯Q和锚定分数分开保存。二进制GPU一致性最大误差见GPU_BATCH_PARITY.json。\n\n三代成绩与10000次配对聚类bootstrap见FINAL_SEARCH_PAIRED_COMPARISON.json；四个重点局权威逐步合法重放及丢城事件见TACTICAL_CASE_REVIEW.json。自然胜负、截断、错误分开统计，不能以保守计零替代自然负局。\n\n${JSON.stringify(comparisons.generations, null, 2)}\n\n封存实质比较率${telemetry.sealed.substantiveRate}，4P ${telemetry.sealed.substantiveByPlayers[4].rate}。完整遥测见SEARCH_TELEMETRY_AUDIT.json。对手为项目困难复刻；结论受有限初态槽、推理栈变化及搜索预算约束，不据验收结果回调配置或重试。\n`, true);
