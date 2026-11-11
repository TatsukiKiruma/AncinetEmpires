/** 中文：正式结果的离线诊断，不反向影响搜索、选根或预算。 */
import fs from 'node:fs';
import path from 'node:path';
import { tacticalScore } from '../search/selection';
import { loadResultEnvelopes } from '../search/search_gate';

const root = 'v19/out/search_recheck_20261003';
const deltas = ['ownCommanderHp', 'enemyCommanderHp', 'ownUnitCount', 'enemyUnitCount', 'ownGold', 'enemyGold'] as const;
const groups = Object.fromEntries(['dev', 'sealed'].map(group => {
    const rows = loadResultEnvelopes(path.join(root, 'formal/windows', group));
    const windows = rows.map(row => {
        const result = row.result;
        const validation = result?.validation;
        const chosen = result?.branches?.find((branch: any) =>
            JSON.stringify(branch.ownActions) === JSON.stringify(result.selected?.ownActions));
        const base = validation?.baseline?.firstOwnBoundary;
        const selected = validation?.selected?.firstOwnBoundary;
        const comparable = base && selected && !base.terminal && !selected.terminal
            && base.tactical.turn === selected.tactical.turn && validation.budgetFair === true;
        return {
            windowId: row.entry?.windowId, mapIndex: row.entry?.mapIndex,
            selected: Boolean(result?.selected), reason: result?.selected?.reason ?? null,
            searchTacticalGain: chosen ? tacticalScore(chosen.leaf.tactical) - tacticalScore(result!.baseline.leaf.tactical) : null,
            validationBoundaryTacticalGain: comparable ? tacticalScore(selected.tactical) - tacticalScore(base.tactical) : null,
            validationBoundaryDeltas: comparable ? Object.fromEntries(deltas.map(key =>
                [key, (selected.tactical[key] ?? 0) - (base.tactical[key] ?? 0)])) : null,
            baselineOutcome: validation?.baseline?.outcomeKind ?? null,
            selectedOutcome: validation?.selected?.outcomeKind ?? null,
            ms: result?.ms ?? null,
            searchBaselineMs: result?.baseline?.ms ?? null,
            validationBaselineMs: validation?.baseline?.ms ?? null,
            validationSelectedMs: validation?.selected?.ms ?? null,
        };
    });
    return [group, {
        windows: rows.length,
        selected: windows.filter(row => row.selected).length,
        positiveIndependentBoundaryScore: windows.filter(row => (row.validationBoundaryTacticalGain ?? 0) > 0).length,
        negativeIndependentBoundaryScore: windows.filter(row => (row.validationBoundaryTacticalGain ?? 0) < 0).length,
        bothNaturalImprovements: windows.filter(row => ['NATURAL_LOSS', 'NATURAL_DRAW'].includes(row.baselineOutcome)
            && row.selectedOutcome === 'NATURAL_WIN').length,
        naturalWinToLoss: windows.filter(row => row.baselineOutcome === 'NATURAL_WIN' && row.selectedOutcome === 'NATURAL_LOSS').length,
        records: windows,
    }];
}));
const output = path.join(root, 'diagnostics.json');
fs.writeFileSync(output, JSON.stringify({ schema: 'v19_search_recheck_diagnostics_1',
    generatedAt: new Date().toISOString(), note: '仅离线解释正式结果；手工分增益不等于胜率增益。', groups }, null, 2) + '\n');
console.log(output);
