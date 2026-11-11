/**
 * 搜索复验的独立局部技能门槛。
 *
 * 只比较两臂从共同根出发后到达的首个己方回合边界，不使用启发式 tacticalScore，
 * 也不把封存窗口自动转成训练数据。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface BoundaryTactical {
    ownCommanderHp: number | null;
    enemyCommanderHp: number | null;
    ownUnitCount: number;
    enemyUnitCount: number;
    ownGold: number;
    enemyGold: number;
    turn: number;
}

interface FirstOwnBoundary {
    stateJson: string;
    tactical: BoundaryTactical;
    steps: number;
    terminal: boolean;
}

export interface LocalSkillEnvelope {
    status?: 'success' | 'error';
    error?: string | null;
    entry?: {
        windowId?: string;
        familyId?: string;
        mapIndex?: number;
        rootStateHash?: string;
        group?: 'dev' | 'sealed';
    };
    result?: {
        selected?: { ownActions?: string[]; reason?: string } | null;
        baseline?: { error?: string | null };
        branches?: Array<{ error?: string | null }>;
        validation?: {
            budgetFair?: boolean;
            baseline?: { outcomeKind?: string; error?: string | null; firstOwnBoundary?: FirstOwnBoundary | null };
            selected?: { outcomeKind?: string; error?: string | null; firstOwnBoundary?: FirstOwnBoundary | null } | null;
        } | null;
    } | null;
}

export interface LocalWindowAssessment {
    windowId: string;
    familyId: string;
    group: 'dev' | 'sealed';
    mapIndex: number | null;
    rootStateHash: string;
    qualifies: boolean;
    failureReasons: string[];
    commanderHpGain: number | null;
}

export interface LocalSkillGateReport {
    schema: 'v19_local_skill_gate_1';
    rule: string;
    denominators: {
        dev: GroupDenominators;
        sealed: GroupDenominators;
        totalFiles: number;
        totalErrors: number;
    };
    rootIsolation: {
        devRoots: number;
        sealedRoots: number;
        overlapRoots: string[];
        passed: boolean;
    };
    qualifyingMaps: number[];
    sealedBudgetNaturalWinLosses: number;
    windows: LocalWindowAssessment[];
    devDistillationIds: string[];
    sealedValidationIds: string[];
    checks: {
        devAtLeast4DistinctRoots: boolean;
        sealedAtLeast2DistinctRoots: boolean;
        sealedRootsDisjointFromDev: boolean;
        qualifyingGainAcrossAtLeast2Maps: boolean;
        sealedBudgetNaturalWinLossesAtMost1: boolean;
        noErrors: boolean;
    };
    passed: boolean;
    notes: string[];
}

interface GroupDenominators {
    files: number;
    successfulRecords: number;
    selectedPairs: number;
    comparableFirstBoundaries: number;
    qualifyingWindows: number;
    qualifyingDistinctRoots: number;
    errorWindows: number;
}

interface EvaluatedRow {
    assessment: LocalWindowAssessment;
    isError: boolean;
    selectedPair: boolean;
    comparable: boolean;
    baselineOutcome: string | null;
    selectedOutcome: string | null;
}

function hp(value: number | null | undefined): number {
    return value === null || value === undefined ? 0 : value;
}

function evaluateRow(row: LocalSkillEnvelope, fallbackGroup: 'dev' | 'sealed', index: number): EvaluatedRow {
    const result = row.result;
    const validation = result?.validation;
    const baselineArm = validation?.baseline;
    const selectedArm = validation?.selected;
    const baseline = baselineArm?.firstOwnBoundary;
    const selected = selectedArm?.firstOwnBoundary;
    const group = fallbackGroup;
    const windowId = String(row.entry?.windowId ?? `${group}-${index}`);
    const familyId = String(row.entry?.familyId ?? windowId);
    const rootStateHash = String(row.entry?.rootStateHash ?? '');
    const reasons: string[] = [];
    const groupMismatch = row.entry?.group !== fallbackGroup;
    const budgetInvalid = validation?.budgetFair !== true;
    const runtimeError = Boolean(
        row.status === 'error'
        || row.error
        || groupMismatch
        || budgetInvalid
        || result?.baseline?.error
        || result?.branches?.some((branch) => branch.error)
        || baselineArm?.error
        || selectedArm?.error,
    );
    if (runtimeError) reasons.push('存在输入、运行或分支错误');
    if (groupMismatch) reasons.push(`记录组别不是${fallbackGroup}`);
    if (budgetInvalid) reasons.push('验证预算公平字段不是true');
    if (!rootStateHash) reasons.push('缺少根状态哈希');
    if (!result?.selected) reasons.push('没有选中替代分支');
    if (!baseline) reasons.push('基线缺少首个己方边界');
    if (result?.selected && !selected) reasons.push('选中臂缺少首个己方边界');
    if (baseline?.terminal || selected?.terminal) reasons.push('首个己方边界已终局');
    if (baseline && selected && baseline.tactical.turn !== selected.tactical.turn) reasons.push('两臂首个边界回合不同');

    let commanderHpGain: number | null = null;
    if (baseline && selected && !baseline.terminal && !selected.terminal
        && baseline.tactical.turn === selected.tactical.turn) {
        const base = baseline.tactical;
        const candidate = selected.tactical;
        commanderHpGain = hp(candidate.ownCommanderHp) - hp(base.ownCommanderHp);
        if (commanderHpGain < 10) reasons.push('己方指挥官生命增益不足10');
        if (hp(candidate.enemyCommanderHp) > hp(base.enemyCommanderHp)) reasons.push('敌方指挥官生命增加');
        if (candidate.ownUnitCount < base.ownUnitCount) reasons.push('己方单位数减少');
        if (candidate.enemyUnitCount > base.enemyUnitCount) reasons.push('敌方单位数增加');
        if (candidate.ownGold < base.ownGold) reasons.push('己方金币减少');
        if (candidate.enemyGold > base.enemyGold) reasons.push('敌方金币增加');
    }

    const selectedPair = Boolean(result?.selected && baselineArm && selectedArm);
    const comparable = Boolean(baseline && selected && !baseline.terminal && !selected.terminal
        && baseline.tactical.turn === selected.tactical.turn && validation?.budgetFair === true);
    return {
        assessment: {
            windowId,
            familyId,
            group,
            mapIndex: Number.isInteger(row.entry?.mapIndex) ? Number(row.entry?.mapIndex) : null,
            rootStateHash,
            qualifies: reasons.length === 0,
            failureReasons: reasons,
            commanderHpGain,
        },
        isError: runtimeError,
        selectedPair,
        comparable,
        baselineOutcome: baselineArm?.outcomeKind ?? null,
        selectedOutcome: selectedArm?.outcomeKind ?? null,
    };
}

function denominators(rows: EvaluatedRow[]): GroupDenominators {
    const qualifyingRoots = new Set(rows.filter((row) => row.assessment.qualifies).map((row) => row.assessment.rootStateHash));
    return {
        files: rows.length,
        successfulRecords: rows.filter((row) => !row.isError).length,
        selectedPairs: rows.filter((row) => row.selectedPair).length,
        comparableFirstBoundaries: rows.filter((row) => row.comparable).length,
        qualifyingWindows: rows.filter((row) => row.assessment.qualifies).length,
        qualifyingDistinctRoots: qualifyingRoots.size,
        errorWindows: rows.filter((row) => row.isError).length,
    };
}

/** 评估开发与封存结果；封存 ID 仅供验证，绝不并入可蒸馏列表。 */
export function evaluateLocalSkillGate(
    devInputs: LocalSkillEnvelope[],
    sealedInputs: LocalSkillEnvelope[],
): LocalSkillGateReport {
    const devRows = devInputs.map((row, index) => evaluateRow(row, 'dev', index));
    const sealedRows = sealedInputs.map((row, index) => evaluateRow(row, 'sealed', index));
    const devRoots = new Set(devRows.map((row) => row.assessment.rootStateHash).filter(Boolean));
    const sealedRoots = new Set(sealedRows.map((row) => row.assessment.rootStateHash).filter(Boolean));
    const overlapRoots = [...sealedRoots].filter((root) => devRoots.has(root)).sort();

    // 中文：根重叠会使封存证据失去独立性；保留记录并明确排除资格。
    if (overlapRoots.length > 0) {
        for (const row of sealedRows) {
            if (!devRoots.has(row.assessment.rootStateHash)) continue;
            row.assessment.qualifies = false;
            row.assessment.failureReasons.push('封存根状态与开发组重合');
        }
    }

    const qualifying = [...devRows, ...sealedRows].filter((row) => row.assessment.qualifies);
    const qualifyingMaps = [...new Set(qualifying
        .map((row) => row.assessment.mapIndex)
        .filter((mapIndex): mapIndex is number => mapIndex !== null))].sort((a, b) => a - b);
    const devQualifyingRoots = new Set(devRows.filter((row) => row.assessment.qualifies)
        .map((row) => row.assessment.rootStateHash));
    const sealedQualifyingRoots = new Set(sealedRows.filter((row) => row.assessment.qualifies)
        .map((row) => row.assessment.rootStateHash));
    const sealedBudgetNaturalWinLosses = sealedRows.filter((row) =>
        row.selectedPair && row.baselineOutcome === 'NATURAL_WIN' && row.selectedOutcome !== 'NATURAL_WIN').length;
    const totalErrors = [...devRows, ...sealedRows].filter((row) => row.isError).length;
    const checks = {
        devAtLeast4DistinctRoots: devQualifyingRoots.size >= 4,
        sealedAtLeast2DistinctRoots: sealedQualifyingRoots.size >= 2,
        sealedRootsDisjointFromDev: overlapRoots.length === 0,
        qualifyingGainAcrossAtLeast2Maps: qualifyingMaps.length >= 2,
        sealedBudgetNaturalWinLossesAtMost1: sealedBudgetNaturalWinLosses <= 1,
        noErrors: totalErrors === 0,
    };
    const assessments = [...devRows, ...sealedRows].map((row) => row.assessment);
    return {
        schema: 'v19_local_skill_gate_1',
        rule: '首个同回合非终局己方边界上，己方指挥官HP至少+10，且敌HP、双方单位数及金币六项严格不劣；开发≥4根、封存≥2根、跨≥2图',
        denominators: {
            dev: denominators(devRows),
            sealed: denominators(sealedRows),
            totalFiles: devRows.length + sealedRows.length,
            totalErrors,
        },
        rootIsolation: {
            devRoots: devRoots.size,
            sealedRoots: sealedRoots.size,
            overlapRoots,
            passed: overlapRoots.length === 0,
        },
        qualifyingMaps,
        sealedBudgetNaturalWinLosses,
        windows: assessments,
        devDistillationIds: devRows.filter((row) => row.assessment.qualifies)
            .map((row) => row.assessment.windowId).sort(),
        sealedValidationIds: sealedRows.filter((row) => row.assessment.qualifies)
            .map((row) => row.assessment.windowId).sort(),
        checks,
        passed: Object.values(checks).every(Boolean),
        notes: [
            '该口径只称为精确局部保血改进，不代表自然胜率改善。',
            'null 指挥官HP按0比较；不使用 tacticalScore。',
            'sealedValidationIds 只供独立验证，绝不自动进入训练或蒸馏。',
        ],
    };
}

function readDirectory(directory: string): LocalSkillEnvelope[] {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory).filter((name) => name.endsWith('.json')).sort()
        .map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) as LocalSkillEnvelope);
}

function atomicWrite(target: string, value: unknown): void {
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
    const devDir = read('--dev-dir');
    const sealedDir = read('--sealed-dir');
    const output = read('--out');
    if (!devDir || !sealedDir || !output) throw new Error('需要 --dev-dir、--sealed-dir 和 --out');
    const report = evaluateLocalSkillGate(readDirectory(devDir), readDirectory(sealedDir));
    atomicWrite(output, report);
    console.log(`[局部技能门槛] ${report.passed ? '通过' : '未通过'}：${output}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        cli();
    } catch (error) {
        console.error(`[局部技能门槛] 失败：${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}

