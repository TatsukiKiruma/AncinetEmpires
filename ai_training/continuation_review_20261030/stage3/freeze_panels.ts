/** 先冻结开发、测试面板元数据；候选锁定前不读取测试父局原态。 */
import fs from 'node:fs';
import path from 'node:path';
import { HERE, read, save, fileSha, sha, initialState } from '../stage1/io';
import { S3, sealedAllowed } from './identity';
import { createAppApkSkirmishGameState } from '../../../src/game/apk_skirmish_map_assets';
import { GameEngine } from '../../../src/game/engine';

const parents = read(path.join(HERE, 'PARTITIONS.json')).parents;
const maps = ['(2) Crossed swords.aem', '(2) Duel.aem', '(2) Icy Paths.aem', '(2) Liberty Port.aem', '(2) Mourningstar.aem', '(2) Peak Island.aem', '(2) Swamplands.aem', '(2) The Crossing.aem'];
const ordered = (split: string, players: number, category?: string) => parents.filter((p: any) => p.corpus === 'new' && p.split === split && p.admitted && p.players === players && (!category || p.category === category)).sort((a: any, b: any) => sha('omni-v1/' + a.parentId).localeCompare(sha('omni-v1/' + b.parentId)));
if (process.argv.includes('--materialize-test')) {
    sealedAllowed();
    materialize(read(path.join(S3, 'OMNI_ARENA_TEST_PANEL.json')));
} else {
    for (const split of ['dev', 'test']) {
        const file = path.join(S3, `OMNI_ARENA_${split.toUpperCase()}_PANEL.json`);
        if (fs.existsSync(file)) throw Error('面板已冻结');
        const slots: any[] = [];
        const add = (players: number, category: string, p?: any, map?: string) => {
            const slot = slots.length;
            slots.push({ slot, players, category, parentId: p?.parentId ?? null, groupId: p?.isolationGroupId ?? null,
                split, map: map ?? p.map, seed: (split === 'dev' ? 310000000 : 320000000) + slot * 1009,
                file: `${split}-initial/slot-${slot}.json`, origin: p ? '只读冻结分区父局初态' : '官方标准正常开局，初始收益恰结算一次' });
        };
        for (const map of maps) add(2, 'normal', undefined, map);
        for (const category of ['preset_units', 'skill']) add(2, category, ordered(split, 2, category)[0]);
        const normal3 = ordered(split, 3, 'normal')[0];
        const threeMaps = [normal3.map, ...[...new Set(ordered(split, 3).map((p: any) => p.map))].filter(m => m !== normal3.map)] as string[];
        if (threeMaps.length !== 4) throw Error('三人地图覆盖不为4');
        const used = new Set<string>();
        for (let i = 0; i < 6; i++) {
            const category = ['normal', 'preset_units', 'advantage_endgame'][i % 3];
            const p = ordered(split, 3, category).find((p: any) => !used.has(p.isolationGroupId) && (i >= 4 || p.map === threeMaps[i]))
                ?? ordered(split, 3, 'preset_units').find((p: any) => !used.has(p.isolationGroupId) && p.map === threeMaps[i]);
            if (!p) throw Error('三人面板缺少课程/地图覆盖'); used.add(p.isolationGroupId); add(3, p.category, p);
        }
        const normal4 = ordered(split, 4, 'normal')[0];
        const fourMaps = [normal4.map, ...[...new Set(ordered(split, 4).map((p: any) => p.map))].filter(m => m !== normal4.map)] as string[];
        for (let i = 0; i < 4; i++) {
            const category = ['normal', 'preset_units', 'advantage_endgame', 'preset_units'][i];
            const p = ordered(split, 4, category).find((p: any) => p.map === fourMaps[i]) ?? ordered(split, 4, 'advantage_endgame').find((p: any) => p.map === fourMaps[i]);
            if (!p) throw Error('四人面板缺少不同地图覆盖'); add(4, p.category, p);
        }
        const matches = slots.flatMap(s => Array.from({ length: s.players }, (_, seat) => ({ id: `p${s.players}-${s.slot}-s${seat}`, slot: s.slot, seat, seed: s.seed, opponent: 'hard' })));
        const panel = { schema: 'stage3-omni-arena-v1', split, slots, matches, total: 54, finalTest: split === 'test',
            engineOptions: { applyInitialTurnStart: false }, maxActions: 10000, maxRounds: 200, maxWallMs: 1800000, maxDecisionMs: 120000,
            opponent: '每个非模型席独立OriginalApkLikeHardAI实例', rank: '自然唯一赢家1；其余按首次eliminated时的先后名次归一化，同一步淘汰共享平均名次；截断/错误名次留空',
            partitionsSha256: fileSha(path.join(HERE, 'PARTITIONS.json')), testRawAccessBeforeLock: 0,
            knownMapCaveat: '八图标准开局属于共享已知地图基准，dev/test使用不同确定种子；父局来源附加场景按隔离组不相交' };
        if (matches.length !== 54) throw Error('实战局数不是54');
        save(file, panel);
        if (split === 'dev') materialize(panel);
    }
}
function materialize(panel: any) {
    const records = [];
    for (const slot of panel.slots) {
        const p = slot.parentId ? parents.find((p: any) => p.parentId === slot.parentId) : null;
        if (p && p.split !== panel.split) throw Error('父局分区不符');
        const raw = p ? initialState(p) : createAppApkSkirmishGameState(slot.map);
        const state = p ? raw : new GameEngine(raw).getState();
        if (state.players.length !== slot.players || state.players.some((p: any) => p.eliminated)) throw Error('初态人数/存活状态不符');
        const target = path.join(S3, slot.file); if (fs.existsSync(target)) throw Error('不可覆盖已物化初态');
        save(target, state);
        const hp = state.players.map((p: any) => state.units.filter((u: any) => u.ownerId === p.id).reduce((v: number, u: any) => v + u.hp, 0));
        records.push({ ...slot, sha256: fileSha(target), hp, gold: state.players.map((p: any) => p.gold), currentPlayer: state.currentPlayer });
    }
    save(path.join(S3, `${panel.split.toUpperCase()}_INITIAL_MANIFEST.json`), { panelSha256: fileSha(path.join(S3, `OMNI_ARENA_${panel.split.toUpperCase()}_PANEL.json`)), slots: records });
}
