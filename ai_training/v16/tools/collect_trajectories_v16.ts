/**
 * V16/T16-01 §3.1：从初态 + 策略真实重放每局，采集逐步 trace 与失败窗口（owner：T16-01）。
 *
 * 为什么用「重放」而不是「边跑边存」：
 * 正式对局是用 `playOne` 跑的，它不暴露逐步钩子。本工具用**同一实现**重新跑一遍同一局
 * （同 scenario/seed/座位/权重/caps），并在每一步记录：
 * 动作前状态摘要、完整动作前状态、规范顺序候选与 logits、实际 actionCode、动作后回合/终局。
 *
 * **忠实性由 `actionDigest` 逐局核对**：重放得到的 digest 必须与正式行完全一致；
 * 只要一局不一致，该局的窗口全部作废并报错。这样「窗口能真实重放」不是声明，而是被验证的。
 *
 * 分歧定义（任务书 §3.1）：在候选策略做决定的步骤上，用隔离标签器 L1 查同状态标签，
 * 比较 L1 的选择与模型的选择，并按「L1 给模型动作的分数 − L1 给自己选择的分数」排序
 * （越负说明 L1 越不认可模型的动作）。每局最多取前 3 个窗口。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v16/tools/collect_trajectories_v16.ts \
 *     --run-id v16_20260926_core --games <games.jsonl> --model <final.json> --model-key c2:42 \
 *     --out-dir v16/out/v16_20260926_core/T16-01
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import {
    UNPACK_DIR,
    SD_PLAN_FILE,
    playOne,
    type GameRecord,
    type StepTraceV16,
} from '../../v14/tools/eval_v14_match';
import { queryL1Label } from '../../v15/tools/labeler_l1_v15';
import { V16_DEFAULT_CAPS, V16_PANELS, blocksForPanelV16, type V16Block } from './eval_v16_protocol';
import { checkpointSha256V15 } from '../../v15/tools/eval_v15_identity';
import type { GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RUN_ID = arg('--run-id', 'v16_20260926_core') as string;
const GAMES_PATH = path.resolve(arg('--games', '') as string);
const MODEL_PATH = arg('--model', null);
const OUT_DIR = path.resolve(arg('--out-dir', `v16/out/${RUN_ID}/T16-01`) as string);
const MAX_WINDOWS = Number(arg('--max-windows', '3'));
const MAX_L1_QUERIES = Number(arg('--max-l1-queries-per-game', '40'));
const LABEL_SEED_BASE = Number(arg('--label-seed-base', '2609700000'));
const ONLY_TERMINAL_FILTER = arg('--only-outcome', 'loss') as string;

if (!fs.existsSync(GAMES_PATH)) throw new Error(`[T16-01] games 文件不存在：${GAMES_PATH}`);
fs.mkdirSync(path.join(OUT_DIR, 'traces'), { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'windows'), { recursive: true });

let predictor: SpatialResNetPredictor | null = null;
let requestedPolicyId = 'heuristic';
if (MODEL_PATH !== null) {
    const abs = path.resolve(MODEL_PATH);
    const json = fs.readFileSync(abs, 'utf8');
    predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(json, { expectedEncoderSchemaId: null }));
    requestedPolicyId = path.basename(abs).replace(/\.json$/, '');
    console.log(`[T16-01] 重放权重 ${path.basename(abs)} schema=${predictor.encoderSchemaId} sha=${checkpointSha256V15(abs).slice(0, 12)}…`);
}

/** 从 blockId 反查 block（`dev:m3:s1` 形式），拿到 scenarioId/rootSeed/座位。 */
function blockOf(panelId: string, blockId: string): V16Block {
    const blocks = blocksForPanelV16(panelId);
    const found = blocks.find((b) => b.blockId === blockId);
    if (!found) throw new Error(`[T16-01] 在面板 ${panelId} 找不到 block ${blockId}。`);
    return found;
}

const rows = fs.readFileSync(GAMES_PATH, 'utf8')
    .split(/\r?\n/).filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as GameRecord)
    .filter((r) => r.arm === 'CANDIDATE');

if (rows.length === 0) throw new Error('[T16-01] 文件里没有 CANDIDATE 行。');

const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);
const allWindows: Array<Record<string, unknown>> = [];
const gameSummaries: Array<Record<string, unknown>> = [];
let digestMismatches = 0;

for (const row of rows) {
    const isLoss = row.outcomeKind === 'NATURAL_LOSS';
    if (ONLY_TERMINAL_FILTER === 'loss' && !isLoss) {
        gameSummaries.push({
            gameId: row.gameId, outcomeKind: row.outcomeKind,
            skipped: '不是失败局（T16-01 只对失败局取窗口）',
        });
        continue;
    }
    if (row.panelId === undefined || row.blockId === undefined
        || row.rootSeed === undefined || row.candidateSeat === null) {
        throw new Error(`[T16-01] ${row.gameId} 缺少重放所需的身份字段。`);
    }
    const block = blockOf(String(row.panelId), String(row.blockId));

    interface Captured { trace: StepTraceV16; stateJson: string | null }
    const captured: Captured[] = [];
    const tracePath = path.join(
        OUT_DIR, 'traces',
        `${path.basename(GAMES_PATH).replace(/\.games\.jsonl$/, '')}__${String(row.blockId).replace(/:/g, '-')}__seat${row.candidateSeat}.jsonl`,
    );

    const replay = await playOne({
        runId: RUN_ID,
        scenarioId: block.scenarioId,
        seed: block.rootSeed,
        candidateSeat: row.candidateSeat,
        viewedSeatHint: row.candidateSeat,
        maxSteps: row.maxSteps,
        maxPlies: row.maxPlies,
        wallTimeoutMs: row.wallTimeoutMs,
        predictor, checkpointSha256: row.checkpointSha256, requestedPolicyId,
        envFactory,
        emitIdentity: false,
        onStep: (trace: StepTraceV16) => {
            if (trace.stateBeforeJson !== null) captured.push({ trace, stateJson: trace.stateBeforeJson });
            else captured.push({ trace, stateJson: null });
        },
        captureStateOnStep: true,
    });

    if (replay.actionDigest !== row.actionDigest) {
        digestMismatches += 1;
        throw new Error(
            `[T16-01] ${row.gameId} 重放 actionDigest 不一致（重放 ${replay.actionDigest.slice(0, 12)}…，`
            + `正式 ${row.actionDigest.slice(0, 12)}…）。窗口全部作废：重放不忠实，不能当证据。`,
        );
    }

    const decisionSteps = captured.filter((c) => c.trace.byCandidate && c.stateJson !== null && c.trace.actionCode !== '');
    // 按 root 限额取样：均匀抽取，避免全部来自同一长局/同一阶段。
    const stride = Math.max(1, Math.ceil(decisionSteps.length / MAX_L1_QUERIES));
    const sampled = decisionSteps.filter((_, i) => i % stride === 0);

    const scored: Array<Record<string, unknown>> = [];
    let l1Agrees = 0;
    for (const item of sampled) {
        const state = JSON.parse(item.stateJson as string) as GameState;
        const label = queryL1Label(state, {
            labelSeedBase: LABEL_SEED_BASE,
            actingPlayerId: item.trace.playerId,
            filterSurrender: true,
        });
        if (label.actionCode === null) continue;
        const modelScore = label.scores.find((s) => s.actionCode === item.trace.actionCode)?.score ?? null;
        const l1Score = label.scores.find((s) => s.actionCode === label.actionCode)?.score ?? null;
        if (label.actionCode === item.trace.actionCode) l1Agrees += 1;
        scored.push({
            stepIndex: item.trace.stepIndex,
            playerId: item.trace.playerId,
            allianceId: item.trace.allianceId,
            stateHashBefore: item.trace.stateHashBefore,
            modelActionCode: item.trace.actionCode,
            l1ActionCode: label.actionCode,
            divergence: label.actionCode !== item.trace.actionCode,
            l1ScoreOfModelAction: modelScore,
            l1ScoreOfL1Action: l1Score,
            l1ScoreGap: (modelScore !== null && l1Score !== null) ? modelScore - l1Score : null,
            legalActionCount: item.trace.legalActionCodes.length,
            modelRankInCanonicalOrder: item.trace.orderedActionCodes === null
                ? null
                : item.trace.orderedActionCodes.indexOf(item.trace.actionCode),
            stateJson: item.stateJson,
        });
    }

    const divergent = scored.filter((s) => s.divergence === true);
    const ranked = [...divergent].sort((a, b) => {
        const ga = (a.l1ScoreGap as number | null) ?? Number.POSITIVE_INFINITY;
        const gb = (b.l1ScoreGap as number | null) ?? Number.POSITIVE_INFINITY;
        if (ga !== gb) return ga - gb;
        return (a.stepIndex as number) - (b.stepIndex as number);
    }).slice(0, MAX_WINDOWS);

    for (const window of ranked) {
        allWindows.push({
            schema: 'v16_failure_window_1',
            gameId: row.gameId,
            panelId: row.panelId,
            blockId: row.blockId,
            mapName: row.mapName,
            seed: row.rootSeed,
            candidateSeat: row.candidateSeat,
            candidateAllianceId: row.candidateAllianceId,
            outcomeKind: row.outcomeKind,
            modelSha: row.checkpointSha256,
            modelTag: row.modelTag,
            reason: 'MODEL_DIVERGES_FROM_L1',
            proofLevel: 'INCONCLUSIVE_TRUNCATED',
            proofLevelNote:
                '本窗口只证明「模型与 L1 在同一状态下选择不同动作」，还没有跑反事实续弈；'
                + 'PROVEN_LOCAL / ROLLOUT_SUPPORTED 由 T16-01 §3.2 的反事实工具给出。',
            ...window,
            replaySource: {
                gameId: row.gameId,
                actionDigest: row.actionDigest,
                initialStateHash: row.initialStateHash,
                rulesHash: row.rulesHash,
                caps: { maxSteps: row.maxSteps, maxPlies: row.maxPlies, wallTimeoutMs: row.wallTimeoutMs },
            },
        });
    }

    const traceLines = captured.map((c) => JSON.stringify({
        stepIndex: c.trace.stepIndex,
        playerId: c.trace.playerId,
        allianceId: c.trace.allianceId,
        byCandidate: c.trace.byCandidate,
        stateHashBefore: c.trace.stateHashBefore,
        actionCode: c.trace.actionCode,
        legalActionCount: c.trace.legalActionCodes.length,
        orderedActionCodes: c.trace.orderedActionCodes,
        actionLogits: c.trace.actionLogits,
        candidateOrderingId: c.trace.candidateOrderingId,
        turnAfter: c.trace.turnAfter,
        terminalAfter: c.trace.terminalAfter,
        winnerAfter: c.trace.winnerAfter,
    })).join('\n');
    fs.writeFileSync(tracePath, `${traceLines}\n`, 'utf8');

    gameSummaries.push({
        gameId: row.gameId,
        blockId: row.blockId,
        mapName: row.mapName,
        seat: row.candidateSeat,
        outcomeKind: row.outcomeKind,
        steps: row.steps,
        turns: row.turns,
        candidateDecisionSteps: decisionSteps.length,
        l1QueriedSteps: sampled.length,
        l1AgreeSteps: l1Agrees,
        divergentSteps: divergent.length,
        windowsSaved: ranked.length,
        replayActionDigestMatches: true,
        tracePath: tracePath.replace(/\\/g, '/'),
    });
    console.log(
        `[T16-01] ${row.gameId} ${row.outcomeKind} steps=${row.steps} `
        + `候选决策=${decisionSteps.length} L1查询=${sampled.length} 分歧=${divergent.length} 窗口=${ranked.length}`,
    );
}

const windowsPath = path.join(OUT_DIR, 'windows', `${path.basename(GAMES_PATH).replace(/\.games\.jsonl$/, '')}.windows.jsonl`);
fs.writeFileSync(windowsPath, `${allWindows.map((w) => JSON.stringify(w)).join('\n')}\n`, 'utf8');
const summaryPath = path.join(OUT_DIR, 'windows', `${path.basename(GAMES_PATH).replace(/\.games\.jsonl$/, '')}.summary.json`);
fs.writeFileSync(summaryPath, `${JSON.stringify({
    schema: 'v16_failure_windows_summary_1',
    gamesPath: GAMES_PATH.replace(/\\/g, '/'),
    modelPath: MODEL_PATH === null ? null : path.resolve(MODEL_PATH).replace(/\\/g, '/'),
    caps: V16_DEFAULT_CAPS,
    labelSeedBase: LABEL_SEED_BASE,
    digestMismatches,
    windowsTotal: allWindows.length,
    games: gameSummaries,
}, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
    windowsPath: windowsPath.replace(/\\/g, '/'),
    summaryPath: summaryPath.replace(/\\/g, '/'),
    windowsTotal: allWindows.length,
    digestMismatches,
    gamesProcessed: gameSummaries.length,
}, null, 2));
void V16_PANELS;
