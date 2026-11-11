/** 中文：独立汇总冻结清单与已完成窗口，不参与搜索选择或调参。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { evaluateSearchGate, loadResultEnvelopes } from '../search/search_gate';
import { evaluateLocalSkillGate } from '../search/local_skill_gate';
import { validateExperimentResults } from '../search/result_integrity';

const args = process.argv.slice(2);
const read = (name: string, fallback: string) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const root = read('--run-dir', 'v19/out/search_recheck_20261003');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'search/window_manifest.json'), 'utf8'));
const resultDir = read('--results-dir', path.join(root, 'formal'));
const dev = loadResultEnvelopes(path.join(resultDir, 'windows/dev'));
const sealed = loadResultEnvelopes(path.join(resultDir, 'windows/sealed'));
const integrity = validateExperimentResults({ manifest: path.join(root, 'search/window_manifest.json'),
    budgetPath: read('--budget-file', path.join(root, 'formal_budget.json')), dev, sealed });
const entries: any[] = manifest.entries;
const rootGroups = new Map<string, any[]>();
for (const entry of entries) rootGroups.set(entry.rootStateHash, [...(rootGroups.get(entry.rootStateHash) ?? []), entry]);
const duplicatedRoots = [...rootGroups.entries()].filter(([, rows]) => rows.length > 1)
    .map(([hash, rows]) => ({ hash, windows: rows.map(row => row.windowId), groups: [...new Set(rows.map(row => row.group))] }));
const coverage = {
    windows: entries.length, uniqueRoots: rootGroups.size, duplicatedRoots,
    crossSplitDuplicateRoots: duplicatedRoots.filter(row => row.groups.length > 1),
    attackCombo: entries.filter(row => row.features.hasAttackCombo).length,
    commanderRisk: entries.filter(row => row.features.hasCommanderRisk).length,
    recruit: entries.filter(row => row.features.hasRecruit).length,
    capture: entries.filter(row => row.features.hasCapture).length,
    ordinary: entries.filter(row => row.features.isOrdinary).length,
    endgame: entries.filter(row => row.features.isEndgame).length,
    fallbackWindows: entries.filter(row => row.fallbackUsed).map(row => row.windowId),
};
const recordStats = (rows: any[]) => ({
    windows: rows.length,
    errors: rows.filter(row => row.status !== 'success' || row.error).length,
    ms: rows.reduce((sum, row) => sum + (row.result?.ms ?? 0), 0),
    selected: rows.filter(row => row.result?.selected).length,
    argmaxOmittedExpansions: rows.flatMap(row => row.result?.candidateDiagnostics ?? []).filter(row => !row.diagnostics?.argmaxRetained).length,
    unfairPairs: rows.filter(row => row.result?.selected && row.result?.validation?.budgetFair === false).length,
    validationWallTimeouts: rows.flatMap(row => [row.result?.validation?.baseline, row.result?.validation?.selected])
        .filter(arm => arm?.outcomeKind === 'WALL_TIMEOUT').length,
    candidateClipping: Object.fromEntries(['attack', 'capture', 'recruit', 'move'].map(kind => {
        const diagnostics = rows.flatMap(row => row.result?.candidateDiagnostics ?? []).map(row => row.diagnostics);
        const available = diagnostics.reduce((sum, row) => sum + (row.tacticalAvailable?.[kind] ?? 0), 0);
        const retained = diagnostics.reduce((sum, row) => sum + (row.tacticalSelected?.[kind] ?? 0), 0);
        return [kind, { available, retained, clipped: available - retained }];
    })),
});
const sealedNaturalGate = evaluateSearchGate(sealed, 20);
const localSkillGate = evaluateLocalSkillGate(dev, sealed);
Object.assign(sealedNaturalGate.checks, { resultIdentityVerified: integrity.valid });
Object.assign(localSkillGate.checks, { resultIdentityVerified: integrity.valid,
    semanticRootsDisjointFromDev: integrity.semanticRootOverlaps.length === 0 });
// 中文：身份失败阻断收益结论；种子元数据不同不能解除局部技能的棋盘隔离要求。
if (!integrity.valid) { sealedNaturalGate.passed = false; localSkillGate.passed = false; }
if (integrity.semanticRootOverlaps.length) {
    localSkillGate.passed = false;
    localSkillGate.notes.push('忽略metadata.sdTrainingSeed后存在跨组同棋盘，按预登记补充口径阻断局部技能蒸馏。');
}
const report = {
    schema: 'v19_search_recheck_summary_1', generatedAt: new Date().toISOString(),
    integrity, coverage, dev: recordStats(dev), sealed: recordStats(sealed),
    devGateDiagnosticOnly: evaluateSearchGate(dev, 20), sealedNaturalGate,
    localSkillGate,
    gateSourceShas: Object.fromEntries(['v19/search/search_gate.ts', 'v19/search/local_skill_gate.ts'].map(file =>
        [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),
    modelChanged: false, objectiveAchieved: false,
};
const output = read('--out', path.join(root, 'final_summary.json'));
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, coverage, dev: report.dev, sealed: report.sealed,
    naturalGate: report.sealedNaturalGate.passed, localSkillGate: report.localSkillGate.passed }, null, 2));
