import { createCipheriv } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApkSkirmishTrainingEnv, getApkSkirmishTrainingScenario } from '../src/game/apk_skirmish';
import { parseAppApkSkirmishMap } from '../src/game/apk_skirmish_map_assets';
import { APK_SKIRMISH_MAP_ASSETS } from '../src/game/apk_skirmish_map_assets.generated';
import { APK_RESOURCE_DECRYPTION_INFO, hexToBytes } from './apk_resource_crypto';
import { parseEpisodeFeatureExportArgs } from './skirmish_episode_feature_export';
import { OldDatasetWorkerPool } from './skirmish_old_dataset_worker_pool';
import { createPresetPolicyFactory, runSkirmishEpisode } from './skirmish_training_runner';

describe('常驻特征导出 worker', () => {
    it('实际子进程可复用处理多个批次，报告重放错误并响应终止', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'feature-worker-'));
        const asset = APK_SKIRMISH_MAP_ASSETS.find(item => item.name === '(2) Duel.aem')!;
        const scenario = getApkSkirmishTrainingScenario(`SD:${asset.name}`)!;
        const unpackDir = path.join(tempDir, 'unpack');
        const resourceFile = path.join(unpackDir, scenario.resourcePath);
        await mkdir(path.dirname(resourceFile), { recursive: true });
        // 相同密钥的三重 DES 等价于单 DES，测试进程无需启用 legacy provider。
        const key = hexToBytes(APK_RESOURCE_DECRYPTION_INFO.keyHex);
        const cipher = createCipheriv('des-ede3-cbc', Buffer.concat([key, key, key]), hexToBytes(APK_RESOURCE_DECRYPTION_INFO.ivHex));
        await writeFile(resourceFile, Buffer.concat([cipher.update(Buffer.from(asset.decryptedBase64, 'base64')), cipher.final()]));
        const episode = runSkirmishEpisode({
            env: createApkSkirmishTrainingEnv(parseAppApkSkirmishMap(asset.name), scenario, { seed: 17, maxPlies: 30 }),
            scenario, seed: 17, maxPlies: 30, maxSteps: 2,
            policyFactory: createPresetPolicyFactory('random')
        });
        const inputFile = path.join(tempDir, 'episode.jsonl');
        await writeFile(inputFile, `${JSON.stringify(episode)}\n`);
        const options = parseEpisodeFeatureExportArgs(['--input', inputFile, '--no-relabel', '--max-candidates', '4']);
        options.unpackDir = unpackDir;
        const pool = new OldDatasetWorkerPool(['--openssl-legacy-provider', '--import', 'tsx']);
        const start = (batchId: string, file = inputFile) => pool.startTask({
            workerId: 1, batchId, exportOptions: { ...options, inputFiles: [file], artifact: {
                ...options.artifact!, rootDir: path.join(tempDir, batchId)
            } }
        });
        try {
            const first = await start('first').result;
            const pid = pool.workerPids[0];
            const second = await start('second').result;
            expect(pool.workerPids).toEqual([pid]);
            const a = JSON.parse(await readFile(first, 'utf8'));
            const b = JSON.parse(await readFile(second, 'utf8'));
            expect(a.datasetId).toBe(b.datasetId);
            expect(a.shards).toEqual(b.shards);
            const badFile = path.join(tempDir, 'bad.jsonl');
            await writeFile(badFile, `${JSON.stringify({ ...episode, initialObservationHash: '不匹配' })}\n`);
            await expect(start('bad', badFile).result).rejects.toThrow('初始 observation hash 不一致');
            expect(await start('after-error').result).toBeTruthy();
            const stopped = start('stopped');
            const rejection = expect(stopped.result).rejects.toThrow('退出');
            stopped.terminate();
            await rejection;
        } finally { await pool.close(); }
        expect(pool.workerPids).toEqual([]);

        // 覆盖正式 CLI 的结果文件与完成后重跑，避免脚本再靠目录差集猜 manifest。
        const resultFile = path.join(tempDir, 'result.json');
        const args = ['--openssl-legacy-provider', '--import', 'tsx', 'tools/skirmish_old_dataset_migrate.ts',
            '--input', inputFile, '--unpack', unpackDir, '--out-root', path.join(tempDir, 'cli'),
            '--result-file', resultFile, '--max-candidates', '4', '--no-relabel', '--json'];
        const execute = promisify(execFile);
        await execute(process.execPath, [...args, '--workers', '2'], { windowsHide: true });
        const completed = JSON.parse(await readFile(resultFile, 'utf8'));
        expect(completed.paused).toBe(false);
        expect(completed.finalManifest).toBeTruthy();
        await execute(process.execPath, [...args, '--workers', '3'], { windowsHide: true });
        expect(JSON.parse(await readFile(resultFile, 'utf8')).finalManifest).toBe(completed.finalManifest);
    }, 30000);
});
