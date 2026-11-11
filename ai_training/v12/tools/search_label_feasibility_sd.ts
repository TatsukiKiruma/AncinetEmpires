/**
 * V12 / T12-08 prerequisite probe (bounded, NOT the authorised experiment).
 *
 * Question this answers:
 *   The T12-06/07 proxy-Q labels were produced on the v11 batch-2 pool
 *   (2-player Duel/Icy/Crossed/Mourningstar) at a measured 1.305 s per decision
 *   and 0.232 s per leaf evaluation. But T12-08 must regenerate those labels on
 *   the SPATIAL training distribution, which is the SD plan archive
 *   (3-4 player Crossroads / Frozen fields / Midway ...), whose games are far
 *   longer (median 2,650 steps vs the v11 pool's short duels).
 *
 *   So the 0.9 h estimate for label regeneration is an EXTRAPOLATION ACROSS
 *   GAME DISTRIBUTIONS. This probe tests whether it holds, by measuring the real
 *   per-leaf cost on SD episodes using the live engine from verified replay.
 *
 * It also proves feasibility: BattleSearchAI needs a GameEngine, and until this
 * round AncientEmpiresEnv kept its engine private (a getEngine() accessor was
 * added). This probe is the first thing that uses it.
 *
 * This deliberately does NOT emit a training label file - it measures cost and
 * proves the path. Producing the label file is T12-08 work.
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs \
 *     v12/tools/search_label_feasibility_sd.ts \
 *     --file sd-3p-high-gold-extra-episodes.jsonl --episode-index 0 \
 *     --every 40 --max-decisions 8 --k 6 --out v12/out/labels/sd_label_feasibility.json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { createDefaultEnvFactory, replayEpisodeDatasetItems } from '../../tools/skirmish_dataset_export';
import { BattleSearchAI } from '../../src/game/ai/battle_search_ai';
import type { Action } from '../../src/game/types';

const ARCHIVE_DIR = 'training_runs/episodes/sd_training_plan_20260705_heuristic-apk-like-balanced';
const UNPACK_DIR = 'APK/_analysis/unpack';
const SD_PLAN = 'training_configs/sd_training_plan_20260705.json';

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Deterministic 32-bit seed; never Math.random (that is the V11-D01 defect). */
function seedFromEpisode(seed: number, step: number): number {
    let h = (seed >>> 0) ^ Math.imul(step + 1, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
}

async function readEpisode(file: string, index: number): Promise<any> {
    const rl = readline.createInterface({
        input: fs.createReadStream(path.join(ARCHIVE_DIR, file), { encoding: 'utf8' }),
        crlfDelay: Infinity,
    });
    let i = 0;
    try {
        for await (const line of rl) {
            if (!line.trim()) continue;
            if (i === index) return JSON.parse(line);
            i++;
        }
    } finally {
        rl.close();
    }
    throw new Error(`episode index ${index} not found in ${file}`);
}

async function main(): Promise<void> {
    const file = arg('--file', 'sd-3p-high-gold-extra-episodes.jsonl');
    const episodeIndex = Number(arg('--episode-index', '0'));
    const every = Number(arg('--every', '40'));
    const maxDecisions = Number(arg('--max-decisions', '8'));
    const k = Number(arg('--k', '6'));
    const out = arg('--out', 'v12/out/labels/sd_label_feasibility.json');

    console.log(`[probe] file=${file} episodeIndex=${episodeIndex} every=${every} maxDecisions=${maxDecisions} k=${k}`);

    const episode = await readEpisode(file, episodeIndex);
    console.log(`[probe] scenario=${episode.scenario.id} seed=${episode.seed} steps=${episode.steps.length} ` +
        `maxPlies=${episode.maxPlies}`);

    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN);
    const env = await envFactory.createEnv(episode);

    const decisions: any[] = [];
    let stepIndex = 0;
    let wallTotalMs = 0;
    let leafTotal = 0;
    let leafWallTotal = 0;

    // replayEpisodeDatasetItems steps the env AFTER each yield, so at the yield
    // point `env` is exactly at the pre-step state for sample.playerId.
    const walk = replayEpisodeDatasetItems(episode, env, { observationMode: 'none' });
    for (const { sample } of walk) {
        if (decisions.length >= maxDecisions) break;
        if (stepIndex % every === 0) {
            const engine = env.getEngine(); // V12 addition: was private
            const playerId = env.getCurrentPlayer();
            let legal: Action[] = [];
            try {
                legal = env.getLegalActions();
            } catch (e) {
                console.log(`[probe] step ${stepIndex}: getLegalActions failed: ${(e as Error).message}`);
                stepIndex++;
                continue;
            }
            const nonSurrender = legal.filter(a => a.type !== 'surrender');
            const candidates = (nonSurrender.length > 0 ? nonSurrender : legal).slice(0, k);
            if (candidates.length === 0) { stepIndex++; continue; }

            const ai = new BattleSearchAI(seedFromEpisode(episode.seed, sample.step), {
                topK: 6, oppProbeK: 6, friendlyRolloutSteps: 3,
            });
            const t0 = Date.now();
            const leaves: Array<{ actionCode: string; leaf: number; wallMs: number }> = [];
            for (const a of candidates) {
                const lt = Date.now();
                let leaf: number;
                try {
                    leaf = (ai as any).evaluateCandidate(engine, playerId, a);
                } catch (e) {
                    leaf = Number.NaN;
                }
                const lms = Date.now() - lt;
                leafWallTotal += lms;
                leafTotal++;
                leaves.push({ actionCode: JSON.stringify(a), leaf, wallMs: lms });
            }
            const ms = Date.now() - t0;
            wallTotalMs += ms;
            const finite = leaves.filter(l => Number.isFinite(l.leaf)).map(l => l.leaf);
            const min = finite.length ? Math.min(...finite) : null;
            const max = finite.length ? Math.max(...finite) : null;
            decisions.push({
                step: sample.step,
                phase: 'PRE_STEP',
                turn: (sample as any).turn ?? null,
                playerId,
                legalActionCount: legal.length,
                evaluatedCandidates: candidates.length,
                leaves,
                distinctLeafValues: new Set(finite).size,
                minLeaf: min,
                maxLeaf: max,
                spread: min !== null && max !== null ? max - min : null,
                wallMs: ms,
                msPerLeaf: leaves.length ? ms / leaves.length : null,
            });
            console.log(`[probe]   step ${sample.step} player ${playerId}: ${candidates.length} leaves ` +
                `distinct=${new Set(finite).size} spread=${min !== null && max !== null ? (max - min).toFixed(1) : 'n/a'} ` +
                `wall=${ms}ms (${(ms / leaves.length).toFixed(0)}ms/leaf)`);
        }
        stepIndex++;
    }

    const report = {
        schema: 'v12_sd_label_feasibility_1',
        generatedAt: new Date().toISOString(),
        purpose:
            'Bounded feasibility + cost probe for T12-08 step 3 (regenerate proxy-Q labels on the ' +
            'SPATIAL training distribution). NOT the authorised experiment and NOT a training label file.',
        config: { archiveDir: ARCHIVE_DIR, file, episodeIndex, every, maxDecisions, k },
        episode: {
            scenarioId: episode.scenario.id,
            seed: episode.seed,
            recordedSteps: episode.steps.length,
            maxPlies: episode.maxPlies,
            stepsWalked: stepIndex,
        },
        engineReachable: decisions.length > 0,
        decisionsCompared: decisions.length,
        leavesEvaluated: leafTotal,
        cost: {
            wallTotalMs,
            wallPerDecisionMs: decisions.length ? wallTotalMs / decisions.length : null,
            wallPerLeafMs: leafTotal ? leafWallTotal / leafTotal : null,
            v11PoolPerDecisionMs: 1305,
            v11PoolPerLeafMs: 232,
        },
        decisions,
        verificationBoundary: [
            'This probe measures COST and FEASIBILITY only; it emits no trainable label file.',
            'It does not verify that the produced leaves are a good ordering, nor that they correlate with outcome.',
            'The candidate set is the first k legal non-surrender actions, NOT the heuristic top-k, so the ' +
            'values here are not deltaQ against a heuristic baseline.',
            'Labels are on the evaluatePositionHeuristic scale - a PROXY reference, not a win probability.',
        ],
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');

    console.log();
    console.log(`[probe] engine reachable     : ${report.engineReachable}`);
    console.log(`[probe] decisions compared   : ${decisions.length}`);
    console.log(`[probe] leaves evaluated     : ${leafTotal}`);
    console.log(`[probe] wall/decision        : ${report.cost.wallPerDecisionMs?.toFixed(0)} ms ` +
        `(v11 pool measured 1305 ms)`);
    console.log(`[probe] wall/leaf            : ${report.cost.wallPerLeafMs?.toFixed(0)} ms ` +
        `(v11 pool measured 232 ms)`);
    console.log(`[probe] wrote ${out}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
