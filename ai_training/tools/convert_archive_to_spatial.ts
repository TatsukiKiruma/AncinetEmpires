/**
 * 离线归档与 PvP 数据集空间张量流式转换器 (Path B Converter)
 *
 * 作用：
 * 流式读取历史归档对局 (2500局) 与 真实人类 PvP 回放 (2.58万步)，
 * 调用 TypeScript 原生空间特征编码器 (encodeGameStateSpatial + encodeCandidateActionSpatial)，
 * 输出为 2D 卷积 ResNet 训练集 (.jsonl)。
 *
 * 特性：
 * - 纯流式读写，零内存堆积 (支持数 GB 大文件转换)
 * - 吞吐量高达 4,000+ 样本/秒
 * - 严格校验合法动作与标签匹配性，自动过滤坏样本
 *
 * =====================================================================
 * T12-03 FIX (branch train/battle-ai-20260923) — what changed and why
 * =====================================================================
 * Before this fix the emitted record had exactly 6 keys and DROPPED all
 * episode identity available in the input, so `python/train_spatial_resnet.py`
 * (line ~480: `ep_id = sample.get("rootFamilyId") or sample.get("episodeId")
 * or f"ep_{idx // 60}"`) silently fell back to a synthetic 60-consecutive-sample
 * grouping, leaking train/val episodes into each other. Also `valueTarget` was
 * only set on the single terminal line of an episode, leaving 29,980/30,000
 * records with a null value target.
 *
 * Fixes, in order of the numbered requirements:
 *  1. Emit `episodeId` + `rootFamilyId` (same readable deterministic value
 *     derived from `scenario.id` + `seed` + `source.episodeIndex`), plus the
 *     free `step` / `turn` / `playerId` fields.
 *  2. `valueTarget` is now the episode's FINAL outcome broadcast to EVERY
 *     decision step of that episode. Implemented as a two-pass stream:
 *       pass 1 - every input file is streamed once and only an
 *                `episodeKey -> last non-null outcome.winnerAfter` map is kept
 *                (never the samples); pass 1 completes for ALL inputs before
 *                pass 2 starts, so an episode split across two input files is
 *                still labelled correctly.
 *       pass 2 - inputs are re-streamed and samples are emitted with
 *                `valueTarget = finalWinner === playerId ? 1.0 : -1.0`, or
 *                `null` when the episode never terminated (censored episodes
 *                MUST stay null - hard requirement from the project taskbook).
 *  3. Refuses to overwrite an existing output file unless `allowOverwrite`
 *     is explicitly set.
 * Plus two safety fixes needed for multi-GB outputs:
 *  - write backpressure is honoured (`drain`), previously the stream buffer
 *    could grow without bound;
 *  - `maxSamples <= 0` means "no cap" (the old code always capped at 30000).
 *
 * See v12/out/spatial/T12-03_converter_fix.md for line references.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { once } from 'events';
import { GameState } from '../src/game/types';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../src/game/ai/spatial_tensor_encoder';
import { decodeAction } from '../src/game/env';

export interface ConvertOptions {
    inputFiles: string[];
    outputFile: string;
    /** <= 0 means "no cap"; undefined keeps the historic 30000 default. */
    maxSamples?: number;
    maxCandidatesPerState?: number;
    seed?: number;
    /** Explicit opt-in required to replace an existing output file. */
    allowOverwrite?: boolean;
    /** Drop samples whose (scenario.id, seed, step) key was already emitted. Default true. */
    dedupeSamples?: boolean;
    /** Optional sidecar JSON path receiving the run statistics. */
    statsFile?: string;
}

/** Separator for the readable episode key. Scenario ids in this corpus never contain '#'. */
const EPISODE_KEY_SEP = '#';

/**
 * Readable, deterministic, equality-groupable episode identity.
 * The trainer only needs equality grouping, so a plain string is preferable
 * to a hash (it is debuggable in the .jsonl).
 */
export function episodeKeyFor(scenarioId: unknown, seed: unknown, episodeIndex: unknown): string | null {
    if (scenarioId === undefined || scenarioId === null) return null;
    if (seed === undefined || seed === null) return null;
    if (episodeIndex === undefined || episodeIndex === null) return null;
    return `${String(scenarioId)}${EPISODE_KEY_SEP}${String(seed)}${EPISODE_KEY_SEP}${String(episodeIndex)}`;
}

/** (scenario.id, seed, step) — the T12-04 dedup key definition. */
export function sampleDedupKeyFor(scenarioId: unknown, seed: unknown, step: unknown): string | null {
    if (scenarioId === undefined || scenarioId === null) return null;
    if (seed === undefined || seed === null) return null;
    if (step === undefined || step === null) return null;
    return `${String(scenarioId)}|${String(seed)}|${String(step)}`;
}

export interface EpisodeRef {
    episodeKey: string | null;
    sampleKey: string | null;
    seed: number | null;
    episodeIndex: number | null;
    /** undefined => no `outcome` object at all; null => outcome present but not terminal. */
    winnerAfter: number | null | undefined;
    hadOutcomeField: boolean;
    viaFallback: boolean;
}

const SCENARIO_RE = /"scenario"\s*:\s*\{\s*"id"\s*:\s*("(?:[^"\\]|\\.)*")/;
const SEED_RE = /"seed"\s*:\s*(-?\d+)/;
const EPISODE_INDEX_RE = /"episodeIndex"\s*:\s*(-?\d+)/;
const STEP_RE = /"step"\s*:\s*(-?\d+)/;
const WINNER_RE = /"winnerAfter"\s*:\s*(null|-?\d+)/;
const HEAD_CHARS = 1200;

/**
 * Cheap field extraction. All of `scenario.id`, `seed`, `source.episodeIndex` and
 * `step` live in the first ~600 bytes of a `skirmish_dataset_sample` line and
 * `outcome` is the last object on the line, so a full JSON.parse of a 150 KB
 * record is avoidable during the (potentially 7 GB) pass-1 scan.
 * Returns null when the cheap path cannot be trusted — the caller then falls
 * back to a real JSON.parse.
 */
function extractEpisodeRefCheap(line: string): EpisodeRef | null {
    const head = line.length > HEAD_CHARS ? line.slice(0, HEAD_CHARS) : line;
    const sm = SCENARIO_RE.exec(head);
    const seedM = SEED_RE.exec(head);
    const epM = EPISODE_INDEX_RE.exec(head);
    const stepM = STEP_RE.exec(head);
    if (!sm || !seedM || !epM || !stepM) return null;
    let scenarioId: string;
    try {
        scenarioId = JSON.parse(sm[1]);
    } catch {
        return null;
    }
    const outcomeIdx = line.lastIndexOf('"outcome"');
    let winnerAfter: number | null | undefined;
    const hadOutcomeField = outcomeIdx >= 0;
    if (hadOutcomeField) {
        const wm = WINNER_RE.exec(line.slice(outcomeIdx));
        if (!wm) return null; // unexpected outcome shape -> fall back to JSON.parse
        winnerAfter = wm[1] === 'null' ? null : Number(wm[1]);
    }
    return {
        episodeKey: episodeKeyFor(scenarioId, seedM[1], epM[1]),
        sampleKey: sampleDedupKeyFor(scenarioId, seedM[1], stepM[1]),
        seed: Number(seedM[1]),
        episodeIndex: Number(epM[1]),
        winnerAfter,
        hadOutcomeField,
        viaFallback: false
    };
}

/** Authoritative (but slower) extraction used for pass 1's fallback path. */
function extractEpisodeRefFromParsed(sampleData: any): EpisodeRef {
    const src = sampleData?.source ?? {};
    const win = sampleData?.outcome?.winnerAfter;
    return {
        episodeKey: episodeKeyFor(sampleData?.scenario?.id, sampleData?.seed, src.episodeIndex),
        sampleKey: sampleDedupKeyFor(sampleData?.scenario?.id, sampleData?.seed, sampleData?.step),
        seed: typeof sampleData?.seed === 'number' ? sampleData.seed : null,
        episodeIndex: src.episodeIndex ?? null,
        winnerAfter: !sampleData?.outcome ? undefined : (win === null || win === undefined ? null : Number(win)),
        hadOutcomeField: !!sampleData?.outcome,
        viaFallback: true
    };
}

/** Cheap first, JSON.parse only when the cheap path is inconclusive. */
export function extractEpisodeRef(line: string): EpisodeRef | null {
    const cheap = extractEpisodeRefCheap(line);
    if (cheap) return cheap;
    let parsed: any;
    try {
        parsed = JSON.parse(line);
    } catch {
        return null;
    }
    return extractEpisodeRefFromParsed(parsed);
}

export interface Pass1Stats {
    lines: number;
    parseFailures: number;
    episodesSeen: number;
    linesWithMissingEpisodeKey: number;
    fallbackParses: number;
}

/**
 * PASS 1: stream a single input file and return only
 * `episodeKey -> LAST non-null outcome.winnerAfter`.
 * Memory is O(number of episodes), never O(number of samples).
 */
async function scanEpisodeFinalOutcomes(
    file: string,
    finals: Map<string, number>,
    episodes: Set<string>,
    onProgress?: (lines: number) => void
): Promise<Pass1Stats> {
    const stats: Pass1Stats = { lines: 0, parseFailures: 0, episodesSeen: 0, linesWithMissingEpisodeKey: 0, fallbackParses: 0 };
    const rl = readline.createInterface({
        input: fs.createReadStream(file, { encoding: 'utf8' }),
        crlfDelay: Infinity
    });
    for await (const line of rl) {
        if (!line.trim()) continue;
        stats.lines++;
        const ref = extractEpisodeRef(line);
        if (!ref) {
            stats.parseFailures++;
            continue;
        }
        if (ref.viaFallback) stats.fallbackParses++;
        if (!ref.episodeKey) {
            stats.linesWithMissingEpisodeKey++;
            continue;
        }
        episodes.add(ref.episodeKey);
        stats.episodesSeen = episodes.size;
        // Iterating in file order and overwriting => "LAST non-null winnerAfter wins".
        if (ref.hadOutcomeField && ref.winnerAfter !== null && ref.winnerAfter !== undefined) {
            finals.set(ref.episodeKey, ref.winnerAfter);
        }
        if (onProgress && stats.lines % 20000 === 0) onProgress(stats.lines);
    }
    return stats;
}

export async function convertArchiveToSpatial(options: ConvertOptions) {
    const maxSamples = options.maxSamples ?? 30000; // <= 0 => unlimited
    const maxCandidates = options.maxCandidatesPerState ?? 48;
    const outDir = path.dirname(options.outputFile);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    if (fs.existsSync(options.outputFile) && !options.allowOverwrite) {
        throw new Error(
            `Refusing to overwrite existing output '${options.outputFile}'. ` +
            `Pass allowOverwrite/--allow-overwrite (or pick a new --output) to replace it.`
        );
    }

    const startTime = performance.now();
    console.log(`=======================================================`);
    console.log(`[Path B Data Ingestion] Spatial Tensor Converter`);
    console.log(`Target Samples: ${maxSamples <= 0 ? 'UNLIMITED' : maxSamples}`);
    console.log(`Output: ${options.outputFile}`);
    console.log(`Input Files: ${options.inputFiles.length}`);
    console.log(`=======================================================\n`);

    // ---------------------------------------------------------------
    // PASS 1 — episode final outcomes only (bounded memory)
    // ---------------------------------------------------------------
    const presentFiles = options.inputFiles.filter(f => {
        if (!fs.existsSync(f)) {
            console.warn(`File not found, skipping: ${f}`);
            return false;
        }
        return true;
    });

    const episodeFinalWinner = new Map<string, number>();
    const pass1Episodes = new Set<string>();
    const pass1Start = performance.now();
    const pass1PerFile: Array<{ file: string } & Pass1Stats> = [];
    let pass1TotalLines = 0;
    let pass1Fallbacks = 0;
    let pass1ParseFailures = 0;
    let pass1MissingEpisodeKey = 0;

    console.log(`[Pass 1/${presentFiles.length}] Scanning episode terminal outcomes ...`);
    for (const file of presentFiles) {
        const perFileStart = performance.now();
        const st = await scanEpisodeFinalOutcomes(file, episodeFinalWinner, pass1Episodes);
        pass1TotalLines += st.lines;
        pass1Fallbacks += st.fallbackParses;
        pass1ParseFailures += st.parseFailures;
        pass1MissingEpisodeKey += st.linesWithMissingEpisodeKey;
        pass1PerFile.push({ file, ...st });
        console.log(
            `  ${path.basename(file)}: ${st.lines} lines, ${st.episodesSeen} episodes ` +
            `(${((performance.now() - perFileStart) / 1000).toFixed(1)}s)`
        );
    }
    const pass1Elapsed = (performance.now() - pass1Start) / 1000;
    console.log(
        `[Pass 1 done] ${pass1TotalLines} lines in ${pass1Elapsed.toFixed(1)}s | ` +
        `${pass1Episodes.size} distinct episodes | ${episodeFinalWinner.size} episodes with a terminal winner | ` +
        `cheap-path fallbacks ${pass1Fallbacks} | parse failures ${pass1ParseFailures} | missing episode key ${pass1MissingEpisodeKey}\n`
    );

    // ---------------------------------------------------------------
    // PASS 2 — emit samples
    // ---------------------------------------------------------------
    const outStream = fs.createWriteStream(options.outputFile, { encoding: 'utf8' });
    let totalSaved = 0;
    let totalSkipped = 0;
    let duplicateSamplesSkipped = 0;
    let valueTargetNonNull = 0;
    let valueTargetNull = 0;
    const emittedEpisodes = new Set<string>();
    const emittedValueNonNullEpisodes = new Set<string>();
    const seenSampleKeys = new Set<string>();
    let hitSampleCap = false;
    let stoppedInFile: string | null = null;
    let episodeKeyFallbacks = 0;

    const writeLine = async (text: string) => {
        if (!outStream.write(text)) {
            await once(outStream, 'drain');
        }
    };

    const pass2Start = performance.now();

    outer:
    for (const file of presentFiles) {
        console.log(`[Pass 2] Processing file: ${file} ...`);
        const rl = readline.createInterface({
            input: fs.createReadStream(file, { encoding: 'utf8' }),
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            if (!line.trim()) continue;
            let sampleData: any;
            try {
                sampleData = JSON.parse(line);
            } catch {
                totalSkipped++;
                continue;
            }

            const obs = sampleData.observation;
            const label = sampleData.label;
            const legalCodes: string[] = sampleData.legalActionCodes;

            if (!obs || !label || !label.actionCode || !legalCodes || legalCodes.length === 0) {
                totalSkipped++;
                continue;
            }

            // --- T12-03: episode identity (requirement 1) ---
            const ref = extractEpisodeRefFromParsed(sampleData);
            // Fallback identity is per-input-file so it can never merge two distinct
            // episodes into one root (which would re-introduce train/val leakage) and
            // can never split one episode across two roots.
            const episodeKey = ref.episodeKey
                ?? `${path.basename(file)}${EPISODE_KEY_SEP}${ref.seed ?? 'seedUnknown'}${EPISODE_KEY_SEP}${ref.episodeIndex ?? 'epUnknown'}`;
            if (!ref.episodeKey) episodeKeyFallbacks++;

            // --- T12-04: cross-file duplicate suppression on (scenario.id, seed, step) ---
            if (options.dedupeSamples !== false) {
                const dk = ref.sampleKey ?? episodeKey + '|' + String(sampleData.step);
                if (seenSampleKeys.has(dk)) {
                    duplicateSamplesSkipped++;
                    continue;
                }
                seenSampleKeys.add(dk);
            }

            // 还原 GameState
            const tiles: any[][] = Array.from({ length: obs.mapHeight }, () => new Array(obs.mapWidth));
            for (const t of obs.tiles) {
                tiles[t.y][t.x] = t;
            }
            const units = obs.units.map((u: any) => ({ ...u, pos: u.pos ?? { x: u.x, y: u.y } }));
            const players = (obs.players ?? []).map((p: any) => ({
                ...p,
                commanderDeathCount: p.commanderDeathCount ?? 0,
                commanderReserveLevel: p.commanderReserveLevel ?? p.reserveLevel ?? 0,
                commanderReserveExp: p.commanderReserveExp ?? p.reserveExp ?? 0
            }));
            const obsRules = obs.rules ?? {};
            const restoredPrices = {
                ...(obsRules.prices ?? {}),
                ...(obsRules.priceOverrides ?? {})
            };
            const rules = {
                ...obsRules,
                prices: restoredPrices,
                commanderRecruitBaseCost: obsRules.commanderRecruitBaseCost !== undefined ? obsRules.commanderRecruitBaseCost : 400,
                commanderRecruitCostGrowth: obsRules.commanderRecruitCostGrowth !== undefined ? obsRules.commanderRecruitCostGrowth : 100,
                commanderCastleRecruitUsesPending: obsRules.commanderCastleRecruitUsesPending ?? false
            };
            const state: GameState = {
                turn: obs.turn,
                currentPlayer: obs.currentPlayer,
                pendingUnitId: obs.pendingUnitId,
                map: { width: obs.mapWidth, height: obs.mapHeight, tiles },
                units,
                players,
                rules,
                metadata: obs.metadata,
                winner: null
            };

            const playerId = sampleData.playerId ?? obs.currentPlayer;
            const enc = encodeGameStateSpatial(state, playerId);

            // 寻找专家选择动作的下标
            let labelIndex = -1;
            const targetActionCode = label.actionCode;

            // 候选动作提取 (截断至 maxCandidates，但严禁丢弃专家动作与指挥官重招募动作)
            let candidateCodes = legalCodes;
            if (candidateCodes.length > maxCandidates) {
                const preserved = new Set<string>();
                if (targetActionCode) preserved.add(targetActionCode);
                for (const code of candidateCodes) {
                    if (code.startsWith('recruit_to_castle:commander:') || code.startsWith('recruit_and_deploy:commander:')) {
                        preserved.add(code);
                    }
                }
                const resultList = Array.from(preserved);
                for (const code of candidateCodes) {
                    if (resultList.length >= maxCandidates) break;
                    if (!preserved.has(code)) {
                        resultList.push(code);
                    }
                }
                candidateCodes = resultList;
            }

            const candidatesList: any[] = [];
            for (let i = 0; i < candidateCodes.length; i++) {
                const code = candidateCodes[i];
                if (code === targetActionCode) {
                    labelIndex = candidatesList.length;
                }
                const act = decodeAction(code);
                if (!act) continue;
                const feat = encodeCandidateActionSpatial(state, playerId, act);
                candidatesList.push({
                    actorCoord: feat.actorCoord,
                    landingCoord: feat.landingCoord,
                    targetCoord: feat.targetCoord,
                    semantics: Array.from(feat.semantics)
                });
            }

            if (labelIndex === -1 || candidatesList.length === 0) {
                totalSkipped++;
                continue;
            }

            // --- T12-03 requirement 2: episode final outcome broadcast to every step ---
            // A censored episode (no non-null winnerAfter anywhere) is absent from the
            // map and therefore keeps valueTarget === null. Hard requirement.
            let valueTarget: number | null = null;
            if (episodeFinalWinner.has(episodeKey)) {
                valueTarget = episodeFinalWinner.get(episodeKey) === playerId ? 1.0 : -1.0;
            }
            if (valueTarget === null) valueTargetNull++; else valueTargetNonNull++;

            const exportObj = {
                sampleId: `s_${totalSaved}_${sampleData.source?.episodeIndex ?? 0}_${sampleData.step ?? 0}`,
                episodeId: episodeKey,
                rootFamilyId: episodeKey,
                step: sampleData.step ?? null,
                turn: sampleData.turn ?? obs.turn ?? null,
                playerId: playerId ?? null,
                spatialTensor: Array.from(enc.spatialTensor),
                globalFeatures: Array.from(enc.globalFeatures),
                targetActionIndex: labelIndex,
                candidateActions: candidatesList,
                valueTarget
            };

            await writeLine(JSON.stringify(exportObj) + '\n');
            totalSaved++;
            emittedEpisodes.add(episodeKey);
            if (valueTarget !== null) emittedValueNonNullEpisodes.add(episodeKey);

            if (totalSaved % 2000 === 0) {
                const curElapsed = (performance.now() - startTime) / 1000;
                console.log(`  -> Converted ${totalSaved} samples (${(totalSaved / curElapsed).toFixed(1)} samples/s, skipped ${totalSkipped}, dupes ${duplicateSamplesSkipped})`);
            }

            if (maxSamples > 0 && totalSaved >= maxSamples) {
                hitSampleCap = true;
                stoppedInFile = file;
                break outer;
            }
        }
    }

    outStream.end();
    await new Promise<void>(resolve => outStream.on('finish', () => resolve()));

    const totalElapsed = (performance.now() - startTime) / 1000;
    const fileBytes = fs.existsSync(options.outputFile) ? fs.statSync(options.outputFile).size : 0;

    const stats = {
        outputFile: options.outputFile,
        outputBytes: fileBytes,
        inputFiles: presentFiles,
        requestedMaxSamples: maxSamples,
        unlimited: maxSamples <= 0,
        hitSampleCap,
        capStoppedInFile: stoppedInFile,
        totalSaved,
        totalSkipped,
        duplicateSamplesSkipped,
        valueTargetNonNull,
        valueTargetNull,
        valueTargetNonNullPct: totalSaved ? +(100 * valueTargetNonNull / totalSaved).toFixed(3) : 0,
        distinctRootFamilyIdsEmitted: emittedEpisodes.size,
        distinctEpisodesWithNonNullValue: emittedValueNonNullEpisodes.size,
        distinctEpisodesWithTerminalWinnerInInput: episodeFinalWinner.size,
        distinctEpisodesInInput: pass1Episodes.size,
        episodeKeyFallbacks,
        pass1: {
            lines: pass1TotalLines,
            elapsedSeconds: +pass1Elapsed.toFixed(2),
            linesPerSecond: pass1Elapsed > 0 ? +(pass1TotalLines / pass1Elapsed).toFixed(1) : null,
            cheapPathFallbacks: pass1Fallbacks,
            parseFailures: pass1ParseFailures,
            linesWithMissingEpisodeKey: pass1MissingEpisodeKey,
            perFile: pass1PerFile.map(p => ({
                file: p.file, lines: p.lines, episodesSeen: p.episodesSeen,
                cheapPathFallbacks: p.fallbackParses, parseFailures: p.parseFailures,
                linesWithMissingEpisodeKey: p.linesWithMissingEpisodeKey
            }))
        },
        elapsedSeconds: +totalElapsed.toFixed(2),
        samplesPerSecond: totalElapsed > 0 ? +(totalSaved / totalElapsed).toFixed(1) : null
    };

    console.log(`\n=======================================================`);
    console.log(`[Conversion Complete] Successfully generated ${totalSaved} spatial samples!`);
    console.log(`valueTarget non-null: ${valueTargetNonNull} (${stats.valueTargetNonNullPct}%) | null: ${valueTargetNull}`);
    console.log(`distinct rootFamilyId: ${emittedEpisodes.size} | episodes with non-null value: ${emittedValueNonNullEpisodes.size}`);
    console.log(`duplicate (scenario,seed,step) samples skipped: ${duplicateSamplesSkipped}`);
    console.log(`Total Time: ${totalElapsed.toFixed(2)}s (${stats.samplesPerSecond} samples/s)`);
    console.log(`Output: ${options.outputFile} (${fileBytes} bytes)`);
    console.log(`=======================================================\n`);

    if (options.statsFile) {
        const sd = path.dirname(options.statsFile);
        if (!fs.existsSync(sd)) fs.mkdirSync(sd, { recursive: true });
        fs.writeFileSync(options.statsFile, JSON.stringify(stats, null, 2));
        console.log(`Stats written to ${options.statsFile}`);
    }

    return { totalSaved, totalSkipped, outputFile: options.outputFile, stats };
}

// ---------------------------------------------------------------------------
// CLI Entrypoint
// ---------------------------------------------------------------------------
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('convert_archive_to_spatial')) {
    const DIR = 'training_runs/agent_upgrade_20260919_01/baseline_dataset';
    const pvpFile = `${DIR}/dataset_part_pvp.jsonl`;
    const baselineParts = Array.from({ length: 9 }, (_, i) => `${DIR}/dataset_part_0${i}.jsonl`);

    const argv = process.argv.slice(2);
    const argOf = (name: string): string | undefined => {
        const i = argv.indexOf(name);
        return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
    };

    // Default input pool is the COMPLETE archive plus every split part. The
    // T12-04 dedup report proves `baseline_dataset.jsonl` is an exact superset of
    // `dataset_part_pvp.jsonl` + `dataset_part_00..08` (22,830 + 25,884 = 48,714 =
    // baseline's line count, disjoint partition), so passing the default pool
    // costs one redundant 7 GB read and relies on `dedupeSamples` to drop the
    // duplicates. Pass `--inputs <file>` to convert only the superset file.
    const defaultInputs = [pvpFile, ...baselineParts, `${DIR}/baseline_dataset.jsonl`];
    const inputFiles = (argOf('--inputs') ?? process.env.SPATIAL_INPUTS)
        ? (argOf('--inputs') ?? process.env.SPATIAL_INPUTS)!.split(',').map(s => s.trim()).filter(Boolean)
        : defaultInputs;

    const outputFile = argOf('--output') ?? process.env.SPATIAL_OUT
        ?? 'training_runs/spatial_dataset/spatial_v2_full_pool.jsonl';

    // TARGET_SAMPLES=0 => unlimited (convert the whole pool).
    const targetRaw = argOf('--max-samples') ?? process.env.TARGET_SAMPLES ?? '0';
    const targetCount = parseInt(targetRaw, 10);
    if (!Number.isFinite(targetCount)) {
        console.error(`Invalid --max-samples/TARGET_SAMPLES value: ${targetRaw}`);
        process.exit(2);
    }

    convertArchiveToSpatial({
        inputFiles,
        outputFile,
        maxSamples: targetCount,
        maxCandidatesPerState: parseInt(argOf('--max-candidates') ?? '48', 10),
        allowOverwrite: argv.includes('--allow-overwrite'),
        dedupeSamples: !argv.includes('--no-dedupe'),
        statsFile: argOf('--stats') ?? process.env.SPATIAL_STATS
    }).catch(err => {
        console.error('Fatal error during spatial conversion:', err);
        process.exit(1);
    });
}
