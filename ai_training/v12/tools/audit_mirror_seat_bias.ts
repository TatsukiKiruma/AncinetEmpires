/**
 * TASK 3 (historical protocol audit) -- MIRROR / SEAT-BIAS CONTROL.
 *
 * Purpose: several historical evaluation harnesses reported a W/L headline for a
 * candidate placed in one or both seats against `HeuristicAI`, but NONE of them ran
 * a mirror control (all seats the same policy). Without one, a per-seat structural
 * bias on the harness's own map is indistinguishable from candidate skill.
 *
 * This tool is NEW (nothing historical is modified). It replays the EXACT map, seat
 * layout, termination rule and cap of each audited harness, with HeuristicAI in
 * EVERY seat, and reports which seat actually wins.
 *
 * Harnesses reproduced (see v12/out/protocol_audit/TASK3_report.md for file:line):
 *   default-duel : tools/train_battle_eval_uncapped.ts:34
 *                  GameEngine(createDefaultAppGameState()); loop 47; safetyTurns default 600
 *   demo-sd      : tools/skirmish_spatial_match_benchmark.ts:44,53
 *                  createDemoState(getApkSkirmishRuleConfig('SD')); loop stepCount < maxSteps (80)
 *   apk5-sd      : tools/v6_all_models_vs_heuristic_5maps_benchmark.ts:156,166
 *                  createAppApkSkirmishGameState(map,'SD'); loop winner===null && turn <= maxTurns (100)
 *
 * Determinism: every seat gets its own mulberry stream derived from (seed, seat).
 * `new HeuristicAI()` with no argument falls back to Math.random
 * (src/game/ai/heuristic_ai.ts:16-17) and is NEVER used here.
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs \
 *     v12/tools/audit_mirror_seat_bias.ts --harness all --games 10 --out v12/out/protocol_audit/mirror_seat_bias.json
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { createDefaultAppGameState } from '../../src/game/default_state';
import { createDemoState } from '../../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../../src/game/apk_skirmish';
import { createAppApkSkirmishGameState } from '../../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import type { Action } from '../../src/game/types';

// ---------------------------------------------------------------------------
// deterministic per-seat RNG (never Math.random)
// ---------------------------------------------------------------------------
function mulberry(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Independent, seat-stable stream. Same (seed,seat) always gives the same stream. */
function streamFor(seed: number, seat: number): () => number {
    let h = (seed >>> 0) ^ Math.imul(seat + 1, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return mulberry((h ^ (h >>> 16)) >>> 0);
}

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// ---------------------------------------------------------------------------
// one all-HeuristicAI game
// ---------------------------------------------------------------------------
type Termination = 'NATURAL_WIN' | 'DRAW' | 'TRUNCATED';

interface MirrorGame {
    seed: number;
    script: string;          // which historical harness config this replays
    makeState: () => any;
    /** stop when true (checked before each step) */
    done: (engine: GameEngine, steps: number) => boolean;
    /** hard guard so a degenerate map can never hang the audit */
    hardStepLimit: number;
}

function playMirror(g: MirrorGame): {
    seed: number; winner: number | null; termination: Termination; steps: number; turn: number;
} {
    const engine = new GameEngine(g.makeState());
    const seatCount = engine.getState().players.length;
    const seatAi = new Map<number, HeuristicAI>();
    for (let s = 0; s < seatCount; s++) seatAi.set(s, new HeuristicAI(streamFor(g.seed, s)));

    let steps = 0;
    while (engine.getState().winner === null && !g.done(engine, steps) && steps < g.hardStepLimit) {
        const s = engine.getState();
        const cur = s.currentPlayer;
        const legal = engine.getLegalActions(cur).filter((a: Action) => a.type !== 'surrender');
        if (legal.length === 0) {
            engine.step({ type: 'end_turn' } as Action);
            steps++;
            continue;
        }
        engine.step((seatAi.get(cur) as HeuristicAI).getAction(engine, cur));
        steps++;
    }

    const st = engine.getState();
    const winner = st.winner;
    const termination: Termination =
        winner === null ? 'TRUNCATED' : winner === -1 ? 'DRAW' : 'NATURAL_WIN';
    return { seed: g.seed, winner, termination, steps, turn: st.turn };
}

// ---------------------------------------------------------------------------
// harness scripts
// ---------------------------------------------------------------------------
const V6_MAPS = [
    '(2) Duel.aem', '(2) Icy Paths.aem', '(2) Liberty Port.aem',
    '(2) Mourningstar.aem', '(2) Crossed swords.aem'
];

interface ScriptResult {
    script: string;
    map: string;
    playerCount: number;
    loopRule: string;
    cap: number | string;
    games: number;
    /** winner player id -> count (natural wins only) */
    naturalWinsBySeat: Record<string, number>;
    draws: number;
    truncated: number;
    /** seat -> count of games this seat occupied (sanity) */
    seatOccupancy: Record<string, number>;
    rows: Array<{ seed: number; winner: number | null; termination: Termination; steps: number; turn: number }>;
    meanSteps: number;
    meanFinalTurn: number;
}

function summarize(script: string, map: string, playerCount: number, loopRule: string,
                   cap: number | string, rows: ReturnType<typeof playMirror>[]): ScriptResult {
    const wins: Record<string, number> = {};
    for (let s = 0; s < playerCount; s++) wins[`P${s}`] = 0;
    const occ: Record<string, number> = {};
    for (let s = 0; s < playerCount; s++) occ[`P${s}`] = rows.length;
    let draws = 0, truncated = 0;
    for (const r of rows) {
        if (r.termination === 'NATURAL_WIN' && r.winner !== null && r.winner >= 0) wins[`P${r.winner}`]++;
        else if (r.termination === 'DRAW') draws++;
        else truncated++;
    }
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
        script, map, playerCount, loopRule, cap,
        games: rows.length,
        naturalWinsBySeat: wins,
        draws, truncated,
        seatOccupancy: occ,
        rows,
        meanSteps: Number(mean(rows.map(r => r.steps)).toFixed(1)),
        meanFinalTurn: Number(mean(rows.map(r => r.turn)).toFixed(1)),
    };
}

async function main(): Promise<void> {
    const which = arg('--harness', 'all');
    const games = Number(arg('--games', '10'));
    const baseSeed = Number(arg('--seed', '2026070601'));
    const safetyTurns = Number(arg('--safety-turns', '600'));
    const demoMaxSteps = Number(arg('--demo-max-steps', '80'));
    const demoLongMaxSteps = Number(arg('--demo-long-max-steps', '4000'));
    const apkMaxTurns = Number(arg('--apk-max-turns', '100'));
    const apkHardStepLimit = Number(arg('--apk-hard-step-limit', '200000'));
    const out = arg('--out', 'v12/out/protocol_audit/mirror_seat_bias.json');

    const all: ScriptResult[] = [];
    const apkGameLog: Array<Record<string, unknown>> = [];
    const seeds = Array.from({ length: games }, (_, i) => baseSeed + i);

    // ---- 1. tools/train_battle_eval_uncapped.ts: createDefaultAppGameState() ----
    if (which === 'all' || which === 'default-duel') {
        const probe = createDefaultAppGameState();
        const pc = probe.players.length;
        const rows = seeds.map(seed => playMirror({
            seed, script: 'default-duel',
            makeState: () => createDefaultAppGameState(),
            done: (e, steps) => steps >= safetyTurns * 80 || e.getState().turn > safetyTurns,
            hardStepLimit: safetyTurns * 80 + 10,
        }));
        const r = summarize('train_battle_eval_uncapped.ts', 'createDefaultAppGameState() (Duel)', pc,
            'while (winner===null && steps<safetyTurns*80 && turn<=safetyTurns)', safetyTurns, rows);
        all.push(r);
        console.log(`[default-duel] ${games} games, all-HeuristicAI, safetyTurns=${safetyTurns}`);
        console.log(`  natural wins by seat: ${JSON.stringify(r.naturalWinsBySeat)} draws=${r.draws} truncated=${r.truncated}`);
        console.log(`  mean steps=${r.meanSteps} mean finalTurn=${r.meanFinalTurn}`);
    }

    // ---- 2. tools/skirmish_spatial_match_benchmark.ts: createDemoState(SD), cap 80 ----
    if (which === 'all' || which === 'demo-sd' || which === 'demo-sd-long') {
        const probe = createDemoState(getApkSkirmishRuleConfig('SD'));
        const pc = probe.players.length;

        if (which === 'all' || which === 'demo-sd') {
            const rows = seeds.map(seed => playMirror({
                seed, script: 'demo-sd',
                makeState: () => createDemoState(getApkSkirmishRuleConfig('SD')),
                done: (_e, steps) => steps >= demoMaxSteps,
                hardStepLimit: demoMaxSteps + 10,
            }));
            const r = summarize('skirmish_spatial_match_benchmark.ts', 'createDemoState(getApkSkirmishRuleConfig("SD"))', pc,
                'while (winner===null && stepCount < maxSteps)', demoMaxSteps, rows);
            all.push(r);
            console.log(`[demo-sd] ${games} games, all-HeuristicAI, maxSteps=${demoMaxSteps} (historical cap)`);
            console.log(`  natural wins by seat: ${JSON.stringify(r.naturalWinsBySeat)} draws=${r.draws} truncated=${r.truncated}`);
        }

        if (which === 'all' || which === 'demo-sd-long') {
            const rows = seeds.slice(0, Math.min(games, 10)).map(seed => playMirror({
                seed, script: 'demo-sd-long',
                makeState: () => createDemoState(getApkSkirmishRuleConfig('SD')),
                done: (_e, steps) => steps >= demoLongMaxSteps,
                hardStepLimit: demoLongMaxSteps + 10,
            }));
            const r = summarize('skirmish_spatial_match_benchmark.ts (cap raised)', 'createDemoState(getApkSkirmishRuleConfig("SD"))', pc,
                'same loop, cap raised to see whether the map can ever resolve', demoLongMaxSteps, rows);
            all.push(r);
            console.log(`[demo-sd-long] ${rows.length} games, all-HeuristicAI, maxSteps=${demoLongMaxSteps}`);
            console.log(`  natural wins by seat: ${JSON.stringify(r.naturalWinsBySeat)} draws=${r.draws} truncated=${r.truncated}`);
            console.log(`  mean steps=${r.meanSteps} mean finalTurn=${r.meanFinalTurn}`);
        }
    }

    // ---- 3. v6 5-map SD harness: createAppApkSkirmishGameState(map,'SD'), maxTurns 100 ----
    if (which === 'all' || which === 'apk5-sd') {
        const perMapGames = Number(arg('--per-map-games', String(games)));
        const mapFilter = arg('--apk-maps', '');
        const mapsToRun = mapFilter ? V6_MAPS.filter(m => mapFilter.split('|').some(f => m.includes(f))) : V6_MAPS;
        for (const map of mapsToRun) {
            const probe = createAppApkSkirmishGameState(map, 'SD');
            const pc = probe.players.length;
            const rows = Array.from({ length: perMapGames }, (_, i) => baseSeed + i).map(seed => {
                const t0 = Date.now();
                const r = playMirror({
                    seed, script: `apk5-sd:${map}`,
                    makeState: () => createAppApkSkirmishGameState(map, 'SD'),
                    done: (e) => e.getState().turn > apkMaxTurns,
                    hardStepLimit: apkHardStepLimit,
                });
                apkGameLog.push({ map, ...r, ms: Date.now() - t0 });
                writeReport();   // survive a per-game cost of minutes
                console.log(`    [apk5-sd] ${map} seed=${seed} -> winner=${r.winner} ${r.termination} steps=${r.steps} turn=${r.turn} (${Date.now() - t0}ms)`);
                return r;
            });
            const r = summarize('v6_*_5maps_benchmark.ts', map, pc,
                'while (winner===null && turn <= maxTurns)', apkMaxTurns, rows);
            all.push(r);
            writeReport();
            console.log(`[apk5-sd] ${map}  n=${perMapGames} all-HeuristicAI  naturalWins=${JSON.stringify(r.naturalWinsBySeat)} draws=${r.draws} truncated=${r.truncated}  meanTurn=${r.meanFinalTurn} meanSteps=${r.meanSteps}`);
        }
    }

    // ---- write (hoisted so it can be called incrementally; a slow map cannot destroy earlier results) ----
    function writeReport(): void {
        const apk = all.filter(r => r.script === 'v6_*_5maps_benchmark.ts');
        const pooled: Record<string, number> = {};
        let pooledGames = 0;
        for (const r of apk) {
            for (const [k, v] of Object.entries(r.naturalWinsBySeat)) pooled[k] = (pooled[k] ?? 0) + v;
            pooledGames += r.games;
        }
        const report = {
            schema: 'v12_historical_protocol_mirror_control_1',
            generatedAt: new Date().toISOString(),
            purpose: 'seat-bias control for historical harnesses: HeuristicAI in EVERY seat, harness-native map + termination rule',
            config: {
                which, games, perMapGames: Number(arg('--per-map-games', String(games))), baseSeed,
                safetyTurns, demoMaxSteps, demoLongMaxSteps, apkMaxTurns, apkHardStepLimit, mapsCompleted: apk.length,
            },
            rng: 'mulberry( hash(seed, seat) ) per seat; independent per seat; never Math.random',
            scripts: all,
            apk5PerGameLog: apkGameLog,
            apk5PooledNaturalWinsBySeat: pooled,
            apk5PooledGames: pooledGames,
        };
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
    }

    writeReport();
    console.log(`\nwrote ${out}`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
