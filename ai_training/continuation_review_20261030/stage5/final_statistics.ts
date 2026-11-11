import fs from 'node:fs';
import path from 'node:path';
import { HERE, DATA, read, save, fileSha, allowSealed } from './sealed_io';
import { scores, pairedComparison, telemetryAudit } from '../stage4_v7/analysis';

/** 只读冻结结果进行配对和权威重放，不运行新对局或改变模型。 */
const token = allowSealed();
const old = 'D:/AncientEmpiresData/continuation_stage3_20261030_v1/acceptance_mac100k_20261031_v1';
const v7 = 'D:/AncientEmpiresData/continuation_stage4_v7_20261102_v1';
const output = path.join(DATA, 'sealed-v1');
const sources: Record<string, string> = {};
function load(file: string) { sources[file] = fileSha(file); return read(file).games; }
const sealed = load(path.join(output, 'test-SUMMARY.json'));
const historical = load(path.join(output, 'historical-SUMMARY.json'));
for (const [split, games, expected] of [['test', sealed, 54], ['historical', historical, 40]] as const) {
    if (games.length !== expected || !games.every((g: any) => g.natural)) throw Error('完整自然覆盖不符');
    for (const game of games) {
        const file = path.join(output, split, game.id, 'SUMMARY.json'), summary = read(file);
        const receipt = read(path.join(output, `${split}-${game.id}.receipt.json`));
        if (receipt.summarySha256 !== fileSha(file) || !summary.gpuExited || summary.configSha256 !== token.configSha256 || summary.modelSha256 !== token.modelSha256 || summary.runtimeSha256 !== token.runtimeSha256 || JSON.stringify(summary.games[0]) !== JSON.stringify(Object.fromEntries(Object.entries(game).filter(([k]) => k !== 'artifactDirectory')))) throw Error('逐局证据不符：' + game.id);
    }
}
const generations: Record<string, any[]> = {
    baseline2414: load(path.join(old, 'test-baseline/SUMMARY.json')),
    stage3: load(path.join(old, 'test-candidate/SUMMARY.json')),
    stage4V7C2: load(path.join(v7, 'test-final/SUMMARY.json')),
    stage5C1: sealed,
};
const history: Record<string, any[]> = {
    baseline2414: load(path.join(HERE, '../stage1/ARENA_ANALYSIS.json')).map((r: any) => ({...r, players: 2, firstPlace: Number(r.classification === 'natural_win'), normalizedRank: Number(r.classification === 'natural_win')})),
    stage3: load(path.join(old, 'historical-final/SUMMARY.json')),
    stage4V7C2: load(path.join(v7, 'historical-final/SUMMARY.json')),
    stage5C1: historical,
};
if (new Set(sealed.map((g: any) => g.slot)).size !== 20) throw Error('封存初态簇数不是20');
const pairs: Record<string, any> = {}, historyPairs: Record<string, any> = {};
const names = Object.keys(generations);
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const key = `${names[j]}_vs_${names[i]}`;
    pairs[key] = pairedComparison(generations[names[i]], generations[names[j]], 10000, 20261101);
    historyPairs[key] = pairedComparison(history[names[i]], history[names[j]], 10000, 20261101);
}
await save(path.join(HERE, 'FINAL_PAIRED_COMPARISON.json'), {sources, generations: Object.fromEntries(names.map(n => [n, scores(generations[n])])), historicalGenerations: Object.fromEntries(names.map(n => [n, scores(history[n])])), pairs, historicalPairs: historyPairs, bootstrap: {iterationsPerComparison: 10000, seed: 20261101, sealedClusters: 20, method: '人数分层、初态槽整簇有放回配对抽样'}, limitations: '封存中途由串行改为双worker；用户确认一次中断封存局归档后重跑。共享GPU竞争可能影响限时搜索，不能将差异全部归因为价值头。'}, true);
console.log('四代配对统计完成');
const audits: Record<string, any> = {};
for (const [split, games] of [['test', sealed], ['historical', historical]] as const) {
    const dir = path.join(HERE, `final-audit-${split}`);
    fs.mkdirSync(dir);
    await save(path.join(dir, 'SUMMARY.json'), {games, complete: true}, true);
    audits[split] = await telemetryAudit(dir);
    console.log(split + ' 全动作重放与遥测审计完成');
}
await save(path.join(HERE, 'FINAL_TELEMETRY_AUDIT.json'), audits, true);
