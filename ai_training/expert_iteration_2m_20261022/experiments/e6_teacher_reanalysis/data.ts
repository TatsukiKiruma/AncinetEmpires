/** 只读重放第二代161父局，独立封存抽样、排重与张量，不调用旧写回执入口。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../../../src/game/engine';
import { encodeAction } from '../../../../src/game/env';
import { encodeDualObservation } from '../../../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../../../src/ai_runtime/dual_v2/reachability';
import { trainingValueTarget } from '../../../../src/ai_runtime/dual_v3/value_target';
import { softPriors, PRIOR_VERSION } from '../../../../src/ai_runtime/dual_v3/search_policy';
import { packTensorBatch } from '../../../dual_stream_v2_phase1_20261020/tensor_bridge';
import { ruleStateHash } from '../../../data_acceptance_20261016/replay/core';
import { expertSamples } from '../../execution_v5/expert_source';
import { HERE, R, E, read, sha, hash, writeNew, checkBudget } from './common';
import { QUOTAS, stratified, developmentMap } from './sampler';
import type { StateRow, Source } from './contract';

function frames(file: string, rows: StateRow[]) {
    const fd = fs.openSync(file, 'wx');
    try {
        for (const row of rows) {
            checkBudget();
            const engine = new GameEngine(row.state, { applyInitialTurnStart: false });
            const legal = engine.getLegalActions(row.state.currentPlayer), context = new ReachabilityContext(row.state);
            assert.deepEqual(legal.map(encodeAction), row.legalCodes);
            const observation = encodeDualObservation(row.state, legal, context);
            const codes = Array.from(observation.actions.sourceIndices, i => encodeAction(legal[i]));
            const target = codes.indexOf(row.targetCode); assert.ok(target >= 0);
            const outcome = trainingValueTarget(row.state, observation.playerOrder, row.valueMask, row.winner);
            const pack = packTensorBatch([observation], [{ target, policyMask: row.source !== 'value-only', valueMask: outcome.valueMask, valueTarget: outcome.target, weight: 1 }]);
            const prior = softPriors(row.state, legal, context);
            const source = { id: row.id, parent: row.parent, source: row.source, quality: row.source === 'search-expert' ? 4 : 1,
                parentPolicyScale: row.parentWeight, parentValueScale: row.parentWeight, priorVersion: PRIOR_VERSION,
                prior: Array.from(observation.actions.sourceIndices, i => prior[i]), codes, canonical: row.canonical,
                searchTarget: row.source === 'search-expert' ? row.searchTarget?.map(t => ({ index: codes.indexOf(t.code), score: t.score })) : undefined };
            const meta = Buffer.from(JSON.stringify({ ...pack.metadata, sources: [source] })), header = Buffer.alloc(8);
            header.writeUInt32LE(meta.length); header.writeUInt32LE(pack.bytes.length, 4);
            fs.writeSync(fd, header); fs.writeSync(fd, meta); fs.writeSync(fd, pack.bytes);
        }
        fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
}
async function main() {
    checkBudget();
    const manifestFile = path.join(E, 'generations/gen_02/expert-manifest.json'), manifest = read(manifestFile);
    assert.equal(manifest.games.length, 161);
    const parentInfo = new Map<string, { map: string; ordinal: number }>();
    const inputs: Record<string, string> = { [manifestFile]: sha(fs.readFileSync(manifestFile)) };
    manifest.games.forEach((g: any, ordinal: number) => {
        const started = read(path.join(g.directory, 'started.json'));
        assert.equal(started.job.split, 'train');
        parentInfo.set(started.job.id, { map: started.job.map, ordinal });
        for (const file of ['started.json', 'result.json', 'actions.jsonl.gz', 'strict.json']) {
            const p = path.join(g.directory, file); inputs[p] = sha(fs.readFileSync(p));
        }
    });
    const splitsFile = path.resolve(R, '../pretrain_preflight_20261022/DATA_SPLITS.json');
    const splits = read(splitsFile), excluded = new Set<string>(); inputs[splitsFile] = sha(fs.readFileSync(splitsFile));
    const indexes = [...splits.exclusionIndexes, ...['legacy-exclusions.txt.gz', 'opening-exclusions.txt.gz', 'seen-evaluation-exclusions.txt.gz'].map(name => ({ path: path.join(E, name) }))];
    for (const p of [path.join(R, 'new-evaluation-exclusions.txt.gz'), path.join(R, 'new-exclusions.txt.gz')]) if (fs.existsSync(p)) indexes.push({ path: p });
    for (const entry of indexes) {
        const raw = fs.readFileSync(entry.path), digest = sha(raw); if (entry.sha256) assert.equal(digest, entry.sha256);
        inputs[entry.path] = digest;
        for (const h of gunzipSync(raw).toString().split('\n').filter(Boolean)) excluded.add(h);
    }
    const pools: StateRow[] = [], canonical = new Set<string>(); let duplicates = 0, ordinal = 0;
    const validationGolds = new Set<number>(read(path.join(E, 'plan.json')).validationInitialGolds);
    for await (const sample of expertSamples(manifestFile, excluded)) {
        if (ordinal++ % 128 === 0) checkBudget();
        const c = ruleStateHash(sample.state); if (canonical.has(c)) { duplicates++; continue; } canonical.add(c);
        assert.ok(!excluded.has(c)); assert.ok(!validationGolds.has(sample.state.rules?.initialGold));
        const parent = parentInfo.get(sample.parentId); assert.ok(parent);
        const row: StateRow = { id: `${sample.parentId}:${sample.macro}`, parent: sample.parentId, ordinal: parent.ordinal,
            step: sample.macro, map: parent.map, phase: sample.state.turn <= 5 ? 'opening' : sample.state.turn <= 15 ? 'middle' : 'late',
            source: sample.origin as Source, canonical: c, beforeHash: sample.currentBeforeHash, state: sample.state, action: sample.legalActions[sample.targetIndex],
            targetCode: sample.targetCode, legalCodes: sample.legalActions.map(encodeAction), winner: sample.winner, valueMask: sample.valueMask,
            parentWeight: sample.weight * (sample.normalizationScale ?? 1), searchTarget: sample.searchTarget };
        // 首遍只保存抽样所需元数据，避免将九万多个完整棋盘和合法动作常驻内存。
        pools.push({ ...row, state: { currentPlayer: row.state.currentPlayer } as StateRow['state'], action: undefined as any, legalCodes: [] });
    }
    const trainPool = pools.filter(r => !developmentMap(r.map)), devPool = pools.filter(r => developmentMap(r.map));
    const used = new Set<string>(), parents = new Map<string, number>(), train: StateRow[] = [], counts: Record<string, any> = {};
    // 稀少来源优先占用共同父局上限；配额与每态一次合同保持不变。
    for (const source of ['natural-winner-demonstration', 'value-only', 'search-expert', 'project-hard-demonstration'] as Source[]) {
        const candidates = trainPool.filter(r => r.source === source), picked = stratified(candidates, QUOTAS[source], used, parents);
        train.push(...picked); counts[source] = { available: candidates.length, required: QUOTAS[source], selected: picked.length };
    }
    const devUsed = new Set<string>(), devParents = new Map<string, number>();
    const searchDev = stratified(devPool.filter(r => r.source === 'search-expert'), 128, devUsed, devParents);
    const valueDev = stratified(devPool.filter(r => r.valueMask), 512, devUsed, devParents);
    const passed = train.length === 4096 && searchDev.length === 128 && valueDev.length === 512;
    const gate = { passed, counts, searchDevelopment: searchDev.length, valueDevelopment: valueDev.length,
        totalUnique: pools.length, duplicates, excluded: excluded.size, parents: Object.fromEntries(parents),
        trainingParents: [...parentInfo].filter(([, p]) => !developmentMap(p.map)).length,
        developmentParents: [...parentInfo].filter(([, p]) => developmentMap(p.map)).length,
        reason: passed ? null : '固定来源配额或开发配额不足，禁止复制补足及启动后续阶段' };
    writeNew(path.join(HERE, 'data-gate.json'), gate);
    writeNew(path.join(HERE, 'data-inputs.json'), inputs);
    if (!passed) { console.log(JSON.stringify(gate)); process.exitCode = 2; return; }
    const selectedIds = new Set([...train, ...searchDev, ...valueDev].map(r => r.id));
    const hydrated = new Map<string, StateRow>();
    for await (const sample of expertSamples(manifestFile, excluded)) {
        const id = `${sample.parentId}:${sample.macro}`; if (!selectedIds.has(id)) continue;
        checkBudget(); const meta = pools.find(r => r.id === id); assert.ok(meta);
        hydrated.set(id, { ...meta, state: sample.state, action: sample.legalActions[sample.targetIndex], legalCodes: sample.legalActions.map(encodeAction) });
    }
    assert.equal(hydrated.size, selectedIds.size);
    train.sort((a, b) => a.ordinal - b.ordinal || a.step - b.step);
    for (const [name, rows] of [['train', train], ['dev-search', searchDev], ['dev-value', valueDev]] as const) {
        const completeRows = rows.map(r => hydrated.get(r.id)!);
        writeNew(path.join(HERE, `data/${name}.json`), completeRows); frames(path.join(HERE, `data/${name}.frames`), completeRows);
    }
    writeNew(path.join(HERE, 'dataset-manifest.json'), { schema: 'e6-data-v1', counts: gate, inputs,
        trainIdentitiesSha256: hash(train.map(r => [r.id, r.canonical])), developmentMapMeaning: '仅本轮微调留出地图，不能声称预训练未见',
        normalization: '固定使用161父局原meanSteps/父局steps，不按抽取子集重算', thirdGenerationConsumed: 0 });
    console.log(JSON.stringify(gate));
}
if (process.argv[1]?.endsWith('data.ts')) await main();
