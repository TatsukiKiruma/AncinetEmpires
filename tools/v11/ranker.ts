/**
 * V11 T11-04 learning module: a small candidate gain ranker.
 *
 * Deliberately tiny and self-contained:
 *   - it lives in `tools/`, not in the Python training pipeline;
 *   - it does NOT touch the production model in `src/game/ai/models/`;
 *   - it is trained only on counterfactual labels produced in one snapshot with a
 *     shared continuation policy, random stream and budget.
 *
 * Two heads are fitted from the same labels so the first experiment can answer
 * "is the signal learnable at all" before anything is integrated into search:
 *
 *   pair  - pairwise logistic ranking (preferred action beats the baseline)
 *   delta - squared-error regression on dQ
 */
import { writeJson } from './common';
import type { CounterfactualLabel, LabelQuality } from './counterfactual';

export const ACTION_TYPES = [
    'move', 'attack', 'capture', 'repair', 'wait',
    'recruit_to_castle', 'recruit_and_deploy', 'heal', 'summon',
    'support', 'destroy_town', 'post_attack_move', 'surrender', 'end_turn',
] as const;

export const CATEGORIES = [
    'BASELINE_HEURISTIC', 'IMMEDIATE_WIN', 'MACRO_CHAIN',
    'ATTACK', 'CAPTURE', 'SUPPORT', 'RECRUIT', 'END_TURN',
] as const;

export const STAGES = ['OPENING', 'MIDGAME', 'ENDGAME'] as const;

/** Fixed feature order. `featureNames[i]` names `weights[i]`. */
export const FEATURE_NAMES: string[] = [
    'bias',
    'is_baseline',
    'is_chain',
    'chain_length_scaled',
    'heuristic_action_score_scaled',
    'turn_scaled',
    'legal_action_count_scaled',
    'player_gold_scaled',
    'player_unit_count_scaled',
    'enemy_unit_count_scaled',
    'commander_hp_fraction',
    'enemy_commander_hp_fraction',
    'unit_advantage_scaled',
    ...ACTION_TYPES.map(t => `action_${t}`),
    ...CATEGORIES.map(c => `category_${c}`),
    ...STAGES.map(s => `stage_${s}`),
];

export function featurize(row: {
    isBaseline: number;
    category: string;
    heuristicActionScore: number;
    actionType: string;
    isChain: number;
    chainLength: number;
    turn: number;
    stage: string;
    legalActionCount: number;
    playerGold: number;
    playerUnitCount: number;
    enemyUnitCount: number;
    commanderHpFraction: number;
    enemyCommanderHpFraction: number;
}): number[] {
    const v: number[] = new Array(FEATURE_NAMES.length).fill(0);
    let i = 0;
    v[i++] = 1; // bias
    v[i++] = row.isBaseline;
    v[i++] = row.isChain;
    v[i++] = row.chainLength / 3;
    v[i++] = Math.tanh(row.heuristicActionScore / 1000);
    v[i++] = row.turn / 30;
    v[i++] = row.legalActionCount / 60;
    v[i++] = row.playerGold / 1000;
    v[i++] = row.playerUnitCount / 10;
    v[i++] = row.enemyUnitCount / 10;
    v[i++] = row.commanderHpFraction;
    v[i++] = row.enemyCommanderHpFraction;
    v[i++] = (row.playerUnitCount - row.enemyUnitCount) / 10;
    for (const t of ACTION_TYPES) v[i++] = row.actionType === t ? 1 : 0;
    for (const c of CATEGORIES) v[i++] = row.category === c ? 1 : 0;
    for (const s of STAGES) v[i++] = row.stage === s ? 1 : 0;
    return v;
}

export interface TrainingRow {
    decisionId: string;
    features: number[];
    delta: number;
    isBaseline: boolean;
    isBest: boolean;
    labelQuality: LabelQuality;
    rootFamilyId: string;
    value: number;
}

export interface RankerWeights {
    schema: 'v11_ranker_weights_1';
    kind: 'pair' | 'delta';
    featureNames: string[];
    weights: number[];
    hyper: Record<string, number>;
    trainedOn: { decisions: number; rows: number; pairs: number };
    trainLoss: number[];
}

export interface TrainOptions {
    kind: 'pair' | 'delta';
    epochs: number;
    learningRate: number;
    l2: number;
    minQuality: LabelQuality[];
    shuffleSeed?: number;
}

export const QUALITY_ORDER: LabelQuality[] = ['VERIFIED_IMMEDIATE_WIN', 'VERIFIED_NATURAL', 'PROXY', 'UNINFORMATIVE'];

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Flatten labels into training rows, optionally shuffling the label signal. */
export function buildTrainingRows(labels: CounterfactualLabel[], shuffleSeed?: number): TrainingRow[] {
    const rng = shuffleSeed === undefined ? null : mulberry32(shuffleSeed);
    const rows: TrainingRow[] = [];
    for (const label of labels) {
        for (const c of label.candidates) {
            if (!c.evaluated) continue;
            rows.push({
                decisionId: label.decisionId,
                features: featurize({
                    isBaseline: c.isBaseline ? 1 : 0,
                    category: c.category,
                    heuristicActionScore: c.heuristicActionScore,
                    actionType: c.actionTypes[0] ?? 'end_turn',
                    isChain: c.actionTypes.length > 1 ? 1 : 0,
                    chainLength: c.actionTypes.length,
                    turn: label.context.turn,
                    stage: label.context.stage,
                    legalActionCount: label.context.legalActionCount,
                    playerGold: label.context.playerGold,
                    playerUnitCount: label.context.playerUnitCount,
                    enemyUnitCount: label.context.enemyUnitCount,
                    commanderHpFraction: label.context.commanderHpFraction,
                    enemyCommanderHpFraction: label.context.enemyCommanderHpFraction,
                }),
                delta: label.deltaQ,
                isBaseline: c.isBaseline,
                isBest: c.index === label.bestIndex,
                labelQuality: label.labelQuality,
                rootFamilyId: label.rootFamilyId,
                value: c.value,
            });
        }
    }
    if (rng) {
        // Shuffle the label signal across rows while keeping features in place:
        // this destroys the feature->preference relation without changing the
        // feature distribution, which is exactly the ablation we need.
        const signals = rows.map(r => ({ delta: r.delta, isBest: r.isBest }));
        for (let i = signals.length - 1; i > 0; i -= 1) {
            const j = Math.floor(rng() * (i + 1));
            [signals[i], signals[j]] = [signals[j], signals[i]];
        }
        rows.forEach((r, i) => { r.delta = signals[i].delta; r.isBest = signals[i].isBest; });
    }
    return rows;
}

/** Fit the ranker: `pair` uses pairwise logistic loss, `delta` least squares. */
export function trainRanker(rows: TrainingRow[], options: TrainOptions): RankerWeights {
    const dim = FEATURE_NAMES.length;
    const w = new Array(dim).fill(0);

    const grouped = new Map<string, TrainingRow[]>();
    for (const r of rows) {
        if (!options.minQuality.includes(r.labelQuality)) continue;
        const list = grouped.get(r.decisionId) ?? [];
        list.push(r);
        grouped.set(r.decisionId, list);
    }

    const pairs: Array<{ pos: number[]; neg: number[] }> = [];
    if (options.kind === 'pair') {
        for (const list of grouped.values()) {
            const best = list.filter(r => r.isBest);
            const baseline = list.filter(r => r.isBaseline);
            for (const p of best) {
                for (const n of baseline) {
                    if (p === n) continue;
                    pairs.push({ pos: p.features, neg: n.features });
                }
            }
        }
    }

    const trainRows = Array.from(grouped.values()).flat();
    const loss: number[] = [];
    const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
    const dot = (a: number[], b: number[]) => {
        let s = 0;
        for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
        return s;
    };

    for (let epoch = 0; epoch < options.epochs; epoch += 1) {
        const grad = new Array(dim).fill(0);
        let epochLoss = 0;
        let count = 0;

        if (options.kind === 'pair') {
            for (const { pos, neg } of pairs) {
                const gap = dot(w, pos) - dot(w, neg);
                const coeff = -(1 - sigmoid(gap));
                for (let i = 0; i < dim; i += 1) grad[i] += coeff * (pos[i] - neg[i]);
                epochLoss += -Math.log(Math.max(1e-12, sigmoid(gap)));
                count += 1;
            }
        } else {
            for (const r of trainRows) {
                const err = dot(w, r.features) - r.delta;
                for (let i = 0; i < dim; i += 1) grad[i] += err * r.features[i];
                epochLoss += 0.5 * err * err;
                count += 1;
            }
        }

        const scale = count > 0 ? 1 / count : 0;
        for (let i = 0; i < dim; i += 1) {
            w[i] -= options.learningRate * (grad[i] * scale + options.l2 * w[i]);
        }
        loss.push(Number((count > 0 ? epochLoss / count : 0).toFixed(6)));
    }

    return {
        schema: 'v11_ranker_weights_1',
        kind: options.kind,
        featureNames: FEATURE_NAMES,
        weights: w.map(x => Number(x.toFixed(8))),
        hyper: {
            epochs: options.epochs,
            learningRate: options.learningRate,
            l2: options.l2,
            minQualityRank: Math.min(...options.minQuality.map(q => QUALITY_ORDER.indexOf(q))),
        },
        trainedOn: { decisions: grouped.size, rows: trainRows.length, pairs: pairs.length },
        trainLoss: loss,
    };
}

export function scoreCandidate(weights: RankerWeights, features: number[]): number {
    let s = 0;
    for (let i = 0; i < features.length; i += 1) s += weights.weights[i] * features[i];
    return s;
}

/** A zeroed ranker: the "learning module disabled" control arm. */
export function zeroedRanker(kind: 'pair' | 'delta' = 'pair'): RankerWeights {
    return {
        schema: 'v11_ranker_weights_1',
        kind,
        featureNames: FEATURE_NAMES,
        weights: new Array(FEATURE_NAMES.length).fill(0),
        hyper: { epochs: 0, learningRate: 0, l2: 0, minQualityRank: 0 },
        trainedOn: { decisions: 0, rows: 0, pairs: 0 },
        trainLoss: [],
    };
}

export function saveRanker(file: string, weights: RankerWeights): void {
    writeJson(file, weights);
}

