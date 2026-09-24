/**
 * V13/T13-06: is the search's inability to differ from the heuristic a THRESHOLD problem
 * or a SIGNAL problem?
 *
 * `teacher_agreement.ts` found that BattleSearchAI agreed with a plain HeuristicAI on
 * 120/120 decisions across four maps, with the takeover branch never firing. Two very
 * different causes would produce that:
 *
 *   (a) THRESHOLD. The leaves do differ, but never by `takeoverThreshold` (1200), so the
 *       kernel always falls back. Fixing the config would fix the teacher.
 *   (b) SIGNAL. Even when forced to take the best leaf unconditionally, the chosen action
 *       is still the heuristic's. Then no threshold can help and the mechanism is inert.
 *
 * This probe answers it directly: it compares, per decision, the action the kernel returns
 * with the default threshold against the action the best-of-topK leaf would pick with the
 * threshold set to 0 (i.e. always take over). If those agree, the problem is (b).
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/teacher_signal_probe.ts \
 *     --plan sd-normal --map "(2) Duel.aem" --seed 2026070501 --decisions 30
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

const SEARCH_SEED = 2026070501;

async function main(): Promise<void> {
    const plan = arg('--plan', 'sd-normal');
    const map = arg('--map', '(2) Duel.aem');
    const seed = Number(arg('--seed', '2026070501'));
    const seat = Number(arg('--seat', '0'));
    const maxDecisions = Number(arg('--decisions', '30'));
    const out = arg('--out', 'v13/out/v13_20260924_t13/T13-06/teacher_signal_probe.json');

    const created = await createEvaluationState({ id: 1, map, plan, seed, seat } as any);
    const env = created.env as any;
    const engine = env.getEngine();

    // Three kernels over the same states:
    //   default      : shipped thresholds
    //   forcedTakeover: threshold 0 and dangerLine +inf, so the best leaf always wins
    //   widerTopK    : forced takeover over a much larger candidate set
    const kernels = {
        default: new BattleSearchAI(SEARCH_SEED, { topK: 10, oppProbeK: 6, friendlyRolloutSteps: 3 }),
        forcedTakeover: new BattleSearchAI(SEARCH_SEED, {
            topK: 10, oppProbeK: 6, friendlyRolloutSteps: 3,
            takeoverThreshold: 0, vetoMargin: 0, dangerLine: Number.POSITIVE_INFINITY,
        }),
        widerTopK: new BattleSearchAI(SEARCH_SEED, {
            topK: 64, oppProbeK: 6, friendlyRolloutSteps: 3,
            takeoverThreshold: 0, vetoMargin: 0, dangerLine: Number.POSITIVE_INFINITY,
        }),
    };
    const heuristic = new HeuristicAI(mulberry(seed ^ 0x5bf03635));

    const rows: any[] = [];
    let decisions = 0;
    let forcedTakeoverSameAsDefault = 0;
    let forcedTakeoverSameAsHeuristic = 0;
    let widerSameAsHeuristic = 0;
    let widerDiffersFromForced = 0;

    while (!engine.isTerminal() && decisions < maxDecisions) {
        const state = engine.getState();
        const p = state.currentPlayer;
        const legal: Action[] = engine.getLegalActions(p).filter((a: Action) => a.type !== 'surrender');
        if (legal.length >= 2) {
            const heurCode = code(new HeuristicAI(mulberry(seed ^ 0x5bf03635)).getAction(engine, p, legal));
            const defCode = code(kernels.default.getAction(engine, p, legal));
            const forcedCode = code(kernels.forcedTakeover.getAction(engine, p, legal));
            const widerCode = code(kernels.widerTopK.getAction(engine, p, legal));

            if (forcedCode === defCode) forcedTakeoverSameAsDefault++;
            if (forcedCode === heurCode) forcedTakeoverSameAsHeuristic++;
            if (widerCode === heurCode) widerSameAsHeuristic++;
            if (widerCode !== forcedCode) widerDiffersFromForced++;

            rows.push({
                decision: decisions, turn: state.turn, playerId: p, legalCount: legal.length,
                heuristicAction: heurCode,
                defaultKernelAction: defCode,
                forcedTakeoverAction: forcedCode,
                widerTopKAction: widerCode,
                forcedTakeoverDiffersFromHeuristic: forcedCode !== heurCode,
                widerTopKDiffersFromHeuristic: widerCode !== heurCode,
            });
            decisions++;
        }
        engine.step(heuristic.getAction(engine, p, undefined) ?? ({ type: 'end_turn' } as Action));
    }

    const report = {
        schema: 'v13_teacher_signal_probe_1',
        generatedAt: new Date().toISOString(),
        scenario: { plan, map, seed, seat, subject: created.subjectId, players: created.players },
        decisionsProbed: decisions,
        comparisons: {
            forcedTakeoverEqualsDefaultThreshold: forcedTakeoverSameAsDefault,
            forcedTakeoverEqualsHeuristic: forcedTakeoverSameAsHeuristic,
            widerTopK64ForcedTakeoverEqualsHeuristic: widerSameAsHeuristic,
            widerTopK64DiffersFromForcedTopK10: widerDiffersFromForced,
        },
        interpretation: {
            thresholdProblemIf: 'forcedTakeoverDiffersFromHeuristic is materially above zero, i.e. '
                + 'the leaves do carry a signal and only the shipped threshold hides it',
            signalProblemIf: 'forcedTakeoverEqualsHeuristic == decisionsProbed, i.e. even when the '
                + 'kernel is forced to take its best leaf it returns the heuristic action, so no '
                + 'threshold setting can make this a distinct teacher',
            widerTopKProbe: 'topK 64 with forced takeover tests whether the signal is merely '
                + 'outside the 10 pre-ranked candidates',
        },
        rows,
    };
    writeAtomic(out, report);

    console.log(`[T13-06] decisions=${decisions}`);
    console.log(`[T13-06] forced-takeover == default-threshold : ${forcedTakeoverSameAsDefault}/${decisions}`);
    console.log(`[T13-06] forced-takeover == heuristic        : ${forcedTakeoverSameAsHeuristic}/${decisions}`);
    console.log(`[T13-06] topK64 forced   == heuristic        : ${widerSameAsHeuristic}/${decisions}`);
    console.log(`[T13-06] topK64 forced   != topK10 forced    : ${widerDiffersFromForced}/${decisions}`);
    console.log(`[T13-06] wrote ${out}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
