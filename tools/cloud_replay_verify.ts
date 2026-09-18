import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { AncientEmpiresEnv } from '../src/game/env';
import { buildLiveBcSample } from './skirmish_training_runner';
import { buildCandidateFeatures, sparseFeaturesToEntries } from './skirmish_bc_train';

const root = path.resolve('training_runs/cloud_pvp_20260918');
const stats = JSON.parse(await readFile(path.join(root, 'feature-summary.json'), 'utf8'));
const audits = JSON.parse(await readFile(path.join(root, 'audit.json'), 'utf8'));
const groups = new Map<string,string>();
const records = new Set<string>();
const splitFiles: Record<string, unknown> = {};
let samples = 0, candidates = 0, paritySamples = 0, parityCandidates = 0;
for (const split of ['train','validation','test']) {
    const raw = await readFile(path.join(root, `${split}.jsonl`));
    const rows = raw.toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    for (const row of rows) {
        const group = row.scenario.id;
        assert.ok(!groups.has(group) || groups.get(group) === split, '整局跨分区泄漏');
        groups.set(group, split);
        const key = `${group}:${row.step}`;
        assert.ok(!records.has(key), '重复状态动作样本'); records.add(key);
        assert.equal(row.featureExtractor, 'hashed-action-v3');
        assert.equal(row.featureDim, 4096);
        assert.equal(row.policy, 'human-winner');
        assert.ok(row.candidates.length > 0 && row.candidates.length <= 64);
        assert.equal(new Set(row.candidates.map((c:any) => c.actionCode)).size, row.candidates.length);
        assert.equal(row.candidates.filter((c:any) => c.actionCode === row.label.actionCode).length, 1);
        for (const c of row.candidates) for (const [index,value] of c.features) {
            assert.ok(Number.isInteger(index) && index >= 0 && index < 4096 && Number.isFinite(value));
        }
        samples++; candidates += row.candidates.length;
    }
    splitFiles[split] = { sha256: createHash('sha256').update(raw).digest('hex'), bytes: raw.length, samples: rows.length };
    // 从各分区重新构造少量在线状态，逐项核对全部候选特征和真人身份。
    for (const game of stats.filter((r:any) => r.split === split && r.samples > 0 && !r.error).slice(0,3)) {
        const entry = audits.find((r:any) => r.id === game.id);
        const states = (await readFile(entry.statesFile, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
        for (const row of rows.filter((r:any) => r.scenario.id === `PVP:${game.group}`).slice(0,3)) {
            const snapshot = states.find((s:any) => s.actionIndex === row.source.stepIndex);
            assert.ok(snapshot);
            assert.ok(entry.humanWinners.includes(row.playerId));
            const result = new AncientEmpiresEnv({ initialState: snapshot.state }).reset();
            const sample = buildLiveBcSample({ result, playerId: row.playerId, stepNumber: row.step, episodeSeed: row.seed, scenario: row.scenario });
            for (const candidate of row.candidates) {
                assert.ok(result.legalActionCodes.includes(candidate.actionCode));
                assert.deepEqual(sparseFeaturesToEntries(buildCandidateFeatures(sample, candidate.actionCode, 4096, 'hashed-action-v3')!), candidate.features);
                parityCandidates++;
            }
            paritySamples++;
        }
    }
}
const report = { passed: true, samples, candidates, uniqueGroups: groups.size, duplicateSamples: 0, splitLeaks: 0,
    paritySamples, parityCandidates, splitFiles };
await writeFile(path.join(root,'feature-verification.json'), JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
