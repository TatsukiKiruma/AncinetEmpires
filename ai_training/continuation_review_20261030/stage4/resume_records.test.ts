import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it, expect } from 'vitest';
import { collectRecordedGames, remainingMatches, preservationFiles, verifyPreservation, publishAggregate } from './resume_records';

it('已完成、截断与失败局都跳过，汇总不改原件且拒绝重复身份', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'stage4-resume-'));
    try {
        const old = path.join(folder, 'old'); fs.mkdirSync(old);
        fs.writeFileSync(path.join(old, 'RUN.json'), JSON.stringify({ configSha256: '配置', model: { binSha256: '模型' }, split: 'dev' }));
        const matches = ['a', 'b', 'c', 'd'].map((id, slot) => ({ id, slot, seat: 0, opponent: 'hard', seed: slot }));
        const panel = { matches, slots: matches.map(m => ({ sha256: '初态' + m.slot })) };
        ['natural_win', 'wall_truncation', 'time_forfeit'].forEach((classification, i) => {
            const m = matches[i], dir = path.join(old, m.id); fs.mkdirSync(dir);
            fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ ...m, natural: i === 0, classification, initialSha256: '初态' + i }));
        });
        const records = collectRecordedGames([old], '配置', panel, '模型');
        expect(remainingMatches(matches, records).map(m => m.id)).toEqual(['d']);
        const preserved = preservationFiles(records);
        await publishAggregate(path.join(folder, 'aggregate'), matches.slice(0, 3), records, { split: 'dev' });
        verifyPreservation(preserved);
        expect(() => collectRecordedGames([old, old], '配置', panel, '模型')).toThrow('重复');
        expect(() => collectRecordedGames([old], '错误配置', panel, '模型')).toThrow('配置');
        const dangling = path.join(old, 'd'); fs.mkdirSync(dangling);
        expect(() => collectRecordedGames([old], '配置', panel, '模型')).toThrow('不能擅自重跑');
    } finally {
        const target = path.resolve(folder), parent = path.resolve(os.tmpdir()) + path.sep;
        if (!target.startsWith(parent)) throw Error('测试清理路径越界');
        fs.rmSync(target, { recursive: true, force: true });
    }
});
