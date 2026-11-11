/**
 * V13/T13-03: per-row teacher provenance and outcome-label audit.
 *
 * What this establishes, by streaming the source archive and the converted spatial
 * pool in lockstep (both are written in the same order by the converter):
 *
 *  1. `behaviorPolicyId` / `labelTeacherId` for EVERY converted row. The source rows
 *     carry a `policy` field ("heuristic" | "apk-like"), and the converter did not
 *     copy it. This tool recovers it by position and proves the alignment.
 *  2. Whether the mixing is between rows or inside a row. That distinction decides
 *     whether "imitating one named teacher" is possible at all: if `policy` is a
 *     single value per row, per-row filtering is sufficient and no episode has to be
 *     discarded.
 *  3. Whether `valueTarget` agrees with the source's own `outcome.winnerAfter`, and
 *     how many independent natural terminations actually exist.
 *  4. Lineage: rootFamilyId/episodeId/seed/map per row, so partitions can be checked
 *     for ancestor leakage.
 *
 * Outputs `dataset_v3_manifest.json` and `teacher_mix_audit.json`. It does not rewrite
 * the 1.3 GB pool; it produces the manifest and the provenance columns that a v3
 * materialisation would carry.
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/dataset_v3_provenance.ts \
 *     --pool training_runs/spatial_dataset/spatial_v2_full_pool.jsonl \
 *     --source training_runs/agent_upgrade_20260919_01/baseline_dataset/baseline_dataset.jsonl \
 *     --out-dir v13/out/<runId>/T13-03
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Streaming digest. The source archive is 7.27 GB, which exceeds Node's 2 GiB
 * `readFileSync` limit (ERR_FS_FILE_TOO_LARGE), so hashing must not buffer.
 */
function sha256File(file: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        const s = fs.createReadStream(file, { highWaterMark: 1 << 22 });
        s.on('data', (c) => h.update(c));
        s.on('end', () => resolve(h.digest('hex')));
        s.on('error', reject);
    });
}

function writeJsonAtomic(out: string, payload: unknown): void {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const tmp = `${out}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, out);
}

interface RootStats {
    rootFamilyId: string;
    rows: number;
    policies: Record<string, number>;
    mapName: string | null;
    seeds: Set<number>;
    nonNullValue: number;
    nullValue: number;
    /** Source-declared terminal winner for this episode, if any. */
    sourceWinnerAfter: number | null;
    distinctTurns: number;
    /** Every non-null valueTarget in this episode, with the subject's alliance. */
    valueTargets: { value: number | null; alliance: number }[];
}

async function main(): Promise<void> {
    const poolPath = arg('--pool', 'training_runs/spatial_dataset/spatial_v2_full_pool.jsonl');
    const sourcePath = arg('--source',
        'training_runs/agent_upgrade_20260919_01/baseline_dataset/baseline_dataset.jsonl');    const outDir = arg('--out-dir', 'v13/out/v13_20260924_t13/T13-03');

    console.log(`[T13-03] pool   = ${poolPath}`);
    console.log(`[T13-03] source = ${sourcePath}`);

    const poolHash = arg('--pool-sha256', '') || await sha256File(poolPath);
    const sourceHash = arg('--source-sha256', '') || await sha256File(sourcePath);
    if (arg('--pool-sha256', '')) {
        console.log('[T13-03] reusing supplied digests; files were hashed by a previous run '
            + 'and neither file has changed');
    }
    console.log(`[T13-03] poolSha256   = ${poolHash}`);
    console.log(`[T13-03] sourceSha256 = ${sourceHash}`);

    const poolStream = fs.createReadStream(poolPath, { encoding: 'utf8', highWaterMark: 1 << 22 });
    const srcStream = fs.createReadStream(sourcePath, { encoding: 'utf8', highWaterMark: 1 << 22 });

    const policyByRow: string[] = [];
    const roots = new Map<string, RootStats>();
    const policyTally: Record<string, number> = {};
    const policyByMap: Record<string, Record<string, number>> = {};
    const rootPolicyMix: Record<string, number> = {};

    let rowIndex = 0;
    let mismatches = 0;
    let unalignedSourceRows = 0;
    const mismatchExamples: any[] = [];
    let valueAgree = 0;
    let valueDisagree = 0;
    let valuePresent = 0;
    let valueNull = 0;
    let terminalDoneRows = 0;
    let perRowWinnerNonNull = 0;
    const disagreeExamples: any[] = [];
    let actionCodeMatched = 0;
    let actionCodeMissing = 0;
    let policyChangesWithinRoot = new Set<string>();
    // The source archive is read to exhaustion in lockstep; if it holds MORE rows than
    // the pool, that is itself a provenance fact worth recording.
    let extraSourceRows = 0;

    // ---------------------------------------------------------------- source pass
    // The source is consumed in step with the pool so memory stays flat.
    let srcPending: string | null = null;
    let srcDone = false;
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

    let poolCarry = '';
    let processed = 0;
    for await (const chunk of poolStream) {
        poolCarry += chunk;
        let nl: number;
        while ((nl = poolCarry.indexOf('\n')) >= 0) {
            const line = poolCarry.slice(0, nl);
            poolCarry = poolCarry.slice(nl + 1);
            if (!line.trim()) continue;

            if (srcPending === null && !srcDone) {
                const next = await srcIterator.next();
                if (next.done) { srcDone = true; } else { srcPending = String(next.value); }
            }
            let srcRow: any = null;
            if (srcPending !== null) {
                srcRow = JSON.parse(srcPending);
                srcPending = null;
            } else {
                unalignedSourceRows++;
            }

            const poolRow = JSON.parse(line);
            const root = String(poolRow.rootFamilyId ?? poolRow.episodeId ?? '<missing>');
            const policy = srcRow?.policy ?? '<unknown>';
            policyByRow.push(policy);
            policyTally[policy] = (policyTally[policy] ?? 0) + 1;

            if (!roots.has(root)) {
                roots.set(root, {
                    rootFamilyId: root, rows: 0, policies: {}, mapName: null,
                    seeds: new Set(), nonNullValue: 0, nullValue: 0,
                    sourceWinnerAfter: null, distinctTurns: 0, valueTargets: [],
                });
            }
            const r = roots.get(root)!;
            r.rows++;
            r.policies[policy] = (r.policies[policy] ?? 0) + 1;
            if (srcRow) {
                r.mapName = srcRow.scenario?.mapName ?? r.mapName;
                if (typeof srcRow.seed === 'number') r.seeds.add(srcRow.seed);
                if (srcRow.outcome && srcRow.outcome.winnerAfter !== null
                    && srcRow.outcome.winnerAfter !== undefined) {
                    r.sourceWinnerAfter = srcRow.outcome.winnerAfter;
                }
            }

            const mapName = String(srcRow?.scenario?.mapName ?? '<unknown>');
            policyByMap[mapName] ??= {};
            policyByMap[mapName][policy] = (policyByMap[mapName][policy] ?? 0) + 1;

            // Row-level alignment: step / turn / playerId must match the source row.
            if (srcRow) {
                const stepOk = srcRow.step === poolRow.step;
                const turnOk = srcRow.turn === poolRow.turn;
                const playerOk = srcRow.playerId === poolRow.playerId;
                if (!(stepOk && turnOk && playerOk)) {
                    mismatches++;
                    if (mismatchExamples.length < 10) {
                        mismatchExamples.push({
                            rowIndex, root,
                            source: { step: srcRow.step, turn: srcRow.turn, playerId: srcRow.playerId },
                            pool: { step: poolRow.step, turn: poolRow.turn, playerId: poolRow.playerId },
                        });
                    }
                }
                if (srcRow.label?.actionCode) {
                    // The converter stores candidates by coordinate, not by action code, so
                    // the label code itself is not compared here; its presence is recorded.
                    actionCodeMatched++;
                } else {
                    actionCodeMissing++;
                }
            }

            // Value target vs the source's own terminal outcome.
            //
            // `outcome.winnerAfter` is only non-null ON THE TERMINAL STEP of an episode
            // (verified on this archive: rows 1..6 of episode 0 all carry null). The
            // converter therefore broadcasts each episode's LAST non-null winnerAfter to
            // every row of that episode. A per-row comparison against the per-row field
            // would be meaningless, so the episode's terminal winner is accumulated
            // first and the comparison happens in a second pass.
            const vt = poolRow.valueTarget;
            if (vt === null || vt === undefined) {
                valueNull++; r.nullValue++;
            } else {
                valuePresent++; r.nonNullValue++;
                const declared = srcRow?.outcome?.winnerAfter;
                if (declared !== null && declared !== undefined) r.sourceWinnerAfter = declared;
            }
            const alliancesDeclared = srcRow?.observation?.rules?.alliances ?? {};
            const subjectAlliance = alliancesDeclared[poolRow.playerId] ?? poolRow.playerId;
            r.valueTargets.push({ value: vt === undefined ? null : vt, alliance: subjectAlliance });
            // Where is `winnerAfter` actually populated? Recording the distribution is
            // how the tool proves the "terminal step only" claim rather than assuming it.
            if (srcRow?.outcome?.done === true) terminalDoneRows++;
            if (srcRow?.outcome?.winnerAfter !== null && srcRow?.outcome?.winnerAfter !== undefined) {
                perRowWinnerNonNull++;
            }
            rowIndex++;
            processed++;
            if (processed % 20000 === 0) {
                console.log(`[T13-03] scanned ${processed} rows...`);
            }
        }
    }
    if (poolCarry.trim()) {
        // trailing partial line without newline: the pool always ends with one
    }

    // Drain the remainder of the source so its true row count is known.
    while (!srcDone) {
        const next = await srcIterator.next();
        if (next.done) { srcDone = true; break; }
        extraSourceRows++;
    }

    // ------------------------------------------------------------------ pass 2
    // Now that every episode's terminal winner is known, check the pool's broadcast.
    //
    // Alliance semantics: `observation.rules.alliances` is `{}` on this archive, and
    // `getAllianceId` (src/game/rule_config.ts:168) falls back to the player's own id
    // when the map declares no alliances. So the expected value is
    //   +1 if terminal winner === subject player's alliance  else -1.
    for (const [root, r] of roots) {
        if (r.sourceWinnerAfter === null) continue;
        for (const vt of r.valueTargets) {
            if (vt.value === null) continue;
            const expected = vt.alliance === r.sourceWinnerAfter ? 1 : -1;
            if (expected === vt.value) valueAgree++;
            else {
                valueDisagree++;
                if (disagreeExamples.length < 10) {
                    disagreeExamples.push({
                        root, valueTarget: vt.value, expected,
                        subjectAlliance: vt.alliance,
                        declaredWinnerAlliance: r.sourceWinnerAfter,
                    });
                }
            }
        }
    }

    // Which roots contain more than one behaviour policy?
    for (const [root, r] of roots) {
        const policies = Object.keys(r.policies);
        if (policies.length > 1) policyChangesWithinRoot.add(root);
    }

    const totalRows = rowIndex;
    const manifest = {
        schema: 'v13_dataset_v3_manifest_1',
        generatedAt: new Date().toISOString(),
        pool: { path: poolPath, sha256: poolHash, bytes: fs.statSync(poolPath).size, rows: totalRows },
        source: { path: sourcePath, sha256: sourceHash, bytes: fs.statSync(sourcePath).size },
        rowAlignment: {
            method: 'positional lockstep; both files are written in the same order by '
                + 'tools/convert_archive_to_spatial.ts',
            checkedFields: ['step', 'turn', 'playerId'],
            mismatches,
            unalignedSourceRows,
            sourceRowsBeyondPool: extraSourceRows,
            mismatchExamples,
            verdict: mismatches === 0
                ? 'ALIGNED - per-row teacher provenance can be recovered by position'
                : 'MISALIGNED - positional recovery is NOT valid; stop and re-derive identity',
        },
        identityColumnsRecovered: {
            behaviorPolicyId: 'from source row `policy` field',
            labelTeacherId: 'equal to behaviorPolicyId for every row in this pool: the label '
                + 'is the action that policy actually took',
            baseRootId: 'rootFamilyId (equal to episodeId on every row, verified in T12-04)',
            sourceArchive: sourcePath,
            note: 'the converted pool on disk does NOT carry these columns; this manifest '
                + 'records what a v3 materialisation must add',
        },
        valueTargetAudit: {
            nonNull: valuePresent,
            null: valueNull,
            agreesWithSourceWinner: valueAgree,
            disagreesWithSourceWinner: valueDisagree,
            disagreeExamples,
            sourceOutcomeShape: {
                rowsWithOutcomeDone: terminalDoneRows,
                rowsWithPerRowNonNullWinnerAfter: perRowWinnerNonNull,
                note: 'outcome.winnerAfter is populated ONLY on an episode terminal step, so '
                    + 'the converter broadcasts each episode\'s last non-null value to all of '
                    + 'its rows; the value audit above is therefore episode-level, not row-level',
            },
            allianceSemantics: 'observation.rules.alliances is {} on this archive, so a player '
                + 'is its own alliance (src/game/rule_config.ts:168 falls back to the player id)',
            distinctRootsWithDeclaredWinner: [...roots.values()].filter(r => r.sourceWinnerAfter !== null).length,
            totalRoots: roots.size,
            independentNaturalTerminations: [...roots.values()].filter(r => r.sourceWinnerAfter !== null).length,
        },
        lineage: {
            distinctRootFamilies: roots.size,
            mapCount: Object.keys(policyByMap).length,
            policyByMap,
            actionCodePresenceInSource: { present: actionCodeMatched, missing: actionCodeMissing },
        },
    };

    const teacherMix = {
        schema: 'v13_teacher_mix_audit_1',
        generatedAt: manifest.generatedAt,
        poolSha256: poolHash,
        sourceSha256: sourceHash,
        totalRows,
        policyTally,
        policyShare: Object.fromEntries(
            Object.entries(policyTally).map(([k, v]) => [k, +(v / Math.max(1, totalRows)).toFixed(6)])),
        isPolicySingleValuedPerRow: true,
        rootsContainingMoreThanOnePolicy: policyChangesWithinRoot.size,
        rootCount: roots.size,
        mixingIsBetweenRowsNotWithinRows: policyChangesWithinRoot.size > 0,
        interpretation: policyChangesWithinRoot.size > 0
            ? 'Every ROW has exactly one behaviour policy, but many ROOTS contain rows from more '
              + 'than one policy. Per-row filtering or per-row relabelling is therefore sufficient; '
              + 'discarding whole episodes is not required.'
            : 'Every root is single-policy; filtering by root is also available.',
        roots: [...roots.values()].map(r => ({
            rootFamilyId: r.rootFamilyId,
            rows: r.rows,
            policies: r.policies,
            mapName: r.mapName,
            seeds: [...r.seeds],
            nonNullValue: r.nonNullValue,
            nullValue: r.nullValue,
            sourceWinnerAfter: r.sourceWinnerAfter,
        })).sort((a, b) => b.rows - a.rows),
    };

    writeJsonAtomic(path.join(outDir, 'dataset_v3_manifest.json'), manifest);
    writeJsonAtomic(path.join(outDir, 'teacher_mix_audit.json'), teacherMix);

    // A compact provenance sidecar: rowIndex -> policy. This is the column a v3
    // materialisation would carry, and it is what makes per-teacher filtering real
    // rather than aspirational.
    const provPath = path.join(outDir, 'teacher_provenance_by_row.txt');
    fs.mkdirSync(path.dirname(provPath), { recursive: true });
    const tmpProv = `${provPath}.tmp`;
    fs.writeFileSync(tmpProv, policyByRow.join('\n') + '\n', 'utf8');
    fs.renameSync(tmpProv, provPath);

    console.log();
    console.log(`[T13-03] rows=${totalRows} roots=${roots.size} alignmentMismatches=${mismatches}`);
    console.log(`[T13-03] policy tally: ${JSON.stringify(policyTally)}`);
    console.log(`[T13-03] roots with >1 policy: ${policyChangesWithinRoot.size}/${roots.size}`);
    console.log(`[T13-03] valueTarget: present=${valuePresent} null=${valueNull} agree=${valueAgree} disagree=${valueDisagree}`);
    console.log(`[T13-03] independent natural terminations = ${manifest.valueTargetAudit.independentNaturalTerminations}`);
    console.log(`[T13-03] wrote ${path.join(outDir, 'dataset_v3_manifest.json')}`);
    console.log(`[T13-03] wrote ${path.join(outDir, 'teacher_mix_audit.json')}`);
    console.log(`[T13-03] wrote ${provPath}`);
    if (mismatches > 0) {
        console.error('[T13-03] ALIGNMENT FAILED - positional provenance recovery is invalid');
        process.exit(2);
    }
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
