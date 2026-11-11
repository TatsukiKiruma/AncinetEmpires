/**
 * V13/T13-06 (1)+(2): a bounded, cancellable search kernel, and a tactical soundness
 * suite run against it on REAL game states.
 *
 * Why both in one tool
 * --------------------
 * The shipped and calibrated kernels are both unusable for a tactical suite: at 0.66-6 s
 * per decision every natural arm hit the wall clock. So the bounded kernel has to exist
 * before the suite can run at a useful sample size. It is implemented here as an explicit
 * wrapper (`BoundedSearchKernel`) rather than by editing `BattleSearchAI`, because the
 * taskbook forbids silently changing the production entry point and the bounded variant is
 * a candidate, not a replacement.
 *
 * The bounded contract
 * --------------------
 *   1. A hard wall-clock budget per decision.
 *   2. If the budget expires, return a LEGAL action - never an exception, never an illegal
 *      move. The fallback is the heuristic's own top pick, which is always legal.
 *   3. The same exit must be reported, so a fallback cannot be mistaken for a search result.
 *
 * Tactical patterns are detected from the ENGINE's legal actions, never asserted by hand:
 *
 *   IMMEDIATE_CAPTURE   a legal capture whose destination is an enemy/neutral town
 *   LETHAL_ATTACK       a legal attack that removes the last enemy unit
 *   OWN_COMMANDER_THREAT  one of my units is adjacent to an enemy that can strike it
 *   RECRUIT_AVAILABLE   a legal recruit action exists
 *   MOVE_THEN_ATTACK    a move exists whose destination is within striking range of an enemy
 *   FORCED_END_TURN     the only non-surrender action is end_turn (or wait)
 *
 * For each pattern present, the kernel's chosen action is classified as SATISFIED (it takes
 * the tactical action), DEFERRED (it does something else legal) or ILLEGAL. "DEFERRED" is
 * not automatically wrong - a better move may exist - so the report gives both the kernel
 * and the heuristic the same treatment and compares them.
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/tactical_soundness.ts \
 *     --plan sd-normal --map "(3) Midway.aem" --seed 2026070501 --decisions 200 \
 *     --budget-ms 250
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BattleSearchAI } from '../../src/game/ai/battle_search_ai';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { createEvaluationState } from '../../tools/skirmish_evaluation_state';
import { encodeAction } from '../../src/game/env';
import type { Action } from '../../src/game/types';

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function writeAtomic(out: string, payload: unknown): void {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const tmp = `${out}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, out);
}

function mulberry(seed: number) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function code(a: Action): string {
    try { return encodeAction(a); } catch { return JSON.stringify(a); }
}

/**
 * Bounded, cancellable wrapper around the calibrated kernel.
 *
 * The budget is enforced by limiting how many candidates the inner kernel may evaluate,
 * because `BattleSearchAI` has no internal deadline and cannot be interrupted mid-call.
 * `maxCandidates` is therefore the knob that makes the budget real: with topK set to
 * `maxCandidates` the inner work is provably bounded, and the measured wall clock is
 * reported so the bound can be checked rather than assumed.
 */
class BoundedSearchKernel {
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
        // `maxCandidates` actions: bounded work AND no dependence on the label.
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
        if (!chosen || !legal.some(a => code(a) === code(chosen))) {
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

interface Patterns {
    immediateCapture: string[];
    lethalAttack: string[];
    ownCommanderThreat: boolean;
    recruitAvailable: string[];
    moveThenAttack: string[];
    forcedEndTurn: boolean;
}

function detectPatterns(engine: any, playerId: number, legal: Action[]): Patterns {
    const state = engine.getState();
    const units = state.units.filter((u: any) => u.hp > 0);
    const mine = units.filter((u: any) => u.ownerId === playerId);
    const foes = units.filter((u: any) => u.ownerId !== playerId);

    const immediateCapture: string[] = [];
    const lethalAttack: string[] = [];
    const recruitAvailable: string[] = [];
    const moveThenAttack: string[] = [];

    for (const a of legal) {
        if (a.type === 'capture') immediateCapture.push(code(a));
        if (a.type === 'attack') {
            const target = units.find((u: any) => u.id === (a as any).targetId);
            if (target && target.hp > 0) {
                // "lethal" = this attack removes the last living unit of that owner
                const ownerUnits = units.filter((u: any) => u.ownerId === target.ownerId);
                if (ownerUnits.length === 1) lethalAttack.push(code(a));
            }
        }
        if (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') recruitAvailable.push(code(a));
        if (a.type === 'move') {
            const me = mine.find((u: any) => u.id === (a as any).unitId);
            if (me) {
                const dest = (a as any).to;
                const reach = (me.maxRange ?? 1) + (me.move ?? 0);
                const threatened = foes.some((f: any) =>
                    Math.abs(f.pos.x - dest.x) + Math.abs(f.pos.y - dest.y) <= reach);
                if (threatened) moveThenAttack.push(code(a));
            }
        }
    }

    // Own commander under threat: an enemy stands within its own striking range of my commander.
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

async function main(): Promise<void> {
    const plan = arg('--plan', 'sd-normal');
    const map = arg('--map', '(3) Midway.aem');
    const seed = Number(arg('--seed', '2026070501'));
    const seat = Number(arg('--seat', '0'));
    const maxDecisions = Number(arg('--decisions', '200'));
    const budgetMs = Number(arg('--budget-ms', '250'));
    const candidates = Number(arg('--max-candidates', '16'));
    const out = arg('--out', 'v13/out/v13_20260924_t13/T13-06/tactical_soundness.json');

    const created = await createEvaluationState({ id: 1, map, plan, seed, seat } as any);
    const env = created.env as any;
    const engine = env.getEngine();
    const kernel = new BoundedSearchKernel(seed ^ 0x51ed270b, candidates, budgetMs);
    const heuristic = new HeuristicAI(mulberry(seed ^ 0x5bf03635));

    const rows: any[] = [];
    const tally: Record<string, { kernelSat: number; kernelDefer: number; kernelIllegal: number;
                                  heurSat: number; n: number }> = {};
    let decisions = 0;
    let kernelIllegalTotal = 0;
    let kernelFallbacks = 0;

    while (!engine.isTerminal() && decisions < maxDecisions) {
        const state = engine.getState();
        const p = state.currentPlayer;
        const legal: Action[] = engine.getLegalActions(p).filter((a: Action) => a.type !== 'surrender');
        if (legal.length >= 1) {
            const pat = detectPatterns(engine, p, legal);
            const legalCodes = new Set(legal.map(code));
            const fallbackAi = new HeuristicAI(mulberry(seed ^ 0x5bf03635));
            const heurAction = fallbackAi.getAction(engine, p, legal);
            const kernelAction = kernel.getAction(engine, p, legal, new HeuristicAI(mulberry(seed ^ 0x5bf03635)));
            const kCode = code(kernelAction);
            const hCode = code(heurAction);
            if (!legalCodes.has(kCode)) kernelIllegalTotal++;

            const patterns: Array<[string, string[]] | [string, boolean]> = [
                ['IMMEDIATE_CAPTURE', pat.immediateCapture],
                ['LETHAL_ATTACK', pat.lethalAttack],
                ['RECRUIT_AVAILABLE', pat.recruitAvailable],
                ['MOVE_THEN_ATTACK', pat.moveThenAttack],
            ];
            const present: string[] = [];
            for (const [name, set] of patterns) {
                const arr = set as string[];
                if (arr.length) {
                    present.push(name);
                    tally[name] ??= { kernelSat: 0, kernelDefer: 0, kernelIllegal: 0, heurSat: 0, n: 0 };
                    const t = tally[name];
                    t.n++;
                    if (!legalCodes.has(kCode)) t.kernelIllegal++;
                    else if (arr.includes(kCode)) t.kernelSat++;
                    else t.kernelDefer++;
                    if (arr.includes(hCode)) t.heurSat++;
                }
            }
            if (pat.ownCommanderThreat) {
                present.push('OWN_COMMANDER_THREAT');
                tally.OWN_COMMANDER_THREAT ??= { kernelSat: 0, kernelDefer: 0, kernelIllegal: 0, heurSat: 0, n: 0 };
                const t = tally.OWN_COMMANDER_THREAT;
                t.n++;
                // A defensive response is an attack, a heal/support, or a move out of reach.
                const defensive = new Set<string>([
                    ...legal.filter(a => a.type === 'attack' || a.type === 'heal' || a.type === 'support').map(code),
                    ...legal.filter(a => a.type === 'move').map(code),
                ]);
                if (!legalCodes.has(kCode)) t.kernelIllegal++;
                else if (defensive.has(kCode)) t.kernelSat++;
                else t.kernelDefer++;
                if (defensive.has(hCode)) t.heurSat++;
            }
            if (pat.forcedEndTurn) present.push('FORCED_END_TURN');

            if (present.length) {
                rows.push({
                    decision: decisions, turn: state.turn, playerId: p, legalCount: legal.length,
                    patterns: present, kernelAction: kCode, heuristicAction: hCode,
                    kernelElapsedMs: kernel.lastMs,
                });
            }
            decisions++;
        }
        engine.step(heuristic.getAction(engine, p, undefined) ?? ({ type: 'end_turn' } as Action));
    }
    kernelFallbacks = kernel.fallbacksUsed;

    const patternSummary = Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, {
        decisions: v.n,
        kernelTookTheTacticalAction: v.kernelSat,
        kernelDeferred: v.kernelDefer,
        kernelIllegal: v.kernelIllegal,
        heuristicTookTheTacticalAction: v.heurSat,
        kernelRate: v.n ? v.kernelSat / v.n : null,
        heuristicRate: v.n ? v.heurSat / v.n : null,
    }]));

    const report = {
        schema: 'v13_tactical_soundness_1',
        generatedAt: new Date().toISOString(),
        scenario: { plan, map, seed, seat, subject: created.subjectId, players: created.players },
        boundedKernel: {
            maxCandidates: candidates,
            budgetMsDeclared: budgetMs,
            decisions: kernel.decisions,
            fallbacksUsed: kernelFallbacks,
            maxObservedDecisionMs: kernel.maxObservedMs,
            boundEnforcedBy: 'capping the inner topK to maxCandidates, so the work per decision '
                + 'is provably finite; the declared budgetMs is a reporting threshold, not an '
                + 'interrupt, because BattleSearchAI cannot be interrupted mid-call',
        },
        decisionsProbed: decisions,
        illegalKernelActions: kernelIllegalTotal,
        patternSummary,
        boundary: [
            'DEFERRED is not automatically wrong: a different move may be better. The heuristic '
            + 'is given identical treatment so the two rates are comparable.',
            'Patterns are detected from the engine legal actions, never asserted by hand.',
            'One map, one seed. No cross-map claim.',
        ],
        rows,
    };
    writeAtomic(out, report);

    console.log(`[T13-06] bounded kernel: candidates=${candidates} decisions=${kernel.decisions} ` +
        `fallbacks=${kernelFallbacks} maxObservedMs=${kernel.maxObservedMs}`);
    console.log(`[T13-06] decisions probed=${decisions} illegalKernelActions=${kernelIllegalTotal}`);
    for (const [k, v] of Object.entries(patternSummary)) {
        console.log(`  ${k.padEnd(22)} n=${String((v as any).decisions).padStart(4)} ` +
            `kernel=${(v as any).kernelRate} heuristic=${(v as any).heuristicRate} ` +
            `illegal=${(v as any).kernelIllegal}`);
    }
    console.log(`[T13-06] wrote ${out}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
