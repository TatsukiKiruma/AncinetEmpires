/** 冻结选择、身份保全和拒绝错误输入的回归；不运行对局或重放。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, rowDigest, selectThird, validate } from './contract.mjs';

const out = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(out, '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(out, name), 'utf8'));
const source = JSON.parse(fs.readFileSync(path.join(root, 'ai_training/hard_curriculum3000_execution_20261027/JOBS.json'), 'utf8'));
const frozen = read('JOBS.json'), identity = read('INPUT_IDENTITY.json');
const sequence = read('source/ai_training/hard_curriculum3000_execution_20261027/EXECUTION_SEQUENCE.json');
const designs = read('inputs/DESIGN_SLOTS.json');
const maps = read('source/ai_training/hard_curriculum3000_plan_20261027/MAP_INVENTORY.json');
const check = jobs => validate(jobs, sequence.rows, designs.slots, maps.maps);
test('执行局号筛选与完整来源对象一致，保留全部未知扩展字段', () => {
    assert.deepEqual(frozen.jobs, selectThird(source.jobs));
    assert.equal(selectThird([...source.jobs].reverse())[0].executionSequence, 3000);
    for (const job of frozen.jobs) assert.equal(rowDigest(job), identity.jobs.find(row => row.executionSequence === job.executionSequence).fullJobSha256);
});
test('七类、实际人数、二十一格观察、初态摘要与地图来源一致', () => {
    const summary = check(frozen.jobs);
    assert.equal(summary.fullProjectedStates, 800); assert.equal(summary.observationParents, 42);
    assert.equal(summary.approximateMaps.length, 4);
});
test('拒绝设计行号切片、改seed、丢弃状态字段或压缩为双人', () => {
    assert.throws(() => check(source.jobs.slice(2000, 3000).sort((a, b) => a.designSlotId.localeCompare(b.designSlotId))));
    for (const modify of [job => { job.seed++; }, job => { delete job.state.units[0].exp; }, job => { job.actualPlayerCount = 4; }, job => { job.activeNativePlayerIds = [0]; }]) {
        const jobs = structuredClone(frozen.jobs); modify(jobs[0]); assert.throws(() => check(jobs));
    }
});
test('旧输入及源码SHA保持；缺失项明确记录，不能算验证通过', () => {
    for (const row of identity.sources) {
        if (!row.exists) continue;
        assert.equal(digest(fs.readFileSync(path.join(root, row.path))), row.sha256, row.path);
        if (row.snapshot) assert.equal(digest(fs.readFileSync(path.join(out, row.snapshot))), row.sha256, row.snapshot);
    }
});
test('未兼容时账本保持零启动，无生产PID、训练、重放或观察跳过', () => {
    const state = read('RUN_STATE.json'), attempts = read('ATTEMPTS.json'), ledger = read('PARENT_LEDGER.json');
    assert.equal(state.phase, 'awaiting_runtime_choice'); assert.equal(state.collectorStarted, false);
    assert.equal(state.collectorPid, null); assert.equal(state.actualStarts, 0); assert.equal(state.unattempted, 1000);
    assert.equal(state.observationGateSkipped, 0); assert.equal(state.trainingUpdates, 0);
    assert.equal(state.replay, 'disabled_by_user'); assert.deepEqual(attempts.attempts, []);
    assert.equal(ledger.parents.length, 1000); assert.ok(ledger.parents.every(row => row.actualStarts === 0));
    const auth = read('AUTHORIZATION.json');
    assert.equal(auth.originSubstitutionAuthorized, false); assert.equal(auth.cpuOnlyProductionAuthorized, false);
    assert.equal(auth.tensorGeneration, false); assert.equal(auth.training, false);
});
