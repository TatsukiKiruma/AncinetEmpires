import fs from 'node:fs';
import path from 'node:path';
import { corpus, DIR, read, save, sha, compact, STAGE3 } from './common';
import { evaluationExclusions } from './exclusions';
import { stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
import { getAllianceId, isActivePlayer } from '../../src/game/rule_config';
import { GameEngine } from '../../src/game/engine';

const generation = Number(process.argv[2]), folder = `generations/gen_${String(generation).padStart(2, '0')}`;
if (!Number.isInteger(generation) || generation < 1) throw Error('需要正整数代数');
if (fs.existsSync(path.join(DIR, folder, 'league-plan.json'))) process.exit(0);
const league = read('league-state.json'), excluded = await evaluationExclusions();
if (league.pendingReservation?.generation === generation) {
    save(`${folder}/league-plan.json`, league.pendingReservation.plan);
    process.exit(0);
}
const manifest = read(path.join(STAGE3, 'split-manifest-v2-stage3.json'));
const devParents = new Set(manifest.parents.filter((p: any) => p.split === 'dev').map((p: any) => p.id));
const mapByParent = new Map<string, string>(manifest.parents.map((p: any) => [p.id, p.map ?? '未知地图']));
const used = new Set<string>(league.usedParentPrefixes ?? []);
const usedStates = new Set<string>(league.usedInitialRuleHashes ?? []);
const pools: Record<string, any[]> = { duel: [], fork: [], '3ffa': [], '4ffa': [], '2v2': [] };
const counts: Record<string, number> = { duel: 24, fork: 21, '3ffa': 5, '4ffa': 5, '2v2': 5 };
for await (const row of corpus('train')) {
    if (devParents.has(row.label.parentId)) throw Error('开发父局泄漏训练池');
    if (row.state.turn > 16 || row.configuredPlayers !== 2 && row.state.turn > 8 || row.state.winner !== null) continue;
    const living = row.state.players.filter((p: any) => p.isAlive && row.state.units.some((u: any) => u.ownerId === p.id && u.hp > 0));
    const alliances = new Set(living.map((p: any) => getAllianceId(row.state, p.id)));
    if (alliances.size <= 1) continue;
    const contested = row.configuredPlayers === 2 && row.state.turn >= 6 && row.state.units.some((u: any) => row.state.units.some((v: any) => getAllianceId(row.state, u.ownerId) !== getAllianceId(row.state, v.ownerId) && Math.abs(u.pos.x - v.pos.x) + Math.abs(u.pos.y - v.pos.y) <= 6));
    const modes = row.configuredPlayers === 2 && living.length === 2 ? [...(row.state.turn <= 8 ? ['duel'] : []), ...(contested ? ['fork'] : [])] : row.configuredPlayers === 3 && living.length === 3 ? ['3ffa'] : row.configuredPlayers === 4 && living.length === 4 ? ['4ffa', '2v2'] : [];
    if (!modes.length || excluded.has(row.label.sourceBeforeHash) || excluded.has(row.label.currentBeforeHash)) continue;
    const ruleHash = ruleStateHash(row.state);
    if (excluded.has(ruleHash) || usedStates.has(ruleHash)) continue;
    for (const mode of modes) {
        if (mode !== 'fork' && row.state.turn > 8) continue;
        const key = row.id; if (used.has(key)) continue;
        const priority = sha(`league:${generation}:${league.seedCursor}:${key}`);
        const pool = pools[mode], item = { key, priority, row };
        if (pool.length < counts[mode] * 8 || priority < pool.at(-1)!.priority) {
            pool.push(item); pool.sort((a, b) => a.priority.localeCompare(b.priority)); if (pool.length > counts[mode] * 8) pool.pop();
        }
    }
}
const slots: any[] = [], reserved = new Set<string>();
for (const [mode, count] of Object.entries(counts)) {
    const chosen: any[] = [];
    const ordered = mode === 'duel' ? [...pools[mode].filter(e => mapByParent.get(e.row.label.parentId)?.includes('Icy Paths')).slice(0, 8), ...pools[mode].filter(e => !mapByParent.get(e.row.label.parentId)?.includes('Icy Paths'))] : pools[mode];
    const mapCounts = new Map<string, number>();
    for (const item of ordered) {
        if (reserved.has(item.row.id)) continue;
        const initialRule = ruleStateHash(item.row.state); if (usedStates.has(initialRule)) continue;
        const mapName = mapByParent.get(item.row.label.parentId) ?? '未知地图';
        if (mode === 'duel' && (mapCounts.get(mapName) ?? 0) >= (mapName.includes('Icy Paths') ? 8 : 6)) continue;
        chosen.push(item); reserved.add(item.row.id); usedStates.add(initialRule); if (chosen.length === count) break;
        mapCounts.set(mapName, (mapCounts.get(mapName) ?? 0) + 1);
    }
    if (chosen.length !== count) throw Error(`训练前缀不足:${mode}/${chosen.length}/${count}`);
    for (const item of chosen) {
        let state = structuredClone(item.row.state);
        if (mode === '2v2') {
            const enabled = state.players.filter((p: any) => isActivePlayer(state, p.id));
            state.rules = { ...state.rules, alliances: Object.fromEntries([...state.players.map((p: any) => [p.id, p.id]), ...enabled.map((p: any, i: number) => [p.id, i % 2])]) };
        }
        if (mode === '3ffa' || mode === '4ffa') state.rules = { ...state.rules, alliances: Object.fromEntries(state.players.map((p: any) => [p.id, p.id])) };
        state = new GameEngine(state).getState();
        if (excluded.has(stateHash(state)) || excluded.has(ruleStateHash(state))) throw Error('联赛初态命中评测排重');
        usedStates.add(ruleStateHash(state));
        const index = slots.length, seed = 2026200000 + league.seedCursor + index, initialPath = `${folder}/initial/${index}.json`;
        save(initialPath, state);
        const activePlayers = state.players.filter((p: any) => isActivePlayer(state, p.id));
        const seat = activePlayers[index % activePlayers.length].id;
        const teacherSeats = mode === 'fork' ? activePlayers.map((p: any) => p.id) : activePlayers.filter((p: any) => getAllianceId(state, p.id) === getAllianceId(state, seat)).map((p: any) => p.id);
        const historicalPool = league.hallOfFame.filter((entry: any) => entry.modelPath !== league.championModelPath);
        const historicalEntry = mode === 'fork' && index % 2 === 1 && historicalPool.length ? historicalPool[(index >> 1) % historicalPool.length] : null;
        const historical = historicalEntry?.modelPath ?? null;
        slots.push({ id: `league-${generation}-${String(index).padStart(3, '0')}`, index, mode, configuredPlayers: activePlayers.length, seed, seat, teacherSeats, opponent: index % 2 ? 'heuristic' : 'apk_like', historical, historicalSha256: historicalEntry?.sha256 ?? null, historicalCalibration: historicalEntry?.calibrationPath ?? null, initialPath, initialHash: stateHash(state), parentId: item.row.label.parentId, mapName: mapByParent.get(item.row.label.parentId), prefix: item.key, prefixTurn: state.turn, sourceBeforeHash: item.row.label.sourceBeforeHash, trainSplit: true });
        used.add(item.key);
    }
}
// 种子与前缀在开局前原子预留；恢复重用同计划，下一代只能消费新游标。
league.seedCursor += slots.length; league.usedParentPrefixes = [...used];
league.usedInitialRuleHashes = [...usedStates];
const plan = { generation, slots, teacherModel: league.championModelPath, teacherSha256: league.championSha256, teacherCalibration: league.championCalibrationPath, maxActions: 2000, maxDecisionMs: 1000, maxWallMs: 600000, mixture: counts, exclusions: read('evaluation-exclusion-receipt.json') };
league.pendingReservation = { generation, plan };
save('league-state.json', league);
save(`${folder}/league-plan.json`, plan);
console.log(JSON.stringify({ generation, games: slots.length, seedCursor: league.seedCursor, mixture: counts }));
