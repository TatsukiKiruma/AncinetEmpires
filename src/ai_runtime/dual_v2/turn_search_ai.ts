import type { GameEngine } from '../../game/engine';
import { encodeAction } from '../../game/env';
import { areAlliedPlayers, getAllianceId, getUnitCost, isCommanderUnit } from '../../game/rule_config';
import { hasAbility } from '../../game/abilities';
import type { Action, GameState } from '../../game/types';
import { encodeDualObservation } from './encoder';
import type { DualStreamModel } from './model_runtime';
import { ReachabilityContext } from './reachability';
import { actionActor, decodeTacticalGroups, tacticalActionPriors } from './tactical_prior';
import { ledgerScore, multiplayerLedger, type RecruitmentTrace } from './multiplayer_leaf';
import { calibrateValue, valueCalibrationFeatures, type ValueCalibration } from './value_calibration';
import { computeScalarValue } from './value_model';
import { takeoverDecision, type BranchEvidence } from './takeover_guard';
import { queueStateKey } from './queue_state';
import { strongestAllianceDamage } from './alliance_threat';
import { retaliationFirst } from './retaliation_order';
import { RootRecruitmentPolicy } from './recruitment_policy';
import { getTileTerrainKey } from '../../game/terrain_rules';
import { positionKey } from './hard_tactics';

const retainedCastles = (state: GameState, self: number) => new Set(state.map.tiles.flatMap((row, y) => row.flatMap((tile, x) => getTileTerrainKey(tile) === 'castle' && tile.ownerId !== null && areAlliedPlayers(state, self, tile.ownerId) ? [positionKey({ x, y })] : [])));

/** 完整快照字符串作为无碰撞的状态身份，包含规则、pending、地图与行动标记。 */
export const turnStateHash = (state: GameState) => JSON.stringify(state);
interface QueueStep { expectedStateHash: string; state: GameState; action: Action }
interface Branch { engine: GameEngine; queue: { state: GameState; action: Action }[]; unitEnds?: number[]; prior: number; score: number; actors: string[]; recruitment?: RecruitmentTrace }
export interface SearchWitness { initial: GameState; actions: Action[]; finalHash: string; player: number }
export interface TurnSearchOptions { budgetMs?: number; beamWidth?: number; maxUnits?: number; maxNodes?: number; maxRetaliationUnits?: number; takeoverMargin?: number; defaultQueue?: 'first_unit' | 'full'; headBias?: readonly number[]; valueCalibration?: ValueCalibration; parentValueModel?: DualStreamModel; onWitness?: (witness: SearchWitness) => void }
interface RiskDetail { penalty: number; expandedChains: number; staticCoveredUnits: number; complete: boolean; staticComplete: boolean; opportunityMs: number; adaptiveClosures?: number; coreChains?: number }

const freshTelemetry = () => ({ queued: false, nodes: 0, rootMs: 0, selectedUnits: 0, primaryUnits: 0, plannedFinalists: 0, budgetSkippedCandidates: 0, comparedUnits: [] as number[], veto: false, takeover: false, witnesses: 0, retaliationComplete: 0, retaliationAttempts: 0, rootValue: 0, riskContract: 'v6-hard-slayer', risks: [] as RiskDetail[] });

export class DualStreamTurnSearchAI {
    readonly memory = { queue: [] as QueueStep[] };
    telemetry = freshTelemetry();
    private deadline = 0;
    private tierOneEnd = 0;
    private retaliationLimit = 0;
    private nodes = 0;
    private readonly recruitmentPolicy = new RootRecruitmentPolicy();
    constructor(private readonly model: DualStreamModel, private readonly options: TurnSearchOptions = {}) {}

    private ranked(engine: GameEngine, neural: boolean, actor?: string) {
        const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer, !neural && actor !== undefined ? { unitId: actor, skipRecruitment: true } : undefined).filter(a => a.type !== 'surrender' && (neural || actor === undefined || actionActor(a) === actor));
        if (!legal.length) return [];
        const context = new ReachabilityContext(state), priors = tacticalActionPriors(state, legal, context);
        if (!neural) return legal.map((action, i) => ({ action, score: priors[i].prior, immediate: priors[i].immediate, forbidden: priors[i].forbidden })).sort((a, b) => b.score - a.score);
        const observation = encodeDualObservation(state, legal, context), output = this.model.forward(observation);
        const decoded = decodeTacticalGroups(output.logits, observation.actions.pointers, priors, this.options.headBias);
        return legal.map((action, i) => ({ action, score: decoded.scores[i], hardScore: priors[i].prior, immediate: priors[i].immediate, forbidden: priors[i].forbidden })).filter(x => actor === undefined || actionActor(x.action) === actor).sort((a, b) => b.score - a.score);
    }

    private apply(branch: Branch, action: Action): Branch | null {
        if (this.nodes >= (this.options.maxNodes ?? 260) || performance.now() >= this.deadline) return null;
        const before = branch.engine.getState(), next = branch.engine.clone();
        const actor = actionActor(action), code = encodeAction(action);
        const legal = next.getLegalActions(before.currentPlayer, actor ? { unitId: actor, skipMovement: action.type !== 'move' && action.type !== 'post_attack_move', skipRecruitment: true } : { skipMovement: true }), actual = legal.find(a => encodeAction(a) === code);
        if (!actual) return null;
        const result = next.step(actual); if (result.info.includes('非法动作')) throw Error('搜索提交了非法动作');
        this.nodes++;
        let recruitment = branch.recruitment ?? { cost: 0, unitIds: [] };
        if (actual.type === 'recruit_to_castle' || actual.type === 'recruit_and_deploy') {
            const previousIds = new Set(before.units.map(u => u.id));
            recruitment = { cost: recruitment.cost + (getUnitCost(before, before.currentPlayer, actual.unitClass) ?? 0), unitIds: [...recruitment.unitIds, ...result.state.units.filter(u => !previousIds.has(u.id) && u.ownerId === before.currentPlayer).map(u => u.id)] };
        }
        return { ...branch, engine: next, recruitment, queue: [...branch.queue, { state: before, action: actual }], actors: [...branch.actors] };
    }

    private complete(branch: Branch, first: Action, self: number, neuralFollowUp = false, maxBranch = neuralFollowUp ? 1 : 2): Branch[] {
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
                const follow = state.currentPlayer === self && state.turn === before.turn && !b.engine.isTerminal() && actor ? this.ranked(b.engine, neuralFollowUp, actor) : [];
                if (!follow.length) { finished.push(b); continue; }
                // 默认链逐步遵循神经首选；其它分支仍保留两条启发式完结解。
                for (const f of follow.filter(f => !f.forbidden).slice(0, maxBranch)) {
                    const child = this.apply(b, f.action); if (!child) continue;
                    child.prior += Math.max(-10, Math.min(10, f.score)) * .04; next.push(child);
                }
            }
            active = next.slice(0, maxBranch === 1 ? 1 : 4);
        }
        // 只有确实完结的链才能进入队列，不伪造新兵wait或跳过剩余二动。
        for (const b of active) {
            const state = b.engine.getState();
            if (state.currentPlayer !== self || state.turn !== before.turn || b.engine.isTerminal() || !actor || !b.engine.getLegalActions(self, { unitId: actor, skipRecruitment: true }).some(a => actionActor(a) === actor)) finished.push(b);
        }
        return finished.map(b => ({ ...b, unitEnds: [...(branch.unitEnds ?? []), b.queue.length] }));
    }

    private candidateRoots(engine: GameEngine, count: number, neural: boolean) {
        const player = engine.getState().currentPlayer, all = this.ranked(engine, neural).filter(x => !x.forbidden);
        if (neural) this.recruitmentPolicy.observe(player, all);
        // 神经排序和规则排序并列选根；兵种始终保持开放。
        const ranked = neural && count === 1 ? all : this.recruitmentPolicy.constrain(player, all), chosen = ranked.slice(0, Math.max(1, count - 4));
        // 规则最强候选独立于网络排序注入，避免网络偏置漏掉守城、集火或招募反制。
        const guided = [...ranked].sort((a, b) => ((b as { hardScore?: number }).hardScore ?? b.score) - ((a as { hardScore?: number }).hardScore ?? a.score));
        if (count > 1) for (const candidate of guided.slice(0, 2)) if (!chosen.includes(candidate) && chosen.length < count) chosen.push(candidate);
        // 高优先级语义与不同actor必须有机会进入根池，避免单一单位占满候选。
        for (const type of ['attack', 'capture', 'support', 'recruit_to_castle', 'heal']) {
            const candidate = ranked.find(x => x.action.type === type); if (candidate && !chosen.includes(candidate) && chosen.length < count) chosen.push(candidate);
        }
        const actorKey = (a: Action) => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy' ? `${positionKey(a.castlePos)}:${a.unitClass}` : actionActor(a);
        for (const candidate of ranked) if (chosen.length < count && !chosen.some(x => actorKey(x.action) === actorKey(candidate.action))) chosen.push(candidate);
        for (const candidate of ranked) if (chosen.length < count && !chosen.includes(candidate)) chosen.push(candidate);
        return chosen;
    }

    private retaliationFirst(engine: GameEngine) { return retaliationFirst(engine); }

    private retaliation(branch: Branch, self: number, monitoredActors?: readonly string[] | boolean) {
        const inherited = this.deadline, start = performance.now();
        // 显式过期预算保持过期；正常对局从根搜索预留区借用窗口，不越过硬上限。
        if (inherited > start && this.retaliationLimit > start) this.deadline = Math.min(this.retaliationLimit, Math.max(inherited, start + 220));
        try { return this.retaliationRollout(branch, self, Array.isArray(monitoredActors) ? monitoredActors : branch.actors); }
        finally { this.deadline = inherited; }
    }

    private retaliationRollout(branch: Branch, self: number, monitoredActors: readonly string[]) {
        const initial = branch.engine.getState(), counter = branch.engine.clone(), actions: Action[] = [];
        const commanders = new Map(initial.units.filter(u => areAlliedPlayers(initial, self, u.ownerId) && isCommanderUnit(initial, u)).map(u => [u.id, u.hp]));
        const plannedTurn = branch.queue[0]?.state.turn ?? initial.turn;
        if (initial.currentPlayer === self && initial.turn !== plannedTurn) return { penalty: 0, commanders, complete: true, staticComplete: true, lethalActors: 0, expandedChains: 0, staticCoveredUnits: 0, retainedCastles: retainedCastles(initial, self) };
        let complete = counter.isTerminal(), rolloutComplete = true, expandedChains = 0, staticCoveredUnits = 0, coreChains = 0, adaptiveClosures = 0;
        const perPlayerLimit = Math.max(1, Math.min(6, Math.floor(this.options.maxRetaliationUnits ?? 5)));
        const hostilePlayers = initial.players.filter(p => p.isAlive && !areAlliedPlayers(initial, self, p.id));
        const totalChainLimit = hostilePlayers.length > 1 ? 8 : perPlayerLimit;
        const exposedDamage = new Map<string, number>();
        const exposedCastles = new Set<string>();
        const visitedPlayers = new Set<number>();
        // 按权威顺位走到己方下一回合；多人总量最多八链，给后续每个敌方保留两条核心链。
        for (let turns = 0; turns < 7 && !counter.isTerminal(); turns++) {
            const state = counter.getState(), player = state.currentPlayer;
            // 己方可能在反扑中淘汰；遇到已经覆盖的顺位即完成一圈，不能反复展开敌方新回合。
            if (turns > 0 && (player === self || visitedPlayers.has(player))) { complete = true; break; }
            visitedPlayers.add(player);
            const end = counter.getLegalActions(player, { skipMovement: true, skipRecruitment: true }).find(a => a.type === 'end_turn');
            if (player === self || areAlliedPlayers(state, self, player)) {
                if (!end) break; counter.step(end); actions.push(end); continue;
            }
            const remainingEnemies = hostilePlayers.filter(p => !visitedPlayers.has(p.id) && state.players.some(current => current.id === p.id && current.isAlive)).length;
            const reservedCoreChains = remainingEnemies * Math.min(2, perPlayerLimit);
            const turnChainLimit = Math.min(perPlayerLimit, Math.max(0, totalChainLimit - expandedChains - reservedCoreChains));
            const extensionReserveMs = 25 + remainingEnemies * 70;
            if (turnChainLimit < Math.min(2, perPlayerLimit) && state.units.some(u => u.ownerId === player && !u.hasActed)) rolloutComplete = false;
            for (let unit = 0; unit < turnChainLimit && counter.getState().currentPlayer === player && counter.getState().turn === state.turn && !counter.isTerminal(); unit++) {
                const now = performance.now();
                if (now >= this.deadline - 5) { if (unit < 2) rolloutComplete = false; else adaptiveClosures++; break; }
                // 核心两链必须完成；延伸链还须为后续每个敌方的核心链和静态覆盖留足时间。
                if (unit >= 2 && now >= this.deadline - extensionReserveMs) { adaptiveClosures++; break; }
                // 实际战术链优先，避免远端赶路占用仅有的两个反扑名额。
                const first = this.retaliationFirst(counter); if (!first) break;
                const prior = this.nodes; this.nodes = 0;
                const completed = this.complete({ engine: counter, queue: [], prior: 0, score: 0, actors: [] }, first.action, player, false, 1);
                this.nodes = prior;
                const best = completed[0];
                if (!best) { if (unit < 2) rolloutComplete = false; else adaptiveClosures++; break; }
                for (const q of best.queue) { counter.step(q.action); actions.push(q.action); }
                expandedChains++;
                if (unit < 2) coreChains++;
            }
            // 对该顺位玩家的全部单位做静态合法可达攻击估计，覆盖未实际展开的敌军。
            const current = counter.getState();
            // 反扑原子可能已自动换手，不能替下一顺位玩家再提交一次end_turn。
            if (current.currentPlayer !== player || current.turn !== state.turn || counter.isTerminal()) {
                if (current.currentPlayer === self || counter.isTerminal()) complete = true;
                continue;
            }
            const context = new ReachabilityContext(current);
            // 未展开敌军不能因强制收口而隐藏立即夺取空城的合法威胁。
            for (const key of retainedCastles(current, self)) {
                const [x, y] = key.split(',').map(Number);
                if (current.units.some(u => u.hp > 0 && u.pos.x === x && u.pos.y === y)) continue;
                if (current.units.some(u => u.ownerId === player && hasAbility(u, 'castle_capturer') && context.units.get(u.id)?.ready && context.units.get(u.id)!.origins.some(p => p.x === x && p.y === y))) exposedCastles.add(key);
            }
            staticCoveredUnits += current.units.filter(u => u.ownerId === player && !u.hasActed).length;
            for (const [id, hp] of commanders) {
                const defender = current.units.find(u => u.id === id); if (!defender) { commanders.set(id, 0); continue; }
                const hits = current.units.filter(u => u.ownerId === player && !u.hasActed).map(u => context.projectedDamage(u, defender)).sort((a, b) => b - a).slice(0, 3);
                commanders.set(id, Math.max(0, Math.min(hp, defender.hp) - hits.reduce((s, x) => s + x, 0)));
            }
            // 各敌方顺位取最大潜在威胁；真实展开的伤害已由账本结算。
            for (const id of new Set(branch.actors)) {
                const defender = current.units.find(u => u.id === id);
                if (!defender || !areAlliedPlayers(current, self, defender.ownerId)) continue;
                const damage = current.units.filter(u => u.ownerId === player && !u.hasActed).map(u => context.projectedDamage(u, defender)).sort((a, b) => b - a).slice(0, 3).reduce((s, x) => s + x, 0);
                exposedDamage.set(id, Math.max(exposedDamage.get(id) ?? 0, damage));
            }
            const finish = counter.getLegalActions(counter.getState().currentPlayer, { skipMovement: true, skipRecruitment: true }).find(a => a.type === 'end_turn');
            if (!finish) break; counter.step(finish); actions.push(finish);
        }
        const final = counter.getState();
        complete ||= counter.isTerminal() || final.currentPlayer === self && final.turn !== plannedTurn;
        for (const [id, hp] of commanders) commanders.set(id, Math.min(hp, final.units.find(u => u.id === id)?.hp ?? 0));
        if (actions.length) { this.options.onWitness?.({ initial, actions, finalHash: turnStateHash(final), player: self }); this.telemetry.witnesses++; }
        const threats = new ReachabilityContext(final);
        const lethalActors = [...new Set(monitoredActors)].filter(id => {
            const u = final.units.find(v => v.id === id);
            if (!u) return true;
            return strongestAllianceDamage(final, self, u, threats) >= u.hp;
        }).length;
        let exposurePenalty = 0;
        for (const [id, damage] of exposedDamage) {
            const u = final.units.find(v => v.id === id);
            if (u) exposurePenalty += .25 * (getUnitCost(final, u.ownerId, u.unitClass) ?? 0) / 1024 * Math.min(u.hp, damage) / u.maxHp;
        }
        const castles = retainedCastles(final, self); for (const key of exposedCastles) castles.delete(key);
        return { penalty: Math.max(0, -ledgerScore(multiplayerLedger(initial, final, self))) + exposurePenalty, commanders, complete: complete && rolloutComplete, staticComplete: complete, lethalActors, expandedChains, staticCoveredUnits, coreChains, adaptiveClosures, retainedCastles: castles };
    }

    getAction(engine: GameEngine, playerId: number): Action {
        const start = performance.now();
        const head = this.memory.queue[0];
        if (head && head.state.currentPlayer === playerId && !engine.isTerminal() && engine.matchesState(head.state) && engine.hasLegalAction(playerId, head.action)) {
            // 完整前态及当前权威合法性均重新核对，验证只返回布尔值，不复制快照或菜单。
            this.memory.queue.shift(); this.telemetry.queued = true; return head.action;
        }
        const state = engine.getState();
        if (state.currentPlayer !== playerId || engine.isTerminal()) throw Error('搜索只能为当前玩家行动');
        const legal = engine.getLegalActions(playerId).filter(a => a.type !== 'surrender');
        this.memory.queue = []; this.nodes = 0;
        this.recruitmentPolicy.reset();
        this.telemetry = freshTelemetry();
        // 主搜索使用880ms，真实反扑最晚950ms收口，外部门槛仍为1000ms。
        this.deadline = start + Math.min(880, this.options.budgetMs ?? 880); this.tierOneEnd = start + (this.deadline - start) * .42;
        this.retaliationLimit = start + Math.min(950, (this.deadline - start) + 70);
        if (legal.length === 1) return legal[0];
        const roots = this.candidateRoots(engine, 12, true);
        if (!roots.length) throw Error('没有可用搜索候选');
        const root: Branch = { engine, queue: [], prior: 0, score: 0, actors: [] }, width = this.options.beamWidth ?? 6;
        let beam: Branch[] = [], primary: Branch | undefined, primaryFirstUnit: Branch | undefined;
        const cheapScore = (b: Branch) => ledgerScore(multiplayerLedger(state, b.engine.getState(), playerId, b.recruitment)) + b.prior;
        for (const [i, candidate] of roots.entries()) {
            if (performance.now() >= this.tierOneEnd) break;
            const complete = this.complete(root, candidate.action, playerId, i === 0);
            for (const b of complete) { b.prior += Math.max(-10, Math.min(10, candidate.score)) * .08; b.score = cheapScore(b); }
            if (i === 0) {
                primary = primaryFirstUnit = complete[0];
                // 基准逐单位使用真实网络推进，与挑战案共享相同的行动深度。
                for (let u = 1; primary && u < (this.options.maxUnits ?? 3) && performance.now() < this.tierOneEnd; u++) {
                    const pState = primary.engine.getState();
                    if (primary.engine.isTerminal() || pState.currentPlayer !== playerId || pState.turn !== state.turn) break;
                    const nextRoots = this.candidateRoots(primary.engine, 1, true);
                    if (!nextRoots.length) break;
                    const nextComplete = this.complete(primary, nextRoots[0].action, playerId, true);
                    if (!nextComplete.length) break;
                    primary = nextComplete[0];
                    primary.prior += Math.max(-10, Math.min(10, nextRoots[0].score)) * .08;
                    primary.score = cheapScore(primary);
                }
                if (primary) beam.push(primary);
            }
            beam.push(...complete);
        }
        beam.sort((a, b) => b.score - a.score); beam = beam.slice(0, width);
        for (let unit = 1; unit < (this.options.maxUnits ?? 3) && performance.now() < this.tierOneEnd && this.nodes < (this.options.maxNodes ?? 260); unit++) {
            const expanded: Branch[] = [...beam];
            for (const b of beam) {
                if (b.actors.length >= (this.options.maxUnits ?? 3) || b.engine.isTerminal() || b.engine.getState().currentPlayer !== playerId || b.engine.getState().turn !== state.turn || performance.now() >= this.tierOneEnd) continue;
                for (const candidate of this.candidateRoots(b.engine, 8, false)) {
                    for (const child of this.complete(b, candidate.action, playerId)) { child.prior += Math.max(-10, Math.min(10, candidate.score)) * .08; child.score = cheapScore(child); expanded.push(child); }
                    if (this.nodes >= (this.options.maxNodes ?? 260) || performance.now() >= this.tierOneEnd) break;
                }
            }
            expanded.sort((a, b) => b.score - a.score); beam = expanded.slice(0, width);
        }
        if (primary && !beam.includes(primary)) beam.push(primary);
        let best = primary, bestScore = -Infinity, decision: 'veto' | 'takeover' | null = null;
        const evaluations: (BranchEvidence & { branch: Branch; value: number })[] = [];
        // 决赛圈按剩余时间收口；双人最多四案，多人最多三案，每案保留反扑与叶价值窗口。
        const primaryEnded = primary && (primary.engine.isTerminal() || primary.engine.getState().currentPlayer !== playerId || primary.engine.getState().turn !== state.turn);
        const planKey = (b: Branch) => b.queue.map(q => encodeAction(q.action)).join(';');
        const seenPlans = new Set(primary ? [planKey(primary)] : []);
        const comparable = beam.filter(b => {
            if (b === primary || !(b.actors.length === primary?.actors.length || primaryEnded || b.engine.isTerminal() || b.engine.getState().currentPlayer !== playerId || b.engine.getState().turn !== state.turn)) return false;
            const key = planKey(b); if (seenPlans.has(key)) return false;
            seenPlans.add(key); return true;
        });
        const comparisonDeadline = this.deadline, remainingMs = Math.max(0, comparisonDeadline - 50 - performance.now());
        const finalists = Math.max(1, Math.min(state.players.filter(p => p.isAlive).length > 2 ? 3 : 4, Math.floor(remainingMs / 110)));
        const ordered = (primary ? [primary, ...comparable] : beam).slice(0, finalists);
        // 双方监控根态同一批现有友军；仅换一批行动者不能伪造“救活”前线单位。
        const monitoredActors = state.units.filter(u => u.hp > 0 && areAlliedPlayers(state, playerId, u.ownerId)).map(u => u.id);
        this.telemetry.primaryUnits = primary?.actors.length ?? 0;
        this.telemetry.plannedFinalists = ordered.length;
        const opportunityMs = Math.max(0, (comparisonDeadline - 50 - performance.now()) / Math.max(1, ordered.length));
        for (const b of ordered) {
            // 基准必须实际核验；挑战案只有仍能获得完整220ms反扑窗口时才进入决赛。
            // 未进入的候选单列，不能把已经启动却失败的核心链改记为完成。
            if (evaluations.length > 0 && performance.now() > this.retaliationLimit - 220) {
                this.telemetry.budgetSkippedCandidates = ordered.length - evaluations.length;
                break;
            }
            const candidateDeadline = Math.min(comparisonDeadline - 50, performance.now() + opportunityMs);
            const after = b.engine.getState();
            // 先完成真实反扑，再用该候选剩余额度做叶价值前向。
            this.deadline = candidateDeadline;
            const risk = this.retaliation(b, playerId, monitoredActors);
            this.deadline = comparisonDeadline;
            let value = 0;
            if (b.engine.isTerminal()) value = after.winner === -1 ? 0 : after.winner === getAllianceId(after, playerId) ? 1 : -1;
            else if (risk.complete && performance.now() < candidateDeadline - 45) {
                const observation = encodeDualObservation(after, b.engine.getLegalActions(after.currentPlayer).filter(a => a.type !== 'surrender'));
                const mix = this.options.valueCalibration?.parentMixture ?? 0, parent = this.options.parentValueModel;
                if (mix > 0 && !parent) throw Error('缺少父代价值模型');
                // 完全沿用父代价值时只执行一次父代前向；策略仍由当前代选择。
                const output = mix === 1 ? parent!.forward(observation) : this.model.forward(observation);
                const parentLogits = mix > 0 ? mix === 1 ? output.valueLogits : parent!.forward(observation).valueLogits : undefined;
                const probs = this.options.valueCalibration ? calibrateValue(output.valueLogits, observation.playerOrder.active, valueCalibrationFeatures(after, observation.playerOrder), this.options.valueCalibration, parentLogits) : output.valueProbs;
                value = computeScalarValue(probs, after, observation.playerOrder, playerId);
            }
            this.telemetry.risks.push({ penalty: risk.penalty, expandedChains: risk.expandedChains, staticCoveredUnits: risk.staticCoveredUnits, complete: risk.complete, staticComplete: risk.staticComplete, opportunityMs, coreChains: risk.coreChains, adaptiveClosures: risk.adaptiveClosures });
            // 根态的每位指挥官都纳入守卫，包括在己方分支中已经阵亡的指挥官。
            for (const u of state.units) if (areAlliedPlayers(state, playerId, u.ownerId) && isCommanderUnit(state, u) && !risk.commanders.has(u.id)) risk.commanders.set(u.id, 0);
            this.telemetry.retaliationAttempts++; this.telemetry.retaliationComplete += Number(risk.complete);
            this.telemetry.comparedUnits.push(b.actors.length);
            const ledger = multiplayerLedger(state, after, playerId, b.recruitment);
            const allyCastlesLost = [...retainedCastles(state, playerId)].filter(key => !(risk.retainedCastles ?? retainedCastles(after, playerId)).has(key)).length;
            evaluations.push({ branch: b, value, ledger, allyCastlesLost, ledgerScore: ledgerScore(ledger), supports: b.queue.filter(q => q.action.type === 'support').length, lethalActors: risk.lethalActors, score: ledgerScore(ledger) + value * 2 - risk.penalty - allyCastlesLost * 100, health: risk.commanders, complete: risk.complete });
        }
        const baseline = evaluations.find(e => e.branch === primary);
        bestScore = baseline?.score ?? -Infinity;
        for (const e of evaluations) {
            if (!baseline || e === baseline) continue;
            const allowed = takeoverDecision(baseline, e, this.options.takeoverMargin ?? .35);
            const current = evaluations.find(x => x.branch === best);
            if (allowed && (best === primary || (e.allyCastlesLost ?? 0) < (current?.allyCastlesLost ?? 0) || (e.allyCastlesLost ?? 0) === (current?.allyCastlesLost ?? 0) && e.score > bestScore)) { best = e.branch; bestScore = e.score; decision = allowed; }
        }
        if (!best?.queue.length) return roots[0].action;
        // 根内部仍比较三单位协同；只兑现胜出方案首单位，下个单位基于最新局面重搜。
        const firstEnd = best.unitEnds?.[0] ?? (best === primary ? primaryFirstUnit?.queue.length : undefined) ?? best.queue.length;
        this.memory.queue = best.queue.slice(1, firstEnd).map(q => {
            let cached: string | undefined;
            return { state: q.state, action: q.action, get expectedStateHash() { return cached ??= queueStateKey(q.state); } };
        });
        this.telemetry.nodes = this.nodes; this.telemetry.rootMs = performance.now() - start; this.telemetry.selectedUnits = best.actors.length;
        this.telemetry.takeover = decision === 'takeover'; this.telemetry.veto = decision === 'veto';
        this.telemetry.rootValue = evaluations.find(e => e.branch === best)?.value ?? 0;
        return best.queue[0].action;
    }
}
