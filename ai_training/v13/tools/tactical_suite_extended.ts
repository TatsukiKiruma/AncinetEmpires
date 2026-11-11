/**
 * V13/T13-06: the remaining four tactical patterns, run against the calibrated bounded
 * kernel alongside the originals.
 *
 * `tactical_soundness.ts` covers IMMEDIATE_CAPTURE, LETHAL_ATTACK, RECRUIT_AVAILABLE,
 * MOVE_THEN_ATTACK, OWN_COMMANDER_THREAT and FORCED_END_TURN. The taskbook also names
 * minimum-range and counterattack, castle/pending, end-turn timing, and the next actor's
 * threat in multi-player games. Those four are added here.
 *
 * Every pattern is computed from the ENGINE's state and legal actions. No position is
 * hand-authored and no pattern asserts what the "right" move is beyond an observable
 * tactical property.
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/tactical_suite_extended.ts \
 *     --plan sd-normal --map "(3) Midway.aem" --seed 2026070501 --decisions 200
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BattleSearchAI } from '../../src/game/ai/battle_search_ai';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { createEvaluationState } from '../../tools/skirmish_evaluation_state';
import { encodeAction } from '../../src/game/env';
import { getAllianceId } from '../../src/game/rule_config';
import type { Action } from '../../src/game/types';
import { BoundedSearchKernel, detectPatterns, codeOf } from './tactical_core';

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

interface ExtPatterns {
    /** An enemy stands closer than my ranged unit's minimum range: attacking it is illegal. */
    minRangePressure: boolean;
    /** Detail of the closest such enemy, for the failure replay. */
    minRangeDetail: any | null;
    /** A unit is pending placement, so a castle/deploy decision is open. */
    castlePending: boolean;
    /** Only moves remain, none of which can reach an enemy or a capturable town. */
    endTurnTiming: boolean;
    /** The next actor in turn order has a unit within striking range of one of mine. */
    nextActorThreat: boolean;
    nextActorDetail: any | null;
}

function detectExtended(engine: any, playerId: number, legal: Action[]): ExtPatterns {
    const state = engine.getState();
    const units = state.units.filter((u: any) => u.hp > 0);
    const mine = units.filter((u: any) => getAllianceId(state, u.ownerId) === getAllianceId(state, playerId));
    const foes = units.filter((u: any) => getAllianceId(state, u.ownerId) !== getAllianceId(state, playerId));

    // 1. Minimum-range pressure: a ranged unit of mine has an adjacent enemy it cannot shoot.
    let minRangeDetail: any = null;
    for (const m of mine) {
        const minR = m.minRange ?? 1;
        if (minR <= 1) continue;
        for (const f of foes) {
            const d = Math.abs(f.pos.x - m.pos.x) + Math.abs(f.pos.y - m.pos.y);
            if (d < minR && d > 0) {
                minRangeDetail = { unitId: m.id, minRange: minR, enemyId: f.id, distance: d };
                break;
            }
        }
        if (minRangeDetail) break;
    }

    // 2. Castle / pending: a placement decision is open.
    const castlePending = Boolean(state.pendingUnitId)
        || mine.some((u: any) => u.isPending)
        || legal.some(a => a.type === 'recruit_and_deploy' || (a as any).type === 'deploy');

    // 3. End-turn timing: all remaining actions are moves that reach no enemy and no
    //    capturable town, i.e. the turn has nothing left that changes the position.
    const nonMove = legal.filter(a => a.type !== 'move' && a.type !== 'end_turn'
        && a.type !== 'wait' && a.type !== 'surrender');
    let endTurnTiming = false;
    if (nonMove.length === 0 && legal.some(a => a.type === 'move')) {
        const towns = (state.map?.tiles ?? []).flat().filter((t: any) =>
            t && t.ownerId !== null && getAllianceId(state, t.ownerId) !== getAllianceId(state, playerId));
        endTurnTiming = !legal.some((a: Action) => {
            if (a.type !== 'move') return false;
            const me = mine.find((u: any) => u.id === (a as any).unitId);
            if (!me) return false;
            const dest = (a as any).to;
            const reach = (me.maxRange ?? 1);
            const hitsEnemy = foes.some((f: any) =>
                Math.abs(f.pos.x - dest.x) + Math.abs(f.pos.y - dest.y) <= reach);
            const hitsTown = towns.some((t: any) =>
                t.x === dest.x && t.y === dest.y);
            return hitsEnemy || hitsTown;
        });
    }

    // 4. Next actor threat: the player who moves next can strike one of mine.
    const turnOrder: number[] = (state.players ?? []).map((p: any) => p.id).sort((a: number, b: number) => a - b);
    let nextActorDetail: any = null;
    if (turnOrder.length > 2) {
        const idx = turnOrder.indexOf(state.currentPlayer);
        const nextPlayer = turnOrder[(idx + 1) % turnOrder.length];
        const theirUnits = units.filter((u: any) => u.ownerId === nextPlayer);
        for (const t of theirUnits) {
            const reach = (t.maxRange ?? 1) + (t.move ?? 0);
            for (const m of mine) {
                const d = Math.abs(t.pos.x - m.pos.x) + Math.abs(t.pos.y - m.pos.y);
                if (d <= reach) {
                    nextActorDetail = { nextPlayer, theirUnitId: t.id, myUnitId: m.id, distance: d, reach };
                    break;
                }
            }
            if (nextActorDetail) break;
        }
    }

    return {
        minRangePressure: minRangeDetail !== null,
        minRangeDetail,
        castlePending,
        endTurnTiming,
        nextActorThreat: nextActorDetail !== null,
        nextActorDetail,
    };
}

async function main(): Promise<void> {
    const plan = arg('--plan', 'sd-normal');
    const map = arg('--map', '(3) Midway.aem');
    const seed = Number(arg('--seed', '2026070501'));
    const seat = Number(arg('--seat', '0'));
    const maxDecisions = Number(arg('--decisions', '200'));
    const candidates = Number(arg('--max-candidates', '16'));
    const out = arg('--out', 'v13/out/v13_20260924_t13/T13-06/tactical_suite_extended.json');

    const created = await createEvaluationState({ id: 1, map, plan, seed, seat } as any);
    const env = created.env as any;
    const engine = env.getEngine();
    const kernel = new BoundedSearchKernel(seed ^ 0x51ed270b, candidates, 250);
    const heuristic = new HeuristicAI(mulberry(seed ^ 0x5bf03635));

    const tally: Record<string, any> = {};
    const rows: any[] = [];
    let decisions = 0;
    let illegal = 0;
    const failureReplays: any[] = [];

    const bump = (name: string, kernelSat: boolean, kernelIllegal: boolean, heurSat: boolean,
                  detail: any = null) => {
        tally[name] ??= { decisions: 0, kernelTookTheTacticalAction: 0, kernelDeferred: 0,
                          kernelIllegal: 0, heuristicTookTheTacticalAction: 0 };
        const t = tally[name];
        t.decisions++;
        if (kernelIllegal) t.kernelIllegal++;
        else if (kernelSat) t.kernelTookTheTacticalAction++;
        else t.kernelDeferred++;
        if (heurSat) t.heuristicTookTheTacticalAction++;
        if (!kernelSat && heurSat && failureReplays.length < 20) {
            failureReplays.push({ pattern: name, detail, turn: engine.getState().turn });
        }
    };

    while (!engine.isTerminal() && decisions < maxDecisions) {
        const state = engine.getState();
        const p = state.currentPlayer;
        const legal: Action[] = engine.getLegalActions(p).filter((a: Action) => a.type !== 'surrender');
        if (legal.length >= 1) {
            const legalCodes = new Set(legal.map(codeOf));
            const heurAction = new HeuristicAI(mulberry(seed ^ 0x5bf03635)).getAction(engine, p, legal);
            const kernelAction = kernel.getAction(engine, p, legal, new HeuristicAI(mulberry(seed ^ 0x5bf03635)));
            const kCode = codeOf(kernelAction);
            const hCode = codeOf(heurAction);
            const isIllegal = !legalCodes.has(kCode);
            if (isIllegal) illegal++;

            const ext = detectExtended(engine, p, legal);
            const base = detectPatterns(engine, p, legal);

            if (ext.minRangePressure) {
                // The tactical response is to reposition: any legal move, or an attack on a
                // DIFFERENT target that is inside range.
                const moves = legal.filter(a => a.type === 'move').map(codeOf);
                const legalAttacks = legal.filter(a => a.type === 'attack').map(codeOf);
                bump('MIN_RANGE_PRESSURE', moves.includes(kCode) || legalAttacks.includes(kCode),
                     isIllegal, moves.includes(hCode) || legalAttacks.includes(hCode), ext.minRangeDetail);
            }
            if (ext.castlePending) {
                const deploy = legal.filter(a => a.type === 'recruit_and_deploy'
                    || a.type === 'recruit_to_castle' || (a as any).type === 'deploy').map(codeOf);
                bump('CASTLE_PENDING', deploy.includes(kCode), isIllegal, deploy.includes(hCode));
            }
            if (ext.endTurnTiming) {
                bump('END_TURN_TIMING', kCode === hCode ? hCode.startsWith('end_turn') : kCode.startsWith('end_turn'),
                     isIllegal, hCode.startsWith('end_turn'));
            }
            if (ext.nextActorThreat) {
                // Sound responses: attack the threat, heal/support, or move out of reach.
                const sound = new Set<string>([
                    ...legal.filter(a => a.type === 'attack' || a.type === 'heal' || a.type === 'support').map(codeOf),
                    ...legal.filter(a => a.type === 'move').map(codeOf),
                ]);
                bump('MULTIPLAYER_NEXT_ACTOR_THREAT', sound.has(kCode), isIllegal, sound.has(hCode),
                     ext.nextActorDetail);
            }
            if (base.ownCommanderThreat) {
                const sound = new Set<string>([
                    ...legal.filter(a => a.type === 'attack' || a.type === 'heal' || a.type === 'support').map(codeOf),
                    ...legal.filter(a => a.type === 'move').map(codeOf),
                ]);
                bump('OWN_COMMANDER_THREAT', sound.has(kCode), isIllegal, sound.has(hCode));
            }
            if (base.immediateCapture.length) {
                bump('IMMEDIATE_CAPTURE', base.immediateCapture.includes(kCode), isIllegal,
                     base.immediateCapture.includes(hCode));
            }
            if (base.lethalAttack.length) {
                bump('LETHAL_ATTACK', base.lethalAttack.includes(kCode), isIllegal,
                     base.lethalAttack.includes(hCode));
            }
            decisions++;
        }
        engine.step(heuristic.getAction(engine, p, undefined) ?? ({ type: 'end_turn' } as Action));
    }

    const summary = Object.fromEntries(Object.entries(tally).map(([k, v]: any) => [k, {
        decisions: v.decisions,
        kernelTookTheTacticalAction: v.kernelTookTheTacticalAction,
        kernelDeferred: v.kernelDeferred,
        kernelIllegal: v.kernelIllegal,
        heuristicTookTheTacticalAction: v.heuristicTookTheTacticalAction,
        kernelRate: v.decisions ? v.kernelTookTheTacticalAction / v.decisions : null,
        heuristicRate: v.decisions ? v.heuristicTookTheTacticalAction / v.decisions : null,
    }]));

    const report = {
        schema: 'v13_teacher_tactical_suite_1',
        generatedAt: new Date().toISOString(),
        scenario: { plan, map, seed, seat, subject: created.subjectId, players: created.players },
        boundedKernel: {
            maxCandidates: candidates,
            decisions: kernel.decisions,
            fallbacksUsed: kernel.fallbacksUsed,
            maxObservedDecisionMs: kernel.maxObservedMs,
        },
        decisionsProbed: decisions,
        illegalKernelActions: illegal,
        patternsCovered: [
            'IMMEDIATE_CAPTURE', 'LETHAL_ATTACK', 'OWN_COMMANDER_THREAT', 'MIN_RANGE_PRESSURE',
            'CASTLE_PENDING', 'END_TURN_TIMING', 'MULTIPLAYER_NEXT_ACTOR_THREAT',
        ],
        summary,
        failureReplays,
        boundary: [
            'Every pattern is derived from the engine state and legal actions; none is hand-authored.',
            'DEFERRED is not automatically wrong: a different move may be better. The heuristic is '
            + 'given identical treatment so the two rates are comparable.',
            'One map, one seed. Directional.',
        ],
    };
    writeAtomic(out, report);

    console.log(`[T13-06] decisions=${decisions} illegal=${illegal} kernelMs_max=${kernel.maxObservedMs}`);
    for (const [k, v] of Object.entries(summary) as any) {
        console.log(`  ${k.padEnd(30)} n=${String(v.decisions).padStart(4)} ` +
            `kernel=${v.kernelRate === null ? 'n/a' : v.kernelRate.toFixed(3)} ` +
            `heuristic=${v.heuristicRate === null ? 'n/a' : v.heuristicRate.toFixed(3)}`);
    }
    console.log(`[T13-06] wrote ${out}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
