'use strict';
/**
 * Source-derived isolated probes for review commit e95b65366186dc55482d5db77346936aaf255ae6.
 * Run: node isolated_contract_probes_v9.cjs [output.json]
 * These probes reproduce small formulas/projections from the reviewed source. They DO NOT
 * import GameEngine, run the real network, load checkpoints, or measure playing strength.
 * Agent must translate them into regression tests against the actual repository modules.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const results = [];

// P1: A v1 policy uses 3 spatial pools + semantics[0..23], without global features.
// Same state / castle / landing / target => identical spatial pools. For recruit_to_castle,
// the discriminating v2 fields (unit category, commander flag, cost, reserves) start at 24.
const commonPools = Array.from({length: 96}, (_, i) => i / 1000);
function recruitSemantics(isCommander, cost, category) {
    const sem = Array(32).fill(0);
    sem[5] = 1; // recruit_to_castle, ACTION_TYPE_LIST index
    sem[24] = category / 7;
    sem[25] = isCommander ? 1 : 0;
    sem[26] = cost / 1000;
    sem[27] = (1000 - cost) / 1000;
    sem[28] = 0;
    sem[29] = isCommander ? 2 / 3 : 0;
    sem[30] = isCommander ? 0.15 : 0;
    return sem;
}
const soldier = recruitSemantics(false, 100, 1);
const commander = recruitSemantics(true, 500, 7);
// Costs are illustrative legal-fixture values, NOT a claim about a particular ruleset price.
const v1Input = s => [...commonPools, ...s.slice(0, 24)];
const v2Input = s => [...commonPools, ...s, ...Array(20).fill(0)];
assert.deepEqual(v1Input(soldier), v1Input(commander));
assert.notDeepEqual(v2Input(soldier), v2Input(commander));
results.push({
    id: 'P1_V1_RECRUIT_INPUT_COLLISION', status: 'EXPOSED_BY_SOURCE_PROJECTION',
    sourcePaths: ['src/game/ai/spatial_tensor_encoder.ts', 'src/game/ai/spatial_conv_net.ts'],
    v1IdenticalInputs: true, v2InputsDiffer: true,
    conclusion: '同状态同坐标的不同兵种招募，在v1策略输入上完全相同；确定性网络无法将它们打出不同分数。',
    limitation: '只验证输入投影；没有加载实际checkpoint或执行游戏。'
});

// P2: The supposedly independent gold offsets are functions of the very same e mod 8 as the map.
const offsets = [-50, 0, 50, 100, 150, 200, 300, 400];
const maps = ['Duel', 'Crossed Swords', 'Icy Paths', 'Liberty Port', 'Mourningstar', 'Peak Island', 'The Crossing', 'Demo Map'];
const pairsByMap = Array.from({length: 8}, () => new Set());
for (let episode = 1; episode <= 800; episode++) {
    const mapIndex = episode % 8;
    const p0 = offsets[(episode * 997 + 1013) % 8];
    const p1 = offsets[(episode * 617 + 2017) % 8];
    pairsByMap[mapIndex].add(`${p0},${p1}`);
}
assert.ok(pairsByMap.every(pairs => pairs.size === 1));
results.push({
    id: 'P2_MAP_GOLD_CONFOUNDING', status: 'EXPOSED_BY_EXACT_FORMULA',
    sourcePaths: ['tools/v7_training_pipeline.ts'], episodesChecked: 800,
    mapGoldPairs: maps.map((map, i) => ({map, offsetPairs: [...pairsByMap[i]].map(s => s.split(',').map(Number))})),
    conclusion: '同一地图的双方金币偏移量固定，不是独立采样；增加episode数量不会消除这个绑定。',
    limitation: '检查偏移公式，不推断所有状态相同，也不统计真实轨迹覆盖。'
});

// P3: Extracted player component of getBehavioralStateHash.
function oldPlayerProjection(p) {
    return `${p.id}:${p.gold}:${p.commanderDeathCount ?? 0}:${p.isAlive ? 1 : 0}:${p.reserveLevel ?? 0}:${p.reserveExp ?? 0}:${p.reserveGold ?? 0}`;
}
const pa = {id: 0, gold: 700, commanderDeathCount: 1, isAlive: true, commanderReserveLevel: 0, commanderReserveExp: 0};
const pb = {...pa, commanderReserveLevel: 2, commanderReserveExp: 75};
assert.equal(oldPlayerProjection(pa), oldPlayerProjection(pb));
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
assert.equal(sha(oldPlayerProjection(pa)), sha(oldPlayerProjection(pb)));
results.push({
    id: 'P3_COMMANDER_RESERVE_HASH_OMISSION', status: 'EXPOSED_BY_SOURCE_PROJECTION',
    sourcePaths: ['tools/v7_training_pipeline.ts', 'src/game/ai/spatial_tensor_encoder.ts'],
    playerA: pa, playerB: pb, identicalPlayerHashComponent: true,
    conclusion: '仅改变commanderReserveLevel/commanderReserveExp不会改变当前玩家哈希片段；其他状态相同时完整哈希也不变。',
    limitation: '实际数据中因此合并了多少状态尚未测量；应由真实模块回归测试和数据重审确认。'
});

// P4: Unique candidate identifiers reproduce the default insertion order and cap.
const selected = new Map([['heuristic_best', 'heuristic_best']]);
let tacticalAdded = 0, spatialAdded = 0, heuristicFillAdded = 0;
for (let i = 0; i < 4 && selected.size < 10; i++) { selected.set(`tactical_${i}`, `tactical_${i}`); tacticalAdded++; }
for (let i = 0; i < 6 && selected.size < 10; i++) { selected.set(`spatial_${i}`, `spatial_${i}`); spatialAdded++; }
for (let i = 0; i < 4 && selected.size < 10; i++) { selected.set(`heuristic_other_${i}`, `heuristic_other_${i}`); heuristicFillAdded++; }
assert.equal(selected.size, 10);
assert.equal(heuristicFillAdded, 0);
results.push({
    id: 'P4_HEURISTIC_FILL_QUOTA_STARVATION', status: 'EXPOSED_BY_INSERTION_ORDER',
    sourcePaths: ['tools/v7_heuristic_bounded_search.ts'],
    distinctCandidateExample: [...selected.keys()], tacticalAdded, spatialAdded, heuristicFillAdded,
    conclusion: '启发式第一名保留并不等于启发式配额全部保留；默认插入顺序允许其他启发式候选被挤掉。',
    limitation: '该构造证明可能性，不证明已评测155个状态中的真实发生频率，更不证明先验导致输棋。'
});

const report = {
    reviewCommit: 'e95b65366186dc55482d5db77346936aaf255ae6',
    generatedAt: new Date().toISOString(), node: process.version,
    scope: 'SOURCE_DERIVED_ISOLATED_PROBES_NOT_REPOSITORY_INTEGRATION_TESTS',
    checkpointsLoaded: 0, gameMatchesPlayed: 0, repositoryTestSuitesExecuted: 0,
    allAssertionsPassed: true, probeCount: results.length, results,
    derivedArithmetic: {daggerNewTrainRows: 61, baseTrainRows: 6528, fractionNewRowsInDaggerTraining: 61 / 6589}
};
const output = path.resolve(process.argv[2] || path.join(__dirname, 'isolated_probe_results.json'));
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({output, allAssertionsPassed: true, probes: results.map(r => ({id:r.id, status:r.status})), scope:report.scope}, null, 2));
