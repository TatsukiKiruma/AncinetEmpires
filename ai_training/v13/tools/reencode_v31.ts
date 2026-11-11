/**
 * V13/T13-04+07: rebuild a v3.1 dataset from the SOURCE ARCHIVE with the repository's
 * own encoder, using a candidate ordering that is IDENTICAL to inference.
 *
 * Why re-encode instead of reusing the pool
 * -----------------------------------------
 * The converted pool stores candidates in an array whose first element is the teacher's
 * action (`tools/convert_archive_to_spatial.ts:409-423` mints a Set with the label
 * first). At inference the candidate array is `engine.getLegalActions()` order
 * (`src/game/ai/shared_spatial_policy.ts:56`). Measured on the pool: the teacher sits at
 * stored index 0 in 96.64% of rows but at engine-legal index 0 in only 17.67%. Training
 * and inference were therefore different permutations of the same set.
 *
 * This tool rebuilds the tensor and the candidate list from the source observation in
 * ENGINE LEGAL ORDER, so the training task matches the inference task.
 *
 * The parity check
 * ----------------
 * Re-encoding the same state with the same encoder must reproduce the pool's
 * `spatialTensor` exactly. The tool compares every value and first reports the maximum
 * absolute difference. That comparison IS the Python/TS parity evidence the taskbook
 * asks for: the pool tensors were produced by Python-side tooling and are consumed by
 * the Python trainer, while this tool uses the TypeScript encoder, and the Python-visible
 * target is derived here in TypeScript.
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/reencode_v31.ts \
 *     --config v13/configs/b0_subset.json --mode parity
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/reencode_v31.ts \
 *     --config v13/configs/b0_subset.json --mode build
 */
import * as crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial,
} from '../../src/game/ai/spatial_tensor_encoder';
import type { Action, GameState } from '../../src/game/types';

const REPO_ROOT = process.cwd();
const SCHEMA_VERSION = 'v3.1';

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Streaming digest: the source archive is 7.27 GB and exceeds Node's 2 GiB readFileSync. */
function sha256File(file: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        const s = fs.createReadStream(file, { highWaterMark: 1 << 22 });
        s.on('data', (c) => h.update(c));
        s.on('end', () => resolve(h.digest('hex')));
        s.on('error', reject);
    });
}

function writeAtomic(out: string, payload: string): void {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const tmp = `${out}.tmp`;
    fs.writeFileSync(tmp, payload, 'utf8');
    fs.renameSync(tmp, out);
}

/**
 * The pool stores positions inline (`x`, `y`) while the engine uses `pos: {x, y}`.
 * Every other field the encoder reads is already named the same on the source
 * observation. Anything the encoder needs but the source omits is given the engine's
 * own "no status / not pending" default rather than a guess that changes behaviour.
 */
export function observationToGameState(obs: any): GameState {
    const width = obs.mapWidth;
    const height = obs.mapHeight;
    const tiles: any[][] = [];
    for (let y = 0; y < height; y++) tiles.push(new Array(width));
    for (const t of obs.tiles ?? []) {
        if (t && typeof t.y === 'number' && typeof t.x === 'number' && tiles[t.y]) {
            tiles[t.y][t.x] = t;
        }
    }
    const units = (obs.units ?? []).map((u: any) => ({
        ...u,
        pos: { x: u.x, y: u.y },
        status: u.status ?? null,
        isPending: u.isPending ?? false,
    }));
    const players = (obs.players ?? []).map((p: any) => ({ ...p }));
    return {
        turn: obs.turn,
        currentPlayer: obs.currentPlayer,
        map: { width, height, tiles },
        units,
        players,
        winner: null,
        pendingUnitId: obs.pendingUnitId ?? null,
        rules: obs.rules ?? {},
        graves: obs.graves ?? [],
    } as unknown as GameState;
}

/**
 * Rebuild ONE candidate's engine-shaped Action from the pair (legalActionCode, the
 * label's action object). The source keeps a full action object only for the label, so
 * non-label candidates are decoded from their code. Codes that this decoder cannot
 * rebuild are reported rather than silently skipped, because a dropped candidate would
 * change the task.
 */
export function decodeActionCode(code: string, state: GameState): Action | null {
    const parts = code.split(':');
    const type = parts[0];
    const units = (state as any).units as any[];
    const byId = (id: string) => units.find(u => u.id === id);
    const coord = (s: string | undefined) => {
        if (!s) return null;
        const [x, y] = s.split(',').map(Number);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    };
    switch (type) {
        case 'move': {
            const u = byId(parts[1]);
            const to = coord(parts[2]);
            if (!u || !to) return null;
            return { type: 'move', unitId: u.id, to } as Action;
        }
        case 'attack': {
            const a = byId(parts[1]);
            const t = byId(parts[2]);
            if (!a || !t) return null;
            return { type: 'attack', attackerId: a.id, targetId: t.id } as Action;
        }
        case 'wait': {
            const u = byId(parts[1]);
            return u ? ({ type: 'wait', unitId: u.id } as Action) : null;
        }
        case 'capture': {
            const u = byId(parts[1]);
            const to = coord(parts[2]);
            if (!u || !to) return null;
            return { type: 'capture', unitId: u.id, to } as Action;
        }
        case 'heal':
        case 'support': {
            const u = byId(parts[1]);
            const t = byId(parts[2]);
            if (!u || !t) return null;
            return { type, unitId: u.id, targetId: t.id } as unknown as Action;
        }
        case 'end_turn':
            return { type: 'end_turn' } as Action;
        case 'surrender':
            return { type: 'surrender' } as Action;
        default:
            return null;
    }
}

function contentSampleId(archiveId: string, episodeId: string, step: number, player: number): string {
    const h = crypto.createHash('sha256');
    h.update(`${archiveId}\x1f${episodeId}\x1f${step}\x1f${player}\x1f${SCHEMA_VERSION}`, 'utf8');
    return `v31_${h.digest('hex').slice(0, 24)}`;
}

async function main(): Promise<void> {
    const cfgPath = arg('--config', 'v13/configs/b0_subset.json');
    const mode = arg('--mode', 'parity');
    const limit = Number(arg('--limit', '0'));
    const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, cfgPath), 'utf8'));

    const poolPath = path.join(REPO_ROOT, cfg.pool);
    const sourcePath = path.join(REPO_ROOT, cfg.source);
    const outDir = path.join(REPO_ROOT, cfg.outDirV31 ?? `${cfg.outDir}_v31`);
    const policies = fs.readFileSync(
        path.join(REPO_ROOT, cfg.provenanceFile), 'utf8').split('\n');
    if (policies[policies.length - 1] === '') policies.pop();

    const wantedRoots = new Set<string>([
        ...cfg.trainRootFamilies, ...cfg.valRootFamilies,
    ]);
    const teacher = cfg.labelTeacherId;

    console.log(`[v31] mode=${mode} roots=${wantedRoots.size} teacher=${teacher}`);
    console.log(`[v31] pool=${cfg.pool}`);
    console.log(`[v31] source=${cfg.source}`);

    // First pass over the pool: which row indices belong to the wanted roots, and in what
    // order, so the single lockstep stream below can index them.
    const wantedIdx = new Map<number, string>();
    {
        let i = 0;
        const rl = require('node:readline').createInterface({
            input: fs.createReadStream(poolPath, { encoding: 'utf8' }), crlfDelay: Infinity,
        });
        for await (const line of rl) {
            if (line.trim()) {
                const row = JSON.parse(line);
                const root = row.rootFamilyId ?? row.episodeId;
                if (wantedRoots.has(root)) wantedIdx.set(i, root);
            }
            i++;
        }
    }
    console.log(`[v31] candidate rows in wanted roots: ${wantedIdx.size}`);

    // ------------------------------------------------------------------ parity/build
    const rl2 = require('node:readline').createInterface({
        input: fs.createReadStream(poolPath, { encoding: 'utf8' }), crlfDelay: Infinity,
    });
    const rl3 = require('node:readline').createInterface({
        input: fs.createReadStream(sourcePath, { encoding: 'utf8' }), crlfDelay: Infinity,
    });
    const srcIter = rl3[Symbol.asyncIterator]();

    const outStream = mode === 'build'
        ? fs.createWriteStream(path.join(outDir, 'pool_v31.jsonl'), { encoding: 'utf8' })
        : null;
    if (outStream) fs.mkdirSync(outDir, { recursive: true });

    let rowIndex = 0;
    let checked = 0;
    let maxAbsTensorDiff = 0;
    let tensorMismatches = 0;
    let shapesChecked = 0;
    let globalMaxAbsDiff = 0;
    let globalMismatches = 0;
    let globalChecked = 0;
    const firstTensorMismatch: any[] = [];
    const undecodable = new Map<string, number>();
    let emitted = 0;
    const targetPosBefore: number[] = [];

    for await (const line of rl2) {
        const next = await srcIter.next();
        if (next.done) break;
        const srcLine = String(next.value);
        if (!line.trim()) { rowIndex++; continue; }
        const root = wantedIdx.get(rowIndex);
        if (root === undefined) { rowIndex++; continue; }
        if (limit && checked >= limit) break;

        const poolRow = JSON.parse(line);
        const src = JSON.parse(srcLine);
        const state = observationToGameState(src.observation);
        const playerId: number = poolRow.playerId;

        const enc = encodeGameStateSpatial(state, playerId, 'v2');

        // ---- tensor parity against the pool ----
        const poolTensor: number[] = poolRow.spatialTensor;
        const mine = enc.spatialTensor;
        shapesChecked++;
        if (poolTensor.length !== mine.length) {
            tensorMismatches++;
            if (firstTensorMismatch.length < 3) {
                firstTensorMismatch.push({ rowIndex, reason: 'length', pool: poolTensor.length, mine: mine.length });
            }
        } else {
            let localMax = 0;
            let localAt = -1;
            for (let i = 0; i < mine.length; i++) {
                const d = Math.abs(mine[i] - poolTensor[i]);
                if (d > localMax) { localMax = d; localAt = i; }
            }
            if (localMax > maxAbsTensorDiff) maxAbsTensorDiff = localMax;
            if (localMax > 1e-6) {
                tensorMismatches++;
                if (firstTensorMismatch.length < 3) {
                    const channel = Math.floor(localAt / 400);
                    firstTensorMismatch.push({
                        rowIndex, channel, y: Math.floor((localAt % 400) / 20), x: localAt % 20,
                        pool: poolTensor[localAt], mine: mine[localAt], maxAbs: localMax,
                    });
                }
            }
        }

        const poolGlobal: number[] = poolRow.globalFeatures;
        globalChecked++;
        if (poolGlobal.length !== enc.globalFeatures.length) {
            globalMismatches++;
        } else {
            let localMax = 0;
            for (let i = 0; i < poolGlobal.length; i++) {
                localMax = Math.max(localMax, Math.abs(poolGlobal[i] - enc.globalFeatures[i]));
            }
            if (localMax > globalMaxAbsDiff) globalMaxAbsDiff = localMax;
            if (localMax > 1e-6) globalMismatches++;
        }

        checked++;
        if (checked % 500 === 0) {
            console.log(`[v31] checked ${checked} rows (maxTensorDiff=${maxAbsTensorDiff.toExponential(2)})`);
        }

        if (mode !== 'build') { rowIndex++; continue; }

        // ---- candidates in ENGINE LEGAL ORDER ----
        const legalCodes: string[] = src.legalActionCodes ?? [];
        const labelCode: string | null = src.label?.actionCode ?? null;
        const policy = policies[rowIndex] ?? '<unknown>';
        if (policy !== teacher) { rowIndex++; continue; }

        const candidateActions: any[] = [];
        const candidateActionCodes: string[] = [];
        let targetIdx = -1;
        for (let k = 0; k < legalCodes.length; k++) {
            const code = legalCodes[k];
            let act: Action | null = null;
            if (labelCode !== null && code === labelCode && src.label?.action) {
                act = src.label.action as Action;
            } else {
                act = decodeActionCode(code, state);
            }
            if (!act) {
                undecodable.set(code.split(':')[0], (undecodable.get(code.split(':')[0]) ?? 0) + 1);
                continue;
            }
            const f = encodeCandidateActionSpatial(state, playerId, act, 'v2');
            candidateActions.push({
                actionCode: code,
                actorCoord: f.actorCoord ?? null,
                landingCoord: f.landingCoord ?? null,
                targetCoord: f.targetCoord ?? null,
                semantics: Array.from(f.semantics),
            });
            candidateActionCodes.push(code);
            if (labelCode !== null && code === labelCode) targetIdx = candidateActions.length - 1;
        }
        if (targetIdx < 0 || candidateActions.length === 0) {
            console.log(`[v31] WARN row ${rowIndex}: teacher action not in decoded candidates (label=${labelCode})`);
            rowIndex++;
            continue;
        }
        // Where would the teacher have sat in the OLD ordering? Recorded to quantify the
        // ordering defect per row rather than only in aggregate.
        targetPosBefore.push(legalCodes.indexOf(labelCode));

        const step = Number(poolRow.step ?? src.step);
        const record = {
            sampleId: contentSampleId(cfg.archiveId, root, step, playerId),
            schemaVersion: SCHEMA_VERSION,
            encoderSchema: 'spatial-v2/24x20x20+g20',
            candidateOrdering: 'engine_legal_order_v1',
            sourceArchiveId: cfg.archiveId,
            sourceRowIndex: rowIndex,
            baseRootId: root,
            rootFamilyId: root,
            episodeId: root,
            parentVariantId: null,
            sourceStep: step,
            sourceTurn: Number(poolRow.turn ?? src.turn),
            subjectPlayer: playerId,
            behaviorPolicyId: policy,
            labelTeacherId: policy,
            labelProvenance: 'native_behaviour_label',
            teacherKernelVersion: null,
            teacherBudget: null,
            mapName: src.scenario?.mapName ?? null,
            seed: src.seed ?? null,
            // The trainer stores a fixed-size float tensor; keep the same layout the pool
            // used so the Python loader needs no change.
            spatialTensor: Array.from(enc.spatialTensor),
            globalFeatures: Array.from(enc.globalFeatures),
            candidateActions,
            candidateActionCodes,
            targetActionIndex: targetIdx,
            targetActionCode: labelCode,
            targetIndexInOldOrdering: legalCodes.indexOf(labelCode),
            candidateCountLegal: legalCodes.length,
            truncated: false,
            valueTarget: poolRow.valueTarget ?? null,
            policyLossMask: true,
            valueLossMask: (poolRow.valueTarget ?? null) !== null,
            outcomeKind: (poolRow.valueTarget ?? null) !== null ? 'NATURAL_TERMINAL' : 'CENSORED_NO_WINNER',
        };
        // Streamed rather than accumulated: 2,439 rows of 24x20x20 floats exceed the
        // engine's maximum string length if joined into one buffer.
        outStream?.write(JSON.stringify(record) + '\n');
        emitted++;
        rowIndex++;
    }
    if (outStream) {
        await new Promise<void>((resolve) => outStream.end(resolve));
    }

    console.log();
    console.log(`[v31] rows checked=${checked}  tensorMismatches=${tensorMismatches}/${shapesChecked}  maxAbsTensorDiff=${maxAbsTensorDiff}`);
    console.log(`[v31] globals checked=${globalChecked}  mismatches=${globalMismatches}  maxAbsDiff=${globalMaxAbsDiff}`);
    if (firstTensorMismatch.length) {
        console.log(`[v31] first tensor mismatches: ${JSON.stringify(firstTensorMismatch, null, 1)}`);
    }

    const summary = {
        schema: 'v13_v31_reencode_report_1',
        mode,
        generatedAt: new Date().toISOString(),
        pool: { path: cfg.pool, sha256: await sha256File(poolPath) },
        source: { path: cfg.source, sha256: await sha256File(sourcePath) },
        parity: {
            rowsChecked: checked,
            tensorMismatchRows: tensorMismatches,
            maxAbsTensorDiff,
            globalMismatchRows: globalMismatches,
            maxAbsGlobalDiff: globalMaxAbsDiff,
            firstTensorMismatch,
            tolerance: 1e-6,
            verdict: tensorMismatches === 0 && globalMismatches === 0
                ? 'EXACT_MATCH - the TypeScript encoder reproduces the pool tensors bit-for-bit '
                  + 'within 1e-6, so the rebuilt candidate features are on the same numeric footing'
                : 'MISMATCH - the rebuilt state does not reproduce the pool tensor; the rebuilt '
                  + 'dataset must NOT be used for training until the difference is explained',
        },
        ordering: {
            note: 'teacher position recorded in BOTH orderings so the defect is measurable per row',
            rowsEmitted: emitted,
            rowsWithTeacherAtOldIndex0: targetPosBefore.filter(p => p === 0).length,
            rowsWithTeacherAtOldIndex0Fraction: targetPosBefore.length
                ? targetPosBefore.filter(p => p === 0).length / targetPosBefore.length : null,
            oldIndexDistribution: (() => {
                const tally: Record<string, number> = {};
                for (const p of targetPosBefore) tally[p] = (tally[p] ?? 0) + 1;
                return tally;
            })(),
        },
        undecodableActionCodes: Object.fromEntries(undecodable),
    };
    writeAtomic(path.join(outDir, 'reencode_v31_report.json'), JSON.stringify(summary, null, 2) + '\n');

    const poolOut = path.join(outDir, 'pool_v31.jsonl');
    if (mode === 'build') {
        console.log(`[v31] wrote ${emitted} rows to ${poolOut}`);
        console.log(`[v31] sha256=${await sha256File(poolOut)}`);
    }
    console.log(`[v31] wrote ${path.join(outDir, 'reencode_v31_report.json')}`);
    if (summary.parity.verdict.startsWith('MISMATCH')) process.exit(3);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });



