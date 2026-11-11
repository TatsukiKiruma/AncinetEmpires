import type { GameEngine } from '../../game/engine';
import type { Action, GameState } from '../../game/types';
import { encodeAction } from '../../game/env';
import { encodeDualObservation } from '../dual_v2/encoder';
import { actionActor } from '../dual_v2/tactical_prior';
import { computeScalarValue, searchTerminal, survivalStatus, applySurvivalVeto, type ValueOptions } from './search_value';
import { ReachabilityContext } from '../dual_v2/reachability';
import { ledgerScore, multiplayerLedger } from '../dual_v2/multiplayer_leaf';
import { calibrateValue, valueCalibrationFeatures, type ValueCalibration } from '../dual_v2/value_calibration';
import { PRIOR_VERSION, tacticalPriorBundle, type RankedAction, type SearchModel } from './search_policy';
import { filterRolloutActions, anchoredCandidates, rootLogPriors, safeBaselineReplacement } from './anchored_policy';

export interface BeamOptions extends ValueOptions {
    requireModelDecision?: boolean; modelVersion: string; budgetMs?: number; maxNodes?: number; rootCandidates?: number;
    beamWidth?: number; maxUnits?: number; finalists?: number; innerCandidates?: number;
    responseUnits?: number; responseVariants?: number; intermediateValue?: boolean;
    leafMode?: 'post_response' | 'pre_response_penalty'; headBias?: readonly number[];
    valueCalibration?: ValueCalibration; priorScale?: number;
    rootPriorScale?: number;
    priorTemperature?: number; priorAnchor?: number; disableActionQueue?: boolean;
    candidateMaxGap?: number; ownFraction?: number; ownTurnRollout?: boolean;
    onWitness?: (w: { initial: GameState; actions: Action[]; final: GameState; complete: boolean }) => void;
}
interface Step { state: GameState; action: Action; heuristic?: boolean }
interface Branch { engine: GameEngine; steps: Step[]; ends: number[]; score: number; value: number; prior: number }
interface Evaluation { ranked: RankedAction[]; value: number }
const fresh = () => ({ queued: false, budgetMs: 0, rootMs: 0, overBudget: false, nodes: 0, ownNodes: 0, responseNodes: 0,
    clones: 0, cloneMs: 0, legalCalls: 0, legalMs: 0, encodeCalls: 0, encodeMs: 0, networkCalls: 0, networkMs: 0,
    priorMs: 0, cacheHits: 0, stopReason: 'candidate_exhaustion', selectedUnits: 0, responseChains: 0,
    rootLegal: 0, rootRuleLegal: 0,rootPolicyExcluded: [] as string[],rootProposed: [] as string[], rootCovered: [] as string[], rootCompleted: [] as string[], rootOmitted: [] as string[], responseComplete: 0, responseTruncated: 0,
    candidates: [] as { id: string; rootAction: string; score: number; value: number; ownChains: number; responseComplete: boolean; responseActions: number; selected: boolean; unsafe: boolean; safe: boolean; eliminated: boolean; vetoed?: boolean; survivalRank: number }[] });

/** 网络参与每层筛选的有界束搜索；仅兑现首单位完整链，下一单位重新规划。 */
export class NeuralBeamSearchAI {
    telemetry = fresh();
    private queue: Step[] = [];
    private deadline = 0;
    private searchEnd = 0;
    private activeEnd = 0;
    private cache = new Map<string, Evaluation>();
    private cost = { evaluation: 60, encoding: 20, network: 25, prior: 15, legal: 2, clone: 1 };
    private self = 0;
    private response = false;
    private responseNodeEnd = Infinity;
    constructor(private readonly model: SearchModel, private readonly options: BeamOptions) {
        if (!(0 < (options.ownFraction ?? .4) && (options.ownFraction ?? .4) < 1)) throw Error('己方预算比例必须在零至一之间');
        if (!options.modelVersion) throw Error('搜索缓存必须绑定模型身份');
        if (!Number.isFinite(options.priorTemperature ?? 4) || (options.priorTemperature ?? 4) <= 0) throw Error('先验温度必须为正数');
        if (!Number.isFinite(options.priorAnchor ?? .1) || (options.priorAnchor ?? .1) < 0) throw Error('先验锚定系数无效');
        if (!Number.isFinite(options.priorScale ?? 1) || (options.priorScale ?? 1) < 0) throw Error('先验尺度无效');
        if (options.rootPriorScale !== undefined && (!Number.isFinite(options.rootPriorScale) || options.rootPriorScale < 0)) throw Error('根先验尺度无效');
        if (!Number.isFinite(options.antiLeaderBeta ?? .25) || (options.antiLeaderBeta ?? .25) < 0 || (options.antiLeaderBeta ?? .25) > 1) throw Error('反榜首系数必须在零至一内');
        if (options.valueMode && !['maxn_ffa', 'zero_sum_margin'].includes(options.valueMode)) throw Error('价值模式无效');
        this.options = { ...options, headBias: options.headBias?.slice() };
    }

    private room(ms = 0, ignoreActiveEnd = false) {
        // 同单位动作也不能突破己方配额，保留反扑和真实叶子估值预算。
        const end = Math.min(this.deadline - 15, this.activeEnd, this.response ? Infinity : this.searchEnd);
        return performance.now() + ms < end;
    }
    private canExpand(ignoreActiveEnd = false) {
        const total = this.options.maxNodes ?? 20000;
        const limit = this.response ? Math.min(total, this.responseNodeEnd) : Math.floor(total * (this.options.ownFraction ?? .4));
        return this.telemetry.nodes < limit && this.room(this.cost.clone + this.cost.legal, ignoreActiveEnd);
    }
    private legal(engine: GameEngine, actor?: string): Action[] {
        const start = performance.now(), player = engine.getState().currentPlayer;
        const authority=engine.getLegalActions(player, actor ? { unitId: actor, skipRecruitment: true } : undefined);
        if(this.telemetry.legalCalls===0&&!actor){this.telemetry.rootRuleLegal=authority.length;this.telemetry.rootPolicyExcluded=authority.filter(a=>a.type==='surrender').map(encodeAction);}
        const actions = authority.filter(a => a.type !== 'surrender' && (!actor || actionActor(a) === actor));
        const elapsed = performance.now() - start;
        this.telemetry.legalCalls++; this.telemetry.legalMs += elapsed; this.cost.legal = Math.max(.1, this.cost.legal * .8 + elapsed * .2);
        return actions;
    }

    private clone(engine: GameEngine) {
        const start = performance.now(), copy = engine.clone(), elapsed = performance.now() - start;
        this.telemetry.clones++; this.telemetry.cloneMs += elapsed; this.cost.clone = Math.max(.1, this.cost.clone * .8 + elapsed * .2); return copy;
    }

    private terminal(state: GameState): number | undefined {
        return searchTerminal(state, this.self);
    }

    private evaluate(engine: GameEngine, force = false, isRoot = false): Evaluation | undefined {
        const state = engine.getState(), terminal = this.terminal(state);
        if (terminal !== undefined) return { ranked: [], value: terminal };
        const scale = isRoot ? (this.options.rootPriorScale ?? 1) : (this.options.priorScale ?? 1);
        // 完整状态含规则、地图来源、pending及全部行动标志；缓存仅存活于本次根搜索。
        const key = `${this.options.modelVersion}:${PRIOR_VERSION}:${isRoot ? 'root' : 'inner'}:${scale}:${this.options.valueMode ?? 'maxn_ffa'}:${this.options.antiLeaderBeta ?? .25}:${JSON.stringify(state)}`;
        const cached = this.cache.get(key); if (cached) { this.telemetry.cacheHits++; return cached; }
        if (!force && !this.room(this.cost.evaluation)) return undefined;
        const begin = performance.now(), legal = this.legal(engine);
        if (!legal.length) return undefined;
        const encoding = performance.now(), context = new ReachabilityContext(state), observation = encodeDualObservation(state, legal, context);
        const encodeMs=performance.now()-encoding;
        this.telemetry.encodeCalls++; this.telemetry.encodeMs += encodeMs;this.cost.encoding=this.cost.encoding*.7+encodeMs*.3;
        if (!force && !this.room(this.cost.network+this.cost.prior)) return undefined;
        const network = performance.now(), output = this.model.forward(observation);
        const networkMs=performance.now()-network;
        this.telemetry.networkCalls++; this.telemetry.networkMs += networkMs;this.cost.network=this.cost.network*.7+networkMs*.3;
        if (!force && !this.room(this.cost.prior)) return undefined;
        const priorStart = performance.now(), { priors: prior, forbidden } = tacticalPriorBundle(state, legal, context, true);
        const priorMs=performance.now()-priorStart;
        this.telemetry.priorMs += priorMs;this.cost.prior=this.cost.prior*.7+priorMs*.3;
        const hasActiveOptions = legal.some(a => a.type === 'move' || a.type === 'attack' || a.type === 'capture' || a.type.startsWith('recruit_'));
        const result = {
            ranked: Array.from(observation.actions.sourceIndices, (source, i) => {
                const act = legal[source];
                const isForbidden = Boolean(forbidden?.[source]) || (act.type === 'end_turn' && hasActiveOptions);
                return {
                    action: act,
                    code: encodeAction(act),
                    prior: prior[source],
                    forbidden: isForbidden,
                    score: output.logits[i] + scale * prior[source] + (this.options.headBias?.[observation.actions.pointers[i * 5 + 2]] ?? 0)
                };
            }).sort((a, b) => b.score - a.score),
            value: computeScalarValue(this.options.valueCalibration ? calibrateValue(output.valueLogits, observation.playerOrder.active, valueCalibrationFeatures(state, observation.playerOrder), this.options.valueCalibration) : output.valueProbs, state, observation.playerOrder, this.self, this.options)
        };
        this.cost.evaluation = Math.max(1, this.cost.evaluation * .6 + (performance.now() - begin) * .4);
        this.cache.set(key, result); return result;
    }

    private priorRankedChoices(engine: GameEngine, follow: Action[]): RankedAction[] {
        const state = engine.getState();
        const context = new ReachabilityContext(state);
        const { priors, forbidden } = tacticalPriorBundle(state, follow, context, true);
        const hasActiveOptions = follow.some(a => a.type === 'move' || a.type === 'attack' || a.type === 'capture' || a.type.startsWith('recruit_'));
        const ranked: RankedAction[] = follow.map((action, i) => ({
            action,
            code: encodeAction(action),
            prior: priors[i],
            forbidden: Boolean(forbidden?.[i]) || (action.type === 'end_turn' && hasActiveOptions),
            score: priors[i],
        })).sort((a, b) => b.score - a.score);
        return filterRolloutActions(ranked);
    }

    private apply(branch: Branch, action: Action, inUnitChain = false, heuristic = false): Branch | undefined {
        if (!this.canExpand(inUnitChain)) return undefined;
        const state = branch.engine.getState();
        if (!branch.engine.hasLegalAction(state.currentPlayer, action)) throw Error('候选失去权威合法性');
        const next = this.clone(branch.engine), result = next.step(action);
        if (result.info.includes('非法动作')) throw Error('束搜索提交了非法动作');
        this.telemetry.nodes++; if (this.response) this.telemetry.responseNodes++; else this.telemetry.ownNodes++;
        return { ...branch, engine: next, steps: [...branch.steps, { state, action, heuristic }] };
    }

    private complete(branch: Branch, first: RankedAction, player: number): Branch[] {
        const start = branch.engine.getState(), initial = this.apply(branch, first.action, true);
        if (!initial) return [];
        let actor = actionActor(first.action);
        if (first.action.type.startsWith('recruit_')) actor = initial.engine.getState().units.find(u => u.ownerId === player && !start.units.some(old => old.id === u.id))?.id;
        initial.prior += Math.tanh(first.score / 20);
        let active = [initial]; const finished: Branch[] = [];
        for (let depth = 0; depth < 5 && active.length; depth++) {
            const next: Branch[] = [];
            for (const b of active) {
                const state = b.engine.getState();
                if (state.winner !== null || state.currentPlayer !== player || state.turn !== start.turn || !actor) { finished.push(b); continue; }
                const follow = this.legal(b.engine, actor);
                if (!follow.length) { finished.push(b); continue; }
                let choices: RankedAction[]; let heuristic = false;
                if (follow.length === 1) {
                    choices = [{ action: follow[0], code: encodeAction(follow[0]), score: 0, prior: 0 }];
                } else if (!this.options.ownTurnRollout && this.room(this.cost.evaluation)) {
                    const learned = this.evaluate(b.engine);
                    const scores = learned?.ranked.filter(r => actionActor(r.action) === actor);
                    if (scores?.length) {
                        choices = filterRolloutActions(scores);
                    } else {
                        choices = this.priorRankedChoices(b.engine, follow); heuristic = true;
                    }
                } else {
                    // CPU 预算紧张时使用轻量战术先验闭合同单位动作链
                    choices = this.priorRankedChoices(b.engine, follow); heuristic = true;
                }
                if (!choices.length) {
                    heuristic = true; choices = follow.map(action => ({ action, code: encodeAction(action), score: action.type === 'wait' ? -1 : 0, prior: 0 }));
                }
                for (const f of choices.slice(0, this.response ? 1 : 2)) {
                    const child = this.apply(b, f.action, true, heuristic);
                    if (child) next.push(child);
                }
            }
            active = next.slice(0, this.response ? 1 : 4);
        }
        for (const b of active) {
            const s = b.engine.getState();
            if (s.winner !== null || s.currentPlayer !== player || s.turn !== start.turn || !actor) {
                finished.push(b);
            } else {
                const remainingLegal = this.legal(b.engine, actor);
                if (!remainingLegal.length) {
                    finished.push(b);
                } else {
                    const rankedRemaining = this.priorRankedChoices(b.engine, remainingLegal);
                    const closingAction = rankedRemaining[0]?.action ?? remainingLegal.find(a => a.type === 'wait') ?? remainingLegal[0];
                    const closed = this.apply(b, closingAction, true, true);
                    if (closed) finished.push(closed);
                    else finished.push(b);
                }
            }
        }
        return finished.map(b => ({ ...b, ends: [...branch.ends, b.steps.length] }));
    }

    private responseLeaf(branch: Branch, variant: number, until: number) {
        const inherited = this.activeEnd;
        // 留出一次真实网络价值计算；推演耗尽时不得强塞换手伪造闭环。
        const reserve = Math.max(35, this.cost.evaluation * 1.25);
        this.activeEnd = until - reserve; this.response = true;
        const initial = branch.engine.getState();
        let current: Branch = { engine: this.clone(branch.engine), steps: [], ends: [], score: 0, prior: 0, value: branch.value };
        const rootState = branch.steps[0]?.state ?? initial;
        let reachedSelf = initial.currentPlayer === this.self && initial.turn !== rootState.turn;
        let chains = 0, turnActions = 0;
        let previousPlayer = initial.currentPlayer, previousTurn = initial.turn;
        const evaluatedPlayers = new Set<number>();
        try {
            while (!current.engine.isTerminal() && !reachedSelf && this.canExpand()) {
                const state = current.engine.getState();
                if (state.currentPlayer !== previousPlayer || state.turn !== previousTurn) {
                    if (state.currentPlayer === this.self) { reachedSelf = true; break; }
                    previousPlayer = state.currentPlayer; previousTurn = state.turn; turnActions = 0;
                }
                if (turnActions >= (this.options.responseUnits ?? 24) * 5) break;
                const legal = this.legal(current.engine);
                if (!legal.length) break;
                let choice: RankedAction | undefined;
                const remaining = state.units.filter(u => u.ownerId === state.currentPlayer && !u.hasActed).length;
                // 小队关键首招可用网络；大兵团按行动者局部先验推演，最终统一网络估值。
                if (!evaluatedPlayers.has(state.currentPlayer) && remaining <= 2 && this.room(this.cost.evaluation * 3 + 40)) {
                    evaluatedPlayers.add(state.currentPlayer);
                    const ranked = this.evaluate(current.engine)?.ranked;
                    if (ranked?.length) {
                        const permitted = filterRolloutActions(ranked);
                        choice = permitted[Math.min(variant, permitted.length - 1)];
                    }
                }
                let heuristic = false;
                if (!choice) {
                    const actors = new Set(legal.map(actionActor).filter(Boolean));
                    const tactical = legal.find(a => a.type === 'attack' || a.type === 'capture' || a.type === 'repair');
                    const actor = state.pendingUnitId ?? state.units.find(u => actors.has(u.id) && u.unitClass === 'commander')?.id
                        ?? (tactical ? actionActor(tactical) : undefined)
                        ?? actors.values().next().value;
                    const menu = actor ? legal.filter(a => actionActor(a) === actor) : legal;
                    choice = this.priorRankedChoices(current.engine, menu)[0]; heuristic = true;
                }
                if (!choice) break;
                const next = this.apply(current, choice.action, false, heuristic);
                if (!next) break;
                current = next; turnActions++;
                if (actionActor(choice.action) || choice.action.type.startsWith('recruit_')) chains++;
                const after = current.engine.getState();
                reachedSelf = after.currentPlayer === this.self && (after.currentPlayer !== state.currentPlayer || after.turn !== rootState.turn);
            }
            const final = current.engine.getState(), terminal = this.terminal(final);
            let complete = terminal !== undefined || reachedSelf;
            // 只在真实闭环后强制执行一次网络估值；残缺分支保持显式不完整。
            this.activeEnd = until;
            const evaluated = terminal ?? (complete ? this.evaluate(current.engine, true)?.value : undefined);
            complete &&= evaluated !== undefined;
            this.telemetry.responseChains += chains;
            if (complete) this.telemetry.responseComplete++; else this.telemetry.responseTruncated++;
            this.options.onWitness?.({ initial, actions: current.steps.map(s => s.action), final, complete });
            return { value: evaluated ?? branch.value, final, complete, actions: current.steps.length, terminal };
        } finally { this.activeEnd = inherited; this.response = false; }
    }

    getAction(engine: GameEngine, player: number): Action {
        const start = performance.now(), head = this.queue[0];
        if (!this.options.disableActionQueue && head && engine.matchesState(head.state) && engine.hasLegalAction(player, head.action)) {
            this.queue.shift(); this.telemetry = { ...fresh(), queued: true, rootMs: performance.now() - start }; return head.action;
        }
        this.queue = []; this.cache.clear(); this.self = player; this.telemetry = fresh(); this.response = false;
        const budget = this.options.budgetMs ?? 4000;
        if (!Number.isFinite(budget) || budget < 20 || budget > 4000) throw Error('根预算必须在20至4000毫秒内');
        this.telemetry.budgetMs = budget; this.deadline = start + budget;
        this.searchEnd = start + budget * (this.options.ownFraction ?? .4); this.activeEnd = this.searchEnd;
        const state = engine.getState(); if (state.currentPlayer !== player || engine.isTerminal()) throw Error('只能为当前玩家搜索');
        const legal = this.legal(engine); if (!legal.length) throw Error('没有合法动作');
        const rootCodes=legal.map(encodeAction);this.telemetry.rootLegal=legal.length;
        let selected = legal.find(a => a.type === 'wait') ?? legal[0];
        try {
            if (!this.options.requireModelDecision && legal.length === 1) { this.telemetry.stopReason = 'unique_action'; return selected; }
            if (!this.options.requireModelDecision && legal.length === 2) {
                const capture = legal.find(a => a.type === 'capture' || a.type === 'repair');
                const wait = legal.find(a => a.type === 'wait');
                if (capture && wait && actionActor(capture) === actionActor(wait)) {
                    this.telemetry.stopReason = 'unique_action'; return capture;
                }
            }
            const rootEvaluation = this.evaluate(engine, true, true);
            if (!rootEvaluation) { if (this.options.requireModelDecision) throw Error('预算不足，未完成冠军网络推理'); this.telemetry.stopReason = 'time'; return selected; }
            const ranked = rootEvaluation.ranked;
            const permittedRanked = filterRolloutActions(ranked);
            if (permittedRanked.length === 1) { this.telemetry.stopReason = 'unique_action'; return permittedRanked[0].action; }
            if (this.options.requireModelDecision) selected = permittedRanked[0].action;
            const roots = anchoredCandidates(permittedRanked, this.options.rootCandidates ?? 24, this.options.candidateMaxGap ?? 20);
            const logPriors = rootLogPriors(ranked, this.options.priorTemperature ?? 4);
            const anchor = this.options.priorAnchor ?? .1;
            selected = roots[0].action;
            this.telemetry.rootProposed = roots.map(r => r.code);
            const root: Branch = { engine, steps: [], ends: [], score: rootEvaluation.value, value: rootEvaluation.value, prior: 0 };
            let beam: Branch[] = [], completed: Branch[] = [];
            for (let depth = 0; depth < (this.options.maxUnits ?? 5) && this.canExpand(); depth++) {
                const expanded: Branch[] = [];
                for (const b of depth === 0 ? [root] : beam) {
                    const s = b.engine.getState();
                    if (s.winner !== null || s.currentPlayer !== player || s.turn !== state.turn) { expanded.push(b); continue; }
                    let candidates: RankedAction[];
                    if (depth === 0) {
                        candidates = roots;
                    } else {
                        const evalResult = this.evaluate(b.engine);
                        const rankedInner = evalResult?.ranked ?? [];
                        const permittedInner = filterRolloutActions(rankedInner);
                        candidates = anchoredCandidates(permittedInner, this.options.innerCandidates ?? 12, this.options.candidateMaxGap ?? 20);
                    }
                    for (const candidate of candidates) {
                        if (!this.canExpand()) break;
                        const priorNodes=this.telemetry.nodes,chains=this.complete(b, candidate, player);
                        if(depth===0&&this.telemetry.nodes>priorNodes)this.telemetry.rootCovered.push(candidate.code);
                        if(depth===0&&chains.length)this.telemetry.rootCompleted.push(candidate.code);
                        for (const child of chains) {
                            const leaf = this.options.intermediateValue === false ? undefined : this.evaluate(child.engine);
                            const terminal = this.terminal(child.engine.getState());
                            child.value = terminal ?? leaf?.value ?? b.value;
                            child.score = terminal !== undefined ? terminal * 10000 : this.options.intermediateValue === false ? ledgerScore(multiplayerLedger(state, child.engine.getState(), player)) + child.prior * .01 : child.value + child.prior * .001;
                            expanded.push(child); completed.push(child);
                        }
                    }
                }
                const plans = new Set<string>();
                beam = expanded.sort((a, b) => b.score - a.score).filter(b => { const key = b.steps.map(s => encodeAction(s.action)).join(';'); if (plans.has(key)) return false; plans.add(key); return true; }).slice(0, this.options.beamWidth ?? 12);
                if (!beam.length) break;
            }
            if (!completed.length) { this.telemetry.stopReason = 'incomplete_unit_fallback'; return selected; }
            // 按根部排序保送主干，每个根动作仅占一个反扑名额。
            const identities = new Set<string>();
            const finalists = completed.sort((a, b) => roots.findIndex(r => r.code === encodeAction(a.steps[0].action)) - roots.findIndex(r => r.code === encodeAction(b.steps[0].action)) || b.score - a.score).filter(b => { const key = encodeAction(b.steps[0].action); if (identities.has(key)) return false; identities.add(key); return true; }).slice(0, this.options.finalists ?? 8);
            let best = finalists[0];
            this.activeEnd = this.deadline - 15;
            for (let i = 0; i < finalists.length && this.room(); i++) {
                const b = finalists[i], immediateTerminal = this.terminal(b.engine.getState());
                const variants = this.options.responseVariants ?? 2, results = [];
                const slice = Math.max(0, (this.deadline - 30 - performance.now()) / (finalists.length - i));
                for (let v = 0; v < variants && this.room(this.cost.evaluation + 5); v++) {
                    this.responseNodeEnd = this.telemetry.nodes + Math.floor(((this.options.maxNodes ?? 20000) - this.telemetry.nodes) / ((finalists.length - i) * variants - v));
                    results.push(this.responseLeaf(b, v, Math.min(this.deadline - 20, performance.now() + slice / (variants - v))));
                }
                const worst = results.length ? Math.min(...results.map(r => r.value)) : b.value;
                // 默认后反扑价值不再扣已由后继状态体现的伤害；旧式评分只用于受控消融。
                const score = this.options.leafMode === 'pre_response_penalty' ? b.value - Math.max(0, ...results.map(r => -ledgerScore(multiplayerLedger(b.engine.getState(), r.final, player)))) : worst;
                const statuses = results.map(r => survivalStatus(state, r.final, player));
                const finalScore = score + anchor * (logPriors.get(encodeAction(b.steps[0].action)) ?? 0), terminalRank = immediateTerminal === 1 ? 2 : immediateTerminal === -1 || statuses.some(s => s.eliminated && !s.won) ? -1 : 0;
                const record = { id: b.steps.map(q => encodeAction(q.action)).join(';'), rootAction: encodeAction(b.steps[0].action), score: finalScore, value: worst, ownChains: b.ends.length, responseComplete: results.length === variants && results.every(r => r.complete), responseActions: results.reduce((s, r) => s + r.actions, 0), selected: false,
                    unsafe: statuses.some(s => s.unsafe), safe: statuses.length === variants && statuses.every(s => s.safe), eliminated: terminalRank === -1, survivalRank: terminalRank };
                this.telemetry.candidates.push(record);
            }
            applySurvivalVeto(this.telemetry.candidates);
            const eligible = this.telemetry.candidates.filter(c => !c.vetoed);
            let winner = eligible.sort((a, b) => b.survivalRank - a.survivalRank || Number(b.responseComplete) - Number(a.responseComplete) || b.score - a.score)[0];
            const trunk = this.telemetry.candidates.find(c => c.rootAction === roots[0].code);
            if (!trunk?.responseComplete) {
                const baseline = rootEvaluation.value + anchor * (logPriors.get(roots[0].code) ?? 0);
                const replacement = safeBaselineReplacement(eligible, baseline);
                if (!replacement) {
                    if (trunk) trunk.selected = true;
                    this.telemetry.stopReason = 'policy_top1_fallback';
                    return roots[0].action;
                }
                winner = eligible.find(c => c.id === replacement.id)!;
            }
            if (winner) best = finalists.find(b => b.steps.map(q => encodeAction(q.action)).join(';') === winner.id)!;
            this.telemetry.selectedUnits = best.ends.length;
            const selectedId = best.steps.map(q => encodeAction(q.action)).join(';');
            for (const c of this.telemetry.candidates) c.selected = c.id === selectedId;
            selected = best.steps[0].action;
            const follow = best.steps.slice(1, best.ends[0]);
            const firstHeuristic = follow.findIndex(s => s.heuristic);
            // 只能兑现启发式降级前的连续已验证前缀，不能跳过中间步骤。
            this.queue = this.options.disableActionQueue ? [] : follow.slice(0, firstHeuristic < 0 ? undefined : firstHeuristic);
            this.telemetry.stopReason = this.telemetry.nodes >= (this.options.maxNodes ?? 20000) ? 'nodes' : performance.now() >= this.searchEnd ? 'time' : beam.some(b=>b.ends.length>=(this.options.maxUnits??5))?'depth':'candidate_exhaustion';
            return selected;
        } finally {
            const covered=new Set(this.telemetry.rootCovered);this.telemetry.rootOmitted=rootCodes.filter(code=>!covered.has(code));
            this.telemetry.rootMs = performance.now() - start; this.telemetry.overBudget = this.telemetry.rootMs > budget;
        }
    }
}
