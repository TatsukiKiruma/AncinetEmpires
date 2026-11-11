/**
 * V16/T16-02 §4.1：规范候选顺序与稳定 tie-break 的可复现回归（owner：T16-02）。
 *
 * 覆盖任务书 §4.1 的三条要求，全部在**真实五图状态**上跑，不用合成假状态：
 * 1. 同一状态、同一权重下，把合法动作数组任意重排（逆序 + 3 个固定乱序），
 *    `predictSpatialAction` 必须选出**同一个行动作**（actionCode 相同）。
 * 2. 精确并列 logits（把 policy 头输出层权重与偏置清零 ⇒ 所有候选 logit 相同）时，
 *    选中的必须是**最小 actionCode**，与输入顺序无关。
 * 3. 比较器属性：反对称、传递、与 Unicode 代码点序一致；重复 actionCode 必须报错，
 *    不允许静默保留导致 tie-break 失去定义。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v16/tools/t16_02_ordering_regression.ts \
 *     --model v15/out/v15_20260925_core/T15-06/c2_s42/c2_s42_final.json \
 *     --out v16/out/v16_20260926_core/T16-02/ordering_regression.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { predictSpatialAction } from '../../src/game/ai/shared_spatial_policy';
import {
    CANDIDATE_ORDERING_ID_V16,
    canonicalActionOrderV16,
    compareActionCodeCanonicalV16,
} from '../../src/game/ai/action_ordering';
import { encodeAction } from '../../src/game/env';
import {
    V16_DEFAULT_CAPS,
    V16_MAPS,
    V16_PANELS,
    V16_SD_PLAN_FILE,
    V16_UNPACK_DIR,
    scenarioIdOfMapV16,
} from './eval_v16_protocol';
import type { Action, GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const MODEL_PATH = arg('--model', 'v15/out/v15_20260925_core/T15-06/c2_s42/c2_s42_final.json') as string;
const OUT_PATH = path.resolve(arg('--out', 'v16/out/v16_20260926_core/T16-02/ordering_regression.json') as string);
const MOVES_PER_MAP = Number(arg('--moves', '6'));

/** 确定性伪随机（与仓库其它工具口径一致，不依赖 Math.random）。 */
function mulberry(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function permutationsOf(count: number, seed: number): Array<{ label: string; order: number[] }> {
    const base = Array.from({ length: count }, (_, i) => i);
    const out: Array<{ label: string; order: number[] }> = [{ label: 'reverse', order: [...base].reverse() }];
    for (let r = 0; r < 3; r += 1) {
        const order = [...base];
        const rng = mulberry(seed + r * 7919);
        for (let i = order.length - 1; i > 0; i -= 1) {
            const j = Math.floor(rng() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        out.push({ label: `shuffle-${r}`, order });
    }
    return out;
}

const modelJson = fs.readFileSync(path.resolve(MODEL_PATH), 'utf8');
const weights = loadSpatialResNetFromJson(modelJson, { expectedEncoderSchemaId: null });
// 中文：不要在 `SpatialResNetWeights` 上做 JSON 往返——它是 Float32Array，JSON 化会退化成
// 普通对象并把 denseForward 变成 NaN。改为在**原始 JSON 文本**上把 policy 输出层清零，
// 再走正式加载器，这样并列输入仍然经过完整的形状校验。
const tiedRaw = JSON.parse(modelJson) as { polDense2: { weights: number[]; biases: number[] } };
tiedRaw.polDense2.weights = new Array(tiedRaw.polDense2.weights.length).fill(0);
tiedRaw.polDense2.biases = new Array(tiedRaw.polDense2.biases.length).fill(0);
const tiedPredictor = new SpatialResNetPredictor(
    loadSpatialResNetFromJson(JSON.stringify(tiedRaw), { expectedEncoderSchemaId: null }),
);
const normalPredictor = new SpatialResNetPredictor(weights);

const failures: string[] = [];
const cases: Array<Record<string, unknown>> = [];

/* ---------------- 比较器属性 ---------------- */
const sampleCodes = [
    'end_turn', 'wait:u1', 'move:u1:1,2', 'attack:u2:u9', 'recruit_to_castle:soldier:4,4',
    'heal:u3:u4', 'support:u5:u6', 'summon:g1:2,3', 'post_attack_move:u7:5,5',
    'destroy_town:5,5', 'capture:u8:3,3', 'repair:u8:3,3',
];
let comparatorViolations = 0;
for (const a of sampleCodes) {
    for (const b of sampleCodes) {
        const ab = compareActionCodeCanonicalV16(a, b);
        const ba = compareActionCodeCanonicalV16(b, a);
        if (ab !== -ba) comparatorViolations += 1;
        const expected = a < b ? -1 : a > b ? 1 : 0; // 期望：与代码点序一致（样本全为 ASCII）
        if (ab !== expected) comparatorViolations += 1;
    }
}
for (const a of sampleCodes) {
    for (const b of sampleCodes) {
        for (const c of sampleCodes) {
            if (compareActionCodeCanonicalV16(a, b) <= 0 && compareActionCodeCanonicalV16(b, c) <= 0
                && compareActionCodeCanonicalV16(a, c) > 0) {
                comparatorViolations += 1;
            }
        }
    }
}

/* ---------------- 重复 actionCode 必须报错 ---------------- */
let duplicateRejected = false;
try {
    const dup: Action[] = [
        { type: 'wait', unitId: 'u1' } as unknown as Action,
        { type: 'wait', unitId: 'u1' } as unknown as Action,
    ];
    canonicalActionOrderV16(dup);
} catch {
    duplicateRejected = true;
}
if (!duplicateRejected) failures.push('重复 actionCode 未被 canonicalActionOrderV16 拒绝。');

/* ---------------- 真实五图状态 ---------------- */
const envFactory = await createDefaultEnvFactory(V16_UNPACK_DIR, V16_SD_PLAN_FILE);

function makeEpisode(scenarioId: string, seed: number) {
    const mapName = scenarioId.split(':').pop() as string;
    return {
        kind: 'skirmish_episode', version: 1,
        scenario: { id: scenarioId, mode: 'SD', mapName, resourcePath: '' },
        seed, maxPlies: 1200, maxSteps: V16_DEFAULT_CAPS.maxStepsAtomicActions,
        initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
        players: [], policyByPlayer: {}, steps: [], summary: {},
    } as any;
}

for (let m = 0; m < V16_MAPS.length; m += 1) {
    const mapName = V16_MAPS[m];
    const scenarioId = scenarioIdOfMapV16(mapName);
    const seed = V16_PANELS.dev.baseSeed + 10 * m;
    const env = await envFactory.createEnv(makeEpisode(scenarioId, seed));
    env.reset(seed);
    const engine = env.getEngine();

    const rng = mulberry(1234 + m);
    for (let move = 0; move < MOVES_PER_MAP; move += 1) {
        if (engine.isTerminal()) break;
        const state: GameState = engine.getState();
        const current = state.currentPlayer;
        const legal = engine.getLegalActions(current).filter((a) => a.type !== 'surrender');
        if (legal.length === 0) break;

        for (const [tag, predictor] of [['normal', normalPredictor], ['tiedZeroPolicyHead', tiedPredictor]] as const) {
            const base = predictSpatialAction(predictor, state, current, legal);
            const minCode = [...legal].map(encodeAction).sort(compareActionCodeCanonicalV16)[0];
            const baseOrdered = canonicalActionOrderV16(legal);
            const expectedMinCode = baseOrdered[0].code;

            if (tag === 'tiedZeroPolicyHead' && base.bestActionCode !== minCode) {
                failures.push(
                    `${mapName} move=${move} 并列 logits 时选中 '${base.bestActionCode}'，最小 actionCode 是 '${minCode}'。`,
                );
            }
            if (base.candidateOrderingId !== CANDIDATE_ORDERING_ID_V16) {
                failures.push(`${mapName} move=${move} 返回的 candidateOrderingId='${base.candidateOrderingId}'。`);
            }
            if (base.orderedActionCodes.length !== legal.length) {
                failures.push(`${mapName} move=${move} orderedActionCodes 长度与合法集不一致。`);
            }
            let permutationStable = true;
            for (const perm of permutationsOf(legal.length, seed + move)) {
                const permuted = perm.order.map((i) => legal[i]);
                const result = predictSpatialAction(predictor, state, current, permuted);
                if (result.bestActionCode !== base.bestActionCode) {
                    permutationStable = false;
                    failures.push(
                        `${mapName} move=${move} tag=${tag} 排列 ${perm.label} 选中 `
                        + `'${result.bestActionCode}'，基准是 '${base.bestActionCode}'。`,
                    );
                }
                if (JSON.stringify(result.orderedActionCodes) !== JSON.stringify(base.orderedActionCodes)) {
                    permutationStable = false;
                    failures.push(`${mapName} move=${move} tag=${tag} 排列 ${perm.label} 规范顺序序列不一致。`);
                }
            }
            cases.push({
                mapName, mapIndex: m, scenarioId, move, tag,
                currentPlayer: current,
                legalCount: legal.length,
                chosenActionCode: base.bestActionCode,
                chosenInputIndex: base.selectedInputIndex,
                minActionCodeInLegalSet: expectedMinCode,
                permutationStable,
                tieCase: tag === 'tiedZeroPolicyHead',
            });
        }

        // 推进：用确定性索引选择，避免依赖 Math.random。
        const picked = legal[Math.floor(rng() * legal.length)];
        try {
            engine.step(picked);
        } catch {
            break;
        }
    }
}

const report = {
    schema: 'v16_t16_02_ordering_regression_1',
    task: 'T16-02',
    generatedAt: new Date().toISOString(),
    modelPath: path.resolve(MODEL_PATH).replace(/\\/g, '/'),
    candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
    comparator: {
        sampleSize: sampleCodes.length,
        antisymmetryAndCodepointAgreement: comparatorViolations === 0,
        violations: comparatorViolations,
    },
    duplicateActionCodeRejected: duplicateRejected,
    casesChecked: cases.length,
    cases: cases.slice(0, 60),
    failures,
    passed: failures.length === 0 && comparatorViolations === 0 && duplicateRejected,
};
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
    out: OUT_PATH.replace(/\\/g, '/'),
    casesChecked: report.casesChecked,
    comparatorViolations,
    duplicateActionCodeRejected: duplicateRejected,
    failureCount: failures.length,
    firstFailures: failures.slice(0, 5),
    passed: report.passed,
}, null, 2));
if (!report.passed) process.exit(2);
