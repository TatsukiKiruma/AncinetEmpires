/** 只分析本阶段新生成实战，复用引擎定位出局前一动作；不读取历史采集轨迹。 */
import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../../../src/game/engine';
import { getCommanderUnit, getScalarRule } from '../../../src/game/rule_config';
import { getTileTerrainKey } from '../../../src/game/terrain_rules';
import { read, save, sha } from '../stage1/io';
import { S3 } from './identity';

const data = 'D:/AncientEmpiresData/continuation_stage3_20261030_v1/run-v2-batch8';
if (!fs.existsSync(path.join(S3, 'FINAL_PAIRED_COMPARISON.json'))) throw Error('仅在正式验收闭合后运行归因，不能据测试结果调参');
const manifest = read(path.join(S3, 'TEST_INITIAL_MANIFEST.json'));
const final = read(path.join(data, 'test-candidate/SUMMARY.json')), baseline = read(path.join(data, 'test-baseline/SUMMARY.json'));
const paired = new Map(baseline.games.map((r: any) => [r.id, r]));
const selected: any[] = [];
for (const n of [2, 3, 4]) for (const won of [false, true]) {
    const rows = final.games.filter((r: any) => r.players === n && r.natural && Boolean(r.firstPlace) === won);
    rows.sort((a: any, b: any) => Number(Boolean((paired.get(b.id) as any).firstPlace) !== won) - Number(Boolean((paired.get(a.id) as any).firstPlace) !== won) || a.id.localeCompare(b.id));
    if (rows.length) selected.push(rows[0]);
}
const reports = [];
for (const game of selected) {
    const slot = manifest.slots[game.slot], initial = read(path.join(S3, slot.file)), engine = new GameEngine(initial, { applyInitialTurnStart: false });
    const records = fs.readFileSync(path.join(data, 'test-candidate', game.id, 'steps.jsonl'), 'utf8').trim().split(/\r?\n/).map(s => JSON.parse(s));
    const counts: Record<string, number> = {}, lastModel: any[] = [], events: any[] = [];
    for (const r of records) {
        const before = engine.getState(); if (sha(JSON.stringify(before)) !== r.before) throw Error('新实战前态链不符');
        if (r.side === 'model') { counts[r.action.type] = (counts[r.action.type] ?? 0) + 1; lastModel.push({ step: r.step, turn: before.turn, action: r.action }); if (lastModel.length > 5) lastModel.shift(); }
        const result = engine.step(r.action); if (sha(JSON.stringify(result.state)) !== r.after) throw Error('新实战后态链不符');
        const wasAlive = before.players.find(p => p.id === game.modelPlayer)!.isAlive, nowAlive = result.state.players.find(p => p.id === game.modelPlayer)!.isAlive;
        if (wasAlive && !nowAlive) {
            const castles = (s: typeof before) => s.map.tiles.flat().filter(t => t.ownerId === game.modelPlayer && getTileTerrainKey(t) === 'castle').length;
            events.push({ step: r.step, turn: before.turn, actingPlayer: r.player, triggerAction: r.action,
                modelUnitsBefore: before.units.filter(u => u.ownerId === game.modelPlayer).map(u => ({ id: u.id, unitClass: u.unitClass, hp: u.hp, pos: u.pos })),
                commanderBefore: getCommanderUnit(before, game.modelPlayer), castlesBefore: castles(before),
                flags: Object.fromEntries(['defeatOnNoUnitsAndNoCastles', 'defeatOnNoUnits', 'defeatOnCommanderDeath', 'defeatOnNoCastles'].map(k => [k, getScalarRule(before, k as any)])),
                recentModelActions: [...lastModel], interpretation: '这是直接出局触发及此前动作证据，不将它等同于更早的战略根因' });
        }
    }
    reports.push({ id: game.id, players: game.players, map: game.map, modelFirstPlace: game.firstPlace,
        baselineFirstPlace: (paired.get(game.id) as any).firstPlace, normalizedRank: game.normalizedRank,
        actionCounts: counts, eliminationEvidence: events, finalStateVerified: sha(JSON.stringify(engine.getState())) === sha(JSON.stringify(read(path.join(data, 'test-candidate', game.id, 'final.json')))) });
}
save(path.join(S3, 'TACTICAL_TRACE_ANALYSIS.json'), { reports, selection: '每人数各一个胜局和败局，优先配对结果改变；最多6局，全部为本阶段新实战', historicalCollectionReplays: 0, trainingAfterTest: 0 });
console.log(JSON.stringify({ cases: reports.length, passed: reports.every(r => r.finalStateVerified) }));
