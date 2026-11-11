/** 只冻结困难原生采样配额；没有原生验收收据时禁止宣称已开始采集。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { getAppApkSkirmishMapOptions, parseAppApkSkirmishMap } from '../../src/game/apk_skirmish_map_assets';
import { createApkSkirmishGameState } from '../../src/game/apk_skirmish';
import { GameEngine } from '../../src/game/engine';

const directory = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(directory, 'HARD_SAMPLING_PLAN.json');
assert.ok(!fs.existsSync(target), '采样计划已冻结，不得覆盖');
const sha = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
const maps = getAppApkSkirmishMapOptions().filter(map => map.playerCount === 2).sort((a, b) => a.name.localeCompare(b.name));
assert.ok(maps.length > 0);
const starts = maps.map(map => {
    const state = createApkSkirmishGameState(parseAppApkSkirmishMap(map.name), { mode: 'SD', mapName: map.name });
    const engine = new GameEngine(state);
    assert.equal(state.players.length, 2);
    assert.ok(!engine.isTerminal() && engine.getLegalActions(state.currentPlayer).length > 0);
    return { map: map.name, projectInitialSha256: sha(JSON.stringify(state)), state,
        note: '这是权威项目默认初态预登记；尚未取得困难APK原生config/initial，不作为原生等价证明。' };
});
const jobs = Array.from({ length: 3000 }, (_, index) => ({
    id: `hard20261022-${String(index + 1).padStart(4, '0')}`,
    parentId: `native-hard-20261022-${String(index + 1).padStart(4, '0')}`,
    map: maps[index % maps.length].name, mode: 'SD', seed: 202610220 + index,
    playerType: 3, players: starts[index % maps.length].state.players.map(player => ({ id: player.id, type: 3 })),
    setup: 'official-default', derivedFrom: null, maxActions: 20000,
    sourceKind: 'native-hard-js-requested', status: 'planned-not-generated',
}));
assert.equal(new Set(jobs.map(job => job.seed)).size, 3000);
const oldSeeds = new Set<number>();
for (const name of ['phone-storage-1000-20261015', 'phone-compressed-2000-20261015']) {
    const old = JSON.parse(fs.readFileSync(path.resolve(directory, '../../captures', name, 'manifest.json'), 'utf8'));
    for (const job of old.jobs) oldSeeds.add(job.seed);
}
assert.ok(jobs.every(job => !oldSeeds.has(job.seed)), '与历史普通AI采样种子冲突');
const manifest = {
    schema: 'native-hard-preregistered-plan-v1', createdAt: new Date().toISOString(),
    apkSha256: 'a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48',
    policyHtmlSha256: '6076f354362f89c0a0abbcb10ef4de04d321f96aa7de90e61f0fb33a2ea883eb',
    total: 3000, quota: maps.map(map => ({ map: map.name, games: jobs.filter(job => job.map === map.name).length })),
    defaultOpeningFraction: 1, requestedBothSides: 'hard-js', jobsSha256: sha(JSON.stringify(jobs)),
    randomContract: { nativeConfigurationSeed: true, javaFallbackSeed: 'per-decision',
        javascriptSeeded: false, status: '待原生验证；不同配置种子并不证明JS轨迹不同，禁止将种子数量写成独特经验数量' },
    gateSequence: ['签名兼容且保留数据安装', '实际APK和困难入口核验', '单局主路径冒烟',
        '约20局多图主路径/回退/错误逐决策验收', '1/2/4适用并发实测与隔离', '冻结采集器身份和随机合同', '按本计划分批生成和独立验收'],
    preflightGamesCountToward3000: false,
    starts, jobs,
};
fs.writeFileSync(target, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ target, maps: maps.length, quota: manifest.quota, jobsSha256: manifest.jobsSha256 }));
