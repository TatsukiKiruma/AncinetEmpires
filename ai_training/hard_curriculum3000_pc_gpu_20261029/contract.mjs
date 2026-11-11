/** 第三批冻结合同；只检查输入，不执行规则、决策或重放。 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

export const quotas = {
    advantage_endgame: 300, building_finish: 100, high_tier: 100,
    normal: 100, parameter_variant: 100, preset_units: 200, skill: 100,
};
export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export const rowDigest = value => digest(JSON.stringify(value));
export function tally(rows, key) {
    const counts = {};
    for (const row of rows) { const name = String(key(row)); counts[name] = (counts[name] ?? 0) + 1; }
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}
export function selectThird(jobs) {
    // 执行局号是权威索引，禁止按设计槽位或数组行号切片。
    return jobs.filter(job => job.executionSequence >= 2001 && job.executionSequence <= 3000);
}
export function validate(jobs, sequenceRows, designSlots, maps) {
    assert.equal(jobs.length, 1000);
    assert.deepEqual(jobs.map(job => job.executionSequence), Array.from({ length: 1000 }, (_, i) => 2001 + i));
    assert.equal(new Set(jobs.map(job => job.parentId)).size, 1000);
    assert.equal(new Set(jobs.map(job => job.seed)).size, 1000);
    assert.deepEqual(tally(jobs, job => job.category), quotas);
    assert.deepEqual(tally(jobs, job => job.actualPlayerCount), { 2: 400, 3: 300, 4: 300 });
    assert.equal(jobs[0].parentId, 'hc7-20261027-1014');
    assert.equal(jobs[0].seed, 2030001014);
    const observation = jobs.filter(job => job.observation);
    assert.deepEqual(observation.map(job => job.executionSequence), Array.from({ length: 42 }, (_, i) => 2001 + i));
    assert.equal(Object.keys(tally(observation, job => `${job.category}/${job.actualPlayerCount}`)).length, 21);
    assert.ok(Object.values(tally(observation, job => `${job.category}/${job.actualPlayerCount}`)).every(count => count === 2));
    const sequences = new Map(sequenceRows.map(row => [row.executionSequence, row]));
    const designs = new Map(designSlots.map(row => [row.slotId, row]));
    const inventory = new Map(maps.map(row => [row.name, row]));
    for (const job of jobs) {
        const sequence = sequences.get(job.executionSequence), design = designs.get(job.designSlotId), map = inventory.get(job.map);
        assert.ok(sequence && design && map);
        for (const [key, value] of Object.entries(sequence)) assert.deepEqual(job[key], value, `${job.executionSequence}/${key}`);
        assert.equal(job.batch, 3); assert.equal(job.device, 'unassigned');
        assert.equal(job.schema, 'hard-curriculum-job-v1');
        assert.equal(job.parentId, job.designSlotId); assert.equal(job.seed, design.nativeSeed);
        assert.equal(job.category, design.category); assert.equal(job.profile, design.profile);
        assert.equal(job.mapAssetSha256, map.sha256);
        assert.deepEqual(job.activeNativePlayerIds, map.nativePlayerIds);
        assert.equal(job.actualPlayerCount, job.activeNativePlayerIds.length);
        assert.equal(job.maxActions, 20000); assert.equal(job.maxEffectiveSeconds, 21600);
        assert.equal(job.requestedPlayerType, 3); assert.equal(job.mode, 'SD');
        assert.equal(job.jsRngMode, 'original_webview_rng'); assert.equal(job.replay, 'disabled_by_user');
        assert.ok([20, 30, 50].includes(job.setup.unitLimit));
        assert.equal(job.setup.levelCap, 3); assert.equal(job.attemptId, '__ATTEMPT__');
        assert.deepEqual(job.construction.active, job.activeNativePlayerIds);
        if (!job.state) {
            assert.ok(['normal', 'parameter_variant'].includes(job.category));
            assert.equal(job.initialStateSha256, null);
            continue;
        }
        assert.equal(rowDigest(job.state), job.initialStateSha256, `初态SHA：${job.executionSequence}`);
        assert.equal(job.state.initialization, 'post_turn_start_projection_no_second_income');
        assert.equal(job.state.pendingRecruit, null);
        assert.ok(job.activeNativePlayerIds.includes(job.state.currentPlayer));
        assert.deepEqual(job.state.players.map(player => player.id), job.activeNativePlayerIds);
        assert.equal(new Set(job.state.units.map(unit => `${unit.pos.x}/${unit.pos.y}`)).size, job.state.units.length);
        for (const player of job.state.players) {
            assert.equal(player.isAlive, true); assert.equal(player.alliance, player.id + 1);
            const army = job.state.units.filter(unit => unit.ownerId === player.id);
            assert.ok(army.length > 0); assert.equal(army.filter(unit => unit.registeredCommander).length, 1);
        }
        for (const unit of job.state.units) {
            for (const key of ['type', 'ownerId', 'pos', 'level', 'exp', 'hp', 'movementRemaining', 'hasActed', 'supported', 'registeredCommander', 'targeted', 'status', 'head', 'code']) assert.ok(key in unit);
            assert.ok(job.activeNativePlayerIds.includes(unit.ownerId));
            assert.ok(unit.hp > 0 && unit.pos.x >= 0 && unit.pos.y >= 0 && unit.pos.x < map.width && unit.pos.y < map.height);
        }
        assert.ok(job.state.buildings.every(building => building.owner < 6 || building.owner === 4094 || building.owner === 4095));
    }
    return {
        parents: jobs.length, category: tally(jobs, job => job.category), players: tally(jobs, job => job.actualPlayerCount),
        cells: tally(jobs, job => `${job.category}/${job.actualPlayerCount}`), maps: tally(jobs, job => job.map),
        profiles: tally(jobs, job => job.profile), populationLimits: tally(jobs, job => job.setup.unitLimit),
        observationParents: observation.length, fullProjectedStates: jobs.filter(job => job.state).length,
        approximateMaps: maps.filter(map => map.confidence.approximateTileCount > 0).map(map => ({
            map: map.name, approximateTileCount: map.confidence.approximateTileCount,
            parents: jobs.filter(job => job.map === map.name).length,
        })),
        first: { executionSequence: jobs[0].executionSequence, parentId: jobs[0].parentId, seed: jobs[0].seed },
        qualification: '冻结输入静态一致性；未创建原生初态，未执行动作或重放',
    };
}
