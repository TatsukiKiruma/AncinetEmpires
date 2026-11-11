import { compactKey, localEvaluation } from './search_support';
import { filterRolloutActions, anchoredCandidates, rootLogPriors, rolloutPriorScale, safeBaselineReplacement } from '../../../src/ai_runtime/dual_v3/anchored_policy';
import type { GameEngine } from '../../../src/game/engine';
import type { Action, GameState } from '../../../src/game/types';
import { areAlliedPlayers } from '../../../src/game/rule_config';
import { encodeAction } from '../../../src/game/env';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import type { DualObservation } from '../../../src/ai_runtime/dual_v2/contract';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { actionActor } from '../../../src/ai_runtime/dual_v2/tactical_prior';
import { calibrateValue, valueCalibrationFeatures } from '../../../src/ai_runtime/dual_v2/value_calibration';
import { diverseCandidates, coverageRotation, tacticalPriorBundle, PRIOR_VERSION, type RankedAction } from '../../../src/ai_runtime/dual_v3/search_policy';
import { searchTerminal, computeScalarValue, survivalStatus, applySurvivalVeto } from '../../../src/ai_runtime/dual_v3/search_value';
import { searchTeacher } from '../../../src/ai_runtime/dual_v3/search_teacher';
import { responseActionIndices } from '../../../src/ai_runtime/dual_v3/response_proposals';
import { crossedSelfTurn } from '../../../src/ai_runtime/dual_v3/response_horizon';
import { withinSearchBudget, isSearchBudgetExpired } from '../../../src/ai_runtime/dual_v3/search_budget';
import type { BatchedModelOutput } from '../../../src/ai_runtime/dual_v3/batched_search_types';
import { freshBatchTelemetry, type BatchedBeamOptions, type BatchedSearchModel, type SearchStep, type FinalistRecord } from '../../../src/ai_runtime/dual_v3/batched_search_types';
export type { BatchedBeamOptions, BatchedSearchModel } from '../../../src/ai_runtime/dual_v3/batched_search_types';

interface Evaluation { ranked: RankedAction[]; value: number }
interface Branch { engine: GameEngine; steps: SearchStep[]; ends: number[]; score: number; value: number; prior: number }
interface ChainTask { branch: Branch; first: RankedAction; player: number }
interface ChainState { branch: Branch; task: ChainTask; actor?: string; turn: number }
interface Response { branch: Branch; initial: GameState; ownTurn: number; previous: Pick<GameState, 'currentPlayer' | 'turn'>; returned: boolean; variant: number; complete: boolean; done: boolean; enemyUnits: number; ownChains?: number; player: number; turn: number; visited: Set<number>; reason?: string }
type Wave = 'root' | 'A' | 'B' | 'C';
const planId = (b: Branch) => b.steps.map(q => encodeAction(q.action)).join(';');

/** CPU执行权威规则，GPU按展开、估值、敌方自利响应三个波次合批；仅兑现首单位完整链。 */
export class BatchedNeuralBeamSearchAI {
    telemetry = freshBatchTelemetry();
    private queue: SearchStep[] = [];
    private cache = new Map<string, Evaluation>();
    // 搜索分支仅在克隆后执行动作；本轮评估过的引擎此后不会原位变化。
    private snapshots = new WeakMap<GameEngine, { state: GameState; key: string }>();
    private self = 0;
    private deadline = 0;
    private activeEnd = 0;
    private response = false;
    private encodingCost = 2;
    private networkCost = 15;
    private priorCost = 5;
    private readonly options: BatchedBeamOptions;
    constructor(private readonly model: BatchedSearchModel, options: BatchedBeamOptions) {
        if (!options.modelVersion) throw Error('搜索缓存必须绑定模型身份');
        if (!Number.isFinite(options.priorScale ?? 1) || (options.priorScale ?? 1) < 0) throw Error('先验尺度无效');
        if (!Number.isFinite(options.antiLeaderBeta ?? .25) || (options.antiLeaderBeta ?? .25) < 0 || (options.antiLeaderBeta ?? .25) > 1) throw Error('反榜首系数必须在零至一内');
        if (options.valueMode && !['maxn_ffa', 'zero_sum_margin'].includes(options.valueMode)) throw Error('价值模式无效');
        for (const key of ['maxNodes', 'rootCandidates', 'innerCandidates', 'beamWidth', 'maxUnits', 'finalists', 'responseUnits', 'responseVariants', 'twoPlayerResponseVariants', 'maxBatchSize', 'responseActors', 'responseCohortSize', 'responseLightUnitThreshold'] as const) {
            const v = options[key]; if (v !== undefined && (!Number.isInteger(v) || v < 1)) throw Error('搜索规模必须为正整数');
        }
        if ((options.maxBatchSize ?? 128) > 128) throw Error('单次波次上限为128');
        if (!Number.isFinite(options.ownFraction ?? .5) || (options.ownFraction ?? .5) < .1 || (options.ownFraction ?? .5) > .8) throw Error('己方展开预算比例无效');
        if (!Number.isFinite(options.teacherTemperature ?? .15) || (options.teacherTemperature ?? .15) <= 0) throw Error('教师温度必须为正数');
        if (options.headBias?.some(v => !Number.isFinite(v))) throw Error('动作语义偏置必须有限');
        if (options.leafMode && options.leafMode !== 'post_response') throw Error('批量搜索仅接受反扑后价值契约');
        for (const key of ['ownRolloutPriorScale', 'enemyPriorScale', 'priorAnchor', 'candidateMaxGap'] as const) {
            if (options[key] !== undefined && (!Number.isFinite(options[key]) || options[key]! < 0)) throw Error('V5先验配置无效');
        }
        if (!Number.isFinite(options.priorTemperature ?? 4) || (options.priorTemperature ?? 4) <= 0) throw Error('根先验温度必须为正数');
        if (!Number.isInteger(options.ownRolloutMaxChains ?? 64) || (options.ownRolloutMaxChains ?? 64) < 1) throw Error('己方补全上限必须为正整数');
        this.options = { ...options, headBias: options.headBias?.slice() };
    }
    private room(reserve = 0) { return true; }
    private unusedWallRoom(reserve = 0) { return performance.now() + reserve < Math.min(this.deadline - 75, this.activeEnd); }
    private canExpand() {
        const maximum = this.options.maxNodes ?? 1800;
        // 己方不可消耗全部节点，给所有决赛轨迹保留共享反扑配额。
        const limit = this.response ? maximum : Math.floor(maximum * (this.options.ownFraction ?? .5));
        return this.telemetry.nodes < limit && this.room(2);
    }
    private legal(engine: GameEngine, actor?: string): Action[] {
        const t = performance.now(), s = engine.getState();
        const all = engine.getLegalActions(s.currentPlayer, actor ? { unitId: actor, skipRecruitment: true } : undefined);
        this.telemetry.legalCalls++; this.telemetry.legalMs += performance.now() - t;
        return all.filter(a => a.type !== 'surrender' && (!actor || actionActor(a) === actor));
    }
    private clone(engine: GameEngine) {
        const t = performance.now(), copy = engine.clone();
        this.telemetry.clones++; this.telemetry.cloneMs += performance.now() - t; return copy;
    }
    private key(s: GameState) {
        if ((this.options as any).benchMode !== "S0") return compactKey(this, s);
        return `${this.options.modelVersion}:${PRIOR_VERSION}:${this.self}:${this.options.priorScale ?? 1}:${this.options.valueMode ?? 'maxn_ffa'}:${this.options.antiLeaderBeta ?? .25}:${this.options.responseActors ?? 3}:${JSON.stringify(s)}`;
    }
    private async evaluateBatch(engines: GameEngine[], wave: Wave, actors?: (string | undefined)[], valueOnly = false, firstGPU?: boolean[]): Promise<(Evaluation | undefined)[]> {
        valueOnly &&= this.model.supportsValueOnly === true;
        const results = new Map<string, Evaluation>(), keys: string[] = [], pending: { key: string; engine: GameEngine; state: GameState; actor?: string }[] = [], seen = new Set<string>();
        for (const [i, engine] of engines.entries()) {
            let snapshot = this.snapshots.get(engine);
            if (!snapshot) {
                const state = engine.getState(); snapshot = { state, key: this.key(state) }; this.snapshots.set(engine, snapshot);
            }
            const state = snapshot.state, actor = actors?.[i];
            const effectiveScale = this.options.ownTurnRollout && wave !== 'root' ? rolloutPriorScale(this.options, state.currentPlayer === this.self) : this.options.priorScale ?? 1;
            const key = snapshot.key + `:scale:${effectiveScale}` + `:actor:${actor ?? '*'}:proposal:${wave === 'C' ? 'response' : 'full'}:valueOnly:${valueOnly}`; keys.push(key);
            if (wave === 'C' && !valueOnly && state.currentPlayer !== this.self && ((this.options as any).benchMode === 'S3' || ((this.options as any).benchMode === 'S4' && !firstGPU?.[i]))) {
                const local = localEvaluation(this, engine, state, actor); results.set(key, local); continue;
            }
            const terminal = searchTerminal(state, this.self), cached = this.cache.get(key);
            if (terminal !== undefined) { results.set(key, { ranked: [], value: terminal }); continue; }
            if (cached) { this.telemetry.cacheHits++; results.set(key, cached); continue; }
            if (!seen.has(key)) { seen.add(key); pending.push({ key, engine, state, actor }); }
        }
        const size = this.options.maxBatchSize ?? 128;
        for (let offset = 0; offset < pending.length && this.room(this.networkCost + this.encodingCost + 5); offset += size) {
            const prepared: { key: string; engine: GameEngine; state: GameState; actor?: string; legal: Action[]; observation: DualObservation; context: ReachabilityContext }[] = [];
            for (const item of pending.slice(offset, offset + size)) {
                if (!this.room(this.networkCost + this.encodingCost + 5)) break;
                const legal = valueOnly ? [] : this.legal(item.engine, item.actor); if (!valueOnly && !legal.length) continue;
                const t = performance.now(), context = new ReachabilityContext(item.state), observation = encodeDualObservation(item.state, legal, context);
                const elapsed = performance.now() - t; this.telemetry.encodeCalls++; this.telemetry.encodeMs += elapsed;
                this.encodingCost = Math.max(1, this.encodingCost * .8 + (performance.now() - t) * .2);
                prepared.push({ ...item, legal, observation, context });
            }
            if (!prepared.length || !this.room(this.networkCost + 5)) break;
            const t = performance.now(), deadline = this.deadline - 75;
            let output: readonly BatchedModelOutput[];
            try {
                output = await withinSearchBudget(() => this.model.forwardBatch(prepared.map(p => p.observation), { deadline, valueOnly }), deadline);
            } catch (error) {
                if (!isSearchBudgetExpired(error)) throw error;
                this.telemetry.budgetExpirations++; this.telemetry.budgetDiscardedObservations += prepared.length;
                this.telemetry.budgetWaitMs += performance.now() - t;
                // 本轮不再发起前向；已完成分支仍可合法兑现，迟到输出不会写入本轮缓存。
                this.activeEnd = Math.min(this.activeEnd, performance.now());
                break;
            }
            const elapsed = performance.now() - t;
            this.telemetry.networkCalls++; this.telemetry.networkMs += elapsed; this.telemetry.observations += prepared.length;
            this.telemetry.batchSizes.push(prepared.length); this.telemetry.waveBatches[wave]++;
            this.networkCost = Math.max(5, this.networkCost * .6 + elapsed * .4);
            if (output.length !== prepared.length) throw Error('批量网络返回数量不符');
            prepared.forEach((p, i) => {
                const o = output[i];
                if (o.logits.length !== p.observation.actions.sourceIndices.length || o.valueLogits.length !== 6 || o.valueProbs.length !== 6 || [o.logits, o.valueLogits, o.valueProbs].some(a => Array.from(a).some(v => !Number.isFinite(v)))) throw Error('批量网络字段、形状或数值无效');
                const probs = this.options.valueCalibration ? calibrateValue(Float32Array.from(o.valueLogits), p.observation.playerOrder.active, valueCalibrationFeatures(p.state, p.observation.playerOrder), this.options.valueCalibration) : o.valueProbs;
                const value = computeScalarValue(probs, p.state, p.observation.playerOrder, this.self, this.options);
                if (valueOnly) {
                    const evaluation = { value, ranked: [] };
                    this.cache.set(p.key, evaluation); results.set(p.key, evaluation); return;
                }
                let ranked: RankedAction[] | undefined;
                const evaluation: Evaluation = { value, get ranked() { return getRanked(); } };
                const getRanked = () => {
                    if (ranked) return ranked;
                    if (!this.room(this.priorCost + 5)) { this.telemetry.priorSkips++; return []; }
                    const tick = performance.now(), scores = new Float64Array(p.legal.length).fill(-Infinity);
                    p.observation.actions.sourceIndices.forEach((source, j) => { scores[source] = o.logits[j] + (this.options.headBias?.[p.observation.actions.pointers[j * 5 + 2]] ?? 0); });
                    const indices = wave === 'C' && !p.actor ? responseActionIndices(p.state, p.legal, scores, this.options.responseActors ?? 3) : Array.from(p.observation.actions.sourceIndices);
                    const menu = indices.map(i => p.legal[i]);
                    const { priors: prior, forbidden } = tacticalPriorBundle(p.state, menu, p.context, Boolean(this.options.ownTurnRollout));
                    const scale = wave !== 'root' && this.options.ownTurnRollout ? rolloutPriorScale(this.options, p.state.currentPlayer === this.self) : this.options.priorScale ?? 1;
                    ranked = indices.map((source, j) => ({ action: p.legal[source], code: encodeAction(p.legal[source]), prior: prior[j], forbidden: forbidden ? Boolean(forbidden[j]) : undefined, score: scores[source] + scale * prior[j] })).sort((a, b) => b.score - a.score);
                    if (wave === 'C' && !p.actor) { this.telemetry.responseFullActions += p.legal.length; this.telemetry.responseProposalActions += menu.length; }
                    const elapsed = performance.now() - tick; this.telemetry.priorMs += elapsed;
                    this.priorCost = Math.max(1, .7 * this.priorCost + .3 * elapsed); return ranked;
                };
                this.cache.set(p.key, evaluation); results.set(p.key, evaluation);
            });
        }
        return keys.map(k => results.get(k));
    }
    private apply(b: Branch, action: Action): Branch | undefined {
        if (!this.canExpand()) return undefined;
        const state = b.engine.getState();
        if (!b.engine.hasLegalAction(state.currentPlayer, action)) throw Error('波次候选失去权威合法性');
        const engine = this.clone(b.engine), result = engine.step(action);
        if (result.info.includes('非法动作')) throw Error('波次搜索提交非法动作');
        this.telemetry.nodes++; if (this.response) this.telemetry.responseNodes++; else this.telemetry.ownNodes++;
        return { ...b, engine, steps: [...b.steps, { state, action }] };
    }
    private witness(initial: GameState, b: Branch, complete: boolean) {
        this.options.onWitness?.({ initial, actions: b.steps.map(s => s.action), final: b.engine.getState(), complete });
    }
    private async completeBatch(tasks: ChainTask[], wave: Wave): Promise<Branch[][]> {
        const finished = new Map<ChainTask, Branch[]>();
        let active: ChainState[] = [];
        for (const task of tasks) {
            const start = task.branch.engine.getState(), b = this.apply(task.branch, task.first.action);
            finished.set(task, []); if (!b) continue;
            if (!this.response && task.branch.steps.length === 0) this.telemetry.rootCovered.push(task.first.code);
            let actor = actionActor(task.first.action);
            if (task.first.action.type.startsWith('recruit_')) actor = b.engine.getState().units.find(u => u.ownerId === task.player && !start.units.some(v => v.id === u.id))?.id;
            b.prior += Math.tanh(task.first.score / 20);
            active.push({ task, branch: b, actor, turn: start.turn });
        }
        for (let depth = 0; active.length && depth <= 6; depth++) {
            const continuing: { item: ChainState; follow: Action[] }[] = [];
            for (const item of active) {
                const s = item.branch.engine.getState();
                const ended = searchTerminal(s, this.self) !== undefined || s.currentPlayer !== item.task.player || s.turn !== item.turn || !item.actor;
                const follow = ended ? [] : this.room(2) ? this.legal(item.branch.engine, item.actor) : undefined;
                if (ended || follow?.length === 0) { finished.get(item.task)!.push({ ...item.branch, ends: [...item.task.branch.ends, item.branch.steps.length] }); continue; }
                if (follow && depth < 6) continuing.push({ item, follow });
            }
            if (!continuing.length) break;
            const needsModel = continuing.filter(c => c.follow.length > 1);
            const evaluations = await this.evaluateBatch(needsModel.map(c => c.item.branch.engine), wave, needsModel.map(c => c.item.actor));
            let cursor = 0; const next: ChainState[] = [], counts = new Map<ChainTask, number>();
            for (const { item, follow } of continuing) {
                const evaluation = follow.length > 1 ? evaluations[cursor++] : undefined;
                const actorChoices = evaluation?.ranked.filter(r => actionActor(r.action) === item.actor) ?? [];
                const choices = follow.length === 1 ? [{ action: follow[0] }] : this.options.ownTurnRollout ? filterRolloutActions(actorChoices) : actorChoices;
                const singleTrack = this.response || Boolean(this.options.ownTurnRollout);
                for (const choice of choices.slice(0, singleTrack ? 1 : 2)) {
                    const count = counts.get(item.task) ?? 0; if (count >= (singleTrack ? 1 : 4)) break;
                    const child = this.apply(item.branch, choice.action);
                    if (child) { next.push({ ...item, branch: child }); counts.set(item.task, count + 1); }
                }
            }
            active = next;
        }
        return tasks.map(task => finished.get(task)!);
    }
    private async responseLeavesBatch(finalists: Branch[]): Promise<Response[][]> {
        if (["S3","S4"].includes((this.options as any).benchMode)) return this.responseCohortBatch(finalists);
        const groups: Response[][] = [], first = finalists[0].engine.getState();
        const effectiveVariants = this.responseVariants(first);
        const alive = new Set(first.players.filter(p => p.isAlive).map(p => p.id));
        const aliveUnits = first.units.filter(u => u.hp > 0 && !u.apkStatic && alive.has(u.ownerId)).length;
        // 金币仅估算潜在招募负载，真实合法性仍由权威引擎决定。
        const recruitLoad = Math.min(16, first.players.filter(p => p.isAlive).reduce((sum, p) => sum + Math.max(0, p.gold), 0) / 200);
        const cohortSize = aliveUnits + recruitLoad <= (this.options.responseLightUnitThreshold ?? 16) ? finalists.length : this.options.responseCohortSize ?? 4;
        let lastCost = 0;
        for (let offset = 0; offset < finalists.length; offset += cohortSize) {
            const cohort = finalists.slice(offset, offset + cohortSize);
            if (!this.room(offset ? lastCost * .95 + 25 : 10) || this.telemetry.nodes >= (this.options.maxNodes ?? 1800)) {
                for (const b of cohort) {
                    const initial = b.engine.getState();
                    groups.push(Array.from({ length: effectiveVariants }, (_, variant) => ({ initial, ownTurn: b.steps[0]?.state.turn ?? initial.turn, previous: initial, returned: false, variant, branch: { ...b, steps: [], ends: [] }, complete: false, done: true, enemyUnits: 0, player: initial.currentPlayer, turn: initial.turn, visited: new Set<number>(), reason: 'cohort_deferred' })));
                    this.telemetry.responseTruncated += effectiveVariants;
                }
                continue;
            }
            const tick = performance.now(); groups.push(...await this.responseCohortBatch(cohort)); lastCost = performance.now() - tick;
        }
        return groups;
    }
    private responseVariants(first: GameState): number {
        const aliveCount = first.players.filter(p => p.isAlive).length;
        return aliveCount <= 2 ? this.options.twoPlayerResponseVariants ?? this.options.responseVariants ?? 1 : this.options.responseVariants ?? 1;
    }
    private async responseCohortBatch(finalists: Branch[]): Promise<Response[][]> {
        this.response = true;
        const effectiveVariants = this.responseVariants(finalists[0].engine.getState());
        const groups = finalists.map(b => Array.from({ length: effectiveVariants }, (_, variant): Response => {
            const initial = b.engine.getState();
            return { initial, ownTurn: b.steps[0]?.state.turn ?? initial.turn, previous: b.steps.at(-1)?.state ?? initial, returned: false, variant, branch: { engine: this.clone(b.engine), steps: [], ends: [], value: b.value, score: 0, prior: 0 }, complete: true, done: false, enemyUnits: 0, player: initial.currentPlayer, turn: initial.turn, visited: new Set() };
        }));
        const tracks = groups.flat();
        // 每个敌席独立按自己的策略视角选动作，所有轨迹按原子链波次同步前进。
        for (let wave = 0; wave < 512 && tracks.some(t => !t.done) && this.canExpand(); wave++) {
            // 尾段将预算让给本梯队的主干及头号挑战者；被舍弃轨迹仍保持未评估。
            if (groups.length > 2 && !this.room(450)) for (const group of groups.slice(2)) for (const track of group) {
                const state = track.branch.engine.getState();
                const closed = searchTerminal(state, this.self) !== undefined || crossedSelfTurn(track.previous, state, this.self);
                if (!track.done && !closed) { track.complete = false; track.done = true; track.reason = 'budget_shed_for_top2'; }
            }
            const ready: Response[] = [];
            for (const t of tracks.filter(t => !t.done)) {
                const s = t.branch.engine.getState();
                if (searchTerminal(s, this.self) !== undefined) { t.done = true; continue; }
                if (crossedSelfTurn(t.previous, s, this.self)) { t.returned = true; t.done = true; continue; }
                t.previous = { currentPlayer: s.currentPlayer, turn: s.turn };
                if (s.currentPlayer !== t.player || s.turn !== t.turn) {
                    if (t.visited.has(s.currentPlayer)) { t.complete = false; t.done = true; t.reason = 'cycle'; continue; }
                    t.player = s.currentPlayer; t.turn = s.turn; t.enemyUnits = 0;
                }
                t.visited.add(s.currentPlayer);
                if (s.currentPlayer === this.self && !this.options.ownTurnRollout) {
                    const end = this.legal(t.branch.engine).find(a => a.type === 'end_turn');
                    const closed = end && this.apply(t.branch, end);
                    if (closed) t.branch = closed; else { t.complete = false; t.done = true; t.reason = 'own_turn_not_closed'; }
                    continue;
                }
                if (s.currentPlayer === this.self && (t.ownChains ?? 0) >= (this.options.ownRolloutMaxChains ?? 64)) { t.complete = false; t.done = true; t.reason = 'own_rollout_cap'; continue; }
                if (s.currentPlayer !== this.self && t.enemyUnits >= (this.options.responseUnits ?? 24)) {
                    // 截断敌方行动不会被计作完整闭合，也不会生成教师标签或否决依据。
                    t.complete = false; t.done = true; t.reason = 'unit_cap'; continue;
                }
                ready.push(t);
            }
            const evaluations = await this.evaluateBatch(ready.map(t => t.branch.engine), 'C', undefined, false, ready.map(t => t.enemyUnits === 0));
            const tasks: ChainTask[] = [], owners: Response[] = [];
            ready.forEach((t, i) => {
                const rawRanked = evaluations[i]?.ranked;
                const ranked = rawRanked && this.options.ownTurnRollout ? filterRolloutActions(rawRanked) : rawRanked;
                if (!ranked?.length) { t.complete = false; t.done = true; t.reason = 'no_policy_before_cutoff'; return; }
                const first = ranked[Math.min(t.player !== this.self && t.enemyUnits === 0 ? t.variant : 0, ranked.length - 1)];
                tasks.push({ branch: t.branch, first, player: t.player }); owners.push(t);
            });
            const chains = await this.completeBatch(tasks, 'C');
            owners.forEach((t, i) => {
                if (!chains[i].length) { t.complete = false; t.done = true; t.reason = 'incomplete_chain'; }
                else { t.branch = chains[i][0]; if (t.player === this.self) t.ownChains = (t.ownChains ?? 0) + 1; else t.enemyUnits++; }
            });
        }
        const leafTracks = tracks.filter(t => t.complete);
        const leafValues = await this.evaluateBatch(leafTracks.map(t => t.branch.engine), 'C', undefined, true);
        const values = tracks.map(t => leafValues[leafTracks.indexOf(t)]);
        tracks.forEach((t, i) => {
            const s = t.branch.engine.getState(), terminal = searchTerminal(s, this.self);
            t.returned ||= crossedSelfTurn(t.previous, s, this.self);
            t.complete &&= (terminal !== undefined || t.returned) && values[i] !== undefined;
            if (!t.complete && !t.reason) t.reason = this.telemetry.nodes >= (this.options.maxNodes ?? 1800) ? 'nodes' : values[i] === undefined ? 'unevaluated_leaf' : 'time';
            if (values[i]) t.branch.value = values[i]!.value;
            if (t.complete) this.telemetry.responseComplete++; else this.telemetry.responseTruncated++;
            this.witness(t.initial, t.branch, t.complete);
        });
        this.response = false; return groups;
    }

    async getAction(engine: GameEngine, player: number): Promise<Action> {
        const start = performance.now(), queued = this.queue[0];
        if (queued && engine.matchesState(queued.state) && engine.hasLegalAction(player, queued.action)) {
            this.queue.shift(); this.telemetry = { ...freshBatchTelemetry(), queued: true, rootMs: performance.now() - start }; return queued.action;
        }
        this.queue = []; this.cache.clear(); this.snapshots = new WeakMap(); this.self = player; this.response = false; this.telemetry = freshBatchTelemetry();
        const budget = this.options.budgetMs ?? 2800;
        if (!Number.isFinite(budget) || budget < 20 || budget > 3600000) throw Error('批量根预算必须在20至4000毫秒内');
        this.deadline = start + 3600000; this.activeEnd = start + budget * (this.options.ownFraction ?? .5); this.telemetry.budgetMs = budget;
        const state = engine.getState();
        if (state.currentPlayer !== player || engine.isTerminal() || searchTerminal(state, player) !== undefined) throw Error('只能为当前存活玩家搜索');
        const legal = this.legal(engine); if (!legal.length) throw Error('没有合法动作');
        this.telemetry.rootLegal = legal.length;
        const ruleLegal = engine.getLegalActions(player); this.telemetry.rootRuleLegal = ruleLegal.length;
        this.telemetry.rootPolicyExcluded = ruleLegal.filter(a => a.type === 'surrender').map(encodeAction);
        const codes = legal.map(encodeAction), fallback = legal.find(a => a.type === 'wait') ?? legal[0];
        try {
            if (legal.length === 1) { this.telemetry.stopReason = 'unique_action'; return legal[0]; }
            if (this.options.ownTurnRollout && legal.length === 2) {
                const capture = legal.find(a => a.type === 'capture' || a.type === 'repair');
                const wait = legal.find(a => a.type === 'wait');
                if (capture && wait && actionActor(capture) === actionActor(wait)) {
                    this.telemetry.stopReason = 'unique_action'; return capture;
                }
            }
            const rootValue = (await this.evaluateBatch([engine], 'root'))[0];
            if (!rootValue) { this.telemetry.stopReason = 'time'; return fallback; }
            const ranked = rootValue.ranked;
            const permittedRanked = this.options.ownTurnRollout ? filterRolloutActions(ranked) : ranked;
            if (this.options.ownTurnRollout && permittedRanked.length === 1) { this.telemetry.stopReason = 'unique_action'; return permittedRanked[0].action; }
            const roots = this.options.ownTurnRollout ? anchoredCandidates(permittedRanked, this.options.rootCandidates ?? this.options.finalists ?? 8, this.options.candidateMaxGap ?? 20) : diverseCandidates(ranked, this.options.rootCandidates ?? 28, coverageRotation(state));
            const logPriors = rootLogPriors(ranked, this.options.priorTemperature ?? 4);
            const anchor = this.options.ownTurnRollout ? this.options.priorAnchor ?? .1 : 0;
            this.telemetry.rootProposed = roots.map(r => r.code);
            let beam: Branch[] = [{ engine, steps: [], ends: [], value: rootValue.value, score: rootValue.value, prior: 0 }];
            const completed: Branch[] = [];
            for (let depth = 0; depth < (this.options.ownTurnRollout ? 1 : this.options.maxUnits ?? 5) && beam.length && this.canExpand(); depth++) {
                const tasks: ChainTask[] = [];
                const evaluations = depth === 0 ? [rootValue] : await this.evaluateBatch(beam.map(b => b.engine), 'B');
                beam.forEach((b, i) => {
                    const s = b.engine.getState();
                    if (searchTerminal(s, player) !== undefined || s.currentPlayer !== player || s.turn !== state.turn) return;
                    const candidates = depth === 0 ? roots : diverseCandidates(evaluations[i]?.ranked ?? [], this.options.innerCandidates ?? 14, coverageRotation(s));
                    for (const first of candidates) tasks.push({ branch: b, first, player });
                });
                const groups = await this.completeBatch(tasks, 'A');
                if (depth === 0) groups.forEach((g, i) => {
                    if (g.length) this.telemetry.rootCompleted.push(tasks[i].first.code);
                });
                const children = groups.flat();
                if (this.options.ownTurnRollout) {
                    for (const b of children) {
                        this.witness(state, b, true);
                        b.value = searchTerminal(b.engine.getState(), player) ?? rootValue.value; b.score = b.value;
                        completed.push(b);
                    }
                    break;
                }
                const leaves = await this.evaluateBatch(children.map(b => b.engine), 'B');
                const evaluated: Branch[] = [];
                children.forEach((b, i) => {
                    const terminal = searchTerminal(b.engine.getState(), player), value = leaves[i]?.value;
                    this.witness(state, b, true);
                    if (value === undefined) return;
                    b.value = value; b.score = terminal !== undefined ? terminal * 10000 : value + b.prior * .0001;
                    completed.push(b); evaluated.push(b);
                });
                const identities = new Set<string>();
                beam = evaluated.sort((a, b) => b.score - a.score).filter(b => { const id = planId(b); if (identities.has(id)) return false; identities.add(id); return true; }).slice(0, this.options.beamWidth ?? 16);
            }
            if (!completed.length) { this.telemetry.stopReason = 'incomplete_unit_fallback'; return roots[0]?.action ?? fallback; }
            const firstChains = new Set<string>();
            const finalists = completed.sort((a, b) => this.options.ownTurnRollout ? roots.findIndex(r => r.code === encodeAction(a.steps[0].action)) - roots.findIndex(r => r.code === encodeAction(b.steps[0].action)) || b.score - a.score : b.score - a.score).filter(b => {
                // 先保证决赛圈有不同根动作，防止全部配额落在同一首动作的跟进变体。
                const id = encodeAction(b.steps[0].action);
                if (firstChains.has(id)) return false; firstChains.add(id); return true;
            }).slice(0, this.options.finalists ?? 16);
            this.activeEnd = this.deadline - 25;
            const responses = await this.responseLeavesBatch(finalists);
            this.telemetry.candidates = finalists.map((b, i): FinalistRecord => {
                const tracks = responses[i], complete = tracks.every(t => t.complete), statuses = tracks.map(t => survivalStatus(state, t.branch.engine.getState(), player));
                const value = complete ? Math.min(...tracks.map(t => t.branch.value)) : b.value;
                return { id: planId(b), rootAction: encodeAction(b.steps[0].action), value, score: value + anchor * (logPriors.get(encodeAction(b.steps[0].action)) ?? 0), ownChains: b.ends.length,
                    responseComplete: complete, responseActions: tracks.reduce((sum, t) => sum + t.branch.steps.length, 0),
                    unsafe: statuses.some(s => s.unsafe), safe: statuses.every(s => s.safe), eliminated: statuses.some(s => s.eliminated && !s.won), selected: false, responseReasons: tracks.map(t => t.reason ?? 'complete') };
            });
            applySurvivalVeto(this.telemetry.candidates);
            const eligible = this.telemetry.candidates.filter(c => !c.vetoed);
            // 已知阵亡严格落后于存活分支；反扑未闭合只作显式回退，不伪装成教师目标。
            const winning = (c: FinalistRecord) => searchTerminal(finalists[this.telemetry.candidates.indexOf(c)].engine.getState(), player) === 1;
            let selected = eligible.sort((a, b) => Number(winning(b)) - Number(winning(a)) || Number(a.eliminated) - Number(b.eliminated) || Number(b.responseComplete) - Number(a.responseComplete) || b.score - a.score)[0];
            if (this.options.ownTurnRollout) {
                const top = roots[0], trunk = this.telemetry.candidates.find(c => c.rootAction === top?.code);
                if (!trunk?.responseComplete) {
                    const baseline = rootValue.value + anchor * (logPriors.get(top.code) ?? 0);
                    selected = safeBaselineReplacement(eligible, baseline)!;
                    if (!selected) {
                        if (trunk) trunk.selected = true;
                        this.telemetry.teacher = searchTeacher(codes, this.telemetry.candidates, this.options.teacherTemperature);
                        const branch = finalists.find(b => encodeAction(b.steps[0].action) === top.code);
                        if (branch && !this.options.ownTurnRollout) this.queue = branch.steps.slice(1, branch.ends[0]);
                        this.telemetry.stopReason = 'policy_top1_fallback'; return top.action;
                    }
                }
            }
            selected.selected = true;
            const best = finalists.find(b => planId(b) === selected.id)!;
            this.telemetry.selectedUnits = best.ends.length; this.queue = this.options.ownTurnRollout ? [] : best.steps.slice(1, best.ends[0]);
            this.telemetry.teacher = searchTeacher(codes, this.telemetry.candidates, this.options.teacherTemperature);
            this.telemetry.stopReason = this.telemetry.nodes >= (this.options.maxNodes ?? 1800) ? 'nodes' : !this.room() ? 'time' : 'depth';
            return best.steps[0].action;
        } finally {
            this.telemetry.rootOmitted = codes.filter(c => !this.telemetry.rootCovered.includes(c));
            if (!this.telemetry.teacher && legal.length > 1) this.telemetry.teacher = searchTeacher(codes, [], this.options.teacherTemperature);
            this.telemetry.rootMs = performance.now() - start; this.telemetry.overBudget = this.telemetry.rootMs > budget;
        }
    }
}

