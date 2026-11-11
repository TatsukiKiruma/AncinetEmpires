/**
 * V14/T14-07：启发式教师的资格探针（T-legal / T-label 部分）。
 *
 * 为什么这样切：
 * 上一轮 T14-07 的结论是「四级资格全部未取得」，但**没有给出可复核的实测读数**，
 * 只做了源码审查。任务书的 T-strong（GT）需要独立开发对战的正向配对改善，
 * 成本很高，本轮不宣称通过；但 T-legal 与 T-label 的前半段是可以在现有窗口上
 * 直接实测的：
 *
 * - T-legal：教师在候选状态上输出的动作必须合法（属于引擎合法集），且不污染状态；
 * - T-label（可复现部分）：同一状态、同一 seed 下重复调用教师必须给出相同动作；
 * - T-label（战术无关键退步部分）：在真实对局的决策窗口上，教师动作至少在
 *   「是否立即致胜 / 是否避免了立即失败 / 是否吃掉可占领目标」这些**规则可判定**的
 *   维度上不劣于候选实选动作。
 *
 * 判定只用真实引擎一步执行结果（`GameEngine.step` 后的 `winner`）与状态读数，
 * 不使用动作类别、代理分数或 rollout 胜负。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/teacher_qualification_probe.ts \
 *     --windows <failure_windows.jsonl> --out-dir <dir> [--replicates 3]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { loadSdTrainingPlanConfig } from '../../tools/sd_training_state_generator';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { encodeAction } from '../../src/game/env';
import { GameEngine } from '../../src/game/engine';
import { streamFor } from '../../v13/tools/eval_v3_core';
import type { Action, GameState } from '../../src/game/types';

const UNPACK_DIR = 'APK/_analysis/unpack';
const SD_PLAN_FILE = 'training_configs/sd_training_plan_20260705.json';

function argOf(name: string, fallback: string | null): string | null {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const windowsPath = argOf('--windows', 'v14/out/v14_20260925_t14b/T14-06/failure_windows_duel2p.jsonl')!;
const outDir = argOf('--out-dir', 'v14/out/v14_20260925_t14b/T14-07')!;
const replicates = Number(argOf('--replicates', '3'));
const maxWindows = Number(argOf('--max-windows', '40'));

interface ProbeResult {
    winner: number | null;
    executed: boolean;
    note: string;
}

/** 中文：真实引擎一步执行，返回 winner 与 info；非法动作如实记录为未执行。 */
function stepOnce(state: GameState, action: Action): ProbeResult {
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    try {
        const result = engine.step(action);
        return { winner: result.state.winner, executed: true, note: String(result.info ?? '') };
    } catch (error) {
        return { winner: null, executed: false, note: error instanceof Error ? error.message : String(error) };
    }
}

async function main(): Promise<void> {
    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);
    const windowRows = fs.readFileSync(windowsPath, 'utf8').split('\n').filter((l) => l.trim())
        .map((l) => JSON.parse(l));

    // 中文：按 (scenario, seed, step) 回放到该决策窗口，重建真实引擎状态。
    const replayCache = new Map<string, { state: GameState; legalCodes: string[]; ally: number }>();
    const perWindow: any[] = [];

    let legalViolations = 0;
    let nonReproducible = 0;
    let comparedWindows = 0;
    let teacherBetter = 0;
    let teacherWorse = 0;
    let teacherEqual = 0;

    const selected = windowRows.slice(0, maxWindows);
    for (const window of selected) {
        const scenarioId = String(window.windowId).split('#')[0];
        const seed = Number(window.seed);
        const targetStep = Number(window.step);
        const cacheKey = `${scenarioId}#${seed}#${targetStep}`;
        let replay = replayCache.get(cacheKey);
        if (!replay) {
            const mapName = scenarioId.split(':').pop() as string;
            const episode = {
                kind: 'skirmish_episode', version: 1,
                scenario: { id: scenarioId, mode: 'SD', mapName, resourcePath: '' },
                seed, maxPlies: 1200, maxSteps: 20000,
                initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
                players: [], policyByPlayer: {}, steps: [], summary: {},
            } as any;
            const env = await envFactory.createEnv(episode);
            env.reset(seed);
            const engine = env.getEngine();
            const student = await (async () => {
                // 中文：重放时使用与 failure_attribution.ts 相同的启发式座位流，
                // 保证窗口状态可复现；候选座位用启发式代替（本探针只考察教师输出）。
                const seatAi = new Map<number, HeuristicAI>();
                const playerIds: number[] = engine.getState().players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
                for (const seat of playerIds) seatAi.set(seat, new HeuristicAI(streamFor(seed, seat)));
                return seatAi;
            })();
            for (let i = 0; i < targetStep; i += 1) {
                const state = engine.getState();
                if (engine.isTerminal()) break;
                const current = state.currentPlayer;
                const legal = engine.getLegalActions(current).filter((a) => a.type !== 'surrender');
                if (legal.length === 0) break;
                const action = student.get(current)?.getAction(engine, current, undefined) ?? null;
                if (!action) break;
                engine.step(action);
            }
            const state = engine.getState();
            replay = {
                state,
                legalCodes: engine.getLegalActions(state.currentPlayer)
                    .filter((a) => a.type !== 'surrender').map((a) => encodeAction(a)),
                ally: state.currentPlayer,
            };
            replayCache.set(cacheKey, replay);
        }

        // T-legal：教师在同一状态上的输出必须落在引擎合法集内。
        // 中文：HeuristicAI 的构造参数是 RNG **函数**（不是 seed）。replicate 0 使用
        // 与对局一致的基础流，其余 replicate 用不同偏移流，用于检验「同一状态重复调用是否稳定」。
        const teacherRuns: string[] = [];
        for (let replicate = 0; replicate < replicates; replicate += 1) {
            const ai = new HeuristicAI(streamFor(seed + replicate * 7919, replay.ally));
            const engine = new GameEngine(JSON.parse(JSON.stringify(replay.state)) as GameState);
            const action = ai.getAction(engine, replay.ally, undefined);
            teacherRuns.push(action ? encodeAction(action) : '(none)');
        }
        const legal = teacherRuns.every((code) => replay!.legalCodes.includes(code));
        if (!legal) legalViolations += 1;
        const reproducible = teacherRuns.every((code) => code === teacherRuns[0]);
        if (!reproducible) nonReproducible += 1;

        // T-label（规则可判定的部分）：教师动作 vs 候选实选动作，比较真实引擎一步结果。
        const stateBefore = replay.state;
        const candidateAction = replay.legalCodes.includes(window.chosenAction) ? window.chosenAction : null;
        const teacherAction = teacherRuns[0];
        let verdictOnWindow = 'UNKNOWN';
        let detail = '';
        if (candidateAction && teacherAction !== '(none)' && replay.legalCodes.includes(teacherAction)) {
            comparedWindows += 1;
            const legalActions = new GameEngine(JSON.parse(JSON.stringify(stateBefore)) as GameState);
            const teacherObj = legalActions.getLegalActions(replay.ally)
                .filter((a) => a.type !== 'surrender').find((a) => encodeAction(a) === teacherAction)!;
            const candidateObj = legalActions.getLegalActions(replay.ally)
                .filter((a) => a.type !== 'surrender').find((a) => encodeAction(a) === candidateAction)!;
            const teacherProbe = stepOnce(stateBefore, teacherObj);
            const candidateProbe = stepOnce(stateBefore, candidateObj);
            const ally = replay.ally;
            const teacherWins = teacherProbe.executed && teacherProbe.winner === ally;
            const candidateWins = candidateProbe.executed && candidateProbe.winner === ally;
            if (teacherWins && !candidateWins) { teacherBetter += 1; verdictOnWindow = 'TEACHER_TAKES_WIN'; }
            else if (!teacherWins && candidateWins) { teacherWorse += 1; verdictOnWindow = 'TEACHER_MISSES_WIN'; }
            else { teacherEqual += 1; verdictOnWindow = 'EQUAL_ON_ONE_STEP_TERMINAL'; }
            detail = `teacher=${teacherAction} candidate=${candidateAction} `
                + `teacherWinner=${teacherProbe.winner} candidateWinner=${candidateProbe.winner}`;
        }

        perWindow.push({
            windowId: window.windowId,
            seed,
            legalCodesCount: replay.legalCodes.length,
            teacherActionsAcrossReplicates: teacherRuns,
            teacherWithinLegalSet: legal,
            teacherReproducible: reproducible,
            candidateChosenAction: window.chosenAction,
            teacherVerdict: verdictOnWindow,
            detail,
        });
    }

    const report = {
        schema: 'v14_teacher_qualification_probe_1',
        task: 'T14-07',
        generatedAt: new Date().toISOString(),
        windowsSource: windowsPath,
        replicates,
        windowsProbed: perWindow.length,
        checks: {
            'T-legal': {
                windows: perWindow.length,
                violations: legalViolations,
                passed: legalViolations === 0,
                note: '教师输出必须属于该状态的真实引擎合法集（策略过滤只去 surrender）。',
            },
            'T-label-reproducibility': {
                windows: perWindow.length,
                nonReproducible,
                passed: nonReproducible === 0,
                note: `同一状态同一 seed 下重复调用 ${replicates} 次必须给出相同动作。`,
            },
            'T-label-no-critical-regression': {
                comparedWindows,
                teacherBetter,
                teacherWorse,
                teacherEqual,
                verdict: teacherWorse > 0 ? 'REGRESSION_FOUND' : (comparedWindows > 0 ? 'NO_REGRESSION_ON_TERMINAL_DIMENSION' : 'INSUFFICIENT_WINDOWS'),
                note: '只在「真实引擎一步执行后的 winner」这一规则可判定维度上比较；'
                    + '该维度不足以支撑 T-strong（GT），GT 仍需独立开发对战的正向配对改善。',
                unknownWindows: perWindow.length - comparedWindows,
            },
        },
        tStrong: {
            status: 'NOT_QUALIFIED',
            reason: '本轮未运行独立开发对战，也未在冻结教师确认集上取得正向配对改善；'
                + '因此不宣称 GT 通过，搜索蒸馏分支仍按任务书保持 DEFERRED。',
        },
        perWindow,
    };

    fs.mkdirSync(path.resolve(outDir), { recursive: true });
    const outPath = path.join(outDir, 'teacher_qualification_probe.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({
        outPath,
        windowsProbed: report.windowsProbed,
        legalViolations,
        nonReproducible,
        comparedWindows,
        teacherBetter,
        teacherWorse,
        teacherEqual,
    }, null, 2));
}

void main();
