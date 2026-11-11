/**
 * V19 搜索复验门禁。
 *
 * 本模块只解释已经落盘的独立验证结果，不参与搜索选择。这样可以在不读取
 * 封存结果的前提下冻结门槛，并用纯函数测试所有结果转移。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NATURAL_OUTCOMES = ['NATURAL_WIN', 'NATURAL_LOSS', 'NATURAL_DRAW'] as const;
export const BUDGET_OUTCOMES = ['STEP_LIMIT', 'WALL_TIMEOUT'] as const;

export type GateOutcome =
    | (typeof NATURAL_OUTCOMES)[number]
    | (typeof BUDGET_OUTCOMES)[number]
    | 'PLY_LIMIT'
    | 'CANCELLED'
    | 'POLICY_ERROR'
    | 'ENGINE_ERROR'
    | 'ERROR'
    | 'OTHER';

export interface SearchResultEnvelope {
    status?: 'success' | 'error';
    error?: string | null;
    entry?: {
        windowId?: string;
        familyId?: string;
        mapIndex?: number;
        rootStateHash?: string;
    };
    result?: Record<string, any>;
    /** 纯函数测试入口；正式 v2 文件使用 result。 */
    windowId?: string;
    familyId?: string;
    mapIndex?: number;
    selected?: unknown;
    validation?: Record<string, any> | null;
    branches?: Array<Record<string, any>>;
    baseline?: Record<string, any>;
}

export interface SearchGateReport {
    schema: 'v19_search_gate_1';
    rule: string;
    denominators: {
        expectedSealed: number;
        files: number;
        completed: number;
        selected: number;
        noSelection: number;
        actualValidationPairs: number;
        bothNatural: number;
    };
    transitions: {
        /** 包含无选择窗口；无选择明确按基线不变放在对角线上。 */
        effectiveMatrix: Record<string, Record<string, number>>;
        /** 只含实际运行了基线和选中两臂验证的窗口。 */
        selectedArmMatrix: Record<string, Record<string, number>>;
        noSelectionAsBaselineUnchanged: number;
    };
    natural: {
        improvementFamilies: number;
        improvementFamilyIds: string[];
        improvementWindows: number;
        improvedMaps: number[];
        unchangedPairs: number;
        regressions: number;
    };
    budget: {
        stepOrWallToWin: number;
        winToAnyNonWin: number;
        nonWinToWin: number;
        netWins: number;
    };
    tactical: {
        selectedForLocalTacticalReason: number;
        localSelectionsWithoutNaturalImprovement: number;
    };
    errors: {
        windows: number;
        ids: string[];
    };
    checks: {
        sealedComplete20: boolean;
        bothNaturalAtLeast10: boolean;
        naturalImprovementsAtLeast4: boolean;
        improvementsAcrossAtLeast2Maps: boolean;
        budgetWinLossesAtMost1: boolean;
        noErrors: boolean;
        positiveNetBudgetWins: boolean;
    };
    passed: boolean;
    notes: string[];
}

const OUTCOME_ORDER: GateOutcome[] = [
    'NATURAL_WIN', 'NATURAL_LOSS', 'NATURAL_DRAW',
    'STEP_LIMIT', 'PLY_LIMIT', 'WALL_TIMEOUT', 'CANCELLED',
    'POLICY_ERROR', 'ENGINE_ERROR', 'ERROR', 'OTHER',
];

function emptyMatrix(): Record<string, Record<string, number>> {
    return Object.fromEntries(OUTCOME_ORDER.map((from) => [
        from,
        Object.fromEntries(OUTCOME_ORDER.map((to) => [to, 0])),
    ]));
}

function normalizeOutcome(arm: any): GateOutcome {
    if (!arm) return 'OTHER';
    if (arm.error) return 'ERROR';
    const kind = String(arm.outcomeKind ?? '');
    if ((OUTCOME_ORDER as string[]).includes(kind)) return kind as GateOutcome;
    return 'OTHER';
}

function isNatural(outcome: GateOutcome): boolean {
    return (NATURAL_OUTCOMES as readonly string[]).includes(outcome);
}

function resultOf(row: SearchResultEnvelope): Record<string, any> {
    return row.result ?? row;
}

function hasAnyError(row: SearchResultEnvelope, result: Record<string, any>): boolean {
    if (row.status === 'error' || row.error) return true;
    if (result.error) return true;
    if (result.baseline?.error) return true;
    if (Array.isArray(result.branches) && result.branches.some((branch: any) => branch?.error)) return true;
    if (result.validation?.baseline?.error || result.validation?.selected?.error) return true;
    if (result.selected && !result.validation?.selected) return true;
    // 中文：只有真实双臂比较要求等额墙钟；无选择窗口只有基线臂，无公平性问题。
    if (result.selected && result.validation?.budgetFair === false) return true;
    if (result.validation && result.validation.fromRoot !== true) return true;
    if (row.entry?.rootStateHash && result.validation?.rootStateHash !== row.entry.rootStateHash) return true;
    if (normalizeOutcome(result.validation?.baseline) === 'POLICY_ERROR'
        || normalizeOutcome(result.validation?.baseline) === 'ENGINE_ERROR') return true;
    if (normalizeOutcome(result.validation?.selected) === 'POLICY_ERROR'
        || normalizeOutcome(result.validation?.selected) === 'ENGINE_ERROR') return true;
    return false;
}

/** 按预注册口径评估门禁；不会把截断解释为自然负。 */
export function evaluateSearchGate(rows: SearchResultEnvelope[], expectedSealed = 20): SearchGateReport {
    const effectiveMatrix = emptyMatrix();
    const selectedArmMatrix = emptyMatrix();
    const improvedFamilies = new Set<string>();
    const improvedMaps = new Set<number>();
    const errorIds: string[] = [];
    let completed = 0;
    let selectedCount = 0;
    let noSelection = 0;
    let pairs = 0;
    let bothNatural = 0;
    let naturalImprovementWindows = 0;
    let naturalUnchanged = 0;
    let naturalRegressions = 0;
    let stepOrWallToWin = 0;
    let winToAnyNonWin = 0;
    let nonWinToWin = 0;
    let localTactical = 0;
    let localWithoutNaturalImprovement = 0;

    rows.forEach((row, index) => {
        const result = resultOf(row);
        const id = String(row.entry?.windowId ?? row.windowId ?? result.windowId ?? `row-${index}`);
        if (hasAnyError(row, result)) errorIds.push(id);
        if (row.status === 'error' || row.error || !result.validation?.baseline) return;
        completed += 1;

        const baseline = normalizeOutcome(result.validation.baseline);
        const hasSelection = Boolean(result.selected);
        const selectedArm = result.validation.selected;
        if (!hasSelection) {
            noSelection += 1;
            effectiveMatrix[baseline][baseline] += 1;
            return;
        }

        selectedCount += 1;
        const reason = String(result.selected?.reason ?? '');
        if (reason.includes('战术')) localTactical += 1;
        if (!selectedArm) {
            effectiveMatrix[baseline].OTHER += 1;
            return;
        }

        pairs += 1;
        const selected = normalizeOutcome(selectedArm);
        effectiveMatrix[baseline][selected] += 1;
        selectedArmMatrix[baseline][selected] += 1;
        const pairNatural = isNatural(baseline) && isNatural(selected);
        if (pairNatural) bothNatural += 1;

        const naturalImprovement =
            (baseline === 'NATURAL_LOSS' || baseline === 'NATURAL_DRAW') && selected === 'NATURAL_WIN';
        if (naturalImprovement) {
            naturalImprovementWindows += 1;
            improvedFamilies.add(String(row.entry?.familyId ?? row.familyId ?? result.familyId ?? id));
            const mapIndex = Number(row.entry?.mapIndex ?? row.mapIndex ?? result.mapIndex);
            if (Number.isInteger(mapIndex)) improvedMaps.add(mapIndex);
        } else if (pairNatural && baseline === 'NATURAL_WIN' && selected !== 'NATURAL_WIN') {
            naturalRegressions += 1;
        } else if (pairNatural) {
            naturalUnchanged += 1;
        }

        if ((baseline === 'STEP_LIMIT' || baseline === 'WALL_TIMEOUT') && selected === 'NATURAL_WIN') {
            stepOrWallToWin += 1;
        }
        if (baseline !== 'NATURAL_WIN' && selected === 'NATURAL_WIN') nonWinToWin += 1;
        if (baseline === 'NATURAL_WIN' && selected !== 'NATURAL_WIN') winToAnyNonWin += 1;
        if (reason.includes('战术') && !naturalImprovement) localWithoutNaturalImprovement += 1;
    });

    const netWins = nonWinToWin - winToAnyNonWin;
    const checks = {
        sealedComplete20: rows.length === expectedSealed && completed === expectedSealed,
        bothNaturalAtLeast10: bothNatural >= 10,
        naturalImprovementsAtLeast4: improvedFamilies.size >= 4,
        improvementsAcrossAtLeast2Maps: improvedMaps.size >= 2,
        budgetWinLossesAtMost1: winToAnyNonWin <= 1,
        noErrors: errorIds.length === 0,
        positiveNetBudgetWins: netWins > 0,
    };

    return {
        schema: 'v19_search_gate_1',
        rule: '封存20窗全部完成；双方自然≥10；自然改善家族≥4且跨≥2图；预算内损失≤1；无错误；预算内净胜>0',
        denominators: {
            expectedSealed,
            files: rows.length,
            completed,
            selected: selectedCount,
            noSelection,
            actualValidationPairs: pairs,
            bothNatural,
        },
        transitions: {
            effectiveMatrix,
            selectedArmMatrix,
            noSelectionAsBaselineUnchanged: noSelection,
        },
        natural: {
            improvementFamilies: improvedFamilies.size,
            improvementFamilyIds: [...improvedFamilies].sort(),
            improvementWindows: naturalImprovementWindows,
            improvedMaps: [...improvedMaps].sort((a, b) => a - b),
            unchangedPairs: naturalUnchanged,
            regressions: naturalRegressions,
        },
        budget: { stepOrWallToWin, winToAnyNonWin, nonWinToWin, netWins },
        tactical: {
            selectedForLocalTacticalReason: localTactical,
            localSelectionsWithoutNaturalImprovement: localWithoutNaturalImprovement,
        },
        errors: { windows: errorIds.length, ids: errorIds },
        checks,
        passed: Object.values(checks).every(Boolean),
        notes: [
            '自然改善只统计 NATURAL_LOSS/NATURAL_DRAW → NATURAL_WIN，不包含截断。',
            '局部战术选择单独统计，不与自然改善合并。',
            '无 selected 的窗口按基线不变进入有效转移矩阵，但不计入实际双臂或双方自然分母。',
        ],
    };
}

export function loadResultEnvelopes(resultsDir: string): SearchResultEnvelope[] {
    if (!fs.existsSync(resultsDir)) return [];
    return fs.readdirSync(resultsDir)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => JSON.parse(fs.readFileSync(path.join(resultsDir, name), 'utf8')) as SearchResultEnvelope);
}

function atomicWriteJson(target: string, value: unknown): void {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(temporary, target);
}

function cli(): void {
    const argv = process.argv.slice(2);
    const read = (name: string): string | null => {
        const index = argv.indexOf(name);
        return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
    };
    const resultsDir = read('--results-dir');
    if (!resultsDir) throw new Error('缺少 --results-dir');
    const output = read('--out') ?? path.join(path.dirname(resultsDir), 'search_gate.json');
    const expected = Number(read('--expected') ?? '20');
    const report = evaluateSearchGate(loadResultEnvelopes(resultsDir), expected);
    atomicWriteJson(output, report);
    console.log(`[搜索门禁] ${report.passed ? '通过' : '未通过'}：${output}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        cli();
    } catch (error) {
        console.error(`[搜索门禁] 失败：${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}

