import { describe, expect, it } from 'vitest';
import { evaluateSearchGate, type SearchResultEnvelope } from './search_gate';

function row(
    baseline: string,
    selected: string | null,
    options: { id?: string; map?: number; family?: string; reason?: string; error?: string } = {},
): SearchResultEnvelope {
    const hasSelection = selected !== null;
    return {
        status: 'success',
        entry: {
            windowId: options.id ?? `${baseline}-${selected}`,
            familyId: options.family ?? options.id ?? `${baseline}-${selected}`,
            mapIndex: options.map ?? 0,
            rootStateHash: 'root-hash',
        },
        result: {
            selected: hasSelection ? { ownActions: ['a'], reason: options.reason ?? '搜索内自然结果改善' } : null,
            baseline: { error: null },
            branches: options.error ? [{ error: options.error }] : [],
            validation: {
                fromRoot: true,
                rootStateHash: 'root-hash',
                armWallMs: 100,
                budgetFair: true,
                allottedWallMs: { baseline: 100, selected: hasSelection ? 100 : null },
                baseline: { outcomeKind: baseline, error: null },
                selected: hasSelection ? { outcomeKind: selected, error: null } : null,
            },
        },
    };
}

describe('搜索复验门禁', () => {
    it('把 WIN→STEP 记为预算内胜场损失，截断不伪装成自然负', () => {
        const report = evaluateSearchGate([row('NATURAL_WIN', 'STEP_LIMIT')], 1);
        expect(report.budget.winToAnyNonWin).toBe(1);
        expect(report.budget.netWins).toBe(-1);
        expect(report.natural.regressions).toBe(0);
        expect(report.denominators.bothNatural).toBe(0);
        expect(report.transitions.selectedArmMatrix.NATURAL_WIN.STEP_LIMIT).toBe(1);
    });

    it('把 STEP→WIN 记为预算内新增胜场，但不算自然改善', () => {
        const report = evaluateSearchGate([row('STEP_LIMIT', 'NATURAL_WIN')], 1);
        expect(report.budget.stepOrWallToWin).toBe(1);
        expect(report.budget.nonWinToWin).toBe(1);
        expect(report.natural.improvementFamilies).toBe(0);
        expect(report.denominators.bothNatural).toBe(0);
    });

    it('无选择时按基线不变列入有效矩阵，不虚增双臂分母', () => {
        const report = evaluateSearchGate([row('NATURAL_LOSS', null)], 1);
        expect(report.denominators.noSelection).toBe(1);
        expect(report.denominators.actualValidationPairs).toBe(0);
        expect(report.denominators.bothNatural).toBe(0);
        expect(report.transitions.effectiveMatrix.NATURAL_LOSS.NATURAL_LOSS).toBe(1);
    });

    it('任何窗口或分支错误都会阻断门禁', () => {
        const report = evaluateSearchGate([row('NATURAL_LOSS', 'NATURAL_WIN', { error: '分支失败' })], 1);
        expect(report.errors.windows).toBe(1);
        expect(report.checks.noErrors).toBe(false);
        expect(report.passed).toBe(false);
    });

    it('拒绝不是从共同根状态执行的验证记录', () => {
        const record = row('NATURAL_LOSS', 'NATURAL_WIN');
        (record.result!.validation as Record<string, unknown>).fromRoot = false;
        const report = evaluateSearchGate([record], 1);
        expect(report.errors.windows).toBe(1);
        expect(report.checks.noErrors).toBe(false);
    });

    it('不等额双臂预算保留转移证据，但作为无效窗口阻断门禁', () => {
        const record = row('NATURAL_LOSS', 'NATURAL_WIN');
        const validation = record.result!.validation as Record<string, any>;
        validation.budgetFair = false;
        validation.allottedWallMs = { baseline: 100, selected: 60 };
        const report = evaluateSearchGate([record], 1);
        expect(report.transitions.selectedArmMatrix.NATURAL_LOSS.NATURAL_WIN).toBe(1);
        expect(report.errors.windows).toBe(1);
        expect(report.checks.noErrors).toBe(false);
        expect(report.passed).toBe(false);
    });

    it('无 selected 时不要求双臂预算公平', () => {
        const record = row('NATURAL_LOSS', null);
        (record.result!.validation as Record<string, unknown>).budgetFair = false;
        const report = evaluateSearchGate([record], 1);
        expect(report.errors.windows).toBe(0);
        expect(report.denominators.noSelection).toBe(1);
    });

    it('自然改善与局部战术选择分开统计', () => {
        const rows = [
            row('NATURAL_LOSS', 'NATURAL_WIN', { family: 'f1', map: 0 }),
            row('NATURAL_DRAW', 'NATURAL_WIN', { family: 'f2', map: 1 }),
            row('NATURAL_LOSS', 'NATURAL_LOSS', { family: 'f3', reason: '战术后果优于基线（非胜利，仅局部改进）' }),
        ];
        const report = evaluateSearchGate(rows, 3);
        expect(report.natural.improvementFamilies).toBe(2);
        expect(report.natural.improvedMaps).toEqual([0, 1]);
        expect(report.tactical.selectedForLocalTacticalReason).toBe(1);
        expect(report.tactical.localSelectionsWithoutNaturalImprovement).toBe(1);
    });

    it('只有全部预注册条件同时满足才通过', () => {
        const rows: SearchResultEnvelope[] = [];
        for (let index = 0; index < 4; index += 1) {
            rows.push(row('NATURAL_LOSS', 'NATURAL_WIN', {
                id: `improve-${index}`,
                family: `family-${index}`,
                map: index % 2,
            }));
        }
        for (let index = 0; index < 6; index += 1) {
            rows.push(row('NATURAL_LOSS', 'NATURAL_LOSS', { id: `same-${index}` }));
        }
        for (let index = 0; index < 10; index += 1) {
            rows.push(row('NATURAL_LOSS', null, { id: `no-selection-${index}` }));
        }
        const report = evaluateSearchGate(rows);
        expect(report.denominators.bothNatural).toBe(10);
        expect(report.natural.improvementFamilies).toBe(4);
        expect(report.budget.netWins).toBe(4);
        expect(report.passed).toBe(true);
    });
});

