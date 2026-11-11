// 中文：独立读取逐局和逐窗口记录，只向本次评估目录写出汇总。
import fs from 'node:fs';
import crypto from 'node:crypto';
const run = 'v19/out/run_20260929_v19_02';
const search = 'v19/out/s0s1_20260930/search';
const readRows = file => fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const count = values => values.reduce((result, value) => { result[value] = (result[value] ?? 0) + 1; return result; }, {});
const panels = {};
for (const [group, tags] of [['dev', ['ppo_w1_theta1', 'ppo_w2_theta2', 'ppo_w3_theta3', 'r2_control', 'r2_fix']], ['recheck', ['theta1_fresh40', 'P1_champion_fresh40']]]) {
    for (const tag of tags) {
        const rows = Array.from({ length: 5 }, (_, m) => readRows(`${run}/arena/${group}/${tag}.m${m}.games.jsonl`)).flat();
        panels[tag] = {
            games: rows.length, outcomes: count(rows.map(r => r.outcomeKind)),
            modelShas: [...new Set(rows.map(r => r.checkpointSha256))],
            errors: rows.filter(r => r.error).length, fallbacks: rows.filter(r => r.fallbackUsed).length,
            byMap: Object.fromEntries([...new Set(rows.map(r => r.mapName))].map(map => [map, count(rows.filter(r => r.mapName === map).map(r => r.outcomeKind))])),
        };
    }
}
const searchGroups = {};
for (const group of ['dev', 'sealed']) {
    const rows = readRows(`${search}/s1_windows_${group}.jsonl`);
    const pairRows = rows.filter(r => r.validation?.selected);
    const win = r => r?.outcomeKind === 'NATURAL_WIN';
    const natural = r => ['NATURAL_WIN', 'NATURAL_LOSS', 'NATURAL_DRAW'].includes(r?.outcomeKind);
    searchGroups[group] = {
        windows: rows.length,
        selectedWindows: pairRows.length,
        bothNatural: pairRows.filter(r => natural(r.validation.baseline) && natural(r.validation.selected)).length,
        winGains: pairRows.filter(r => !win(r.validation.baseline) && win(r.validation.selected)).length,
        winLossesIncludingTruncation: pairRows.filter(r => win(r.validation.baseline) && !win(r.validation.selected)).length,
        naturalToNaturalWinGains: pairRows.filter(r => natural(r.validation.baseline) && !win(r.validation.baseline) && win(r.validation.selected)).length,
        zeroStepSelectedValidation: pairRows.filter(r => r.validation.selected.steps === 0).map(r => r.windowId),
        totalMs: rows.reduce((sum, r) => sum + r.ms, 0),
        over600s: rows.filter(r => r.ms > 600000).map(r => ({ windowId: r.windowId, ms: r.ms })),
        outcomePairs: count(pairRows.map(r => `${r.validation.baseline.outcomeKind} -> ${r.validation.selected.outcomeKind}`)),
    };
}
const sourceFiles = ['v19/search/rollout_search.ts', 'v19/search/s1_experiment.ts', 'v19/search/window_coverage.ts', 'src/game/ai/shared_spatial_policy.ts'];
const weights = ['v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json', `${run}/experiments/ppo_w1/s42/ppo_w1.json`];
const hashes = Object.fromEntries([...sourceFiles, ...weights].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const report = { date: '2026-10-03', panels, searchGroups, hashes };
fs.writeFileSync('v19/review/assessment_20261003/record_audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ panels: Object.fromEntries(Object.entries(panels).map(([k, v]) => [k, { games: v.games, outcomes: v.outcomes, errors: v.errors, fallbacks: v.fallbacks }])), searchGroups }, null, 2));
