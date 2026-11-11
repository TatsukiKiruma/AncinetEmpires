import type { GameEngine } from '../../game/engine';
import { encodeAction } from '../../game/env';
import { areAlliedPlayers, getAllianceId, getUnitCost, isCommanderUnit } from '../../game/rule_config';
import type { Action, GameState } from '../../game/types';
import { encodeDualObservation } from './encoder';
import type { DualStreamModel } from './model_runtime';
import { ReachabilityContext } from './reachability';
import { actionActor, decodeTacticalGroups, tacticalActionPriors } from './tactical_prior';
import { ledgerScore, multiplayerLedger, type RecruitmentTrace } from './multiplayer_leaf';
import { calibrateValue, valueCalibrationFeatures, type ValueCalibration } from './value_calibration';
import { computeScalarValue } from './value_model';
import { takeoverDecision, type BranchEvidence } from './takeover_guard';

/** 完整快照字符串作为无碰撞的状态身份，包含规则、pending、地图与行动标记。 */
export const turnStateHash = (state: GameState) => JSON.stringify(state);
interface QueueStep { expectedStateHash: string; action: Action }
interface Branch { engine: GameEngine; queue: QueueStep[]; prior: number; score: number; actors: string[]; recruitment?: RecruitmentTrace }
export interface SearchWitness { initial: GameState; actions: Action[]; finalHash: string; player: number }
export interface TurnSearchOptions { budgetMs?: number; beamWidth?: number; maxUnits?: number; maxNodes?: number; takeoverMargin?: number; headBias?: readonly number[]; valueCalibration?: ValueCalibration; onWitness?: (witness: SearchWitness) => void }
interface RiskDetail { penalty: number; expandedChains: number; staticCoveredUnits: number; complete: boolean; staticComplete: boolean; opportunityMs: number }

const freshTelemetry = () => ({ queued: false, nodes: 0, rootMs: 0, selectedUnits: 0, veto: false, takeover: false, witnesses: 0, retaliationComplete: 0, retaliationAttempts: 0, rootValue: 0, riskContract: 'equal-two-chain-v2', risks: [] as RiskDetail[] });

export class DualStreamTurnSearchAI {
    readonly memory = { queue: [] as QueueStep[] };
    telemetry = freshTelemetry();
    private deadline = 0;
    private tierOneEnd = 0;
    private nodes = 0;
    constructor(private readonly model: DualStreamModel, private readonly options: TurnSearchOptions = {}) {}

    private ranked(engine: GameEngine, neural: boolean, actor?: string) {
        const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender' && (actor === undefined || actionActor(a) === actor));
        if (!legal.length) return [];
        const context = new ReachabilityContext(state), priors = tacticalActionPriors(state, legal, context);
        if (!neural) return legal.map((action, i) => ({ action, score: priors[i].prior, forbidden: priors[i].forbidden })).sort((a, b) => b.score - a.score);
        const observation = encodeDualObservation(state, legal, context), output = this.model.forward(observation);
        const decoded = decodeTacticalGroups(output.logits, observation.actions.pointers, priors, this.options.headBias);
        return legal.map((action, i) => ({ action, score: decoded.scores[i], forbidden: priors[i].forbidden })).sort((a, b) => b.score - a.score);
    }

    private apply(branch: Branch, action: Action): Branch | null {
        if (this.nodes >= (this.options.maxNodes ?? 180) || performance.now() >= this.deadline) return null;
        const before = branch.engine.getState(), next = branch.engine.clone();
        const code = encodeAction(action), legal = next.getLegalActions(before.currentPlayer), actual = legal.find(a => encodeAction(a) === code);
        if (!actual) return null;
        const result = next.step(actual); if (result.info.includes('非法动作')) throw Error('搜索提交了非法动作');
        this.nodes++;
        let recruitment = branch.recruitment ?? { cost: 0, unitIds: [] };
        if (actual.type === 'recruit_to_castle' || actual.type === 'recruit_and_deploy') {
            const previousIds = new Set(before.units.map(u => u.id));
            recruitment = { cost: recruitment.cost + (getUnitCost(before, before.currentPlayer, actual.unitClass) ?? 0), unitIds: [...recruitment.unitIds, ...result.state.units.filter(u => !previousIds.has(u.id) && u.ownerId === before.currentPlayer).map(u => u.id)] };
        }
        return { ...branch, engine: next, recruitment, queue: [...branch.queue, { expectedStateHash: turnStateHash(before), action: actual }], actors: [...branch.actors] };
    }

    private complete(branch: Branch, first: Action, self: number): Branch[] {
        const before = branch.engine.getState(), ids = new Set(before.units.map(u => u.id));
        const initial = this.apply(branch, first); if (!initial) return [];
        let actor = actionActor(first);
        if (first.type.startsWith('recruit_')) actor = initial.engine.getState().units.find(u => !ids.has(u.id) && u.ownerId === self)?.id;
        if (actor) initial.actors.push(actor);
        let active = [initial], finished: Branch[] = [];
        // 一条完整单位链最多覆盖移动、动作、突击移动；保留两条不同完结解。
        for (let depth = 0; depth < 4 && active.length && performance.now() < this.deadline; depth++) {
            const next: Branch[] = [];
            for (const b of active) {
                if (performance.now() >= this.deadline) break;
                const state = b.engine.getState();
                const follow = state.currentPlayer === self && state.turn === before.turn && !b.engine.isTerminal() && actor ? this.ranked(b.engine, false, actor) : [];
                if (!follow.length) { finished.push(b); continue; }
                for (const f of follow.filter(f => !f.forbidden).slice(0, 2)) {
                    const child = this.apply(b, f.action); if (!child) continue;
                    child.prior += Math.max(-10, Math.min(10, f.score)) * .04; next.push(child);
                }
            }
            active = next.slice(0, 4);
        }
        // 只有确实完结的链才能进入队列，不伪造新兵wait或跳过剩余二动。
        for (const b of active) {
            const state = b.engine.getState();
            if (state.currentPlayer !== self || state.turn !== before.turn || b.engine.isTerminal() || !actor || !b.engine.getLegalActions(self).some(a => actionActor(a) === actor)) finished.push(b);
        }
        return finished;
    }

    private candidateRoots(engine: GameEngine, count: number, neural: boolean) {
        const ranked = this.ranked(engine, neural).filter(x => !x.forbidden), chosen = ranked.slice(0, Math.max(1, count - 4));
        // 高优先级语义与不同actor必须有机会进入根池，避免单一单位占满候选。
        for (const type of ['attack', 'capture', 'support', 'recruit_to_castle', 'heal']) {
            const candidate = ranked.find(x => x.action.type === type); if (candidate && !chosen.includes(candidate) && chosen.length < count) chosen.push(candidate);
        }
        for (const candidate of ranked) if (chosen.length < count && !chosen.some(x => actionActor(x.action) === actionActor(candidate.action))) chosen.push(candidate);
        for (const candidate of ranked) if (chosen.length < count && !chosen.includes(candidate)) chosen.push(candidate);
        return chosen;
    }

    private retaliation(branch: Branch, self: number) {
        const initial = branch.engine.getState(), counter = branch.engine.clone(), actions: Action[] = [];
        const commanders = new Map(initial.units.filter(u => areAlliedPlayers(initial, self, u.ownerId) && isCommanderUnit(initial, u)).map(u => [u.id, u.hp]));
        const plannedTurn = branch.queue.length ? JSON.parse(branch.queue[0].expectedStateHash).turn : initial.turn;
        if (initial.currentPlayer === self && initial.turn !== plannedTurn) return { penalty: 0, commanders, complete: true, staticComplete: true, lethalActors: 0, expandedChains: 0, staticCoveredUnits: 0 };
        let complete = counter.isTerminal(), rolloutComplete = true, expandedChains = 0, staticCoveredUnits = 0;
        // 按权威换手顺位走到己方下一回合；盟友只换手，敌方展开两个完整主力链。
        for (let turns = 0; turns < 7 && !counter.isTerminal(); turns++) {
            const state = counter.getState(), player = state.currentPlayer;
            if (turns > 0 && player === self) { complete = true; break; }
            const end = counter.getLegalActions(player).find(a => a.type === 'end_turn');
            if (player === self || areAlliedPlayers(state, self, player)) {
                if (!end) break; counter.step(end); actions.push(end); continue;
            }
            for (let unit = 0; unit < 2 && counter.getState().currentPlayer === player && !counter.isTerminal(); unit++) {
                if (performance.now() >= this.deadline - 5) { rolloutComplete = false; break; }
                const first = this.candidateRoots(counter, 1, false)[0]; if (!first) break;
                const prior = this.nodes; this.nodes = 0;
                const completed = this.complete({ engine: counter, queue: [], prior: 0, score: 0, actors: [] }, first.action, player);
                this.nodes = prior;
                const best = completed.sort((a, b) => ledgerScore(multiplayerLedger(state, b.engine.getState(), player, b.recruitment)) - ledgerScore(multiplayerLedger(state, a.engine.getState(), player, a.recruitment)))[0];
                if (!best) { rolloutComplete = false; break; }
                for (const q of best.queue) { counter.step(q.action); actions.push(q.action); }
                expandedChains++;
            }
            // 对该顺位玩家的全部单位做静态合法可达攻击估计，覆盖未实际展开的敌军。
            const current = counter.getState();
            // 反扑原子可能已自动换手，不能替下一顺位玩家再提交一次end_turn。
            if (current.currentPlayer !== player || counter.isTerminal()) {
                if (current.currentPlayer === self || counter.isTerminal()) complete = true;
                continue;
            }
            const context = new ReachabilityContext(current);
            staticCoveredUnits += current.units.filter(u => u.ownerId === player && !u.hasActed).length;
            for (const [id, hp] of commanders) {
                const defender = current.units.find(u => u.id === id); if (!defender) { commanders.set(id, 0); continue; }
                const hits = current.units.filter(u => u.ownerId === player && !u.hasActed).map(u => context.projectedDamage(u, defender)).sort((a, b) => b - a).slice(0, 3);
                commanders.set(id, Math.max(0, Math.min(hp, defender.hp) - hits.reduce((s, x) => s + x, 0)));
            }
            const finish = counter.getLegalActions(counter.getState().currentPlayer).find(a => a.type === 'end_turn');
            if (!finish) break; counter.step(finish); actions.push(finish);
        }
        const final = counter.getState();
        complete ||= counter.isTerminal() || final.currentPlayer === self && final.turn !== plannedTurn;
        for (const [id, hp] of commanders) commanders.set(id, Math.min(hp, final.units.find(u => u.id === id)?.hp ?? 0));
        if (actions.length) { this.options.onWitness?.({ initial, actions, finalHash: turnStateHash(final), player: self }); this.telemetry.witnesses++; }
        const threats = new ReachabilityContext(final);
        const lethalActors = [...new Set(branch.actors)].filter(id => {
            const u = final.units.find(v => v.id === id);
            if (!u) return true;
            return final.units.filter(e => !areAlliedPlayers(final, self, e.ownerId)).map(e => threats.projectedDamage(e, u)).sort((a, b) => b - a).slice(0, 3).reduce((s, x) => s + x, 0) >= u.hp;
        }).length;
        return { penalty: Math.max(0, -ledgerScore(multiplayerLedger(initial, final, self))), commanders, complete: complete && rolloutComplete, staticComplete: complete, lethalActors, expandedChains, staticCoveredUnits };
    }

    getAction(engine: GameEngine, playerId: number): Action {
        const start = performance.now(), state = engine.getState();
        if (state.currentPlayer !== playerId || engine.isTerminal()) throw Error('搜索只能为当前玩家行动');
        const head = this.memory.queue[0];
        if (head && head.expectedStateHash === turnStateHash(state)) {
            // 已验证队列只查询对应行动者，避免复制整支军队的全局移动/招募菜单。
            const actor = actionActor(head.action);
            const queuedLegal = actor ? engine.getLegalActions(playerId, { unitId: actor, skipRecruitment: true }) : engine.getLegalActions(playerId);
            const actual = queuedLegal.find(a => encodeAction(a) === encodeAction(head.action));
            if (actual) { this.memory.queue.shift(); this.telemetry.queued = true; return actual; }
        }
        const legal = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
        this.memory.queue = []; this.nodes = 0;
        this.telemetry = freshTelemetry();
        // 1000ms外部门槛中保留200ms，供不可中断的权威静态覆盖、快照和GC尾部使用。
        this.deadline = start + Math.min(800, this.options.budgetMs ?? 800); this.tierOneEnd = start + (this.deadline - start) * .61;
        if (legal.length === 1) return legal[0];
        const roots = this.candidateRoots(engine, 12, true);
        if (!roots.length) throw Error('没有可用搜索候选');
        const root: Branch = { engine, queue: [], prior: 0, score: 0, actors: [] }, width = this.options.beamWidth ?? 6;
        let beam: Branch[] = [], primary: Branch | undefined;
        const cheapScore = (b: Branch) => ledgerScore(multiplayerLedger(state, b.engine.getState(), playerId, b.recruitment)) + b.prior;
        for (const [i, candidate] of roots.entries()) {
            if (performance.now() >= this.tierOneEnd) break;
            const complete = this.complete(root, candidate.action, playerId);
            for (const b of complete) { b.prior += Math.max(-10, Math.min(10, candidate.score)) * .08; b.score = cheapScore(b); }
            if (i === 0) primary = complete[0];
            beam.push(...complete);
        }
        beam.sort((a, b) => b.score - a.score); beam = beam.slice(0, width);
        for (let unit = 1; unit < (this.options.maxUnits ?? 3) && performance.now() < this.tierOneEnd && this.nodes < (this.options.maxNodes ?? 180); unit++) {
            const expanded: Branch[] = [...beam];
            for (const b of beam) {
                if (b.engine.isTerminal() || b.engine.getState().currentPlayer !== playerId || b.engine.getState().turn !== state.turn || performance.now() >= this.tierOneEnd) continue;
                for (const candidate of this.candidateRoots(b.engine, 8, false)) {
                    for (const child of this.complete(b, candidate.action, playerId)) { child.prior += Math.max(-10, Math.min(10, candidate.score)) * .08; child.score = cheapScore(child); expanded.push(child); }
                    if (this.nodes >= (this.options.maxNodes ?? 180) || performance.now() >= this.tierOneEnd) break;
                }
            }
            expanded.sort((a, b) => b.score - a.score); beam = expanded.slice(0, width);
        }
        if (primary && !beam.includes(primary)) beam.push(primary);
        let best = primary, bestScore = -Infinity, decision: 'veto' | 'takeover' | null = null;
        const evaluations: (BranchEvidence & { branch: Branch; value: number })[] = [];
        // 同一比较最多三案，每案两条敌方完整单位链；每案获得相同墙钟额度。
        const ordered = (primary ? [primary, ...beam.filter(b => b !== primary)] : beam).slice(0, 3);
        const comparisonDeadline = this.deadline, opportunityMs = Math.max(0, (comparisonDeadline - 120 - performance.now()) / Math.max(1, ordered.length));
        for (const b of ordered) {
            const candidateDeadline = Math.min(comparisonDeadline - 120, performance.now() + opportunityMs);
            const after = b.engine.getState();
            let value = 0;
            if (b.engine.isTerminal()) value = after.winner === -1 ? 0 : after.winner === getAllianceId(after, playerId) ? 1 : -1;
            else if (performance.now() < this.deadline - 40) {
                const observation = encodeDualObservation(after, b.engine.getLegalActions(after.currentPlayer).filter(a => a.type !== 'surrender')), output = this.model.forward(observation);
                const probs = this.options.valueCalibration ? calibrateValue(output.valueLogits, observation.playerOrder.active, valueCalibrationFeatures(after, observation.playerOrder), this.options.valueCalibration) : output.valueProbs;
                value = computeScalarValue(probs, after, observation.playerOrder, playerId);
            }
            this.deadline = candidateDeadline;
            const risk = this.retaliation(b, playerId);
            this.deadline = comparisonDeadline;
            this.telemetry.risks.push({ penalty: risk.penalty, expandedChains: risk.expandedChains, staticCoveredUnits: risk.staticCoveredUnits, complete: risk.complete, staticComplete: risk.staticComplete, opportunityMs });
            // 根态的每位指挥官都纳入守卫，包括在己方分支中已经阵亡的指挥官。
            for (const u of state.units) if (areAlliedPlayers(state, playerId, u.ownerId) && isCommanderUnit(state, u) && !risk.commanders.has(u.id)) risk.commanders.set(u.id, 0);
            this.telemetry.retaliationAttempts++; this.telemetry.retaliationComplete += Number(risk.complete);
            const ledger = multiplayerLedger(state, after, playerId, b.recruitment);
            evaluations.push({ branch: b, value, ledger, ledgerScore: ledgerScore(ledger), supports: b.queue.filter(q => q.action.type === 'support').length, lethalActors: risk.lethalActors, score: b.score + value * 2 - risk.penalty, health: risk.commanders, complete: risk.complete });
        }
        const baseline = evaluations.find(e => e.branch === primary);
        bestScore = baseline?.score ?? -Infinity;
        for (const e of evaluations) {
            if (!baseline || e === baseline) continue;
            const allowed = takeoverDecision(baseline, e, this.options.takeoverMargin ?? .35);
            if (allowed && (best === primary || e.score > bestScore)) { best = e.branch; bestScore = e.score; decision = allowed; }
        }
        if (!best?.queue.length) return roots[0].action;
        this.memory.queue = best.queue.slice(1);
        this.telemetry.nodes = this.nodes; this.telemetry.rootMs = performance.now() - start; this.telemetry.selectedUnits = best.actors.length;
        this.telemetry.takeover = decision === 'takeover'; this.telemetry.veto = decision === 'veto';
        this.telemetry.rootValue = evaluations.find(e => e.branch === best)?.value ?? 0;
        return best.queue[0].action;
    }
}
