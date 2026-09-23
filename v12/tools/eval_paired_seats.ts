/**
 * V12 follow-up / Task 1: a seat-paired evaluation protocol that removes the
 * seat and policy-assignment confounds found in the previous rounds.
 *
 * Why the old protocol was wrong
 * ------------------------------
 * 1. It only ever put the candidate in seats P0/P1. On `SDPLAN:sd-normal:(4) Crossroads.aem`
 *    an ALL-HeuristicAI mirror had P2 win 7/7 natural games, so those seats may be
 *    structurally unable to win -- the candidate was measured on the seat, not on skill.
 * 2. It used seeds (20260924 + k*100003) that never occur in the training archive.
 * 3. It built the non-candidate seats with `new HeuristicAI()` -- no argument, so the
 *    heuristic falls back to `Math.random`. That is exactly defect V11-D01
 *    (`v11/out/self_audit.json`) and it made runs non-reproducible.
 *
 * The protocol here
 * -----------------
 * For every (seed, seat) pair, TWO games are played with IDENTICAL per-seat RNG streams:
 *   arm CANDIDATE : the candidate plays `seat`, HeuristicAI plays every other seat
 *   arm MIRROR    : HeuristicAI plays EVERY seat (same streams)
 * The only difference is who occupies `seat`, so
 *   delta(seat) = winRate_candidate(seat) - winRate_mirror(seat)
 * isolates the candidate's contribution from seat bias, policy assignment and position.
 *
 * Self-test: run with `--candidate heuristic`; both arms are then identical and every
 * delta MUST be exactly 0. Report it if it is not.
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs \
 *     v12/tools/eval_paired_seats.ts \
 *     --candidate v12/models/budget_s42.json \
 *     --scenario SDPLAN:sd-normal:(4) Crossroads.aem \
 *     --seeds 2026070501,2026070502,2026070503 --seats 0,1,2,3 \
 *     --max-steps 20000 --out v12/out/protocol_v2/paired_budget_s42.json
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { getSpatialAiActionSync, setDefaultSpatialWeights } from '../../src/game/ai/spatial_neural_adapter';
import { loadSpatialResNetFromJson } from '../../src/game/ai/spatial_conv_net';
import type { Action } from '../../src/game/types';

const UNPACK_DIR = 'APK/_analysis/unpack';
const SD_PLAN = 'training_configs/sd_training_plan_20260705.json';

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
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

/** Deterministic, independent, seat-stable stream. Never Math.random. */
function streamFor(seed: number, seat: number): () => number {
    let h = (seed >>> 0) ^ Math.imul(seat + 1, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return mulberry((h ^ (h >>> 16)) >>> 0);
}

interface ArmResult {
    winner: number | null;
    candidateWon: boolean;
    capped: boolean;
    steps: number;
    turn: number;
    fallbacks: number;
    candidateDecisions: number;
    candidateP50Ms: number | null;
}

async function playGame(opts: {
    envFactory: any;
    scenarioId: string;
    seed: number;
    candidateSeat: number | null; // null => mirror (all heuristic)
    maxSteps: number;
    candidateIsModel: boolean;
}): Promise<ArmResult> {
    const { envFactory, scenarioId, seed, candidateSeat, maxSteps, candidateIsModel } = opts;
    const fakeEpisode = {
        kind: 'skirmish_episode', version: 1,
        scenario: { id: scenarioId, mode: 'SD', mapName: scenarioId.split(':').pop(), resourcePath: '' },
        seed, maxPlies: 1200, maxSteps: 76800,
        initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
        players: [], policyByPlayer: {}, steps: [], summary: {},
    } as any;

    const env = await envFactory.createEnv(fakeEpisode);
    env.reset(seed);
    const engine = env.getEngine();

    // One deterministic HeuristicAI per seat, identical between the two arms.
    const seatAi = new Map<number, HeuristicAI>();
    for (let s = 0; s < 4; s++) seatAi.set(s, new HeuristicAI(streamFor(seed, s)));

    let steps = 0;
    let fallbacks = 0;
    let candidateDecisions = 0;
    const latencies: number[] = [];

    while (!engine.isTerminal() && steps < maxSteps) {
        const p = engine.getState().currentPlayer;
        let action: Action;
        if (candidateSeat !== null && p === candidateSeat) {
            if (candidateIsModel) {
                const res = getSpatialAiActionSync(engine, p, {
                    deadlineMs: 1000,
                    allowInteractiveFallback: false,
                });
                action = res.action;
                latencies.push(res.e2eMs ?? res.latencyMs);
                if ((res as any).fallbackUsed) fallbacks++;
            } else {
                action = (seatAi.get(p) as HeuristicAI).getAction(engine, p);
            }
            candidateDecisions++;
        } else {
            action = (seatAi.get(p) as HeuristicAI).getAction(engine, p);
        }
        if (!action) break;
        engine.step(action);
        steps++;
    }

    const st = engine.getState();
    const winner = st.winner;
    return {
        winner,
        candidateWon: candidateSeat !== null && winner === candidateSeat,
        capped: winner === null,
        steps,
        turn: st.turn,
        fallbacks,
        candidateDecisions,
        candidateP50Ms: latencies.length ? latencies.slice().sort((a, b) => a - b)[Math.floor(latencies.length / 2)] : null,
    };
}

async function main(): Promise<void> {
    const candidateArg = arg('--candidate', 'heuristic');
    const scenarioId = arg('--scenario', 'SDPLAN:sd-normal:(4) Crossroads.aem');
    const seeds = arg('--seeds', '2026070501,2026070502,2026070503').split(',').map(Number).filter(Number.isFinite);
    const seats = arg('--seats', '0,1,2,3').split(',').map(Number).filter(Number.isFinite);
    const maxSteps = Number(arg('--max-steps', '20000'));
    const out = arg('--out', 'v12/out/protocol_v2/paired.json');
    const candidateIsModel = candidateArg !== 'heuristic';

    if (candidateIsModel) {
        setDefaultSpatialWeights(loadSpatialResNetFromJson(fs.readFileSync(candidateArg, 'utf8')));
    }
    console.log(`[paired] candidate=${candidateArg} (model=${candidateIsModel})`);
    console.log(`[paired] scenario=${scenarioId} seeds=[${seeds}] seats=[${seats}] maxSteps=${maxSteps}`);
    console.log(`[paired] arms per (seed,seat): CANDIDATE + MIRROR, identical per-seat RNG streams`);

    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN);
    const rows: any[] = [];

    for (const seed of seeds) {
        for (const seat of seats) {
            const cand = await playGame({
                envFactory, scenarioId, seed, candidateSeat: seat, maxSteps, candidateIsModel,
            });
            const mirror = await playGame({
                envFactory, scenarioId, seed, candidateSeat: null, maxSteps, candidateIsModel,
            });
            const row = {
                seed, seat,
                candidate: cand,
                mirror,
                delta: (cand.candidateWon ? 1 : 0) - (mirror.winner === seat ? 1 : 0),
            };
            rows.push(row);
            console.log(`[paired] seed=${seed} seat=P${seat} | CAND winner=${cand.winner} ${cand.capped ? '[CAPPED]' : '[NATURAL]'} turn=${cand.turn}` +
                ` | MIRROR winner=${mirror.winner} ${mirror.capped ? '[CAPPED]' : '[NATURAL]'} turn=${mirror.turn} | delta=${row.delta}`);
        }
    }

    const perSeat: Record<string, any> = {};
    for (const seat of seats) {
        const rs = rows.filter(r => r.seat === seat);
        const cWins = rs.filter(r => r.candidate.candidateWon).length;
        const mWins = rs.filter(r => r.mirror.winner === seat).length;
        perSeat[`P${seat}`] = {
            games: rs.length,
            candidateWins: cWins,
            mirrorWins: mWins,
            candidateWinRate: rs.length ? cWins / rs.length : null,
            mirrorWinRate: rs.length ? mWins / rs.length : null,
            delta: rs.length ? (cWins - mWins) / rs.length : null,
            candidateTruncations: rs.filter(r => r.candidate.capped).length,
            mirrorTruncations: rs.filter(r => r.mirror.capped).length,
            candidateFallbacks: rs.reduce((a, r) => a + r.candidate.fallbacks, 0),
            candidateP50Ms: (() => {
                const v = rs.map(r => r.candidate.candidateP50Ms).filter((x: any) => x !== null) as number[];
                return v.length ? v.sort((a, b) => a - b)[Math.floor(v.length / 2)] : null;
            })(),
        };
    }

    // Mirror arm pooled: which seats actually win when everyone is the heuristic?
    const mirrorWinBySeat: Record<string, number> = {};
    for (const seat of seats) mirrorWinBySeat[`P${seat}`] = rows.filter(r => r.mirror.winner === seat).length;

    const totalCand = rows.filter(r => r.candidate.candidateWon).length;
    const totalMirror = rows.filter(r => r.mirror.winner === r.seat).length;

    const report = {
        schema: 'v12_paired_seat_eval_1',
        generatedAt: new Date().toISOString(),
        candidate: candidateArg,
        candidateIsModel,
        protocol: {
            scenarioId,
            seeds, seats, maxSteps,
            arms: 'CANDIDATE (candidate at `seat`, heuristic elsewhere) vs MIRROR (heuristic at every seat)',
            rng: 'per-seat deterministic stream: mulberry(hash(seed, seat)); identical across both arms; never Math.random',
            pairedBy: '(seed, seat) - the only difference between arms is who occupies `seat`',
            fallbackPolicy: 'allowInteractiveFallback=false for the candidate (no silent heuristic fallback)',
        },
        perSeat,
        mirrorWinBySeat,
        overall: {
            games: rows.length,
            candidateWins: totalCand,
            mirrorWins: totalMirror,
            candidateWinRate: rows.length ? totalCand / rows.length : null,
            mirrorWinRate: rows.length ? totalMirror / rows.length : null,
            delta: rows.length ? (totalCand - totalMirror) / rows.length : null,
            candidateTruncationRate: rows.length ? rows.filter(r => r.candidate.capped).length / rows.length : null,
            mirrorTruncationRate: rows.length ? rows.filter(r => r.mirror.capped).length / rows.length : null,
        },
        selfTest: candidateIsModel ? null : {
            expectation: 'candidate arm == mirror arm when the candidate is the heuristic, so every delta MUST be 0',
            allDeltasZero: rows.every(r => r.delta === 0),
        },
        rows,
        caveats: [
            'n is small (seeds x seats). Deltas of +-1 game are noise.',
            'A positive delta means the candidate won its seat more often than the heuristic would have in the SAME seat with the SAME streams; that is the only quantity this protocol licenses.',
            'Truncated games are not counted as wins for either arm.',
        ],
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');

    console.log();
    console.log('[paired] per seat:  seat | candW/mirrorW | delta | candTrunc | fallbacks | p50');
    for (const seat of seats) {
        const s = perSeat[`P${seat}`];
        console.log(`  P${seat} | ${s.candidateWins}/${s.mirrorWins} | ${s.delta >= 0 ? '+' : ''}${s.delta.toFixed(2)} | ` +
            `${s.candidateTruncations}/${s.games} | ${s.candidateFallbacks} | ${s.candidateP50Ms ?? 'n/a'}ms`);
    }
    console.log(`[paired] overall candidate ${totalCand}/${rows.length} vs mirror ${totalMirror}/${rows.length} ` +
        `=> delta ${report.overall.delta >= 0 ? '+' : ''}${report.overall.delta.toFixed(3)}`);
    console.log(`[paired] mirror win by seat: ${JSON.stringify(mirrorWinBySeat)}  <- seat-bias read`);
    if (report.selfTest) console.log(`[paired] SELF-TEST allDeltasZero=${report.selfTest.allDeltasZero}`);
    console.log(`[paired] wrote ${out}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
