/**
 * V12 / T12-01 follow-up: does the 77x training budget change ACTUAL PLAYING STRENGTH?
 *
 * Why this exists:
 *   V12/T12-01 measured that raising the budget from the historical 87 optimizer
 *   steps (~22 s) to 6,752 steps x 3 seeds lifts validation accuracy from
 *   ~37.7% (epoch-1 level) to ~44.7%. That is a VALIDATION-ACCURACY statement.
 *   Every previously evaluated spatial policy scored 0/10 vs HeuristicAI, so
 *   accuracy clearly does not automatically buy strength. Reporting "budget
 *   scaling works" on accuracy alone would repeat exactly the mistake the V11
 *   taskbook warns about.
 *
 *   This tool plays real matches to check the translation.
 *
 * How it avoids touching production:
 *   `setDefaultSpatialWeights()` replaces the in-memory predictor cache; no file
 *   under src/game/ai/models/ is written or overwritten.
 *
 * Protocol:
 *   - Real SD-plan 4-player map (the training distribution), via the same env
 *     factory the spatial dataset was built with.
 *   - Seats alternate so each side plays P0 and P1.
 *   - Natural termination is distinguished from a step-cap truncation.
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs \
 *     v12/tools/eval_budget_model_vs_heuristic.ts \
 *     --model v12/models/budget_s42.json --games 6 --max-steps 6000 \
 *     --out v12/out/training/eval_budget_s42.json
 *
 *   --model default   => use the repo's deployed spatial v2 checkpoint (control)
 *   --model mirror    => HeuristicAI vs HeuristicAI (seat-bias control)
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import {
    getSpatialAiActionSync,
    setDefaultSpatialWeights,
} from '../../src/game/ai/spatial_neural_adapter';
import { loadSpatialResNetFromJson } from '../../src/game/ai/spatial_conv_net';
import type { Action } from '../../src/game/types';

const UNPACK_DIR = 'APK/_analysis/unpack';
const SD_PLAN = 'training_configs/sd_training_plan_20260705.json';
const SCENARIO_ID = 'SDPLAN:sd-normal:(4) Crossroads.aem';

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

async function main(): Promise<void> {
    const modelArg = arg('--model', 'default');
    const intervene = arg('--intervene', 'none');
    const games = Number(arg('--games', '6'));
    const maxSteps = Number(arg('--max-steps', '6000'));
    const seedStart = Number(arg('--seed-start', '20260924'));
    const seedList = arg('--seeds', '')
        .split(',')
        .map(s => Number(s.trim()))
        .filter(Number.isFinite);
    const out = arg('--out', 'v12/out/training/eval_budget.json');

    // ---- arm wiring -------------------------------------------------------
    let arm: string;
    if (modelArg === 'mirror') {
        arm = 'heuristic-mirror';
    } else if (modelArg === 'default') {
        arm = 'deployed-spatial-v2 (control)';
    } else {
        const json = fs.readFileSync(modelArg, 'utf8');
        setDefaultSpatialWeights(loadSpatialResNetFromJson(json));
        arm = `trained:${modelArg}`;
    }
    console.log(`[eval] arm=${arm} games=${games} maxSteps=${maxSteps} scenario=${SCENARIO_ID}`);

    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN);
    const records: any[] = [];

    for (let i = 0; i < games; i++) {
        const seed = seedList.length > 0 ? seedList[i % seedList.length] : seedStart + i * 100003;
        // alternate seats: even index -> spatial/model is P0
        const modelSeat = i % 2 === 0 ? 0 : 1;
        const fakeEpisode = {
            kind: 'skirmish_episode', version: 1,
            scenario: { id: SCENARIO_ID, mode: 'SD', mapName: '(4) Crossroads.aem', resourcePath: '' },
            seed, maxPlies: 1200, maxSteps: 76800,
            initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
            players: [], policyByPlayer: {}, steps: [], summary: {},
        } as any;

        const env = await envFactory.createEnv(fakeEpisode);
        env.reset(seed);
        const engine = env.getEngine();

        const heuristicAi = new HeuristicAI();
        const modelAi = new HeuristicAI(mulberry(seed + 999));
        // Separate instance used ONLY to ask "what would the heuristic have played
        // here?" without perturbing either seat's RNG stream.
        const probeAi = new HeuristicAI(mulberry(seed + 4242));
        let steps = 0;
        const decisions: number[] = [];
        let fallbacks = 0;
        let errors = 0;
        let interventions = 0;
        let agree = 0;
        let modelDecisions = 0;
        const modelTypes: Record<string, number> = {};
        const heuristicTypes: Record<string, number> = {};
        // Heuristic's action mix BY TURN BUCKET, so it can be compared directly
        // against the archive's phase-bucketed table. In mirror mode this is the
        // action actually played by the heuristic seat; in model mode it is the
        // heuristic probe's preference on the model's turn.
        const byTurn: Record<string, Record<string, number>> = {};
        const bucketOf = (t: number) => (t <= 5 ? '0-5' : t <= 10 ? '6-10' : t <= 20 ? '11-20' : t <= 40 ? '21-40' : '41+');
        const bump = (b: string, ty: string) => {
            const cur = (byTurn[b] ??= {});
            cur[ty] = (cur[ty] ?? 0) + 1;
        };

        while (!engine.isTerminal() && steps < maxSteps) {
            const p = engine.getState().currentPlayer;
            let action: Action;
            if (p === modelSeat && modelArg === 'mirror') {
                // mirror control: both seats are HeuristicAI, independent RNG streams
                action = modelAi.getAction(engine, p);
                bump(bucketOf(engine.getState().turn), action.type);
            } else if (p === modelSeat) {
                // Benchmark mode: never allow a silent HeuristicAI fallback, which
                // would make the arm a heuristic in disguise.
                const res = getSpatialAiActionSync(engine, p, {
                    deadlineMs: 1000,
                    allowInteractiveFallback: false,
                });
                action = res.action;
                decisions.push(res.e2eMs ?? res.latencyMs);
                if ((res as any).fallbackUsed) fallbacks++;
                modelDecisions++;
                modelTypes[action.type] = (modelTypes[action.type] ?? 0) + 1;
                const heurHere = probeAi.getAction(engine, p);
                heuristicTypes[heurHere.type] = (heuristicTypes[heurHere.type] ?? 0) + 1;
                bump(bucketOf(engine.getState().turn), heurHere.type);
                if (JSON.stringify(action) === JSON.stringify(heurHere)) agree++;

                // ---- intervention: does the recruit deficit CAUSE the losses? ----
                // Nothing else is changed. If the heuristic would recruit and the
                // model would not, take the heuristic's recruit instead.
                if (intervene === 'recruit') {
                    const isRecruit = (t: string) => t === 'recruit_to_castle' || t === 'recruit_and_deploy';
                    if (isRecruit(heurHere.type) && !isRecruit(action.type)) {
                        action = heurHere;
                        interventions++;
                    }
                } else if (intervene === 'all') {
                    // upper bound: play the heuristic whenever it disagrees
                    if (JSON.stringify(action) !== JSON.stringify(heurHere)) {
                        action = heurHere;
                        interventions++;
                    }
                }
                if (!action) break;
            } else {
                action = heuristicAi.getAction(engine, p);
            }
            engine.step(action);
            steps++;
        }

        const st = engine.getState();
        const winner = st.winner;
        const capped = winner === null;
        const modelWon = winner === modelSeat;
        const record = {
            game: i + 1, seed, modelSeat, winner,
            modelWon, capped, steps, turn: st.turn,
            decisionsMade: decisions.length,
            fallbacks, errors, interventions,
            agreementWithHeuristic: modelDecisions ? agree / modelDecisions : null,
            modelActionTypes: modelTypes,
            heuristicActionTypes: heuristicTypes,
            heuristicByTurn: byTurn,
            p50Ms: decisions.length ? decisions.slice().sort((a, b) => a - b)[Math.floor(decisions.length / 2)] : null,
        };
        records.push(record);
        console.log(`[eval] game ${i + 1}/${games} modelSeat=P${modelSeat} winner=${winner === null ? 'NONE(truncated)' : 'P' + winner} ` +
            `turn=${st.turn} steps=${steps} modelWon=${modelWon} ${capped ? '[CAPPED]' : '[NATURAL]'}`);
    }

    const natural = records.filter(r => !r.capped);
    const modelWins = records.filter(r => r.modelWon).length;
    const naturalWins = natural.filter(r => r.modelWon).length;
    const report = {
        schema: 'v12_budget_strength_eval_1',
        generatedAt: new Date().toISOString(),
        arm,
        protocol: {
            scenarioId: SCENARIO_ID,
            map: '(4) Crossroads.aem',
            players: 4,
            games, maxSteps, seedStart,
            seatsAlternate: true,
            distributionNote: 'This is the SD training distribution (3-4 player plan maps), not the demo map used by tools/skirmish_spatial_match_benchmark.ts.',
        },
        summary: {
            games,
            modelWins,
            naturalTerminations: natural.length,
            naturalModelWins: naturalWins,
            truncated: records.length - natural.length,
            truncationRate: (records.length - natural.length) / records.length,
            naturalWinRate: natural.length ? naturalWins / natural.length : null,
            totalFallbacks: records.reduce((a, r) => a + (r.fallbacks ?? 0), 0),
            intervention: intervene,
            totalInterventions: records.reduce((a, r) => a + (r.interventions ?? 0), 0),
            overallAgreementWithHeuristic: (() => {
                const tot = records.reduce((a, r) => a + (r.decisionsMade ?? 0), 0);
                const num = records.reduce((a, r) => a + (r.agreementWithHeuristic ?? 0) * (r.decisionsMade ?? 0), 0);
                return tot ? num / tot : null;
            })(),
        },
        records,
        caveats: [
            modelArg === 'mirror'
                ? 'Mirror control: both seats are HeuristicAI, so deviations from 50% indicate seat/map bias rather than model strength.'
                : 'The model plays ONLY its own seat turns; the opponent is HeuristicAI, matching the historical 0/10 protocol.',
            'Natural termination is distinguished from step-cap truncation; a truncated game is NOT counted as a win.',
            'Small n. This is a translation check for the budget result, not a promotion confirmation.',
        ],
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');

    console.log();
    console.log(`[eval] arm=${arm}`);
    console.log(`[eval] model wins ${modelWins}/${games}; natural ${natural.length}/${games} ` +
        `(truncation ${((records.length - natural.length) / records.length * 100).toFixed(0)}%)`);
    console.log(`[eval] natural win rate: ${report.summary.naturalWinRate === null ? 'n/a' : (report.summary.naturalWinRate * 100).toFixed(1) + '%'}`);
    console.log(`[eval] wrote ${out}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
