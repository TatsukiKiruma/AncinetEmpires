/**
 * V18/T18-03：候选**后继状态**的价值探针。
 *
 * ## 为什么需要它
 *
 * 任务书 T18-03 明确要求：
 *   > 价值头用真实自然胜负训练…**先验证是否能正确排序同状态下的候选后继**，再允许用于搜索。
 *   > 原总 MSE 改善不替代分支排序验证。
 *
 * V17 只报过价值 MSE（0.157 vs 常数 0.945），**从未做过分支排序验证**。
 * 本工具为那项验证准备输入：对成对续弈里每个窗口的每个分支，
 * 把该分支动作应用到**精确快照**上得到后继状态，按与训练/评测完全相同的口径编码，
 * 输出空间张量与全局特征，交给 Python 侧的价值头打分。
 *
 * 注意：这里**不跑续弈**——「真实后果」直接取自已有的
 * `counterfactual/paired_continuation.branches.jsonl`（同一续弈合同下的有界结果）。
 * 本工具只负责「后继状态 → 网络输入」这一步。
 *
 * 用法（仓库根目录）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v18/tools/successor_value_probe_v18.ts \
 *     --run-id run_20260927_v18_01
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { encodeGameStateSpatial, encodeCandidateActionSpatial, ENCODER_SCHEMA_ID_V15 } from '../../src/game/ai/spatial_tensor_encoder';
import { CANDIDATE_ORDERING_ID_V16, compareActionCodeCanonicalV16 } from '../../src/game/ai/action_ordering';
import { V17_INPUT_IDENTITY_ID, policyInputKeyHexV17 } from '../../v17/tools/v17_input_identity';
import { getAllianceId } from '../../src/game/rule_config';
import type { Action, GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

const RUN_ID = arg('--run-id', 'run_20260927_v18_01') as string;
const RUN_ROOT = path.resolve(`v18/out/${RUN_ID}`);
const V17_RUN = path.resolve('v17/out/v17_20260926_r2');

const continuationPath = path.join(RUN_ROOT, 'counterfactual', 'paired_continuation.json');
if (!fs.existsSync(continuationPath)) throw new Error(`[T18-03] 缺少 ${continuationPath}`);
const continuation = JSON.parse(fs.readFileSync(continuationPath, 'utf8')) as {
    windows: Array<{ windowId: string; gameId: string; mapName: string; phaseBucket: string; branches: Array<{ actionCode: string; roles: string[] }> }>;
};

// 窗口的精确快照来自训练用途的学生轨迹（与成对续弈用的是同一批行）。
const rolloutFiles = [0, 1, 2, 3, 4].map(
    (m) => path.join(V17_RUN, 'data', 'new_train', 'rollouts', `train_student_P1s2026.m${m}.jsonl`),
);
const byGameId = new Map<string, { stateJson: string; subjectPlayerId: number; subjectSeat: number; rootFamilyId: string }>();
for (const file of rolloutFiles) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        let row: Record<string, unknown>;
        try {
            row = JSON.parse(t) as Record<string, unknown>;
        } catch {
            continue;
        }
        const gameId = String(row.gameId);
        if (byGameId.has(gameId)) continue;
        if (!row.stateJson) continue;
        byGameId.set(gameId, {
            stateJson: String(row.stateJson),
            subjectPlayerId: Number(row.subjectPlayerId),
            subjectSeat: Number(row.subjectSeat ?? row.subjectPlayerId),
            rootFamilyId: String(row.trueFamilyId ?? row.rootFamilyId),
        });
    }
}

const outRows: string[] = [];
const stats = {
    schema: 'v18_successor_value_probe_1',
    runId: RUN_ID,
    windows: 0,
    branches: 0,
    successorsEncoded: 0,
    missingWindowState: 0,
    illegalBranchAction: 0,
    terminalSuccessors: 0,
    encoderSchemaId: ENCODER_SCHEMA_ID_V15,
    candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
    inputIdentityId: V17_INPUT_IDENTITY_ID,
};

for (const window of continuation.windows) {
    const source = byGameId.get(window.gameId);
    if (!source) {
        stats.missingWindowState += 1;
        continue;
    }
    stats.windows += 1;
    const windowState = JSON.parse(source.stateJson) as GameState;
    const subjectAlliance = getAllianceId(windowState, source.subjectPlayerId);
    const engine = new GameEngine(JSON.parse(source.stateJson) as GameState);
    const legal: Action[] = engine.isTerminal() ? [] : engine.getLegalActions(source.subjectPlayerId).filter((a) => a.type !== 'surrender');
    const codeToAction = new Map<string, Action>();
    for (const a of legal) codeToAction.set(encodeAction(a), a);

    for (const branch of window.branches) {
        stats.branches += 1;
        const action = codeToAction.get(branch.actionCode);
        if (!action) {
            stats.illegalBranchAction += 1;
            continue;
        }
        const fork = new GameEngine(JSON.parse(source.stateJson) as GameState);
        fork.step(action);
        const successor = fork.getState();
        const terminal = fork.isTerminal();
        if (terminal) stats.terminalSuccessors += 1;

        const spatial = encodeGameStateSpatial(successor, source.subjectPlayerId, 'v2', { channels: 26 });
        const spatialArray = Array.from(spatial.spatialTensor);
        const globalArray = Array.from(spatial.globalFeatures);

        // 后继状态下主体仍然行动者的候选集（用于 policyInputKey，与训练口径一致）。
        const nextEngine = new GameEngine(JSON.parse(JSON.stringify(successor)) as GameState);
        const nextLegal: Action[] = nextEngine.isTerminal() ? [] : nextEngine.getLegalActions(source.subjectPlayerId).filter((a) => a.type !== 'surrender');
        const decorated = nextLegal.map((a) => ({ action: a, code: encodeAction(a) }));
        decorated.sort((a, b) => compareActionCodeCanonicalV16(a.code, b.code));
        const candidates = decorated.map((d) => {
            const features = encodeCandidateActionSpatial(successor, source.subjectPlayerId, d.action, 'v2', 'v15_current');
            return {
                actionCode: d.code,
                actorCoord: features.actorCoord ?? null,
                landingCoord: features.landingCoord ?? null,
                targetCoord: features.targetCoord ?? null,
                semantics: Array.from(features.semantics),
            };
        });
        const policyInputKey = policyInputKeyHexV17(spatialArray, globalArray, candidates);

        outRows.push(JSON.stringify({
            schema: 'v18_successor_row_1',
            windowId: window.windowId,
            gameId: window.gameId,
            mapName: window.mapName,
            phaseBucket: window.phaseBucket,
            rootFamilyId: source.rootFamilyId,
            branchActionCode: branch.actionCode,
            branchRoles: branch.roles,
            subjectPlayerId: source.subjectPlayerId,
            subjectSeat: source.subjectSeat,
            subjectAllianceId: subjectAlliance,
            successorTerminal: terminal,
            successorWinnerAllianceId: successor.winner ?? null,
            successorSubjectAliveUnits: successor.units.filter((u) => u.hp > 0 && getAllianceId(successor, u.ownerId) === subjectAlliance).length,
            successorCurrentPlayer: successor.currentPlayer,
            successorPolicyInputKey: policyInputKey,
            spatialTensor: spatialArray,
            globalFeatures: globalArray,
        }));
        stats.successorsEncoded += 1;
    }
}

const outPath = path.join(RUN_ROOT, 'counterfactual', 'successor_values.jsonl');
fs.writeFileSync(outPath, `${outRows.join('\n')}\n`, 'utf8');
const summaryPath = path.join(RUN_ROOT, 'counterfactual', 'successor_values.summary.json');
fs.writeFileSync(summaryPath, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
    out: path.relative(process.cwd(), outPath).replace(/\\/g, '/'),
    ...stats,
}, null, 2));
