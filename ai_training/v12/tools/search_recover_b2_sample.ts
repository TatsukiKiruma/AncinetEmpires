/**
 * Recover the v11 batch-2 decision sample, for a same-footing yield comparison.
 *
 * The batch-2 artifacts published 8 kept decision ids (`v11/out/counterfactual_labels.jsonl`)
 * and the first 10 dropped ids (`v11/out/label_quality.json` -> uninformativeExamples).
 * They did not publish the other 22 dropped ids, nor the (maxEpisodes,
 * decisionsPerEpisode) pair that produced the 40 compared decisions.
 *
 * This tool recovers that pair from the published ids:
 *   - the sampling is per-episode and independent across episodes: for episode e
 *     the chosen steps are `sampleDecisionSteps(eligible(e).length, {
 *     decisionsPerEpisode: K, seed: 0xC0FFEE ^ e.seed })` mapped through
 *     `eligible(e)`. So the sample for (E, K) is the union over the first E
 *     episodes, and a larger K is a strict superset of a smaller K on the same
 *     episode;
 *   - `decisionsCompared` was 40 and no decision can be lost (the sampled steps
 *     are by construction steps where the subject seat is to move), so the
 *     batch-2 configuration must satisfy E * K = 40.
 *
 * It writes the recovered id list to v12/out/labels/b2_recovered_decision_ids.json,
 * which the main label tool consumes through --footing-ids-file.
 *
 * Usage:
 *   node v11/tools/run-tool.mjs v12/tools/search_recover_b2_sample.ts [--episodes-file p] [--out f]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sampleDecisionSteps } from '../../tools/v11/counterfactual';
import { loadValidatedEpisodes } from '../../tools/v11/labels';
import { defaultEpisodesFile } from '../../tools/v11/replay_validation';
import { ensureDir, readJson, readJsonl, writeJson } from '../../tools/v11/common';

const PREVIOUS_LABELS = 'v11/out/counterfactual_labels.jsonl';
const PREVIOUS_QUALITY = 'v11/out/label_quality.json';
const PREVIOUS_DECISIONS_COMPARED = 40;
const MIN_STEP_FRACTION = 0.08;
const MAX_STEP_FRACTION = 0.92;

function argValue(flag: string): string | null {
    const idx = process.argv.indexOf(flag);
    return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

function knownPublishedIds(): { kept: string[]; uninformativeExamples: string[] } {
    const kept = fs.existsSync(PREVIOUS_LABELS)
        ? readJsonl<{ decisionId: string }>(PREVIOUS_LABELS).map(l => l.decisionId)
        : [];
    const quality = fs.existsSync(PREVIOUS_QUALITY)
        ? readJson<{ uninformativeExamples?: Array<{ decisionId: string }> }>(PREVIOUS_QUALITY)
        : {};
    const examples = (quality.uninformativeExamples ?? []).map(u => u.decisionId);
    return { kept, uninformativeExamples: examples };
}

export interface RecoveredSample {
    schema: 'v12_b2_sample_recovery_1';
    generatedAt: string;
    episodesFile: string;
    previousDecisionsCompared: number;
    publishedKeptIds: string[];
    publishedUninformativeExamples: string[];
    publishedIdsKnown: number;
    candidates: Array<{
        maxEpisodes: number;
        decisionsPerEpisode: number;
        sampleSize: number;
        containsAllPublishedIds: boolean;
        missingPublishedIds: string[];
        matchesPublishedCount: boolean;
    }>;
    recovered: {
        maxEpisodes: number;
        decisionsPerEpisode: number;
        decisionIds: string[];
        publishedIdsCovered: number;
        uniqueSolution: boolean;
    } | null;
    note: string;
}

export function recoverBatch2Sample(episodesFile: string, maxEpisodes: number): RecoveredSample {
    const { kept, uninformativeExamples } = knownPublishedIds();
    const known = Array.from(new Set([...kept, ...uninformativeExamples]));
    const { loaded } = loadValidatedEpisodes(episodesFile, maxEpisodes);

    // Per-episode eligible steps and the id list for each candidate K.
    const perEpisode = loaded.map(episode => {
        const totalSteps = episode.actions.length;
        const subjectSeat = episode.snapshot.subjectSeat ?? 0;
        const lo = Math.max(1, Math.floor(totalSteps * MIN_STEP_FRACTION));
        const hi = Math.min(totalSteps - 1, Math.ceil(totalSteps * MAX_STEP_FRACTION));
        const eligible: number[] = [];
        for (let i = lo; i <= hi; i += 1) {
            if (episode.actions[i].player === subjectSeat) eligible.push(i);
        }
        const seed = 0xC0FFEE ^ Number(episode.record.seed);
        const idsByK = new Map<number, string[]>();
        for (let k = 1; k <= 12; k += 1) {
            const chosen = sampleDecisionSteps(eligible.length, { decisionsPerEpisode: k, seed });
            idsByK.set(k, chosen.map(idx => `${episode.record.episodeId}#${eligible[Math.min(idx, eligible.length - 1)]}`));
        }
        return { episodeId: episode.record.episodeId, eligibleCount: eligible.length, idsByK };
    });

    const candidates: RecoveredSample['candidates'] = [];
    for (let e = 1; e <= perEpisode.length; e += 1) {
        for (let k = 1; k <= 12; k += 1) {
            const sample = new Set<string>();
            for (let i = 0; i < e; i += 1) for (const id of perEpisode[i].idsByK.get(k) ?? []) sample.add(id);
            const missing = known.filter(id => !sample.has(id));
            candidates.push({
                maxEpisodes: e,
                decisionsPerEpisode: k,
                sampleSize: sample.size,
                containsAllPublishedIds: missing.length === 0,
                missingPublishedIds: missing,
                matchesPublishedCount: sample.size === PREVIOUS_DECISIONS_COMPARED,
            });
        }
    }

    const solutions = candidates.filter(c => c.containsAllPublishedIds && c.matchesPublishedCount);
    const recovered = solutions.length >= 1 ? (() => {
        const best = solutions[0];
        const sample = new Set<string>();
        for (let i = 0; i < best.maxEpisodes; i += 1) {
            for (const id of perEpisode[i].idsByK.get(best.decisionsPerEpisode) ?? []) sample.add(id);
        }
        return {
            maxEpisodes: best.maxEpisodes,
            decisionsPerEpisode: best.decisionsPerEpisode,
            decisionIds: Array.from(sample).sort(),
            publishedIdsCovered: known.length,
            uniqueSolution: solutions.length === 1,
        };
    })() : null;

    return {
        schema: 'v12_b2_sample_recovery_1',
        generatedAt: new Date().toISOString(),
        episodesFile,
        previousDecisionsCompared: PREVIOUS_DECISIONS_COMPARED,
        publishedKeptIds: kept,
        publishedUninformativeExamples: uninformativeExamples,
        publishedIdsKnown: known.length,
        candidates,
        recovered,
        note:
            'Recovery is a consistency argument, not a proof: it finds every (maxEpisodes, decisionsPerEpisode) ' +
            'pair whose deterministic re-sample reproduces all published batch-2 decision ids and the ' +
            'published compared-decision count. If more than one pair fits, the recovered id list is the ' +
            'first and `uniqueSolution` is false - read the candidate table before relying on it.',
    };
}

const isEntry = (process.argv[1] ?? '').endsWith('search_recover_b2_sample.ts');
if (isEntry) {
    const episodesFile = argValue('--episodes-file') ?? process.env.V12_EPISODES_FILE ?? defaultEpisodesFile();
    const maxEpisodes = Number(argValue('--episodes') ?? 32);
    const out = argValue('--out') ?? 'v12/out/labels/b2_recovered_decision_ids.json';
    const t0 = Date.now();
    const result = recoverBatch2Sample(episodesFile, maxEpisodes);
    ensureDir(path.dirname(out));
    writeJson(out, result);

    console.log(`episodes file              : ${result.episodesFile}`);
    console.log(`published ids known        : ${result.publishedIdsKnown} ` +
        `(${result.publishedKeptIds.length} kept + ${result.publishedUninformativeExamples.length} dropped examples)`);
    console.log(`previous decisionsCompared : ${result.previousDecisionsCompared}`);
    const fitting = result.candidates.filter(c => c.containsAllPublishedIds);
    console.log(`combos containing all published ids: ${fitting.length}`);
    for (const c of fitting.slice(0, 20)) {
        console.log(`  E=${String(c.maxEpisodes).padStart(2)} K=${String(c.decisionsPerEpisode).padStart(2)} ` +
            `size=${String(c.sampleSize).padStart(3)} matchesCount=${c.matchesPublishedCount}`);
    }
    if (result.recovered) {
        console.log('');
        console.log(`RECOVERED: maxEpisodes=${result.recovered.maxEpisodes} ` +
            `decisionsPerEpisode=${result.recovered.decisionsPerEpisode} ` +
            `(${result.recovered.decisionIds.length} ids, unique=${result.recovered.uniqueSolution})`);
    } else {
        console.log('NO (E,K) pair reproduces the published ids AND the published count.');
    }
    console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`wrote ${out}`);
}
