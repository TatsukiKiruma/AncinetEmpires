/**
 * S1 试验驱动：对冻结窗口清单逐窗执行整回合搜索，并做独立的封存验证续弈。
 *
 * 输出严格分离两类结果（对应审核要求「分别给出搜索选择时的结果和封存复核结果」）：
 * - `search`：搜索层结果（到下一己方边界的精确战术后果 / 搜索内自然终局）
 * - `validation`：封存复核结果（用**独立预登记流**把基线与被选中分支各续弈到自然终局）
 *
 * 预登记工程门槛（只用于决定是否允许有限扩展，不是统计显著性）：
 *   封存 20 窗口中 ≥10 个得到双方自然结果；≥4 个家族改善且退化 ≤1；改善跨 ≥2 图。
 *
 * 用法（仓库根目录）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v19/search/s1_experiment.ts \
 *        --group dev --limit 2 --budget measure
 */

import fs from 'node:fs';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import {
    DEFAULT_SEARCH_BUDGET,
    V19_SEARCH_STREAM_OFFSET,
    V19_S1_SEARCH_ROOT_BASE_SEED,
    V19_VALIDATION_STREAM_OFFSET,
    searchWindow,
    type SearchBudget,
    type WindowSearchResult,
} from './rollout_search';
import type { GameState } from '../../src/game/types';

const OUT_ROOT = 'v19/out/s0s1_20260930';
const OUT_DIR = `${OUT_ROOT}/search`;
const MANIFEST_PATH = `${OUT_DIR}/window_manifest.json`;
const THETA1_PATH = 'v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json';

interface ManifestEntry {
    windowId: string;
    familyId: string;
    mapIndex: number;
    mapName: string;
    seed: number;
    ownSeat: number;
    group: 'dev' | 'sealed';
    engineStepIndex: number;
    phaseTurn: number;
    legalActionCount: number;
    rootStateHash: string;
    rootStateJson: string;
    gameOutcomeKind: string;
}

interface Manifest {
    entries: ManifestEntry[];
    counts: { total: number; dev: number; sealed: number };
}

interface Args {
    group: 'dev' | 'sealed' | 'all';
    limit: number | null;
    budgetPreset: 'measure' | 'frozen';
    budget: SearchBudget;
}

/** 吞吐预演档：更小的分支预算，只用于实测速度。 */
const MEASURE_BUDGET: SearchBudget = {
    ...DEFAULT_SEARCH_BUDGET,
    maxOwnDepth: 1,
    maxBranchPerLevel: 4,
    policyTopK: 3,
    maxBranchesPerWindow: 6,
    wallMsPerWindow: 120000,
};

/** 冻结档：在预演实测可行后使用。 */
const FROZEN_BUDGET: SearchBudget = {
    ...DEFAULT_SEARCH_BUDGET,
    maxOwnDepth: 2,
    maxBranchPerLevel: 5,
    policyTopK: 4,
    maxBranchesPerWindow: 16,
    wallMsPerWindow: 600000,
};

function parseArgs(argv: string[]): Args {
    const read = (name: string): string | null => {
        const index = argv.indexOf(name);
        return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
    };
    const group = (read('--group') ?? 'dev') as Args['group'];
    const limitRaw = read('--limit');
    const budgetPreset = (read('--budget') ?? 'measure') as Args['budgetPreset'];
    return {
        group,
        limit: limitRaw ? Number(limitRaw) : null,
        budgetPreset,
        budget: budgetPreset === 'frozen' ? FROZEN_BUDGET : MEASURE_BUDGET,
    };
}

/** 逐窗口的精简记录：不落根状态全文，只落哈希与序列，控制文件体积。 */
function compact(result: WindowSearchResult): Record<string, unknown> {
    return {
        windowId: result.windowId,
        familyId: result.familyId,
        mapIndex: 0,
        mapName: result.mapName,
        seed: result.seed,
        ownSeat: result.ownSeat,
        group: result.group,
        engineStepIndex: result.engineStepIndex,
        rootStateHash: result.rootStateHash,
        phaseTurn: result.phaseTurn,
        rootLegalActionCount: result.rootLegalActionCount,
        budget: result.budget,
        search: {
            baseline: {
                ownActions: result.baseline.ownActions,
                outcomeKind: result.baseline.leaf.outcomeKind,
                terminal: result.baseline.leaf.terminal,
                truncated: result.baseline.leaf.truncated,
                tactical: result.baseline.leaf.tactical,
                error: result.baseline.error,
                nodes: result.baseline.nodes,
                ms: result.baseline.ms,
            },
            branchCount: result.branches.length,
            naturalBranches: result.naturalBranches,
            bestTactical: result.bestTactical,
            selected: result.selected,
            errors: result.branches.filter((b) => b.error).map((b) => ({ ownActions: b.ownActions, error: b.error })),
            truncatedCount: result.branches.filter((b) => b.leaf.truncated).length,
        },
        validation: result.validation
            ? {
                streamSeed: result.validation.streamSeed,
                baseline: result.validation.baseline,
                selected: result.validation.selected,
                selectedOwnActions: result.validation.selectedOwnActions,
            }
            : null,
        // 中文：顶层别名。门槛函数早期误读顶层 `row.selected`，而驱动只写了
        // `search.selected`，导致改善数被算成 0。两处都写，避免再次口径不一致。
        selected: result.selected,
        notes: result.notes,
        ms: result.ms,
    };
}

interface GateInput {
    rows: Array<Record<string, any>>;
}

/** 预登记工程门槛评估；只对封存组有意义。 */
function evaluateGate(input: GateInput): Record<string, unknown> {
    const rows = input.rows;
    let bothNatural = 0;
    let improved = 0;
    let regressed = 0;
    let same = 0;
    let undecided = 0;
    const improvedMaps = new Set<number>();
    for (const row of rows) {
        const base = row.validation?.baseline;
        const sel = row.validation?.selected;
        const baseNatural = base && (base.outcomeKind === 'NATURAL_WIN' || base.outcomeKind === 'NATURAL_LOSS' || base.outcomeKind === 'NATURAL_DRAW');
        const selNatural = sel && (sel.outcomeKind === 'NATURAL_WIN' || sel.outcomeKind === 'NATURAL_LOSS' || sel.outcomeKind === 'NATURAL_DRAW');
        if (baseNatural && selNatural) bothNatural += 1;
        // 中文：兼容两种落盘结构（顶层别名 / search 子对象），避免再次因字段路径
        // 不一致把改善数算成 0。见 v19/tools/recompute_s1_gate.py 的同一修正。
        const selectedRecord = row.selected ?? row.search?.selected;
        if (!selectedRecord) { same += 1; continue; }
        if (!selNatural) { undecided += 1; continue; }
        const baseWin = base.outcomeKind === 'NATURAL_WIN';
        const selWin = sel.outcomeKind === 'NATURAL_WIN';
        if (selWin && !baseWin) { improved += 1; improvedMaps.add(row.mapIndex); }
        else if (!selWin && baseWin) regressed += 1;
        else same += 1;
    }
    const passed = bothNatural >= 10 && improved >= 4 && regressed <= 1 && improvedMaps.size >= 2;
    return {
        rule: '封存20窗口中 ≥10 个双方自然结果；≥4 个家族改善且退化 ≤1；改善跨 ≥2 图',
        bothNatural,
        improved,
        regressed,
        unchangedOrNoSelection: same,
        undecidedOrError: undecided,
        improvedMaps: [...improvedMaps],
        passed,
        note: '该门槛只允许有限扩展，不是统计显著性或整体胜率证明。',
    };
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const predictor = new SpatialResNetPredictor(
        loadSpatialResNetFromJson(fs.readFileSync(THETA1_PATH, 'utf8')),
    );

    let entries = manifest.entries;
    if (args.group !== 'all') entries = entries.filter((e) => e.group === args.group);
    if (args.limit !== null) entries = entries.slice(0, args.limit);

    console.log(
        `[S1] 组=${args.group} 窗口数=${entries.length} 预算档=${args.budgetPreset} ` +
            `深度=${args.budget.maxOwnDepth} 分支/层=${args.budget.maxBranchPerLevel} 总分支=${args.budget.maxBranchesPerWindow}`,
    );

    const rows: Array<Record<string, unknown>> = [];
    let index = 0;
    for (const entry of entries) {
        index += 1;
        const started = Date.now();
        const rootState = JSON.parse(entry.rootStateJson) as GameState;
        const opponentStreamSeed = V19_S1_SEARCH_ROOT_BASE_SEED + V19_SEARCH_STREAM_OFFSET + index;
        const validationStreamSeed = V19_S1_SEARCH_ROOT_BASE_SEED + V19_VALIDATION_STREAM_OFFSET + index;
        try {
            const result = searchWindow(
                {
                    windowId: entry.windowId,
                    familyId: entry.familyId,
                    mapName: entry.mapName,
                    seed: entry.seed,
                    ownSeat: entry.ownSeat,
                    group: entry.group,
                    engineStepIndex: entry.engineStepIndex,
                    rootState,
                    budget: args.budget,
                    opponentStreamSeed,
                    validationStreamSeed,
                    validationMaxSteps: 12000,
                    policyId: 'theta1',
                },
                predictor,
            );
            const row = compact(result) as Record<string, any>;
            row.mapIndex = entry.mapIndex;
            rows.push(row);
            const v = row.validation;
            console.log(
                `[S1] ${index}/${entries.length} ${entry.windowId} map=${entry.mapIndex} ` +
                    `分支=${result.branches.length} 选中=${result.selected ? result.selected.ownActions.join('+') : '无'} ` +
                    `搜索基线=${result.baseline.leaf.outcomeKind ?? '未终局'} ` +
                    `验证基线=${v?.baseline?.outcomeKind ?? '-'} 验证选中=${v?.selected?.outcomeKind ?? '-'} ` +
                    `${((Date.now() - started) / 1000).toFixed(1)}s`,
            );
        } catch (error) {
            rows.push({
                windowId: entry.windowId,
                familyId: entry.familyId,
                mapIndex: entry.mapIndex,
                mapName: entry.mapName,
                seed: entry.seed,
                ownSeat: entry.ownSeat,
                group: entry.group,
                error: error instanceof Error ? error.message : String(error),
                ms: Date.now() - started,
            });
            console.log(`[S1] ${index}/${entries.length} ${entry.windowId} 失败：${error instanceof Error ? error.message : String(error)}`);
        }
    }

    const jsonlPath = `${OUT_DIR}/s1_windows_${args.group}.jsonl`;
    fs.writeFileSync(jsonlPath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    const gate = args.group === 'sealed' || args.group === 'all' ? evaluateGate({ rows }) : null;
    const summary = {
        schema: 'v19_s1_search_experiment_1',
        generatedAt: new Date().toISOString(),
        group: args.group,
        budgetPreset: args.budgetPreset,
        budget: args.budget,
        windows: rows.length,
        namespace: {
            baseSeed: V19_S1_SEARCH_ROOT_BASE_SEED,
            searchStreamOffset: V19_SEARCH_STREAM_OFFSET,
            validationStreamOffset: V19_VALIDATION_STREAM_OFFSET,
            note:
                'H0 的整局随机流是有状态闭包，无法从中间状态克隆或快进（见 s0_engine_recon.md §2）。' +
                '因此搜索续弈与验证续弈都使用**独立且预登记**的流，不是原局 H0 流的连续延伸；' +
                '同一窗口内所有分支共用同一条对手流以保证配对可比。',
        },
        gate,
        totals: {
            searchErrors: rows.filter((r) => r.error).length,
            selectedWindows: rows.filter((r) => (r as any).selected).length,
            naturalTerminalInSearch: rows.filter((r) => (r as any).search?.naturalBranches?.length > 0).length,
        },
        output: jsonlPath,
    };
    const summaryPath = `${OUT_DIR}/s1_summary_${args.group}.json`;
    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(`[S1] 明细：${jsonlPath}\n[S1] 汇总：${summaryPath}`);
    if (gate) console.log(`[S1] 门槛：${JSON.stringify(gate)}`);
}

main().catch((error) => {
    console.error('[S1] 试验失败：', error);
    process.exitCode = 1;
});
