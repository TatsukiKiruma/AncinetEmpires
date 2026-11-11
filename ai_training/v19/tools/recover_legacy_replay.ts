/** 严格恢复历史轨迹，整局通过后才提交少量当前教师监督样本。 */
import { createReadStream, existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { createDefaultEnvFactory, replayEpisodeDatasetItems } from '../../tools/skirmish_dataset_export';
import type { SkirmishEpisodeRecord } from '../../tools/skirmish_training_runner';
import { createLegacyEpisodeEnvFactory, LEGACY_EPISODE_INITIALIZATION_MODE } from '../data/legacy_episode_env';
import { encodeRecoveredState } from '../data/encode_recovered_state';
import { sourceDigestsV16 } from '../../v16/tools/eval_v16_identity';
import { V16_MAPS } from '../../v16/tools/eval_v16_protocol';
import type { GameState } from '../../src/game/types';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function fileHash(file: string): Promise<string> {
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(file)) digest.update(chunk);
    return digest.digest('hex');
}

async function main() {
    const args = process.argv.slice(2);
    const option = (key: string, fallback: string) => {
        const i = args.indexOf(key);
        return i < 0 ? fallback : args[i + 1];
    };
    const selectionPath = path.resolve(option('--selection', 'v19/out/data_scale_20261003/legacy_replay50/sd_replay_pilot.json'));
    const selection = JSON.parse(await readFile(selectionPath, 'utf8'));
    const [shard, shards] = option('--shard', '0/1').split('/').map(Number);
    const limit = Number(option('--limit', '50'));
    const timeoutMs = Number(option('--episode-timeout-ms', '180000'));
    const rowsPerEpisode = Number(option('--rows-per-episode', '32'));
    if (!Number.isInteger(shard) || !Number.isInteger(shards) || shard < 0 || shard >= shards
        || !Number.isInteger(limit) || limit < 1 || !Number.isFinite(timeoutMs) || timeoutMs <= 0
        || !Number.isInteger(rowsPerEpisode) || rowsPerEpisode < 1) throw new Error('无效分片或预算参数');
    const outDir = path.resolve(option('--out-dir', 'v19/out/data_scale_20261003/recovered_smoke'));
    if (existsSync(outDir)) throw new Error(`输出目录已存在，拒绝覆盖：${outDir}`);
    await mkdir(outDir, { recursive: true });
    const selected = selection.results.slice(0, limit).filter((_: unknown, i: number) => i % shards === shard);
    const sourceDigests = sourceDigestsV16(process.cwd());
    const legacy = await createLegacyEpisodeEnvFactory(selection.summary.unpackDir, selection.summary.sdPlanFile);
    const current = await createDefaultEnvFactory(selection.summary.unpackDir, selection.summary.sdPlanFile);
    const results: Record<string, unknown>[] = [];
    const sources: Record<string, string> = {};
    const negativeControls: Record<string, unknown>[] = [];
    let rowCount = 0;
    const started = Date.now();
    const mainMaps = new Set(V16_MAPS);
    for (const file of [...new Set<string>(selected.map((r: any) => r.file))]) {
        const filePath = path.resolve(selection.summary.archiveDir, file);
        sources[file] = await fileHash(filePath);
        const targets = new Map<number, any>(selected.filter((r: any) => r.file === file).map((r: any) => [r.lineIndex, r]));
        const lines = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
        let lineIndex = -1;
        for await (const line of lines) {
            lineIndex++;
            if (!targets.has(lineIndex)) continue;
            const picked = targets.get(lineIndex);
            const episode = JSON.parse(line) as SkirmishEpisodeRecord;
            const before = Date.now();
            let steps = 0;
            const result: Record<string, unknown> = {
                file, lineIndex, scenarioId: episode.scenario.id, seed: episode.seed,
                planId: picked.planId, planKind: picked.planKind, playerCount: picked.playerCount,
                sourceRecordSha256: hash(line), expectedSteps: episode.steps.length,
                originalCurrentFactoryOutcome: picked.outcome,
            };
            const snapshots: { stepIndex: number; state: GameState }[] = [];
            try {
                const env = await legacy.createEnv(episode);
                const legacyInitial = env.reset(episode.seed);
                const currentInitial = (await current.createEnv(episode)).reset(episode.seed);
                Object.assign(result, {
                    recordedInitialHash: episode.initialObservationHash,
                    legacyInitialHash: hash(JSON.stringify(legacyInitial.observation)),
                    currentInitialHash: hash(JSON.stringify(currentInitial.observation)),
                    legacyGold: legacyInitial.state.players.map(p => p.gold),
                    currentGold: currentInitial.state.players.map(p => p.gold),
                });
                const indices = new Set(Array.from({ length: Math.min(rowsPerEpisode, episode.steps.length) }, (_, i) =>
                    Math.floor(i * (episode.steps.length - 1) / Math.max(1, Math.min(rowsPerEpisode, episode.steps.length) - 1))));
                // 必须耗尽生成器：yield 之后才执行对应动作和结果断言。
                for (const item of replayEpisodeDatasetItems(episode, env, { observationMode: 'none' })) {
                    if (Date.now() - before > timeoutMs) throw new Error('EPISODE_TIMEOUT');
                    if (indices.has(steps)) snapshots.push({ stepIndex: steps, state: JSON.parse(JSON.stringify(item.result.state)) });
                    steps++;
                }
                if (Date.now() - before > timeoutMs) throw new Error('EPISODE_TIMEOUT');
                if (steps !== episode.steps.length || steps === 0) throw new Error('重放步数不完整');
                result.replayVerified = true;
                if (negativeControls.length === 0) {
                    const cases = [
                        ['hash', '初始 observation hash 不一致'],
                        ['action', '动作编码错位'], ['reward', 'reward 错位'], ['winner', 'winner 错位'],
                    ];
                    for (const [mutation, expected] of cases) {
                        const bad = { ...episode, steps: [{ ...episode.steps[0] }, ...episode.steps.slice(1)] };
                        if (mutation === 'hash') bad.initialObservationHash = 'corrupt';
                        if (mutation === 'action') bad.steps[0].actionCode += '-corrupt';
                        if (mutation === 'reward') bad.steps[0].reward += 123;
                        if (mutation === 'winner') bad.steps[0].winnerAfter = 999;
                        let message = '';
                        try {
                            const generator = replayEpisodeDatasetItems(bad, await legacy.createEnv(bad), { observationMode: 'none' });
                            generator.next(); generator.next();
                        } catch (error) { message = String(error); }
                        negativeControls.push({ mutation, expected, message, passed: message.includes(expected) });
                    }
                    if (!negativeControls.every(c => c.passed)) throw new Error('负对照校验失败');
                }
                // 整局严格通过后再编码；任一状态编码失败时整局均不入样本文件。
                const rows = snapshots.map(({ stepIndex, state }) => ({
                    ...encodeRecoveredState(state),
                    sampleId: `${file}:${lineIndex}:${stepIndex}`,
                    stateJson: state,
                    provenance: {
                        sourceFile: file, sourceFileSha256: sources[file], sourceLineIndex: lineIndex,
                        sourceRecordSha256: result.sourceRecordSha256, stepIndex,
                        initializationPolicyId: LEGACY_EPISODE_INITIALIZATION_MODE,
                        historicalReplayVerified: true,
                        dataRole: 'historical_curriculum_relabelled_current_h0',
                        scenarioId: episode.scenario.id, seed: episode.seed,
                        familyId: `${episode.scenario.id}:${episode.seed}`,
                        mainMapTwoPlayer: picked.playerCount === 2 && mainMaps.has(state.metadata?.apkMapName ?? ''),
                        eligibleForCurrentOpeningDataset: false,
                    },
                }));
                await appendFile(path.join(outDir, 'rows.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
                rowCount += rows.length;
                Object.assign(result, { outcome: 'PASS', rows: rows.length });
            } catch (error) {
                Object.assign(result, { outcome: String(error).includes('EPISODE_TIMEOUT') ? 'TIMEOUT' : 'FAIL', error: String(error), rows: 0 });
            }
            Object.assign(result, { stepsYielded: steps, elapsedMs: Date.now() - before });
            results.push(result);
            await appendFile(path.join(outDir, 'episodes.jsonl'), JSON.stringify(result) + '\n');
            console.log(JSON.stringify({ done: results.length, total: selected.length, file, lineIndex, outcome: result.outcome, steps, rows: result.rows, elapsedMs: result.elapsedMs }));
            targets.delete(lineIndex);
            if (targets.size === 0) break;
        }
        if (targets.size) throw new Error(`源文件缺少目标行：${file}`);
    }
    const artifactHashes: Record<string, string> = {};
    for (const file of ['rows.jsonl', 'episodes.jsonl']) {
        if (existsSync(path.join(outDir, file))) artifactHashes[file] = await fileHash(path.join(outDir, file));
    }
    const manifest = {
        kind: 'v19-legacy-recovery-pilot', version: 1, generatedAt: new Date().toISOString(),
        initializationPolicyId: LEGACY_EPISODE_INITIALIZATION_MODE,
        selectionPath, selectionSha256: await fileHash(selectionPath), shard, shards,
        selectedEpisodes: selected.length, attemptedEpisodes: results.length,
        pass: results.filter(r => r.outcome === 'PASS').length,
        fail: results.filter(r => r.outcome === 'FAIL').length,
        timeout: results.filter(r => r.outcome === 'TIMEOUT').length,
        rowCount, elapsedMs: Date.now() - started, timeoutMs, rowsPerEpisode,
        negativeControls, sourceDigests, sources, artifactHashes,
        recoverySourceSha256: await fileHash('v19/tools/recover_legacy_replay.ts'),
        adapterSourceSha256: await fileHash('v19/data/legacy_episode_env.ts'),
        encoderSourceSha256: await fileHash('v19/data/encode_recovered_state.ts'),
        teacherSourceSha256: await fileHash('v18/tools/labeler_l1_v18.ts'),
    };
    await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({ completed: true, pass: manifest.pass, fail: manifest.fail, timeout: manifest.timeout, rowCount }));
    if (manifest.fail || manifest.timeout || manifest.pass !== selected.length) process.exitCode = 2;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
