import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readExistingEpisodeKeys } from './sd_training_plan_runner';

describe('SD training plan runner', () => {
    it('流式读取已有 episode，并生成去重键', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sd-training-resume-'));
        const episodeFile = path.join(tempDir, 'episodes.jsonl');
        await writeFile(episodeFile, [
            JSON.stringify({
                kind: 'skirmish_episode',
                scenario: { id: 'SDPLAN:sd-normal:(2) Duel.aem' },
                seed: 101
            }),
            '',
            JSON.stringify({
                kind: 'skirmish_episode',
                scenario: { id: 'SDPLAN:sd-normal:(2) Duel.aem' },
                seed: 102
            }),
            JSON.stringify({
                kind: 'other_record',
                scenario: { id: 'SDPLAN:sd-normal:(2) Duel.aem' },
                seed: 103
            })
        ].join('\n'), 'utf8');

        const keys = await readExistingEpisodeKeys(episodeFile);

        expect([...keys]).toEqual([
            'SDPLAN:sd-normal:(2) Duel.aem|101',
            'SDPLAN:sd-normal:(2) Duel.aem|102'
        ]);
    });

    it('文件不存在时返回空集合', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sd-training-resume-missing-'));
        const keys = await readExistingEpisodeKeys(path.join(tempDir, 'missing.jsonl'));

        expect(keys.size).toBe(0);
    });

    it('JSONL 损坏时报告准确行号', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sd-training-resume-invalid-'));
        const episodeFile = path.join(tempDir, 'episodes.jsonl');
        await writeFile(episodeFile, [
            JSON.stringify({
                kind: 'skirmish_episode',
                scenario: { id: 'SDPLAN:sd-normal:(2) Duel.aem' },
                seed: 101
            }),
            '',
            '{invalid'
        ].join('\n'), 'utf8');

        await expect(readExistingEpisodeKeys(episodeFile)).rejects.toThrow(`${episodeFile}:3`);
    });
});
