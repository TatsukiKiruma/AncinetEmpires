/**
 * V15/T15-05：tie-break（受控精确并列）TS 侧原始读数。
 *
 * 任务书 §6 步骤 4 的要求：
 *   - 受控精确并列使用**合成相同 logits**；
 *   - 新 V15 共同 tie-break = 最高 logit，再按**规范 actionCode 的代码点顺序**（不用 localeCompare）；
 *   - 近似并列单列，不通过加任意 epsilon 改写高低排序；
 *   - 旧 schema 的 tie-break 保留其历史版本，不能为历史模型静默换新规则。
 *
 * 因此这里明确实现两个规则：
 *   `v15_current`：max logit → 最小 actionCode（代码点序）→ 最小下标。
 *   历史 schema（v1/v13/v14）：`argmax` 首个最大值（数组下标序），即既有实现行为，保持不变。
 *
 * 「代码点序」说明：动作码字母表只有 ASCII 字母/数字/`:`/`,`/`_`，全部位于 BMP 且与
 * UTF-16 代码单元一一对应，故 JS 的 `<`（代码单元序）与代码点序一致；
 * 本文件与 Python 侧都**不使用** localeCompare / locale.strxfrm。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/parity_tiebreak_v15.ts \
 *       --states <diag_states.jsonl> --ts-raw <ts_forward_synthetic.json> \
 *       --legacy-checkpoint src/game/ai/models/spatial_resnet_v2_checkpoint.json \
 *       --out <raw/tiebreak_ts.json>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
    SpatialResNetPredictor,
    loadSpatialResNetFromJson,
} from '../../src/game/ai/spatial_conv_net';
import { actionSemanticsVariantForSchema } from '../../src/game/ai/spatial_tensor_encoder';
import {
    predictSpatialAction,
    EmptyActionSetError,
} from '../../src/game/ai/shared_spatial_policy';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import type { Action, GameState } from '../../src/game/types';

function argOf(name: string, fallback: string | null): string | null {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const statesPath = argOf('--states', 'v15/out/v15_20260925_core/T15-05/states/diag_states.jsonl')!;
const tsRawPath = argOf('--ts-raw', 'v15/out/v15_20260925_core/T15-05/raw/ts_forward_synthetic.json')!;
const legacyCheckpointPath = argOf('--legacy-checkpoint', 'src/game/ai/models/spatial_resnet_v2_checkpoint.json');
const outPath = argOf('--out', 'v15/out/v15_20260925_core/T15-05/raw/tiebreak_ts.json')!;

const sha256 = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');

/** V15 规范 tie-break：max logit → 最小 actionCode（代码点序）→ 最小下标。 */
export function selectActionIndexV15(logits: number[], actionCodes: string[]): number {
    let best = -1;
    for (let index = 0; index < logits.length; index += 1) {
        if (best < 0) { best = index; continue; }
        const logit = logits[index];
        const bestLogit = logits[best];
        if (logit > bestLogit) { best = index; continue; }
        if (logit < bestLogit) continue;
        const code = actionCodes[index] ?? '';
        const bestCode = actionCodes[best] ?? '';
        if (code < bestCode) { best = index; continue; }
        if (code > bestCode) continue;
        // 完全相同的 actionCode：保持更小下标，保证函数是确定的纯函数。
    }
    return best;
}

/** 历史 schema 的 tie-break：首个最大值（既有实现的 `>` 比较），不静默换新规则。 */
export function selectActionIndexLegacy(logits: number[], actionCodes: string[]): number {
    void actionCodes;
    let best = 0;
    for (let index = 1; index < logits.length; index += 1) {
        if (logits[index] > logits[best]) best = index;
    }
    return best;
}

export function selectActionIndexForSchema(schemaId: string, logits: number[], actionCodes: string[]): number {
    const variant = actionSemanticsVariantForSchema(schemaId);
    return variant === 'v15_current'
        ? selectActionIndexV15(logits, actionCodes)
        : selectActionIndexLegacy(logits, actionCodes);
}

const states = new Map<string, { actionCodes: string[]; candidateCount: number }>();
for (const line of fs.readFileSync(path.resolve(statesPath), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    states.set(record.diagId, {
        actionCodes: record.policyAllowedActionCodes,
        candidateCount: record.candidateCount,
    });
}

const tsRaw = JSON.parse(fs.readFileSync(path.resolve(tsRawPath), 'utf8')) as {
    readouts: Array<{
        diagId: string;
        actionCodes: string[];
        logits: number[];
        bestActionIndex: number;
        duplicatedCandidateIndex: number | null;
        exactTieGroups: number[][];
    }>;
};

// ------------------------------------------------------------------ A. 合成相同 logits

function syntheticLogits(kind: string, count: number): number[] {
    switch (kind) {
        case 'all_equal': return new Array(count).fill(0.5);
        case 'all_equal_negative': return new Array(count).fill(-3.25);
        case 'two_max_at_ends': {
            const values = new Array(count).fill(-1.0);
            values[0] = 2.0;
            values[count - 1] = 2.0;
            return values;
        }
        case 'two_max_adjacent': {
            const values = new Array(count).fill(-1.0);
            const mid = Math.floor(count / 2);
            values[mid] = 1.5;
            values[Math.min(count - 1, mid + 1)] = 1.5;
            return values;
        }
        case 'three_way_exact': {
            const values = new Array(count).fill(0.0);
            values[0] = 4.0;
            values[Math.floor(count / 2)] = 4.0;
            values[count - 1] = 4.0;
            return values;
        }
        case 'near_tie_1e-7': {
            const values = new Array(count).fill(-2.0);
            values[0] = 1.0;
            values[count - 1] = 1.0 - 1e-7;
            return values;
        }
        default: throw new Error(`未知的合成 logits 类型：${kind}`);
    }
}

const syntheticKinds = ['all_equal', 'all_equal_negative', 'two_max_at_ends', 'two_max_adjacent', 'three_way_exact', 'near_tie_1e-7'];
/** 取候选数最接近 8 的若干状态作为 actionCode 载体，覆盖多动作类型。 */
const carrierStates = [...tsRaw.readouts]
    .filter((r) => r.actionCodes.length >= 4)
    .sort((a, b) => Math.abs(a.actionCodes.length - 8) - Math.abs(b.actionCodes.length - 8))
    .slice(0, 8);

const syntheticCases = carrierStates.map((carrier) => {
    const codes = carrier.actionCodes;
    const cases = syntheticKinds.map((kind) => {
        const logits = syntheticLogits(kind, codes.length);
        const v15Index = selectActionIndexV15(logits, codes);
        const legacyIndex = selectActionIndexLegacy(logits, codes);
        const maxLogit = Math.max(...logits);
        const tiedIndices = logits
            .map((value, index) => (value === maxLogit ? index : -1))
            .filter((index) => index >= 0);
        const expectedV15 = tiedIndices.reduce(
            (best, index) => (best < 0 || codes[index] < codes[best] ? index : best), -1,
        );
        return {
            kind,
            logits,
            tiedMaxIndices: tiedIndices,
            tiedMaxCount: tiedIndices.length,
            v15SelectedIndex: v15Index,
            v15SelectedActionCode: codes[v15Index] ?? null,
            legacySelectedIndex: legacyIndex,
            legacySelectedActionCode: codes[legacyIndex] ?? null,
            expectedV15Index: expectedV15,
            v15MatchesRule: v15Index === expectedV15,
        };
    });
    return {
        carrierDiagId: carrier.diagId,
        candidateCount: codes.length,
        actionCodes: codes,
        cases,
    };
});

// ------------------------------------------------------------------ B/C. 真实前向的并列与近似并列

const realExactTies: any[] = [];
const nearTies: any[] = [];
const controlledDuplicateChecks: any[] = [];
const forcedTopTies: any[] = [];
for (const readout of tsRaw.readouts) {
    const logits = readout.logits;
    if (logits.length < 2) continue;
    const ordered = [...logits].sort((a, b) => b - a);
    const topGap = ordered[0] - ordered[1];
    const maxLogit = ordered[0];
    const tiedIndices = logits
        .map((value, index) => (value === maxLogit ? index : -1))
        .filter((index) => index >= 0);
    if (tiedIndices.length > 1) {
        const v15Index = selectActionIndexV15(logits, readout.actionCodes);
        realExactTies.push({
            diagId: readout.diagId,
            candidateCount: logits.length,
            tiedMaxIndices: tiedIndices,
            tiedMaxActionCodes: tiedIndices.map((index) => readout.actionCodes[index]),
            topGap,
            v15SelectedIndex: v15Index,
            v15SelectedActionCode: readout.actionCodes[v15Index],
            legacySelectedIndex: selectActionIndexLegacy(logits, readout.actionCodes),
            predictorBestActionIndex: readout.bestActionIndex,
            duplicatedCandidateIndex: readout.duplicatedCandidateIndex,
            exactTieGroups: readout.exactTieGroups,
        });
    }
    // 受控精确并列（端到端）：候选里有一组坐标+语义逐位相同的候选 ⇒
    // 同一权重下它们 logit 必然逐位相等。这里核对是否真的相等。
    //
    // 说明：构建器为 `syn_exact_tie_duplicate_candidate` 在候选列表**末尾追加**了一个
    // 与候选 0 逐位相同的候选（这是构建器产物里的客观事实）。TS 前向工具为了与生产
    // 调用一致，按引擎真实合法集重建候选，因此这条人工追加项不出现在前向候选里，
    // 组内下标会越界。越界组在这里显式剔除并计数，绝不静默当成"并列成立"。
    const inRangeGroups = (readout.exactTieGroups ?? []).filter(
        (group: number[]) => group.every((index) => index >= 0 && index < logits.length),
    );
    const outOfRangeGroups = (readout.exactTieGroups ?? []).length - inRangeGroups.length;
    if (inRangeGroups.length > 0 || outOfRangeGroups > 0) {
        controlledDuplicateChecks.push({
            diagId: readout.diagId,
            candidateCount: logits.length,
            engineDerivedCandidateCount: logits.length,
            builderExactTieGroups: readout.exactTieGroups ?? [],
            outOfRangeGroups,
            groups: inRangeGroups.map((group: number[]) => {
                const values = group.map((index) => logits[index]);
                const codes = group.map((index) => readout.actionCodes[index]);
                const allEqual = values.every((value) => value === values[0]);
                return {
                    indices: group,
                    actionCodes: codes,
                    logits: values,
                    allLogitsExactlyEqual: allEqual,
                    maxAbsDiffWithinGroup: allEqual ? 0 : Math.max(...values) - Math.min(...values),
                    groupIsTopTie: values[0] === maxLogit,
                };
            }),
        });
    }
    // 强制顶部精确并列（用真实 logits，把次高改成与最高**完全相等**）：
    // 展示两种规则在同一组真实候选取值下的选择差异。这不是"加 epsilon 改排序"，
    // 而是把并列情形显式构造出来，用于验证共同 tie-break。
    if (logits.length >= 2) {
        const bestIndex = selectActionIndexLegacy(logits, readout.actionCodes);
        let secondIndex = -1;
        for (let index = 0; index < logits.length; index += 1) {
            if (index === bestIndex) continue;
            if (secondIndex < 0 || logits[index] > logits[secondIndex]) secondIndex = index;
        }
        if (secondIndex >= 0) {
            const forced = [...logits];
            forced[secondIndex] = logits[bestIndex];
            const v15Index = selectActionIndexV15(forced, readout.actionCodes);
            forcedTopTies.push({
                diagId: readout.diagId,
                forcedTieIndices: [bestIndex, secondIndex].sort((a, b) => a - b),
                forcedTieActionCodes: [readout.actionCodes[bestIndex], readout.actionCodes[secondIndex]],
                topLogit: logits[bestIndex],
                originalGap: logits[bestIndex] - logits[secondIndex],
                v15SelectedIndex: v15Index,
                v15SelectedActionCode: readout.actionCodes[v15Index],
                legacySelectedIndex: selectActionIndexLegacy(forced, readout.actionCodes),
                legacySelectedActionCode: readout.actionCodes[selectActionIndexLegacy(forced, readout.actionCodes)],
                v15PrefersSmallerCode: v15Index === (
                    readout.actionCodes[bestIndex] <= readout.actionCodes[secondIndex] ? bestIndex : secondIndex
                ),
            });
        }
    }
    if (topGap < 1e-3) {
        nearTies.push({
            diagId: readout.diagId,
            candidateCount: logits.length,
            topGap,
            v15SelectedIndex: selectActionIndexV15(logits, readout.actionCodes),
            v15SelectedActionCode: readout.actionCodes[selectActionIndexV15(logits, readout.actionCodes)],
            legacySelectedIndex: selectActionIndexLegacy(logits, readout.actionCodes),
            predictorBestActionIndex: readout.bestActionIndex,
        });
    }
}

// ------------------------------------------------------------------ D. 历史 schema 的 tie-break 保留

interface LegacyReadout {
    checkpointPath: string;
    exists: boolean;
    encoderSchemaId: string | null;
    semanticsVariant: string | null;
    spatialChannels: number | null;
    semanticDim: number | null;
    loadError: string | null;
    probe: Record<string, unknown> | null;
}

let legacy: LegacyReadout = {
    checkpointPath: legacyCheckpointPath,
    exists: false,
    encoderSchemaId: null,
    semanticsVariant: null,
    spatialChannels: null,
    semanticDim: null,
    loadError: null,
    probe: null,
};

if (legacyCheckpointPath && fs.existsSync(path.resolve(legacyCheckpointPath))) {
    legacy.exists = true;
    try {
        const weights = loadSpatialResNetFromJson(fs.readFileSync(path.resolve(legacyCheckpointPath), 'utf8'));
        const predictor = new SpatialResNetPredictor(weights);
        legacy.encoderSchemaId = predictor.encoderSchemaId;
        legacy.semanticsVariant = predictor.semanticsVariant;
        legacy.spatialChannels = predictor.spatialChannels;
        legacy.semanticDim = predictor.semanticDim;
        // 历史权重用历史规则的 tie-break：合成并列下取**数组下标序**首个最大值。
        const codes = ['move:b:9,9', 'attack:a:b', 'wait:a', 'end_turn'];
        const logits = [1.0, 1.0, 1.0, 1.0];
        const legacyIndex = selectActionIndexForSchema(predictor.encoderSchemaId, logits, codes);
        legacy.probe = {
            syntheticAllEqualLogits: logits,
            actionCodes: codes,
            selectedIndexBySchemaRule: legacyIndex,
            selectedActionCode: codes[legacyIndex],
            v15RuleWouldSelectIndex: selectActionIndexV15(logits, codes),
            v15RuleWouldSelectCode: codes[selectActionIndexV15(logits, codes)],
            legacyRulePreserved: legacyIndex === 0,
        };
    } catch (error) {
        legacy.loadError = (error as Error)?.message ?? String(error);
    }
}

// ------------------------------------------------------------------ E. 空合法集的 shared policy 契约

const emptySetResults: any[] = [];
for (const line of fs.readFileSync(path.resolve(statesPath), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (record.candidateCount !== 0) continue;
    const state = record.state as GameState;
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    const legal: Action[] = engine.isTerminal() ? [] : engine.getLegalActions(state.currentPlayer);
    const allowed = legal.filter((a) => a.type !== 'surrender');
    // 用同一张 V15 权重跑两个入口：引擎真实合法集、以及显式空数组。
    const checkpointForEmpty = argOf('--v15-checkpoint', 'v15/out/v15_20260925_core/T15-05/checkpoints/synthetic_v15_s42.json')!;
    const weights = loadSpatialResNetFromJson(fs.readFileSync(path.resolve(checkpointForEmpty), 'utf8'), {
        expectedEncoderSchemaId: 'spatial26_global20_actionSemantics53_v15',
    });
    const predictor = new SpatialResNetPredictor(weights);
    const probe = (actions: Action[], label: string) => {
        try {
            const result = predictSpatialAction(predictor, state, state.currentPlayer, actions);
            return { label, rejected: false, actionCode: encodeAction(result.action) };
        } catch (error) {
            return {
                label,
                rejected: true,
                errorName: (error as Error)?.name ?? null,
                errorCode: (error as { code?: string })?.code ?? null,
                typedEmptyActionSet: error instanceof EmptyActionSetError,
                message: (error as Error)?.message ?? String(error),
            };
        }
    };
    emptySetResults.push({
        diagId: record.diagId,
        engineLegalActionCount: legal.length,
        policyAllowedActionCount: allowed.length,
        probes: [probe(allowed, 'policy_allowed_set'), probe([], 'explicit_empty_array')],
    });
}

const report = {
    schema: 'v15_tiebreak_raw_1',
    task: 'T15-05',
    side: 'typescript',
    generatedAt: new Date().toISOString(),
    rules: {
        v15_current: 'max logit → 最小 actionCode（代码点序）→ 最小下标',
        legacySchemas: '首个最大值（数组下标序），保留既有实现，不静默换新规则',
        noLocaleCompare: '两侧都只用代码单元/代码点比较，不使用 localeCompare / locale.strxfrm',
    },
    inputs: {
        statesPath,
        statesSha256: sha256(fs.readFileSync(path.resolve(statesPath))),
        tsRawPath,
        tsRawSha256: sha256(fs.readFileSync(path.resolve(tsRawPath))),
    },
    syntheticTieCases: syntheticCases,
    realExactTies,
    controlledDuplicateChecks,
    forcedTopTies,
    nearTies,
    nearTieThreshold: 1e-3,
    legacySchema: legacy,
    emptyAllowedSet: emptySetResults,
};

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(path.resolve(outPath), JSON.stringify(report, null, 2), 'utf8');

console.log(JSON.stringify({
    out: outPath,
    syntheticCarriers: syntheticCases.length,
    syntheticCases: syntheticCases.length * syntheticKinds.length,
    realExactTies: realExactTies.length,
    controlledDuplicateStates: controlledDuplicateChecks.length,
    controlledDuplicateGroupsAllEqual: controlledDuplicateChecks
        .flatMap((entry) => entry.groups).filter((group: any) => group.allLogitsExactlyEqual).length,
    forcedTopTies: forcedTopTies.length,
    nearTies: nearTies.length,
    legacySchemaId: legacy.encoderSchemaId,
    legacyVariant: legacy.semanticsVariant,
    legacyLoadError: legacy.loadError,
    emptySetStates: emptySetResults.length,
    emptySetRejections: emptySetResults.flatMap((e) => e.probes).filter((p: any) => p.rejected).length,
}, null, 2));
