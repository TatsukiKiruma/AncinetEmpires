/**
 * V19/T19-02 + T19-04：主体座位采样收集器（2026-09-29 复核后重写）。
 *
 * 与上一版的差别（对应 `V19_PROGRESS_REVIEW_20260929.md` B 节）：
 * 1. **分块流式写出**：主体决策按 `--chunk-size` 分块落盘，写完一块释放内存。
 *    不再有 2000 条记录上限 —— 长局的**全程**都会被保存，内存只与块大小有关。
 * 2. **可恢复**：默认 `--resume true`，按 gameId 只补缺失的局，不从第一张图重采。
 * 3. **队列按地图/座位轮转**：seed 最外层、地图次之、座位最内层，
 *    预算到点时五图得到的局数大致均衡（旧版按地图顺序采，wave1 的 Crossed 只采到 7 局）。
 * 4. **seed 全局唯一检查**：新公式每图可容纳 1000 个 seed；构造完队列后断言无重复。
 * 5. **行为身份**：每条 transition 记录采样时冻结的行为模型 SHA；下一波必须用本波导出的模型采样。
 * 6. **可重放**：每局保存完整动作序列与每个主体回合边界的完整规范化状态哈希。
 *
 * 数据布局（每波一个目录）：
 *   <key>.transitions.jsonl  每条 transition 的元数据 + 张量在 blob 中的偏移
 *   <key>.tensors.f32        Float32 小端二进制块：空间张量 + 全局特征 + 每个候选的语义
 *   <key>.games.jsonl        每局一行：终局记录 + 完整动作序列 + 回合边界快照
 *   <key>.commits.jsonl      每局提交后的三个数据文件有效字节尾部
 *   <key>.summary.json       吞吐与组成统计
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { SUPPORTED_ENCODER_SCHEMA_IDS } from '../../src/game/ai/spatial_tensor_encoder';
import { UNPACK_DIR, SD_PLAN_FILE } from '../../v14/tools/eval_v14_match';
import { V16_DEFAULT_CAPS } from '../../v16/tools/eval_v16_protocol';
import {
    playSubjectEpisode,
    type SubjectChunkV19,
    type SubjectEpisodeResultV19,
} from '../env/subject_episode';
import {
    COLLECTION_COMMIT_SCHEMA,
    formatCollectionCommit,
    prepareCollectionResume,
    type CollectionCommit,
} from './collection_resume';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const FIVE_MAPS = [
    '(2) Duel.aem',
    '(2) Icy Paths.aem',
    '(2) Liberty Port.aem',
    '(2) Mourningstar.aem',
    '(2) Crossed swords.aem',
] as const;

/**
 * V19 训练采样命名空间（2026-09-29 起的新公式）。
 *
 * 旧公式 `BASE + 1000*wave + 10*mapIndex + seedIndex` 每图只能容纳 10 个 seed，
 * 超过就会与相邻地图撞号。新公式每图 1000 个、每波 100000 个，并在构造队列后做唯一性断言。
 */
export const V19_TRAIN_SEED_BASE_V2 = 2611000000;

export function trainSeedV19(wave: number, mapIndex: number, seedIndex: number): number {
    return V19_TRAIN_SEED_BASE_V2 + 100000 * wave + 1000 * mapIndex + seedIndex;
}

function sha256File(file: string): string {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** 带背压的写盘：采样主循环的 await 大多在微任务里完成，不交回事件循环会让缓冲排不出去。 */
async function writeChunk(stream: fs.WriteStream, chunk: string | Buffer): Promise<void> {
    if (!stream.write(chunk)) {
        await new Promise<void>((resolve) => stream.once('drain', resolve));
    }
}

/** 中文：建立同一 stream 的写入屏障并同步到磁盘，保证局级 commit 不会越过数据文件。 */
async function syncStream(stream: fs.WriteStream): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        stream.write(Buffer.alloc(0), (error) => error ? reject(error) : resolve());
    });
    const descriptor = (stream as unknown as { fd: number | null }).fd;
    if (typeof descriptor !== 'number') throw new Error('写入流尚未取得文件描述符，无法提交本局');
    await new Promise<void>((resolve, reject) => {
        fs.fdatasync(descriptor, (error) => error ? reject(error) : resolve());
    });
}

interface PlannedGame {
    gameId: string;
    mapIndex: number;
    mapName: string;
    seedIndex: number;
    seed: number;
    subjectSeat: number;
}

async function main(): Promise<void> {
    const wave = Number(arg('--wave', '3'));
    const runId = arg('--run-id', 'run_20260929_v19_02') as string;
    const modelPath = arg('--model', null);
    const modelKey = arg('--model-key', 'wave') as string;
    const seedsPerMap = Number(arg('--seeds-per-map', '8'));
    const outDir = path.resolve(arg('--out-dir', `v19/out/${runId}/data/wave${wave}`) as string);
    const sample = arg('--sample', 'true') !== 'false';
    const maxSteps = Number(arg('--max-steps', String(V16_DEFAULT_CAPS.maxStepsAtomicActions)));
    const wallMs = Number(arg('--wall-ms', String(V16_DEFAULT_CAPS.wallTimeoutMs)));
    const maxPlies = arg('--max-plies', null) === null ? V16_DEFAULT_CAPS.maxPlies : Number(arg('--max-plies', null));
    const captureTensors = arg('--capture-tensors', 'true') !== 'false';
    const chunkSize = Number(arg('--chunk-size', '256'));
    const resume = arg('--resume', 'true') !== 'false';
    const maxWallMinutes = Number(arg('--max-wall-minutes', '0'));
    const maps = (arg('--maps', FIVE_MAPS.join('|')) as string).split('|');

    if (!modelPath) throw new Error('[T19-02] 采样必须显式给 --model（禁止静默用默认权重）。');
    const absModel = path.resolve(modelPath);
    if (!fs.existsSync(absModel)) throw new Error(`[T19-02] 权重不存在：${absModel}`);
    const json = fs.readFileSync(absModel, 'utf8');
    const declared = (JSON.parse(json) as { encoderSchemaId?: string }).encoderSchemaId ?? null;
    const expected = declared === null
        ? null
        : (SUPPORTED_ENCODER_SCHEMA_IDS as readonly string[]).includes(declared)
            ? declared
            : (() => { throw new Error(`[T19-02] 未知 encoderSchemaId '${declared}'。`); })();
    const predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(json, { expectedEncoderSchemaId: expected }));
    const checkpointSha256 = sha256File(absModel);

    fs.mkdirSync(outDir, { recursive: true });
    const transitionsPath = path.join(outDir, `${modelKey}.transitions.jsonl`);
    const tensorsPath = path.join(outDir, `${modelKey}.tensors.f32`);
    const gamesPath = path.join(outDir, `${modelKey}.games.jsonl`);
    const commitsPath = path.join(outDir, `${modelKey}.commits.jsonl`);

    // 队列：seed 最外层、地图次之、座位最内层 ⇒ 预算到点时五图均衡。
    const queue: PlannedGame[] = [];
    for (let seedIndex = 0; seedIndex < seedsPerMap; seedIndex += 1) {
        for (let mapIndex = 0; mapIndex < maps.length; mapIndex += 1) {
            const seed = trainSeedV19(wave, mapIndex, seedIndex);
            for (const subjectSeat of [0, 1]) {
                queue.push({
                    gameId: `${runId}|wave${wave}|${maps[mapIndex]}|seed=${seed}|seat=${subjectSeat}`,
                    mapIndex, mapName: maps[mapIndex], seedIndex, seed, subjectSeat,
                });
            }
        }
    }
    const uniqueGames = new Set(queue.map(q => q.gameId));
    if (uniqueGames.size !== queue.length) {
        throw new Error(`[T19-02] 计划队列存在重复 gameId：${queue.length - uniqueGames.size} 个。拒绝采样。`);
    }

    // 中文：恢复只能触碰当前 outDir/modelKey 的四个明确文件；半局尾部先回滚到局级 commit。
    const resumeState = prepareCollectionResume(
        { transitionsPath, tensorsPath, gamesPath, commitsPath },
        resume,
        checkpointSha256,
    );
    const done = resumeState.doneGameIds;
    if (resume) {
        console.log(`[T19-02] 恢复：已完成 ${done.size} 局，张量 ${resumeState.tensorBytes} 字节，`
            + `来源=${resumeState.source}${resumeState.recoveredTail ? '，已清理未提交尾部' : ''}`);
    }
    const todo = queue.filter(q => !done.has(q.gameId));
    if (todo.length === 0) {
        console.log(`[T19-02] wave=${wave} 全部 ${queue.length} 局已完成，无需重采。`);
        return;
    }

    const transitionsOut = fs.createWriteStream(transitionsPath, { flags: 'a' });
    const tensorsOut = fs.createWriteStream(tensorsPath, { flags: 'a' });
    const gamesOut = fs.createWriteStream(gamesPath, { flags: 'a' });
    const commitsOut = fs.createWriteStream(commitsPath, { flags: 'a' });

    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);
    const channels = predictor.spatialChannels;
    const semanticDim = predictor.semanticDim;

    let transitionByteOffset = resumeState.transitionBytes;
    let tensorByteOffset = resumeState.tensorBytes;
    let gameByteOffset = resumeState.gameBytes;
    const gameRows: Array<Record<string, unknown>> = [];
    const outcomeCounts: Record<string, number> = {};
    const perMapCounts: Record<string, number> = {};
    let transitionCount = 0;
    let candidateTotal = 0;
    let encodeMsTotal = 0;
    let inferMsTotal = 0;
    let engineStepsTotal = 0;
    let totalSubjectDecisions = 0;
    let totalRecordedDecisions = 0;
    let writeMsEstimate = 0;
    let stoppedByWallBudget = false;
    const startedAt = Date.now();

    console.log(`[T19-02] wave=${wave} model=${path.basename(absModel)} sha=${checkpointSha256.slice(0, 12)}… `
        + `schema=${predictor.encoderSchemaId} channels=${channels} sample=${sample} chunk=${chunkSize}`);
    console.log(`[T19-02] 计划 ${queue.length} 局，待采 ${todo.length} 局（已完成 ${done.size}）`);

    for (const planned of todo) {
        if (maxWallMinutes > 0 && (Date.now() - startedAt) / 60000 >= maxWallMinutes) {
            stoppedByWallBudget = true;
            console.warn(`[T19-02] 到达墙钟预算 ${maxWallMinutes} 分钟，正常收尾（已完成局有效，可用 --resume 续跑）。`);
            break;
        }
        const t0 = Date.now();
        const gameStartOffsets = {
            transitionBytes: transitionByteOffset,
            tensorBytes: tensorByteOffset,
            gameBytes: gameByteOffset,
        };
        const result: SubjectEpisodeResultV19 = await playSubjectEpisode({
            runId, mapName: planned.mapName, seed: planned.seed, subjectSeat: planned.subjectSeat,
            maxSteps, maxPlies, wallTimeoutMs: wallMs,
            predictor, checkpointSha256, sample,
            samplingSeed: planned.seed * 2 + planned.subjectSeat,
            envFactory,
            recordTransitions: true,
            captureTensors,
            chunkSize,
            gameId: planned.gameId,
            onChunk: async (chunk: SubjectChunkV19) => {
                await writeChunkToDisk(chunk, {
                    transitionsOut, tensorsOut,
                    addTransitionOffset: (n) => { transitionByteOffset += n; },
                    getOffset: () => tensorByteOffset,
                    addOffset: (n) => { tensorByteOffset += n; },
                    planned, channels, semanticDim, predictor, checkpointSha256,
                });
                transitionCount += chunk.transitions.length;
                totalRecordedDecisions += chunk.transitions.length;
                for (const t of chunk.transitions) candidateTotal += t.orderedActionCodes.length;
            },
        });
        writeMsEstimate += Date.now() - t0;

        outcomeCounts[result.outcomeKind] = (outcomeCounts[result.outcomeKind] ?? 0) + 1;
        perMapCounts[planned.mapName] = (perMapCounts[planned.mapName] ?? 0) + 1;
        engineStepsTotal += result.steps;
        totalSubjectDecisions += result.subjectDecisions;
        encodeMsTotal += result.encodeMsTotal;
        inferMsTotal += result.inferMsTotal;

        gameRows.push({
            outcomeKind: result.outcomeKind,
            naturalTerminal: result.naturalTerminal,
            truncated: result.truncated,
            error: result.error,
            mapName: planned.mapName, seed: planned.seed, subjectSeat: planned.subjectSeat,
            steps: result.steps, turns: result.turns,
            subjectDecisions: result.subjectDecisions,
            recordedDecisions: result.recordedDecisions,
            recordCapped: result.recordCapped,
            chunksWritten: result.chunksWritten,
            wallMs: result.wallMs,
        });

        const gameLine = `${JSON.stringify({
            gameId: planned.gameId,
            mapName: planned.mapName, seed: planned.seed, subjectSeat: planned.subjectSeat,
            subjectAllianceId: result.subjectAllianceId,
            winnerAllianceId: result.winnerAllianceId,
            outcomeKind: result.outcomeKind,
            naturalTerminal: result.naturalTerminal,
            truncated: result.truncated,
            terminalReturn: result.terminalReturn,
            terminalCreditedToOpponentReply: result.terminalCreditedToOpponentReply,
            terminalCreditedAfterRecordCap: result.terminalCreditedAfterRecordCap,
            steps: result.steps, turns: result.turns, plies: result.plies,
            subjectDecisions: result.subjectDecisions,
            recordedDecisions: result.recordedDecisions,
            recordCapped: result.recordCapped,
            chunksWritten: result.chunksWritten,
            opponentSteps: result.opponentSteps,
            error: result.error, wallMs: result.wallMs,
            encoderSchemaId: result.encoderSchemaId,
            behaviorCheckpointSha256: result.checkpointSha256,
            // 可重放：完整动作序列 + 每个主体回合边界的完整规范化状态哈希。
            actionCodes: result.actionCodes,
            turnSnapshots: result.turnSnapshots,
            actionDigest: createHash('sha256').update(result.actionCodes.join('\n')).digest('hex'),
        })}\n`;
        await writeChunk(gamesOut, gameLine);
        gameByteOffset += Buffer.byteLength(gameLine);

        // 中文：先同步三份数据，再写并同步 commit；崩溃发生在此前会回滚本局。
        await Promise.all([syncStream(transitionsOut), syncStream(tensorsOut), syncStream(gamesOut)]);
        const commit: CollectionCommit = {
            schema: COLLECTION_COMMIT_SCHEMA,
            type: 'game',
            gameId: planned.gameId,
            transitionStartBytes: gameStartOffsets.transitionBytes,
            tensorStartBytes: gameStartOffsets.tensorBytes,
            gameStartBytes: gameStartOffsets.gameBytes,
            transitionBytes: transitionByteOffset,
            tensorBytes: tensorByteOffset,
            gameBytes: gameByteOffset,
            recordedDecisions: result.recordedDecisions,
        };
        await writeChunk(commitsOut, formatCollectionCommit(commit));
        await syncStream(commitsOut);

        console.log(`[T19-02] ${planned.mapName} seed=${planned.seed} seat=${planned.subjectSeat} `
            + `${result.outcomeKind} steps=${result.steps} decisions=${result.subjectDecisions} `
            + `chunks=${result.chunksWritten} capped=${result.recordCapped} `
            + `${(result.wallMs / 1000).toFixed(1)}s rss=${Math.round(process.memoryUsage().rss / 1048576)}MB`);
    }

    await Promise.all([
        new Promise<void>(r => transitionsOut.end(r)),
        new Promise<void>(r => tensorsOut.end(r)),
        new Promise<void>(r => gamesOut.end(r)),
        new Promise<void>(r => commitsOut.end(r)),
    ]);

    const wallSeconds = (Date.now() - startedAt) / 1000;
    const naturalGames = gameRows.filter(g => g.naturalTerminal);
    const summary = {
        schema: 'v19_rollout_wave_2',
        runId, wave, modelKey,
        modelPath: absModel.replace(/\\/g, '/'),
        behaviorCheckpointSha256: checkpointSha256,
        encoderSchemaId: predictor.encoderSchemaId,
        channels, semanticDim, sample, chunkSize,
        caps: { maxSteps, maxPlies, wallTimeoutMs: wallMs },
        seedBase: V19_TRAIN_SEED_BASE_V2,
        seedFormula: 'V19_TRAIN_SEED_BASE_V2 + 100000*wave + 1000*mapIndex + seedIndex',
        plannedGames: queue.length,
        alreadyDone: done.size,
        attemptedThisRun: gameRows.length,
        completedTotal: done.size + gameRows.length,
        transitions: transitionCount,
        meanCandidatesPerDecision: transitionCount ? candidateTotal / transitionCount : 0,
        outcomeCounts,
        perMapCounts,
        naturalGames: naturalGames.length,
        naturalWins: gameRows.filter(g => g.outcomeKind === 'NATURAL_WIN').length,
        naturalLosses: gameRows.filter(g => g.outcomeKind === 'NATURAL_LOSS').length,
        truncatedGames: gameRows.filter(g => g.truncated).length,
        recordCappedGames: gameRows.filter(g => g.recordCapped === true).length,
        errors: gameRows.filter(g => g.error !== null).length,
        engineStepsTotal,
        totalSubjectDecisions,
        totalRecordedDecisions,
        /** 记录完整率：1.0 表示长局后半程没有被丢掉。 */
        recordCompleteness: totalSubjectDecisions > 0 ? totalRecordedDecisions / totalSubjectDecisions : null,
        stoppedByWallBudget,
        throughput: {
            wallSeconds: Math.round(wallSeconds * 10) / 10,
            engineStepsPerSecond: wallSeconds > 0 ? engineStepsTotal / wallSeconds : null,
            networkDecisionsPerSecond: wallSeconds > 0 ? transitionCount / wallSeconds : null,
            naturalGamesPerHour: wallSeconds > 0 ? (naturalGames.length / wallSeconds) * 3600 : null,
            attemptedGamesPerHour: wallSeconds > 0 ? (gameRows.length / wallSeconds) * 3600 : null,
            writeMsEstimate,
            tensorBlobBytes: tensorByteOffset,
            tensorBlobMiB: Math.round((tensorByteOffset / 1048576) * 10) / 10,
        },
        note: '采样为探索策略（--sample true 时按 actionProbs 抽样）；正式 DEV 评测使用 argmax，两者分开报告。',
        files: {
            transitions: transitionsPath.replace(/\\/g, '/'),
            tensors: tensorsPath.replace(/\\/g, '/'),
            games: gamesPath.replace(/\\/g, '/'),
            commits: commitsPath.replace(/\\/g, '/'),
        },
        generatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(outDir, `${modelKey}.summary.json`),
        `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(`[T19-02] 完成 attempted=${summary.attemptedThisRun} transitions=${summary.transitions} `
        + `natural=${summary.naturalGames} truncated=${summary.truncatedGames} errors=${summary.errors} `
        + `记录完整率=${summary.recordCompleteness === null ? 'n/a' : summary.recordCompleteness.toFixed(4)}`);
    console.log(`[T19-02] 吞吐 环境步/秒=${summary.throughput.engineStepsPerSecond?.toFixed(1)} `
        + `网络决策/秒=${summary.throughput.networkDecisionsPerSecond?.toFixed(1)} `
        + `自然局/小时=${summary.throughput.naturalGamesPerHour?.toFixed(1)}`);
}

/** 把一个块写进 transitions.jsonl + tensors.f32。 */
async function writeChunkToDisk(
    chunk: SubjectChunkV19,
    ctx: {
        transitionsOut: fs.WriteStream;
        tensorsOut: fs.WriteStream;
        addTransitionOffset: (n: number) => void;
        getOffset: () => number;
        addOffset: (n: number) => void;
        planned: PlannedGame;
        channels: number;
        semanticDim: number;
        predictor: SpatialResNetPredictor;
        checkpointSha256: string;
    },
): Promise<void> {
    const {
        transitionsOut, tensorsOut, addTransitionOffset, getOffset, addOffset,
        planned, channels, semanticDim, predictor, checkpointSha256,
    } = ctx;
    for (let i = 0; i < chunk.transitions.length; i += 1) {
        const transition = chunk.transitions[i];
        const tensor = chunk.tensors?.[i];
        let byteLength = 0;
        let globalOffset: number | null = null;
        const base = getOffset();
        if (tensor) {
            const spatial = Float32Array.from(tensor.spatialTensor);
            const buf = Buffer.from(spatial.buffer, spatial.byteOffset, spatial.byteLength);
            await writeChunk(tensorsOut, buf);
            byteLength += buf.length;
            const globals = Float32Array.from(tensor.globalFeatures);
            const gbuf = Buffer.from(globals.buffer, globals.byteOffset, globals.byteLength);
            globalOffset = base + byteLength;
            await writeChunk(tensorsOut, gbuf);
            byteLength += gbuf.length;
            for (const candidate of tensor.candidates) {
                const sem = Float32Array.from(candidate.semantics);
                const sbuf = Buffer.from(sem.buffer, sem.byteOffset, sem.byteLength);
                await writeChunk(tensorsOut, sbuf);
                byteLength += sbuf.length;
            }
        }
        const transitionLine = `${JSON.stringify({
            gameId: planned.gameId,
            mapName: planned.mapName, seed: planned.seed, subjectSeat: planned.subjectSeat,
            chunkIndex: chunk.chunkIndex,
            subjectDecisionIndex: transition.subjectDecisionIndex,
            engineStepIndex: transition.engineStepIndex,
            turn: transition.turn,
            stateHash: transition.stateHash,
            currentPlayer: transition.currentPlayer,
            orderedActionCodes: transition.orderedActionCodes,
            candidateCoords: (tensor?.candidates ?? []).map(c => [
                c.actorCoord ? [c.actorCoord.x, c.actorCoord.y] : [-1, -1],
                c.landingCoord ? [c.landingCoord.x, c.landingCoord.y] : [-1, -1],
                c.targetCoord ? [c.targetCoord.x, c.targetCoord.y] : [-1, -1],
            ]),
            chosenIndex: transition.chosenIndex,
            chosenActionCode: transition.chosenActionCode,
            behaviorLogProb: transition.behaviorLogProb,
            policyEntropy: transition.policyEntropy,
            value: transition.value,
            reward: transition.reward,
            terminal: transition.terminal,
            truncated: transition.truncated,
            terminalCreditedToOpponentReply: transition.terminalCreditedToOpponentReply === true,
            terminalCreditedAfterRecordCap: transition.terminalCreditedAfterRecordCap === true,
            currentPlayerAfter: transition.currentPlayerAfter,
            opponentStepsBetween: transition.opponentStepsBetween,
            encodeMs: transition.encodeMs,
            inferMs: transition.inferMs,
            channels,
            semanticDim,
            globalDim: tensor ? tensor.globalFeatures.length : null,
            encoderSchemaId: predictor.encoderSchemaId,
            checkpointSha256,
            tensorOffset: tensor ? base : null,
            globalOffset,
            tensorBytes: byteLength || null,
        })}\n`;
        await writeChunk(transitionsOut, transitionLine);
        // 中文：transition 偏移按 UTF-8 字节计算，不能使用 JavaScript 字符串长度。
        addTransitionOffset(Buffer.byteLength(transitionLine));
        addOffset(byteLength);
    }
}

const entryPath = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entryPath.endsWith('v19/rollout/collector.ts')) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.stack ?? error.message : String(error));
        process.exit(1);
    });
}
