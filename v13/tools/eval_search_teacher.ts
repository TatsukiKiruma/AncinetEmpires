/**
 * V13/T13-06: paired natural games - calibrated search teacher vs plain heuristic.
 *
 * This is the only measurement that can qualify a teacher for distillation, because every
 * cheap probe in this toolchain (leaf margins, takeover counts, agreement rates) is a proxy
 * for the teacher's own objective, and the taskbook is explicit that proxy improvement and
 * win-rate improvement must be reported separately.
 *
 * Protocol (v3 semantics, reused deliberately):
 *   - one cached all-heuristic mirror per (scenario, seed), so seat rows are not
 *     independent observations
 *   - every seat the engine reports, not a hard-coded 0..3
 *   - per-seat deterministic streams; never Math.random
 *   - outcome taxonomy with NATURAL_DRAW and errors separated from truncations
 *   - WALL_TIMEOUT recorded as an undecided arm, never as a loss
 *   - takeover instrumentation, so "the search agreed with the heuristic every time" is
 *     visible in the result rather than inferred
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/eval_search_teacher.ts \
 *     --scenario "SDPLAN:sd-normal:(3) Midway.aem" --seeds 2026070501 \
 *     --max-steps 20000 --wall-timeout-ms 300000
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BattleSearchAI } from '../../src/game/ai/battle_search_ai';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { getAllianceId } from '../../src/game/rule_config';
import { classifyOutcome, isError, isNatural, type OutcomeKind } from './eval_v3_core';
import type { Action } from '../../src/game/types';

const UNPACK_DIR = 'APK/_analysis/unpack';
const SD_PLAN = 'training_configs/sd_training_plan_20260705.json';

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

function streamFor(seed: number, seat: number): () => number {
    let h = (seed >>> 0) ^ Math.imul(seat + 1, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return mulberry((h ^ (h >>> 16)) >>> 0);
}

/** Calibrated kernel: forced takeover over a candidate set wide enough to matter. */
const CALIBRATED = {
    topK: 64, oppProbeK: 8, friendlyRolloutSteps: 4,
    takeoverThreshold: 0, vetoMargin: 0, dangerLine: Number.POSITIVE_INFINITY,
} as const;

interface ArmResult {
    outcomeKind: OutcomeKind;
    winnerAllianceId: number | null;
    steps: number;
    turns: number;
    plies: number;
    decisions: number;
    /** How often the kernel's threshold branch fired instead of deferring to the heuristic. */
    takeoverCount: number;
    error: string | null;
    wallMs: number;
}

async function playOne(opts: {
    envFactory: any; scenarioId: string; seed: number; subjectSeat: number | null;
    maxSteps: number; wallTimeoutMs: number; searchOn: boolean;
}): Promise<ArmResult> {
    const { envFactory, scenarioId, seed, subjectSeat, maxSteps, wallTimeoutMs, searchOn } = opts;
    const fakeEpisode = {
        kind: 'skirmish_episode', version: 1,
        scenario: { id: scenarioId, mode: 'SD', mapName: scenarioId.split(':').pop(), resourcePath: '' },
        seed, maxPlies: 1200, maxSteps,
        initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
        players: [], policyByPlayer: {}, steps: [], summary: {},
    } as any;
    const env = await envFactory.createEnv(fakeEpisode);
    env.reset(seed);
    const engine = env.getEngine();

    const playerIds: number[] = engine.getState().players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
    const seatAi = new Map<number, HeuristicAI>();
    for (const s of playerIds) seatAi.set(s, new HeuristicAI(streamFor(seed, s)));
    // One search kernel per game, reused, exactly as the label tool uses it.
    const kernel = new BattleSearchAI(seed ^ 0x51ed270b, { ...CALIBRATED });

    const started = Date.now();
    let steps = 0;
    let decisions = 0;
    let takeoverCount = 0;
    let error: string | null = null;
    let wallTimeout = false;

    while (!engine.isTerminal() && steps < maxSteps) {
        if (Date.now() - started > wallTimeoutMs) { wallTimeout = true; break; }
        const st = engine.getState();
        const p = st.currentPlayer;
        let action: Action | null = null;
        try {
            if (searchOn && subjectSeat !== null && p === subjectSeat) {
                const legal: Action[] = engine.getLegalActions(p).filter((a: Action) => a.type !== 'surrender');
                const chosen = kernel.getAction(engine, p, legal);
                // Instrument the branch: did the kernel depart from the heuristic's top pick?
                const heurTop = (seatAi.get(p) as HeuristicAI).getAction(engine, p, legal);
                const same = JSON.stringify(chosen) === JSON.stringify(heurTop);
                if (!same) takeoverCount++;
                decisions++;
                action = chosen;
            } else {
                action = (seatAi.get(p) as HeuristicAI).getAction(engine, p, undefined);
            }
        } catch (err) {
            error = err instanceof Error ? err.message : String(err);
            break;
        }
        if (!action) { error = 'no action'; break; }
        try {
            engine.step(action);
        } catch (err) {
            error = err instanceof Error ? err.message : String(err);
            break;
        }
        steps++;
    }

    const state = engine.getState();
    const subjectAlliance = subjectSeat === null ? null : getAllianceId(state, subjectSeat);
    const playerCount = Math.max(1, playerIds.length);
    const currentIndex = Math.max(0, playerIds.indexOf(state.currentPlayer));
    const plies = Math.max(0, state.turn - 1) * playerCount + currentIndex + 1;

    return {
        outcomeKind: classifyOutcome({
            engineError: error && error !== 'no action' ? error : null,
            policyError: error === 'no action' ? error : null,
            cancelled: false, wallTimeout,
            winner: state.winner,
            winnerAlliance: state.winner === null ? null : state.winner,
            candidateAlliance: subjectAlliance,
            steps, maxSteps, plies, maxPlies: 1200,
        }),
        winnerAllianceId: state.winner,
        steps, turns: state.turn, plies, decisions, takeoverCount, error,
        wallMs: Date.now() - started,
    };
}

async function main(): Promise<void> {
    const scenarioId = arg('--scenario', 'SDPLAN:sd-normal:(3) Midway.aem');
    const seeds = arg('--seeds', '2026070501').split(',').map(Number).filter(Number.isFinite);
    const maxSteps = Number(arg('--max-steps', '20000'));
    const wallTimeoutMs = Number(arg('--wall-timeout-ms', '300000'));
    const out = arg('--out', 'v13/out/v13_20260924_t13/T13-06/eval_search_teacher.json');

    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN);
    const probe = await envFactory.createEnv({
        kind: 'skirmish_episode', version: 1,
        scenario: { id: scenarioId, mode: 'SD', mapName: scenarioId.split(':').pop(), resourcePath: '' },
        seed: seeds[0], maxPlies: 1200, maxSteps,
        initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
        players: [], policyByPlayer: {}, steps: [], summary: {},
    } as any);
    probe.reset(seeds[0]);
    const seats: number[] = probe.getEngine().getState().players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
    console.log(`[teacher-eval] scenario=${scenarioId} seats=[${seats}] seeds=[${seeds}]`);
    console.log(`[teacher-eval] calibrated kernel: ${JSON.stringify(CALIBRATED)}`);

    const mirrorCache = new Map<number, ArmResult>();
    for (const seed of seeds) {
        const m = await playOne({ envFactory, scenarioId, seed, subjectSeat: null, maxSteps, wallTimeoutMs, searchOn: false });
        mirrorCache.set(seed, m);
        console.log(`[teacher-eval] mirror seed=${seed} -> ${m.outcomeKind} winner=${m.winnerAllianceId} steps=${m.steps}`);
    }

    const rows: any[] = [];
    for (const seed of seeds) {
        const mirror = mirrorCache.get(seed)!;
        for (const seat of seats) {
            const arm = await playOne({ envFactory, scenarioId, seed, subjectSeat: seat, maxSteps, wallTimeoutMs, searchOn: true });
            const seatAlliance = (() => {
                const s = probe.getEngine().getState();
                return getAllianceId(s, seat);
            })();
            const mirrorWon = isNatural(mirror.outcomeKind) && mirror.outcomeKind === 'NATURAL_WIN'
                && mirror.winnerAllianceId === seatAlliance;
            const searchWon = arm.outcomeKind === 'NATURAL_WIN';
            rows.push({
                seed, seat, seatAlliance, mirrorOutcome: mirror.outcomeKind,
                search: arm, mirrorWonThisSeat: mirrorWon,
                delta: (searchWon ? 1 : 0) - (mirrorWon ? 1 : 0),
            });
            console.log(`[teacher-eval] seed=${seed} seat=P${seat} | SEARCH ${arm.outcomeKind} winner=${arm.winnerAllianceId} ` +
                `steps=${arm.steps} takeovers=${arm.takeoverCount}/${arm.decisions} | MIRROR ${mirror.outcomeKind} winner=${mirror.winnerAllianceId} | delta=${(searchWon ? 1 : 0) - (mirrorWon ? 1 : 0)}`);
        }
    }

    const naturalRows = rows.filter(r => isNatural(r.search.outcomeKind));
    const searchWins = naturalRows.filter(r => r.search.outcomeKind === 'NATURAL_WIN').length;
    const mirrorSeatWins = rows.filter(r => r.mirrorWonThisSeat).length;
    const totalTakeovers = rows.reduce((a, r) => a + r.search.takeoverCount, 0);
    const totalDecisions = rows.reduce((a, r) => a + r.search.decisions, 0);

    const report = {
        schema: 'v13_search_teacher_eval_1',
        generatedAt: new Date().toISOString(),
        scenarioId,
        seeds,
        seats,
        calibratedKernel: { ...CALIBRATED },
        accounting: {
            plannedSeatArms: seeds.length * seats.length,
            executedSeatArms: rows.length,
            independentMirrorGames: mirrorCache.size,
            naturalSeatArms: naturalRows.length,
            undecidedSeatArms: rows.length - naturalRows.length,
            errorSeatArms: rows.filter(r => isError(r.search.outcomeKind)).length,
        },
        takeoverInstrumentation: {
            searchDecisions: totalDecisions,
            decisionsWhereSearchDifferedFromHeuristic: totalTakeovers,
            fraction: totalDecisions ? totalTakeovers / totalDecisions : null,
        },
        result: {
            searchNaturalWins: searchWins,
            naturalSeatArms: naturalRows.length,
            mirrorSeatWins,
            deltaOverNaturalArms: naturalRows.length ? (searchWins - mirrorSeatWins) / naturalRows.length : null,
        },
        rows,
        boundary: 'Development reading. One map, one seed block, seat arms share a single mirror '
            + 'per seed. Undecided arms are reported, not counted as losses. No cross-map claim.',
    };
    writeAtomic(out, report);

    console.log();
    console.log(`[teacher-eval] search natural wins ${searchWins}/${naturalRows.length}, mirror seat wins ${mirrorSeatWins}/${rows.length}`);
    console.log(`[teacher-eval] takeover rate ${totalTakeovers}/${totalDecisions} = ${report.takeoverInstrumentation.fraction}`);
    console.log(`[teacher-eval] wrote ${out}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
