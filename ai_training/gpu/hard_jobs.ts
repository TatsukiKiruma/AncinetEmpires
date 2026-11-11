/** 冻结课程job到项目权威引擎初态的适配；不重新生成槽位、种子或地形。 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decryptApkResourceBytes } from '../tools/apk_resource_crypto';
import { parseApkAemMap } from '../../src/game/apk_map';
import { createApkSkirmishGameState } from '../../src/game/apk_skirmish';
import { APK_UNIT_ID_TO_CLASS } from '../../src/game/apk_compat';
import { UNIT_CONFIGS } from '../../src/game/units';
import { getCurrentPopulation, getCommanderUnit } from '../../src/game/rule_config';
import type { GameState, Unit } from '../../src/game/types';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const JOBS = path.join(ROOT, 'ai_training/hard_curriculum3000_pc_gpu_20261029/JOBS.json');
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const fileSha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const cache = new Map<string, ReturnType<typeof parseApkAemMap>>();
export type SharedMapAssets=Record<string,SharedArrayBuffer>;
export function preloadMapAssets(jobs:any[]){
    const assets:SharedMapAssets={};let bytes=0;
    for(const job of jobs){if(assets[job.map])continue;const file=path.join(ROOT,'APK/_analysis/unpack/assets/maps',job.map),raw=fs.readFileSync(file);if(createHash('sha256').update(raw).digest('hex')!==job.mapAssetSha256)throw Error('共享地图原件摘要不符');const memory=new SharedArrayBuffer(raw.length);new Uint8Array(memory).set(raw);assets[job.map]=memory;bytes+=raw.length;}
    return {assets,reads:Object.keys(assets).length,bytes};
}

export function readJobs() {
    const jobs = JSON.parse(fs.readFileSync(JOBS, 'utf8')).jobs as any[];
    if (jobs.length !== 1000 || jobs.some((j, i) => j.executionSequence !== 2001 + i) || new Set(jobs.map(j => j.parentId)).size !== 1000) throw Error('冻结第三批局号或唯一父局不符');
    return jobs;
}

export function createJobState(job:any):GameState{return createJobStateWithAssets(job);}
export function createJobStateWithAssets(job: any, assets?:SharedMapAssets): GameState {
    if (job.mode !== 'SD' || job.requestedPlayerType !== 3) throw Error('仅支持已冻结SD困难任务');
    const file = path.join(ROOT, 'APK/_analysis/unpack/assets/maps', job.map);
    const raw=assets?.[job.map]?Buffer.from(assets[job.map]):fs.readFileSync(file);
    if (createHash('sha256').update(raw).digest('hex') !== job.mapAssetSha256) throw Error('地图原件摘要不符');
    if (!cache.has(job.map)) cache.set(job.map, parseApkAemMap(decryptApkResourceBytes(raw)));
    const state = createApkSkirmishGameState(cache.get(job.map)!, {
        mode: 'SD', mapName: job.map, setup: job.setup, applyInitialTurnStart: !job.state,
        rules: { alliances: Object.fromEntries(job.activeNativePlayerIds.map((id: number) => [id, id + 1])) },
    });
    if (job.state) {
        const s = job.state;
        if (hash(s) !== job.initialStateSha256 || s.initialization !== 'post_turn_start_projection_no_second_income' || s.pendingRecruit !== null) throw Error('预设初态身份或结算阶段不符');
        state.currentPlayer = s.currentPlayer; state.turn = s.turn; state.winner = null;
        state.players = s.players.map((p: any) => ({ id: p.id, gold: p.gold, isAlive: p.isAlive, commanderDeathCount: 0 }));
        state.rules.alliances = Object.fromEntries(s.players.map((p: any) => [p.id, p.alliance]));
        state.rules.commanderUnitIds = {};
        state.units = s.units.map((u: any, i: number): Unit => {
            const unitClass = APK_UNIT_ID_TO_CLASS[u.type];
            if (!unitClass || u.status !== 0 || u.code !== null) throw Error('预设出现尚未支持的单位/状态/代码字段');
            const id = `${job.parentId}-project-${i}`;
            if (u.registeredCommander) state.rules.commanderUnitIds[u.ownerId] = id;
            return { id, unitClass, ownerId: u.ownerId, pos: { ...u.pos }, hp: u.hp,
                maxHp: 100 + UNIT_CONFIGS[unitClass].maxHpGrowth * u.level, level: u.level, exp: u.exp,
                movementRemaining: u.movementRemaining, hasActed: u.hasActed, hasMoved: false,
                hasPostAttackMoved: false, hasBeenHealedThisTurn: false, hasBeenSupportedThisTurn: u.supported,
                apkUnitId: u.type, apkUnitHead: u.head, apkTargeted: u.targeted };
        });
        state.graves = s.graves.map((g: any, i: number) => ({ id: `${job.parentId}-grave-${i}`, pos: { ...g.pos }, ownerId: g.ownerId, remainingTurns: g.remainingTurns }));
        for (const b of s.buildings) {
            const tile = state.map.tiles[b.y]?.[b.x];
            if (!tile || tile.apkTerrainId !== b.terrainId || ![0,1,2,3,4,5,4094,4095].includes(b.owner)) throw Error('建筑地形或归属编码不符');
            const code = b.owner < 6 ? b.owner : b.owner === 4094 ? 254 : 255;
            tile.ownerId = b.owner < 6 ? b.owner : null; tile.apkOwnerCode = code;
            if (tile.apkTerrainRaw !== undefined) tile.apkTerrainRaw = (tile.apkTerrainRaw & ~255) | code;
        }
        delete state.pendingUnitId;
    }
    const active = state.players.filter(p => p.isAlive).map(p => p.id).sort((a, b) => a - b);
    if (JSON.stringify(active) !== JSON.stringify(job.activeNativePlayerIds) || active.length !== job.actualPlayerCount) throw Error('实际参战人数不符');
    for (const player of active) {
        if (!getCommanderUnit(state, player) || getCurrentPopulation(state, player) > job.setup.unitLimit) throw Error('队长或人口合同不符');
    }
    if (new Set(state.units.map(u => `${u.pos.x},${u.pos.y}`)).size !== state.units.length) throw Error('预设单位重叠');
    return state;
}
