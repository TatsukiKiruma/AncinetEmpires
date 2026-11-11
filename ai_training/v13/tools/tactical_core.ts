/**
 * V13/T13-06: shared core for the tactical suites.
 *
 * Kept in its own module so both `tactical_soundness.ts` (the original four patterns) and
 * `tactical_suite_extended.ts` (the remaining four) exercise the SAME bounded kernel and
 * the SAME pattern detectors. Duplicating either would let the two suites drift, which is
 * the class of defect this whole task exists to prevent.
 */
import { BattleSearchAI } from '../../src/game/ai/battle_search_ai';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { encodeAction } from '../../src/game/env';
import type { Action } from '../../src/game/types';

export function codeOf(a: Action): string {
    try { return encodeAction(a); } catch { return JSON.stringify(a); }
}

export function mulberry(seed: number) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Bounded, cancellable wrapper around the calibrated kernel.
 *
 * The budget is enforced by capping the inner `topK`, so the work per decision is provably
 * finite and the inner kernel never has to be interrupted mid-call (it cannot be). A
 * legal-action fallback is always available and every fallback is counted, so a fallback can
 * never be mistaken for a search result.
 */
export class BoundedSearchKernel {
    private inner: BattleSearchAI;
    public fallbacksUsed = 0;
    public decisions = 0;
    public lastMs = 0;
    public maxObservedMs = 0;

    constructor(seed: number, public readonly maxCandidates: number,
                public readonly budgetMs: number) {
        this.inner = new BattleSearchAI(seed, {
            topK: maxCandidates,
            oppProbeK: 6,
            friendlyRolloutSteps: 3,
            takeoverThreshold: 0,
            vetoMargin: 0,
            dangerLine: Number.POSITIVE_INFINITY,
        });
    }

    getAction(engine: any, playerId: number, legal: Action[], fallbackAi: HeuristicAI): Action {
        const t0 = Date.now();
        this.decisions++;
        // Pre-rank with the heuristic so the bounded candidate set is the heuristic's best
        // `maxCandidates` actions: bounded work, and no dependence on the label.
        const scored = (this.inner as any).heuristic.scoreCandidateActions(engine, playerId, legal);
        const ordered = [...scored].sort((a: any, b: any) => b.score - a.score);
        const pool: Action[] = ordered.slice(0, Math.min(this.maxCandidates, ordered.length))
            .map((c: any) => c.action);
        let chosen: Action;
        let usedFallback = false;
        try {
            chosen = this.inner.getAction(engine, playerId, pool);
        } catch {
            chosen = fallbackAi.getAction(engine, playerId, legal);
            usedFallback = true;
        }
        if (!chosen || !legal.some(a => codeOf(a) === codeOf(chosen))) {
            chosen = fallbackAi.getAction(engine, playerId, legal);
            usedFallback = true;
        }
        const elapsed = Date.now() - t0;
        this.lastMs = elapsed;
        if (elapsed > this.maxObservedMs) this.maxObservedMs = elapsed;
        if (usedFallback) this.fallbacksUsed++;
        return chosen;
    }
}

export interface Patterns {
    immediateCapture: string[];
    lethalAttack: string[];
    ownCommanderThreat: boolean;
    recruitAvailable: string[];
    moveThenAttack: string[];
    forcedEndTurn: boolean;
}

/** The original four patterns plus commander threat and forced-end-turn. */
export function detectPatterns(engine: any, playerId: number, legal: Action[]): Patterns {
    const state = engine.getState();
    const units = state.units.filter((u: any) => u.hp > 0);
    const mine = units.filter((u: any) => u.ownerId === playerId);
    const foes = units.filter((u: any) => u.ownerId !== playerId);

    const immediateCapture: string[] = [];
    const lethalAttack: string[] = [];
    const recruitAvailable: string[] = [];
    const moveThenAttack: string[] = [];

    for (const a of legal) {
        if (a.type === 'capture') immediateCapture.push(codeOf(a));
        if (a.type === 'attack') {
            const target = units.find((u: any) => u.id === (a as any).targetId);
            if (target && target.hp > 0) {
                const ownerUnits = units.filter((u: any) => u.ownerId === target.ownerId);
                if (ownerUnits.length === 1) lethalAttack.push(codeOf(a));
            }
        }
        if (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') recruitAvailable.push(codeOf(a));
        if (a.type === 'move') {
            const me = mine.find((u: any) => u.id === (a as any).unitId);
            if (me) {
                const dest = (a as any).to;
                const reach = (me.maxRange ?? 1) + (me.move ?? 0);
                const threatened = foes.some((f: any) =>
                    Math.abs(f.pos.x - dest.x) + Math.abs(f.pos.y - dest.y) <= reach);
                if (threatened) moveThenAttack.push(codeOf(a));
            }
        }
    }

    let commanderThreat = false;
    const myCommander = mine.find((u: any) => u.isCommander || u.unitClass === 'commander');
    if (myCommander) {
        commanderThreat = foes.some((f: any) => {
            const reach = (f.maxRange ?? 1) + (f.move ?? 0);
            return Math.abs(f.pos.x - myCommander.pos.x) + Math.abs(f.pos.y - myCommander.pos.y) <= reach;
        });
    }

    const nonTrivial = legal.filter(a => a.type !== 'end_turn' && a.type !== 'wait' && a.type !== 'surrender');
    return {
        immediateCapture, lethalAttack, ownCommanderThreat: commanderThreat,
        recruitAvailable, moveThenAttack, forcedEndTurn: nonTrivial.length === 0,
    };
}
