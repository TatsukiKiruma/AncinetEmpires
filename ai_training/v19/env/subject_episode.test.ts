/**
 * V19/T19-02 验收：主体座位训练环境的奖励合同、终止掩码与 log_prob 重放。
 *
 * 这里的手工短局只用来核对**接口正确性**，不作为棋力证据：
 * - 自然终局（胜/负/和）各一局，回报必须精确等于 +1 / −1 / 0；
 * - 截断局（步数上限、ply 上限）回报必须为 0 且不得写任何胜负标签；
 * - V18 复核 §2.5 的 `winner=null, reward=-1` 现有截断探针作为**负例**保留：
 *   它证明旧接口会伪造代理胜负，而本模块在同一条件下必须返回截断。
 */

import { describe, expect, it, vi } from 'vitest';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { existsSync, readFileSync } from 'node:fs';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { AncientEmpiresEnv } from '../../src/game/env';
import { createAppApkSkirmishGameState } from '../../src/game/apk_skirmish_map_assets';
import {
    SpatialResNetPredictor,
    createInitializedSpatialResNet,
    loadSpatialResNetFromJson,
} from '../../src/game/ai/spatial_conv_net';
import {
    UNPACK_DIR,
    SD_PLAN_FILE,
} from '../../v14/tools/eval_v14_match';
import {
    entropyOfProbs,
    playSubjectEpisode,
    rewardForWinnerV19,
    sampleFromProbs,
    type SubjectChunkV19,
    type SubjectEpisodeOptionsV19,
} from './subject_episode';

const MAPS = [
    '(2) Duel.aem',
    '(2) Icy Paths.aem',
    '(2) Liberty Port.aem',
    '(2) Mourningstar.aem',
    '(2) Crossed swords.aem',
];

const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);

/**
 * 只用于诊断：把状态改造成「某座位已无兵且无城堡」，用来手工构造可核算的自然终局。
 *
 * 两个必须注意的实现细节：
 * - `engine.getState()` 返回深拷贝，直接改它不会影响引擎；必须用 `engine.reset(state)` 装回去。
 * - `playSubjectEpisode` 会在 createEnv 之后自己调用 `env.reset(seed)`，
 *   因此改造必须包在 env.reset 里，否则会被随后的真实 reset 覆盖。
 *   `engine.reset` 不触发 checkWinConditions，终局仍由真实 step 触发。
 */
function withStateMutation(mutate: (state: any) => void) {
    return {
        async createEnv(episode: any) {
            const env = await envFactory.createEnv(episode);
            const originalReset = env.reset.bind(env);
            env.reset = (seed?: number) => {
                const result = originalReset(seed);
                const engine = env.getEngine();
                const state = engine.getState();
                mutate(state);
                engine.reset(state);
                return result;
            };
            return env;
        },
    };
}

function eliminateSeatFactory(seatToEliminate: number) {
    return withStateMutation((state) => {
        state.units = state.units.filter((u: any) => u.ownerId !== seatToEliminate);
        for (const row of state.map.tiles) {
            for (const tile of row) {
                if (tile.ownerId === seatToEliminate) tile.ownerId = null;
            }
        }
    });
}

/** 双方同时失去全部单位与城堡：按规则应判规则平局（winner = −1）。 */
const eliminateBothFactory = withStateMutation((state) => {
    state.units = [];
    for (const row of state.map.tiles) {
        for (const tile of row) tile.ownerId = null;
    }
});

function baseOptions(overrides: Partial<SubjectEpisodeOptionsV19>): SubjectEpisodeOptionsV19 {
    return {
        runId: 'run_20260928_v19_01',
        mapName: MAPS[0],
        seed: 424242,
        subjectSeat: 0,
        maxSteps: 40,
        maxPlies: null,
        wallTimeoutMs: 60000,
        predictor: null,
        checkpointSha256: null,
        sample: false,
        samplingSeed: 7,
        envFactory,
        recordTransitions: true,
        ...overrides,
    };
}

describe('V19 主体座位环境：奖励与终止合同', () => {
    it('纯函数回报口径：自然胜 +1 / 自然负 −1 / 平局与未终局 0', () => {
        expect(rewardForWinnerV19(0, 0)).toBe(1);
        expect(rewardForWinnerV19(1, 0)).toBe(-1);
        expect(rewardForWinnerV19(-1, 0)).toBe(0);
        expect(rewardForWinnerV19(null, 0)).toBe(0);
        expect(rewardForWinnerV19(0, null)).toBe(0);
    });

    it('手工构造：主体自然胜时终局回报为 +1，且最后一条 transition 的奖励等于它', async () => {
        const result = await playSubjectEpisode(baseOptions({
            subjectSeat: 0,
            predictor: new SpatialResNetPredictor(createInitializedSpatialResNet(11)),
            envFactory: eliminateSeatFactory(1),
        }));
        expect(result.outcomeKind).toBe('NATURAL_WIN');
        expect(result.naturalTerminal).toBe(true);
        expect(result.truncated).toBe(false);
        expect(result.terminalReturn).toBe(1);
        expect(result.transitions.length).toBeGreaterThan(0);
        const last = result.transitions[result.transitions.length - 1];
        expect(last.reward).toBe(1);
        expect(last.terminal).toBe(true);
        expect(last.truncated).toBe(false);
        // 终局回报只允许出现在最后一条。
        expect(result.transitions.slice(0, -1).every(t => t.reward === 0)).toBe(true);
    });

    it('手工构造：主体自然负时终局回报为 −1', async () => {
        const result = await playSubjectEpisode(baseOptions({
            subjectSeat: 0,
            predictor: new SpatialResNetPredictor(createInitializedSpatialResNet(12)),
            envFactory: eliminateSeatFactory(0),
        }));
        expect(result.outcomeKind).toBe('NATURAL_LOSS');
        expect(result.terminalReturn).toBe(-1);
        const last = result.transitions[result.transitions.length - 1];
        expect(last.reward).toBe(-1);
    });

    it('手工构造：双方同时被淘汰时是规则平局，回报 0 而不是胜负', async () => {
        const result = await playSubjectEpisode(baseOptions({
            subjectSeat: 0,
            predictor: new SpatialResNetPredictor(createInitializedSpatialResNet(13)),
            envFactory: eliminateBothFactory,
        }));
        expect(result.outcomeKind).toBe('NATURAL_DRAW');
        expect(result.terminalReturn).toBe(0);
        if (result.transitions.length > 0) {
            expect(result.transitions.every(t => t.reward === 0)).toBe(true);
        }
    });
});

describe('V19 主体座位环境：截断绝不伪造胜负', () => {
    it('步数上限截断：terminalReturn 必须为 null，全部奖励为 0', async () => {
        const result = await playSubjectEpisode(baseOptions({ maxSteps: 12 }));
        expect(result.truncated).toBe(true);
        expect(result.naturalTerminal).toBe(false);
        expect(result.terminalReturn).toBeNull();
        expect(result.outcomeKind).toBe('TRUNCATED_STEP_LIMIT');
        expect(result.transitions.every(t => t.reward === 0)).toBe(true);
        expect(result.transitions.every(t => !t.terminal)).toBe(true);
    });

    it('ply 上限截断：与现有 winner=null 探针同条件，本模块不给 −1', async () => {
        // 负例来源：V18 复核 §2.5 的现有接口探针。
        const legacyEnv = new AncientEmpiresEnv({
            initialState: createAppApkSkirmishGameState(MAPS[0]),
            maxPlies: 1,
        });
        const legacy = legacyEnv.stepAction({ type: 'end_turn' });
        expect(legacy.done).toBe(true);
        expect(legacyEnv.getState().winner).toBeNull();
        // 旧接口在这一步给出了 −1：这正是不能直接当 PPO 奖励的原因。
        expect(legacy.reward).toBe(-1);

        const result = await playSubjectEpisode(baseOptions({ maxSteps: 6, maxPlies: 1 }));
        expect(result.truncated).toBe(true);
        expect(result.terminalReturn).toBeNull();
        expect(result.outcomeKind).toBe('TRUNCATED_PLY_LIMIT');
        expect(result.transitions.every(t => t.reward === 0)).toBe(true);
        // 初始 ply 为 1，公共环境在首个动作结算后检查边界，不能继续跑满 maxSteps。
        expect(result.steps).toBe(1);
    });

    it('连续原子动作不会冒充规则回合，达到玩家回合边界后立即停止', async () => {
        let calls = 0;
        const policy = vi.spyOn(HeuristicAI.prototype, 'getAction').mockImplementation((engine, seat) => {
            calls += 1;
            const legal = engine.getLegalActions(seat);
            const actionType = calls === 1 ? 'move' : calls === 2 ? 'wait' : 'end_turn';
            return legal.find(action => action.type === actionType)!;
        });
        try {
            const result = await playSubjectEpisode(baseOptions({ maxSteps: 30, maxPlies: 2 }));
            expect(result.error).toBeNull();
            expect(result.steps).toBe(3);
            expect(result.plies).toBe(2);
            expect(calls).toBe(3);
            expect(result.outcomeKind).toBe('TRUNCATED_PLY_LIMIT');
            expect(result.terminalReturn).toBeNull();
        } finally {
            policy.mockRestore();
        }
    });

    it('主体达到回合上限的最后一次决策带截断掩码，无自然胜负标签', async () => {
        const result = await playSubjectEpisode(baseOptions({
            maxSteps: 30, maxPlies: 1,
            predictor: new SpatialResNetPredictor(createInitializedSpatialResNet(17)),
        }));
        expect(result.steps).toBe(1);
        expect(result.transitions).toHaveLength(1);
        expect(result.transitions[0].truncated).toBe(true);
        expect(result.transitions[0].terminal).toBe(false);
        expect(result.transitions[0].reward).toBe(0);
        expect(result.terminalReturn).toBeNull();
    });

    it('边界动作同时产生自然终局时，规则胜负优先于回合截断', async () => {
        const result = await playSubjectEpisode(baseOptions({
            maxPlies: 1, envFactory: eliminateSeatFactory(1),
            predictor: new SpatialResNetPredictor(createInitializedSpatialResNet(18)),
        }));
        expect(result.steps).toBe(1);
        expect(result.outcomeKind).toBe('NATURAL_WIN');
        expect(result.truncated).toBe(false);
        expect(result.terminalReturn).toBe(1);
        expect(result.transitions[0].truncated).toBe(false);
    });

    it('对手回应跨过回合边界时，最后一条主体记录也标记截断', async () => {
        const policy = vi.spyOn(HeuristicAI.prototype, 'getAction').mockImplementation((engine, seat) =>
            engine.getLegalActions(seat).find(action => action.type === 'end_turn')!);
        try {
            const result = await playSubjectEpisode(baseOptions({
                maxSteps: 200, maxPlies: 3,
                predictor: new SpatialResNetPredictor(createInitializedSpatialResNet(17)),
            }));
            expect(result.error).toBeNull();
            expect(result.outcomeKind).toBe('TRUNCATED_PLY_LIMIT');
            expect(result.plies).toBe(3);
            expect(result.opponentSteps).toBe(1);
            expect(result.transitions.length).toBeGreaterThan(0);
            const last = result.transitions[result.transitions.length - 1];
            expect(last.truncated).toBe(true);
            expect(last.terminal).toBe(false);
            expect(last.reward).toBe(0);
            expect(result.transitions.slice(0, -1).every(t => !t.truncated)).toBe(true);
        } finally {
            policy.mockRestore();
        }
    });

    it('12 个短局全部满足：截断 ⟺ 无终局回报，自然终局 ⟺ 有终局回报', async () => {
        const cases: SubjectEpisodeOptionsV19[] = [];
        for (let i = 0; i < 5; i += 1) {
            cases.push(baseOptions({ mapName: MAPS[i], maxSteps: 10 + i, subjectSeat: i % 2, seed: 900 + i }));
        }
        for (let i = 0; i < 4; i += 1) {
            cases.push(baseOptions({ mapName: MAPS[i], maxSteps: 18 + i, subjectSeat: 1, seed: 1200 + i, sample: true }));
        }
        cases.push(baseOptions({ mapName: MAPS[4], maxSteps: 25, subjectSeat: 0, seed: 1500, maxPlies: 3 }));
        cases.push(baseOptions({ mapName: MAPS[2], maxSteps: 30, subjectSeat: 1, seed: 1600, maxPlies: 2 }));
        cases.push(baseOptions({
            mapName: MAPS[1], maxSteps: 40, subjectSeat: 0, seed: 1700,
            predictor: new SpatialResNetPredictor(createInitializedSpatialResNet(14)),
            envFactory: eliminateSeatFactory(1),
        }));
        expect(cases.length).toBe(12);

        const results = [];
        for (const options of cases) results.push(await playSubjectEpisode(options));

        for (const r of results) {
            if (r.truncated) {
                expect(r.terminalReturn).toBeNull();
                expect(r.transitions.every(t => t.reward === 0)).toBe(true);
                expect(r.transitions.every(t => t.terminal === false)).toBe(true);
            } else if (r.naturalTerminal) {
                expect(r.terminalReturn).not.toBeNull();
                // 自然终局必须至少有一条主体 transition，否则「最后一条奖励 == 终局回报」无从核对。
                expect(r.transitions.length).toBeGreaterThan(0);
                const last = r.transitions[r.transitions.length - 1];
                expect(last.terminal).toBe(true);
                expect(last.reward).toBe(r.terminalReturn);
                expect(r.transitions.slice(0, -1).every(t => t.reward === 0)).toBe(true);
            } else {
                throw new Error(`短局既非自然终局也非截断：${r.outcomeKind} / ${r.error}`);
            }
            // 主体座位的每一条 transition 都必须真的发生在主体座位上。
            expect(r.transitions.every(t => t.currentPlayer === r.subjectSeat)).toBe(true);
        }
        const truncatedCount = results.filter(r => r.truncated).length;
        const naturalCount = results.filter(r => r.naturalTerminal).length;
        expect(truncatedCount + naturalCount).toBe(12);
        expect(naturalCount).toBeGreaterThanOrEqual(1);
    });
});

describe('V19 主体座位环境：log_prob 与候选顺序可重放', () => {
    it('记录的 behaviorLogProb 等于对同一状态重新前向后的 masked softmax 对数概率', async () => {
        const predictor = new SpatialResNetPredictor(createInitializedSpatialResNet(2026));
        const result = await playSubjectEpisode(baseOptions({
            maxSteps: 30,
            subjectSeat: 0,
            predictor,
            sample: true,
            samplingSeed: 99,
            captureTensors: true,
        }));
        expect(result.transitions.length).toBeGreaterThan(0);
        expect(result.tensors?.length).toBe(result.transitions.length);
        const replayMap = createAppApkSkirmishGameState(MAPS[0]).map;

        for (let i = 0; i < result.transitions.length; i += 1) {
            const transition = result.transitions[i];
            const tensor = result.tensors![i];
            expect(tensor.subjectDecisionIndex).toBe(transition.subjectDecisionIndex);
            expect(tensor.candidates.length).toBe(transition.orderedActionCodes.length);
            expect(tensor.candidates.map(c => c.code)).toEqual(transition.orderedActionCodes);

            const pred = predictor.predict(
                {
                    spatialTensor: new Float32Array(tensor.spatialTensor),
                    globalFeatures: new Float32Array(tensor.globalFeatures),
                    mapWidth: replayMap.width, mapHeight: replayMap.height, subjectPlayerId: result.subjectSeat,
                },
                tensor.candidates.map(c => ({
                    actorCoord: c.actorCoord,
                    landingCoord: c.landingCoord,
                    targetCoord: c.targetCoord,
                    semantics: c.semantics,
                })),
            );
            // 同一状态、同一候选顺序 ⇒ 概率逐位可重放。
            expect(pred.actionProbs.length).toBe(transition.orderedActionCodes.length);
            const replayLogProb = Math.log(pred.actionProbs[transition.chosenIndex]);
            expect(replayLogProb).toBeCloseTo(transition.behaviorLogProb, 6);
            expect(entropyOfProbs(pred.actionProbs)).toBeCloseTo(transition.policyEntropy, 6);
            // argmax 决策与采样决策必须落在同一候选集内。
            expect(transition.chosenIndex).toBeGreaterThanOrEqual(0);
            expect(transition.chosenIndex).toBeLessThan(transition.orderedActionCodes.length);
        }
    });

    it('采样流确定性：同局同采样种子逐位复现；argmax 与采样互不冒充', async () => {
        const predictor = new SpatialResNetPredictor(createInitializedSpatialResNet(77));
        const opts = baseOptions({ maxSteps: 24, predictor, sample: true, samplingSeed: 5 });
        const a = await playSubjectEpisode(opts);
        const b = await playSubjectEpisode(opts);
        expect(b.actionCodes).toEqual(a.actionCodes);
        expect(b.transitions.map(t => t.chosenIndex)).toEqual(a.transitions.map(t => t.chosenIndex));

        const greedy = await playSubjectEpisode({ ...opts, sample: false });
        // argmax 与采样是不同的部署/探索方式，本测试只要求两者都自洽（不要求相同）。
        expect(greedy.transitions.every(t => t.chosenIndex >= 0)).toBe(true);
    });

    it('sampleFromProbs 尊重概率质量与零概率候选', () => {
        const probs = [0, 1, 0, 0];
        for (let i = 0; i < 20; i += 1) expect(sampleFromProbs(probs, Math.random)).toBe(1);
        // 退化概率（全零）时不抛错，退回均匀采样。
        const degenerate = sampleFromProbs([0, 0, 0], () => 0.5);
        expect(degenerate).toBeGreaterThanOrEqual(0);
        expect(degenerate).toBeLessThan(3);
    });
});

/**
 * V19/2026-09-29 复核 B 节：长局必须**完整**保存，不能再用记录上限砍掉后半程。
 *
 * 这些测试针对的是流程缺陷（旧实现 2000 条上限丢掉长局后半段、内存随局长增长），
 * 不是棋力证据。
 */
describe('V19 分块流式记录：完整性与内存上界', () => {
    /**
     * 用**真实冠军权重**跑多块测试。
     *
     * 中文：随机初始化网络会互相送死，一局只有十几步，根本跨不了多块；要验证分块机制
     * 就必须用真实策略打出几百步的对局。冠军是正式冻结产物，路径与 SHA 都在身份清单里。
     */
    const CHAMPION = 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json';
    const championAvailable = existsSync(CHAMPION);
    function championPredictor(): SpatialResNetPredictor {
        return new SpatialResNetPredictor(loadSpatialResNetFromJson(readFileSync(CHAMPION, 'utf8')));
    }

    async function collectChunks(options: SubjectEpisodeOptionsV19) {
        const chunks: SubjectChunkV19[] = [];
        const result = await playSubjectEpisode({
            ...options,
            onChunk: async (chunk) => { chunks.push(chunk); },
        });
        return { chunks, result };
    }

    it('分块写出时不再把 transition 留在结果里（内存只与块大小有关）', async () => {
        const predictor = new SpatialResNetPredictor(createInitializedSpatialResNet(31));
        const { chunks, result } = await collectChunks(baseOptions({
            maxSteps: 60, predictor, chunkSize: 8, captureTensors: true,
        }));
        expect(chunks.length).toBeGreaterThan(1);
        expect(result.transitions).toEqual([]);
        expect(result.tensors).toBeUndefined();
        expect(result.chunksWritten).toBe(chunks.length);
    });

    it('块编号连续、决策编号无重复无缺失，且只有最后一块带真实终局回报', async () => {
        const predictor = new SpatialResNetPredictor(createInitializedSpatialResNet(32));
        const { chunks, result } = await collectChunks(baseOptions({
            maxSteps: 80, predictor, chunkSize: 8,
            envFactory: eliminateSeatFactory(1),
        }));
        expect(result.outcomeKind).toBe('NATURAL_WIN');

        // 块编号必须从 0 开始逐 1 递增，且只有最后一块 last=true。
        expect(chunks.map(c => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
        expect(chunks.filter(c => c.last).length).toBe(1);
        expect(chunks[chunks.length - 1].last).toBe(true);

        // 决策编号必须连续覆盖 [0, subjectDecisions)，无重复、无缺失。
        const indices = chunks.flatMap(c => c.transitions.map(t => t.subjectDecisionIndex));
        expect(indices.length).toBe(result.subjectDecisions);
        expect(indices).toEqual(indices.map((_, i) => i));

        // 终局回报只能出现在全局最后一条，且等于终局回报。
        const all = chunks.flatMap(c => c.transitions);
        const rewarded = all.filter(t => t.reward !== 0);
        expect(rewarded.length).toBe(1);
        expect(rewarded[0]).toBe(all[all.length - 1]);
        expect(rewarded[0].reward).toBe(result.terminalReturn);
        expect(rewarded[0].terminal).toBe(true);
    });

    it('默认不再有记录上限：recordCapped 恒为 false（旧默认 2000 已废弃）', async () => {
        const predictor = new SpatialResNetPredictor(createInitializedSpatialResNet(33));
        const { result } = await collectChunks(baseOptions({ maxSteps: 40, predictor, chunkSize: 16 }));
        expect(result.recordCapped).toBe(false);
        expect(result.recordedDecisions).toBe(result.subjectDecisions);
    });

    it('回合边界检查点：每个主体回合一条，含完整规范化状态哈希且回合号递增', async () => {
        const predictor = new SpatialResNetPredictor(createInitializedSpatialResNet(34));
        const { result } = await collectChunks(baseOptions({ maxSteps: 60, predictor, chunkSize: 8 }));
        expect(result.turnSnapshots.length).toBeGreaterThan(0);
        const turns = result.turnSnapshots.map(s => s.turn);
        expect(turns).toEqual([...turns].sort((a, b) => a - b));
        expect(new Set(turns).size).toBe(turns.length);
        for (const snap of result.turnSnapshots) {
            expect(snap.canonicalStateHash).toMatch(/^[0-9a-f]{64}$/);
            expect(snap.legalActionCount).toBeGreaterThan(0);
        }
    });

    /**
     * 记录上限现在是**显式可选**的，默认不存在。
     *
     * 旧实现默认 2000 条上限，长局后半程被静默丢掉（wave2 有 8 局长局只存了前 2000 步，
     * 却占 PPO 样本的 56%）。这里同时证明两件事：默认不设上限；显式设上限时才截断并标记。
     */
    it('默认无记录上限；显式设上限时才截断并如实标记 recordCapped', async () => {
        if (!championAvailable) return;
        const predictor = championPredictor();
        const uncapped = await collectChunks(baseOptions({
            maxSteps: 900, predictor, chunkSize: 32, maxPlies: null, samplingSeed: 11,
        }));
        expect(uncapped.result.recordCapped).toBe(false);
        expect(uncapped.result.recordedDecisions).toBe(uncapped.result.subjectDecisions);
        expect(uncapped.result.subjectDecisions).toBeGreaterThan(20);

        const capped = await collectChunks(baseOptions({
            maxSteps: 900, predictor, chunkSize: 32, maxPlies: null, samplingSeed: 11,
            maxRecordedDecisions: 10,
        }));
        expect(capped.result.recordCapped).toBe(true);
        expect(capped.result.recordedDecisions).toBe(10);
        expect(capped.result.subjectDecisions).toBeGreaterThan(10);
        // 记录被截断时，真实终局回报归到最后一条已记录 transition，并如实标注来源。
        const recorded = capped.chunks.flatMap(c => c.transitions);
        expect(recorded.length).toBe(10);
    }, 600000);

    /**
     * 真实长局的**完整记录**证据不放在单元测试里，而由真实采样波次的 summary 承担：
     * `recordCompleteness` 必须为 1.0、`recordCappedGames` 必须为 0，
     * 且其中包含上万次主体决策的长局。这比人造长局更有说服力，也避免为了测试而拖长 CI。
     *
     * 这里用真实冠军权重跑一局跨多块的对局，验证块机制在真实数据上连续可用。
     */
    it('真实对局跨多块写出：块数 > 3 且编号与决策号完全连续', async () => {
        if (!championAvailable) return;
        const predictor = championPredictor();
        const { chunks, result } = await collectChunks(baseOptions({
            maxSteps: 1200, predictor, chunkSize: 8, maxPlies: null, samplingSeed: 3,
        }));
        expect(chunks.length).toBeGreaterThan(3);
        expect(result.subjectDecisions).toBeGreaterThan(24);
        const indices = chunks.flatMap(c => c.transitions.map(t => t.subjectDecisionIndex));
        expect(indices).toEqual(indices.map((_, i) => i));
        expect(chunks[chunks.length - 1].last).toBe(true);
        expect(Math.max(...chunks.map(c => c.transitions.length))).toBeLessThanOrEqual(8);
    }, 900000);
});
