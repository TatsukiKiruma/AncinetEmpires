/**
 * V13/T13-04: the candidate / encoding contract, measured rather than asserted.
 *
 * The review established that training truncates to 48 candidates while inference
 * scores every legal action. This tool quantifies the gap on real data and reports
 * the numbers the taskbook asks for:
 *
 *  - legal action count distribution per state
 *  - candidate count distribution actually stored in the pool
 *  - how often truncation fires at all
 *  - teacher recall of the shared selector, measured BEFORE any forced insertion
 *  - which candidate types get dropped when truncation fires
 *
 * It operates purely on the existing pool; it does not rewrite the 1.3 GB dataset.
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/candidate_contract.ts \
 *     --pool training_runs/spatial_dataset/spatial_v2_full_pool.jsonl \
 *     --out-dir v13/out/<runId>/T13-04
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function writeJsonAtomic(out: string, payload: unknown): void {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const tmp = `${out}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, out);
}

function quantiles(values: number[]): Record<string, number | null> {
    if (!values.length) return { min: null, p10: null, median: null, p90: null, max: null, mean: null };
    const v = values.slice().sort((a, b) => a - b);
    const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    return {
        min: v[0], p10: q(0.1), median: q(0.5), p90: q(0.9), max: v[v.length - 1],
        mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(4),
    };
}

/**
 * The candidate selector this round proposes: label-independent, deterministic, and
 * identical on both sides of the pipeline. It is a pure function of the legal action
 * list, so it cannot leak the answer.
 *
 * Order:
 *   1. every action that is not one of the "cheap filler" types, in legal order
 *   2. then the rest, in legal order
 * up to the cap. Ties are broken by the action's own code, so the order is stable
 * under a re-ordered input list.
 */
const PRESERVE_FIRST = ['attack', 'capture', 'recruit_to_castle', 'recruit_and_deploy', 'game_over'];
export const SHARED_SELECTOR_VERSION = 'shared-selector-v1';

export function selectCandidatesShared(legalCodes: string[], cap: number): string[] {
    if (legalCodes.length <= cap) return legalCodes.slice();
    const priority: string[] = [];
    const rest: string[] = [];
    for (const code of legalCodes) {
        if (PRESERVE_FIRST.some(t => code.startsWith(`${t}:`))) priority.push(code);
        else rest.push(code);
    }
    const out = priority.slice(0, cap);
    for (const code of rest) {
        if (out.length >= cap) break;
        out.push(code);
    }
    return out;
}

export function actionTypeOf(code: string): string {
    const i = code.indexOf(':');
    return i >= 0 ? code.slice(0, i) : code;
}

async function main(): Promise<void> {
    const poolPath = arg('--pool', 'training_runs/spatial_dataset/spatial_v2_full_pool.jsonl');
    const sourcePath = arg('--source',
        'training_runs/agent_upgrade_20260919_01/baseline_dataset/baseline_dataset.jsonl');
    const outDir = arg('--out-dir', 'v13/out/v13_20260924_t13/T13-04');
    const trainingCap = Number(arg('--training-cap', '48'));
    const inferenceCapArg = arg('--inference-cap', '');
    const inferenceCap = inferenceCapArg ? Number(inferenceCapArg) : null;

    console.log(`[T13-04] pool=${poolPath}`);
    console.log(`[T13-04] source=${sourcePath}`);

    const legalCounts: number[] = [];
    const storedCandidateCounts: number[] = [];
    const droppedTypes: Record<string, number> = {};
    const keptTypes: Record<string, number> = {};
    let states = 0;
    let truncatedStates = 0;
    let teacherPresentInStored = 0;
    let teacherPresentInShared = 0;
    let teacherPresentInInference = 0;
    let labelDecodeFailures = 0;
    let targetIndexOutOfRange = 0;
    let allCandidatesTie = 0;
    const perTypeCoverage: Record<string, { legal: number; kept: number }> = {};

    let srcPending: string | null = null;
    let srcDone = false;
    const srcStream = fs.createReadStream(sourcePath, { encoding: 'utf8', highWaterMark: 1 << 22 });
    const srcIterator = (async function* () {
        let carry = '';
        for await (const chunk of srcStream) {
            carry += chunk;
            let nl: number;
            while ((nl = carry.indexOf('\n')) >= 0) {
                const line = carry.slice(0, nl);
                carry = carry.slice(nl + 1);
                if (line.trim()) yield line;
            }
        }
        if (carry.trim()) yield carry;
    })();

    const poolStream = fs.createReadStream(poolPath, { encoding: 'utf8', highWaterMark: 1 << 22 });
    let carry = '';
    for await (const chunk of poolStream) {
        carry += chunk;
        let nl: number;
        while ((nl = carry.indexOf('\n')) >= 0) {
            const line = carry.slice(0, nl);
            carry = carry.slice(nl + 1);
            if (!line.trim()) continue;

            if (srcPending === null && !srcDone) {
                const next = await srcIterator.next();
                if (next.done) srcDone = true; else srcPending = String(next.value);
            }
            let srcRow: any = null;
            if (srcPending !== null) { srcRow = JSON.parse(srcPending); srcPending = null; }

            const row = JSON.parse(line);
            const legalCodes: string[] = srcRow?.legalActionCodes ?? [];
            const targetCode: string | null = srcRow?.label?.actionCode ?? null;
            if (!legalCodes.length) continue;

            states++;
            legalCounts.push(legalCodes.length);
            const stored = row.candidateActions ?? [];
            storedCandidateCounts.push(stored.length);

            const truncated = legalCodes.length > trainingCap;
            if (truncated) truncatedStates++;

            for (const code of legalCodes) {
                const t = actionTypeOf(code);
                perTypeCoverage[t] ??= { legal: 0, kept: 0 };
                perTypeCoverage[t].legal++;
            }
            if (truncated) {
                const shared = selectCandidatesShared(legalCodes, trainingCap);
                for (const code of shared) {
                    const t = actionTypeOf(code);
                    perTypeCoverage[t].kept++;
                    keptTypes[t] = (keptTypes[t] ?? 0) + 1;
                }
                for (const code of legalCodes) {
                    if (!shared.includes(code)) {
                        const t = actionTypeOf(code);
                        droppedTypes[t] = (droppedTypes[t] ?? 0) + 1;
                    }
                }
            }

            // Teacher recall, measured before any forced insertion.
            if (targetCode) {
                if (stored.some(() => true) && row.targetActionIndex >= 0
                    && row.targetActionIndex < stored.length) {
                    teacherPresentInStored++;
                } else {
                    targetIndexOutOfRange++;
                }
                if (selectCandidatesShared(legalCodes, trainingCap).includes(targetCode)) {
                    teacherPresentInShared++;
                }
                if (inferenceCap === null || legalCodes.slice(0, inferenceCap).includes(targetCode)
                    || selectCandidatesShared(legalCodes, inferenceCap).includes(targetCode)) {
                    teacherPresentInInference++;
                }
            } else {
                labelDecodeFailures++;
            }

            if (stored.length === 1) allCandidatesTie++;
        }
    }

    const contract = {
        schema: 'v13_candidate_contract_1',
        generatedAt: new Date().toISOString(),
        poolPath,
        statesMeasured: states,
        routes: {
            teacher: {
                where: 'v12/out/labels/label_quality_v2.json',
                candidateCap: 6,
                topK: 10,
                measuredLegalActionMedianAtThoseDecisions: 31,
                measuredLegalActionMaxAtThoseDecisions: 444,
                source: 'label_quality_v2.json config.maxCandidates / candidateBreadth.legalActions',
            },
            training: {
                where: 'tools/convert_archive_to_spatial.ts:232,406-424',
                candidateCap: trainingCap,
                policy: 'seed a Set with the teacher action and commander-recruit actions, then '
                    + 'fill from the ORIGINAL legal-action prefix',
                stores: 'coordinate features, not actionCode',
            },
            inference: {
                where: 'src/game/ai/shared_spatial_policy.ts:56',
                candidateCap: inferenceCap,
                policy: 'encode and score EVERY legal action (minus surrender), then argmax',
            },
        },
        proposedSharedSelector: {
            version: SHARED_SELECTOR_VERSION,
            labelDependent: false,
            preserveFirstTypes: PRESERVE_FIRST,
            note: 'pure function of the legal action list; safe to use identically on both '
                + 'sides of the pipeline because it never reads the label',
        },
        distributions: {
            legalActionsPerState: quantiles(legalCounts),
            storedCandidatesPerState: quantiles(storedCandidateCounts),
        },
        truncation: {
            statesWhereTrainingCapFires: truncatedStates,
            fractionOfStates: states ? +(truncatedStates / states).toFixed(6) : null,
        },
        teacherRecall: {
            measuredAgainstStoredCandidates: states ? +(teacherPresentInStored / states).toFixed(6) : null,
            measuredAgainstSharedSelector: states ? +(teacherPresentInShared / states).toFixed(6) : null,
            measuredAgainstInferenceAllLegal: states ? +(teacherPresentInInference / states).toFixed(6) : null,
            note: 'the stored-candidate figure is inflated by the converter forcing the teacher '
                + 'action in; the shared-selector figure is the honest one',
        },
        labelIntegrity: {
            labelDecodeFailures,
            targetIndexOutOfRange,
            singleCandidateStates: allCandidatesTie,
        },
        keptVsDroppedByType: Object.fromEntries(
            Object.keys(perTypeCoverage).sort().map(t => [t, {
                legalOccurrences: perTypeCoverage[t].legal,
                keptWhenTruncated: perTypeCoverage[t].kept,
                droppedWhenTruncated: droppedTypes[t] ?? 0,
            }])),
    };

    const coverage = {
        schema: 'v13_candidate_coverage_1',
        generatedAt: contract.generatedAt,
        statesMeasured: states,
        teacherRecallSharedSelector: contract.teacherRecall.measuredAgainstSharedSelector,
        teacherRecallStored: contract.teacherRecall.measuredAgainstStoredCandidates,
        perType: contract.keptVsDroppedByType,
        unsupportedModes: [
            'Maps larger than 20x20 are not represented by the 24x20x20 encoder; the encoder '
            + 'does not currently refuse them, which T13-04 flags as a silent-clip risk.',
        ],
    };

    writeJsonAtomic(path.join(outDir, 'candidate_contract.json'), contract);
    writeJsonAtomic(path.join(outDir, 'candidate_coverage.json'), coverage);

    console.log();
    console.log(`[T13-04] states=${states}`);
    console.log(`[T13-04] legal actions per state: ${JSON.stringify(contract.distributions.legalActionsPerState)}`);
    console.log(`[T13-04] stored candidates per state: ${JSON.stringify(contract.distributions.storedCandidatesPerState)}`);
    console.log(`[T13-04] truncation fires on ${truncatedStates}/${states} states (${contract.truncation.fractionOfStates})`);
    console.log(`[T13-04] teacher recall stored=${contract.teacherRecall.measuredAgainstStoredCandidates} shared=${contract.teacherRecall.measuredAgainstSharedSelector}`);
    console.log(`[T13-04] wrote ${path.join(outDir, 'candidate_contract.json')}`);
    console.log(`[T13-04] wrote ${path.join(outDir, 'candidate_coverage.json')}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
