/**
 * V14/T14-06 补项：失败对局的**逐决策窗口规则归因**。
 *
 * 为什么必须补：
 * 上一轮 `failure_taxonomy.json` 只有机械分类（结局、步数、回合、决策数、错误、回退），
 * 任务书要求「每个候选在失利/截断中至少抽取 10 个决策窗口，由规则 oracle 判定：
 * 数据/解码、规则特征、战术失误、策略长期目标等，并保留 UNKNOWN」。
 * 机械分类无法回答「哪一步是坏棋」，因此本工具把逐窗口记录做出来。
 *
 * 判定原则（对应任务书第 16 节的禁止项）：
 * - 只有**真实引擎一步结果**才能判「立即致胜」：把候选动作交给真实 `GameEngine.step`，
 *   读 `state.winner` 并与己方联盟比较；不用动作类别或启发式 rollout 猜测；
 * - 「存在合法 capture」不等于「此刻必须 capture」：capture 只作**机会读数**记录，
 *   不当判错依据；
 * - 「攻击了最后一个单位」不等于击杀：只看引擎实际执行结果；
 * - 无法归因的窗口保留 `UNKNOWN`；
 * - 所有探针都在克隆状态上执行，绝不污染真实对局。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/failure_attribution.ts \
 *     --candidate <model.json> --scenario "SDPLAN:sd-normal:(2) Duel.aem" --seeds 1,2,3 \
 *     --out <windows.jsonl> [--wall-ms 300000] [--tail-window 30]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { loadSdTrainingPlanConfig } from '../../tools/sd_training_state_generator';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { encodeAction } from '../../src/game/env';
import { getAllianceId } from '../../src/game/rule_config';
import { GameEngine } from '../../src/game/engine';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { predictSpatialAction } from '../../src/game/ai/shared_spatial_policy';
import { ENCODER_SCHEMA_ID_V14 } from '../../src/game/ai/spatial_tensor_encoder';
import { classifyOutcome } from '../../v13/tools/eval_v3_core';
import { streamFor } from '../../v13/tools/eval_v3_core';
import type { Action, GameState } from '../../src/game/types';

const UNPACK_DIR = 'APK/_analysis/unpack';
const SD_PLAN_FILE = 'training_configs/sd_training_plan_20260705.json';

function arg(name: string, fallback: string | null): string | null {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const candidatePath = arg('--candidate', 'v14/out/v14_20260925_t14b/T14-06/c1_s42/c1_s42_best.json')!;
const scenarioId = arg('--scenario', 'SDPLAN:sd-normal:(2) Duel.aem')!;
const seeds = (arg('--seeds', '1,2,3') as string).split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
const wallMs = Number(arg('--wall-ms', '300000'));
const maxSteps = Number(arg('--max-steps', '20000'));
const tailWindow = Number(arg('--tail-window', '30'));
const outPath = path.resolve(arg('--out', 'v14/out/v14_20260925_t14b/T14-06/failure_windows.jsonl')!);

/**
 * 中文：在克隆状态上用真实引擎一步执行，判断该动作是否立即终结对局。
 * 返回 winner 与真实 info 文本；执行失败（非法动作）如实记录而不是当成「未致胜」。
 */
function immediateWinnerOf(state: GameState, action: Action): { winner: number | null; executed: boolean; note: string } {
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    try {
        const result = engine.step(action);
        return { winner: result.state.winner, executed: true, note: String(result.info ?? '') };
    } catch (error) {
        return { winner: null, executed: false, note: error instanceof Error ? error.message : String(error) };
    }
}

interface WindowRecord {
    windowId: string;
    seed: number;
    seat: number;
    ally: number;
    turn: number;
    step: number;
    candidateUnits: number;
    enemyUnits: number;
    legalCount: number;
    chosenAction: string;
    chosenIsCapture: boolean;
    chosenIsEndTurn: boolean;
    terminalWinAvailable: boolean;
    terminalWinActionCodes: string[];
    chosenIsTerminalWin: boolean;
    captureOpportunityAvailable: boolean;
    captureActionCodes: string[];
    enemyOnOwnCastleCount: number;
    ownCastleCount: number;
    endTurnWithActionsAvailable: boolean;
    verdict: string;
    evidence: string;
}

function castleOccupancy(state: GameState, ally: number): { enemyOn: number; own: number } {
    let enemyOn = 0;
    let own = 0;
    for (let y = 0; y < state.map.height; y += 1) {
        for (let x = 0; x < state.map.width; x += 1) {
            const tile = state.map.tiles[y]?.[x];
            if (!tile) continue;
            if (getTileTerrainKey(tile) !== 'castle') continue;
            const owner = tile.ownerId;
            if (owner === null || owner === undefined) continue;
            if (getAllianceId(state, owner) !== ally) continue;
            own += 1;
            const occupiedByEnemy = state.units.some((u) => u.hp > 0 && u.pos.x === x && u.pos.y === y
                && getAllianceId(state, u.ownerId) !== ally);
            if (occupiedByEnemy) enemyOn += 1;
        }
    }
    return { enemyOn, own };
}

async function main(): Promise<void> {
    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);
    const weights = loadSpatialResNetFromJson(fs.readFileSync(candidatePath, 'utf8'), {
        expectedEncoderSchemaId: ENCODER_SCHEMA_ID_V14,
    });
    const predictor = new SpatialResNetPredictor(weights);
    const mapName = scenarioId.split(':').pop() as string;

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const out = fs.createWriteStream(outPath, { flags: 'w' });
    const gameSummaries: any[] = [];

    for (const seed of seeds) {
        const episode = {
            kind: 'skirmish_episode', version: 1,
            scenario: { id: scenarioId, mode: 'SD', mapName, resourcePath: '' },
            seed, maxPlies: 1200, maxSteps,
            initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
            players: [], policyByPlayer: {}, steps: [], summary: {},
        } as any;
        const env = await envFactory.createEnv(episode);
        env.reset(seed);
        const engine = env.getEngine();
        const playerIds: number[] = engine.getState().players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
        const seatAi = new Map<number, HeuristicAI>();
        for (const seat of playerIds) seatAi.set(seat, new HeuristicAI(streamFor(seed, seat)));

        const windows: WindowRecord[] = [];
        let steps = 0;
        let wallTimeout = false;
        let policyError: string | null = null;
        const startedAt = Date.now();
        const candidateSeat = playerIds[0];
        const candidateAlly = getAllianceId(engine.getState(), candidateSeat);

        while (!engine.isTerminal() && steps < maxSteps) {
            if (Date.now() - startedAt > wallMs) { wallTimeout = true; break; }
            const state = engine.getState();
            const current = state.currentPlayer;
            const legal = engine.getLegalActions(current).filter((a) => a.type !== 'surrender');
            if (legal.length === 0) { policyError = `no policy-allowed action for seat ${current}`; break; }

            let action: Action | null;
            if (current === candidateSeat) {
                try {
                    action = predictSpatialAction(predictor, state, current, legal).action;
                } catch (error) {
                    policyError = error instanceof Error ? error.message : String(error);
                    break;
                }
            } else {
                try {
                    action = seatAi.get(current)?.getAction(engine, current, undefined) ?? null;
                } catch (error) {
                    policyError = error instanceof Error ? error.message : String(error);
                    break;
                }
            }
            if (!action) { policyError = 'policy returned no action'; break; }
            const chosenCode = encodeAction(action);

            // 中文：只对候选座位的决策做 oracle 归因 —— 这才能回答「候选哪一步是坏棋」。
            if (current === candidateSeat) {
                const legalCodes = legal.map((a) => encodeAction(a));
                const winCodes: string[] = [];
                for (const candidateAction of legal) {
                    const probe = immediateWinnerOf(state, candidateAction);
                    if (probe.executed && probe.winner !== null && probe.winner !== -1
                        && probe.winner === candidateAlly) {
                        winCodes.push(encodeAction(candidateAction));
                    }
                }
                const captureCodes = legalCodes.filter((code) => code.startsWith('capture:'));
                const isEndTurn = chosenCode === 'end_turn';
                const hasNonEndTurn = legalCodes.some((code) => code !== 'end_turn');
                const castle = castleOccupancy(state, candidateAlly);
                const chosenIsWin = winCodes.includes(chosenCode);

                let verdict = 'UNKNOWN';
                let evidence = '本窗口读数不足以归因';
                if (winCodes.length > 0 && !chosenIsWin) {
                    verdict = 'MISSED_IMMEDIATE_TERMINAL_WIN';
                    evidence = `存在 ${winCodes.length} 个真实引擎一步致胜动作（例：${winCodes[0]}），实选 ${chosenCode}`;
                } else if (chosenIsWin) {
                    verdict = 'TOOK_TERMINAL_WIN';
                    evidence = `实选 ${chosenCode} 经引擎一步执行后立即获胜`;
                } else if (isEndTurn && hasNonEndTurn) {
                    verdict = 'END_TURN_WITH_ACTIONS_AVAILABLE';
                    evidence = `仍有 ${legalCodes.length - 1} 个非 end_turn 合法动作时结束回合`;
                } else if (captureCodes.length === 0 && castle.enemyOn > 0) {
                    verdict = 'NO_CAPTURE_AVAILABLE_WHILE_ENEMY_ON_OWN_CASTLE';
                    evidence = `${castle.enemyOn}/${castle.own} 座己方城堡被敌军占据，但本窗口没有合法 capture`;
                }

                windows.push({
                    windowId: `${scenarioId}#seed${seed}#step${steps}`,
                    seed, seat: current, ally: candidateAlly, turn: state.turn, step: steps,
                    candidateUnits: state.units.filter(
                        (u) => u.hp > 0 && getAllianceId(state, u.ownerId) === candidateAlly).length,
                    enemyUnits: state.units.filter(
                        (u) => u.hp > 0 && getAllianceId(state, u.ownerId) !== candidateAlly).length,
                    legalCount: legalCodes.length,
                    chosenAction: chosenCode,
                    chosenIsCapture: chosenCode.startsWith('capture:'),
                    chosenIsEndTurn: isEndTurn,
                    terminalWinAvailable: winCodes.length > 0,
                    terminalWinActionCodes: winCodes.slice(0, 5),
                    chosenIsTerminalWin: chosenIsWin,
                    captureOpportunityAvailable: captureCodes.length > 0,
                    captureActionCodes: captureCodes.slice(0, 5),
                    enemyOnOwnCastleCount: castle.enemyOn,
                    ownCastleCount: castle.own,
                    endTurnWithActionsAvailable: isEndTurn && hasNonEndTurn,
                    verdict,
                    evidence,
                });
            }

            if (!legal.some((a) => encodeAction(a) === chosenCode)) {
                policyError = `chosen action outside policy-allowed set: ${chosenCode}`;
                break;
            }
            try {
                engine.step(action);
            } catch (error) {
                policyError = error instanceof Error ? error.message : String(error);
                break;
            }
            steps += 1;
        }

        const finalState = engine.getState();
        const outcomeKind = classifyOutcome({
            engineError: null,
            policyError,
            cancelled: false,
            wallTimeout,
            winner: finalState.winner,
            winnerAlliance: finalState.winner,
            candidateAlliance: candidateAlly,
            steps,
            maxSteps,
            plies: steps,
            maxPlies: null,
        });

        const tail = windows.slice(-tailWindow);
        for (const record of windows) out.write(JSON.stringify(record) + '\n');

        const counts: Record<string, number> = {};
        for (const record of windows) counts[record.verdict] = (counts[record.verdict] ?? 0) + 1;
        const tailCounts: Record<string, number> = {};
        for (const record of tail) tailCounts[record.verdict] = (tailCounts[record.verdict] ?? 0) + 1;

        gameSummaries.push({
            seed, scenarioId, candidateSeat, candidateAlly,
            candidateDecisions: windows.length,
            steps,
            finalWinnerAllianceId: finalState.winner,
            outcomeKind,
            losing: outcomeKind === 'NATURAL_LOSS' || outcomeKind === 'WALL_TIMEOUT'
                || outcomeKind === 'STEP_LIMIT' || outcomeKind === 'PLY_LIMIT',
            wallTimeout,
            policyError,
            verdictCounts: counts,
            tailVerdictCounts: tailCounts,
            tailWindowsSampled: tail.length,
            meetsMinimumWindows: tail.length >= 10,
            windowLogPath: path.relative(process.cwd(), outPath).replace(/\\/g, '/'),
        });
        console.log(`[T14-06] seed=${seed} steps=${steps} winner=${finalState.winner} `
            + `outcome=${outcomeKind} verdicts=${JSON.stringify(counts)}`);
    }

    await new Promise<void>((resolve) => out.end(resolve));
    const summaryPath = path.join(path.dirname(outPath), 'failure_attribution_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({
        schema: 'v14_failure_attribution_1',
        task: 'T14-06',
        generatedAt: new Date().toISOString(),
        candidate: candidatePath.replace(/\\/g, '/'),
        scenarioId,
        seeds,
        rule: '中文：verdict 只使用真实引擎一步执行结果与状态读数；capture 只作机会读数，'
            + '不判「必须立即占领」；无法归因记为 UNKNOWN。',
        games: gameSummaries,
    }, null, 2) + '\n');
    console.log(`[T14-06] -> ${outPath}`);
    console.log(`[T14-06] -> ${summaryPath}`);
}

void main();
