/** 只在候选锁定后的最终实战轨迹上做四个痛点复盘；不继续或改写第三阶段旧局。 */
import path from 'node:path';
import { GameEngine } from '../../../src/game/engine';
import { getTileTerrainKey } from '../../../src/game/terrain_rules';
import { HERE, S3, DATA, read, save, sha, allowSealed } from './io';
import { lines } from './analysis';

export async function auditCases() {
    allowSealed();
    const manifest = read(path.join(S3, 'TEST_INITIAL_MANIFEST.json')), reports = [];
    const summary = read(path.join(DATA, 'test-final/SUMMARY.json'));
    for (const id of ['p3-10-s0', 'p2-9-s1', 'p3-13-s0', 'p4-16-s1']) {
        const result = summary.games.find((r: any) => r.id === id); if (!result) throw Error('重点复盘局号缺失');
        const saved = read(path.join(result.artifactDirectory, 'INITIAL.json'));
        const initial = read(path.join(S3, manifest.slots[result.slot].file)), engine = new GameEngine(initial, saved.engineOptions);
        const counts: Record<string, number> = {}, incidents = []; let steps = 0;
        for await (const r of lines(path.join(result.artifactDirectory, 'steps.jsonl.gz'))) {
            const before = engine.getState();
            if (sha(JSON.stringify(before)) !== r.before || !engine.hasLegalAction(before.currentPlayer, r.action)) throw Error('重点实战重放前态或合法性不符');
            const next = engine.step(r.action).state;
            if (sha(JSON.stringify(next)) !== r.after) throw Error('重点实战重放后态不符');
            const castles = (s: typeof before) => s.map.tiles.flat().filter(t => t.ownerId === result.modelPlayer && getTileTerrainKey(t) === 'castle').length;
            const priorCastles = castles(before), afterCastles = castles(next);
            if (afterCastles < priorCastles || before.players.find(p => p.id === result.modelPlayer)?.isAlive && !next.players.find(p => p.id === result.modelPlayer)?.isAlive) incidents.push({ step: r.step, turn: before.turn, player: before.currentPlayer, action: r.action, castlesBefore: priorCastles, castlesAfter: afterCastles, unitsBefore: before.units.filter(u => u.ownerId === result.modelPlayer).length, aliveAfter: next.players.find(p => p.id === result.modelPlayer)?.isAlive });
            if (r.side === 'model') counts[r.action.type] = (counts[r.action.type] ?? 0) + 1;
            steps++;
        }
        if (sha(JSON.stringify(engine.getState())) !== sha(JSON.stringify(read(path.join(result.artifactDirectory, 'final.json'))))) throw Error('重点实战最终状态不一致');
        reports.push({ id, previousProblem: id === 'p3-10-s0' ? '阶段三200回合截断' : '阶段三空末城被占出局', current: result, modelActions: counts, incidents, replayedSteps: steps, replayLegal: true,
            interpretation: '只陈述本次唯一配置的新实战变化，不能从局部差异证明普遍战略根因或预先保证翻盘' });
    }
    await save(path.join(HERE, 'TACTICAL_CASE_REVIEW.json'), { reports }, true);
}
