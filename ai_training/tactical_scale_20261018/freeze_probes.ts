import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { GameEngine } from './reference_engine';
import { encodeAction, decodeAction } from '../../src/game/env';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { FEATURE_NAMES } from './tactics';
import { extractFeatures } from '../tactical_conditional_20261018/complete_tactics';
import { observationState, encodeFeatures, newSchema } from './encoding';
import { DIR, PHONE, save, sha, hash, quantiles, read } from './io';
import { initialFor, groupKey } from '../tactical_conditional_20261018/sources';
const selection = JSON.parse(fs.readFileSync(path.join(PHONE, 'selection.json'), 'utf8'));
const oldContract = JSON.parse(fs.readFileSync(path.join(PHONE, 'contract.json'), 'utf8'));
const oldSchema = JSON.parse(fs.readFileSync(path.join(PHONE, 'schema.json'), 'utf8'));
const command: string = process.argv[2] ?? 'profile';
const dataDirectory = 'data-v2';
const boundPaths = ['tactics.ts', 'threat.ts', 'encoding.ts', 'sources.ts', '../../src/game/engine.ts', '../../src/game/rules.ts', '../../src/game/abilities.ts', '../../src/game/map.ts', '../../src/game/ai/tactical_pathfinding.ts'];
const sourceBinding = Object.fromEntries(boundPaths.map(name => [name, sha(fs.readFileSync(path.resolve(DIR, name)))]));
const lane = Number(process.argv[3] ?? 0), lanes = Number(process.argv[4] ?? 1);
const timings: number[] = [], candidateTimings: number[] = [];
const coverage = FEATURE_NAMES.map(() => 0);
let profiled = 0, coverageCandidates = 0;

for (const [pi, parent] of selection.parents.entries()) {
    if (command === 'full' && pi % lanes !== lane) continue;
    const entry = oldContract.Files.find((f: any) => f.Parent === parent.parentId);
    assert.ok(entry);
    const sourceFile = path.join(PHONE, entry.Path);
    assert.equal(sha(fs.readFileSync(sourceFile)), entry.SHA);
    const receiptName = `${dataDirectory}/${parent.parentId}.receipt.json`;
    if (command === 'full' && fs.existsSync(path.join(DIR, receiptName))) continue;
    const initial = initialFor(parent);
    // 来源器仅用于读取旧记录；真正特征器和自动轨迹均启用默认自动换手。
    const source = new GameEngine(initial, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
    const automatic = new GameEngine(initial, { applyInitialTurnStart: false });
    const rows = createInterface({ input: fs.createReadStream(sourceFile).pipe(createGunzip()), crlfDelay: Infinity });
    let zip: ReturnType<typeof createGzip> | undefined, output: fs.WriteStream | undefined;
    const outputPath = path.join(DIR, `${dataDirectory}/${parent.parentId}.jsonl.gz`);
    if (command === 'full') {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        assert.ok(!fs.existsSync(outputPath), '拒绝覆盖未封存分片');
        if (fs.existsSync(outputPath + '.partial')) fs.renameSync(outputPath + '.partial', outputPath + '.interrupted-' + Date.now());
        zip = createGzip({ level: 3 }); output = fs.createWriteStream(outputPath + '.partial', { flags: 'wx' }); zip.pipe(output);
    }
    let originalRows = 0, kept = 0, trivial = 0, stateHashChanges = 0, weight = 0, candidates = 0;
    const localMs: number[] = [];
    const started = performance.now();
    const parentTarget = pi < 48 ? 2 : 1;
    let localProfiled = 0;
    for await (const line of rows) {
        const row = JSON.parse(line);
        const state = source.getState(), all = source.getLegalActions(state.currentPlayer);
        if (!originalRows) {
            const canonical = (v: any): string => v === null || typeof v !== 'object' ? JSON.stringify(v) ?? 'null' : Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.entries(v).filter(([, z]) => z !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, z]) => JSON.stringify(k) + ':' + canonical(z)).join(',')}}`;
            assert.equal(sha(canonical(state.rules)), row.projectionReceipt.originalRulesDigest, '冻结原生规则配置摘要不一致');
        }
        const byCode = new Map(all.map(a => [encodeAction(a), a]));
        if (hash([...byCode.keys()].sort()) !== hash([...row.codes].sort())) {
            save('candidate-difference.json', { parent: parent.parentId, row: originalRows, macro: row.macro, code: row.codes[row.target],
                onlyCurrent: [...byCode.keys()].filter(c => !row.codes.includes(c)), onlySource: row.codes.filter((c: string) => !byCode.has(c)), state });
            throw Error(`${parent.parentId} 候选集合变化，先诊断再提取`);
        }
        const labelCode = row.codes[row.target], label = byCode.get(labelCode);
        assert.ok(label);
        if (hash(state) !== row.beforeHash) stateHashChanges++;
        originalRows++;
        const meaningful = all.some(a => a.type !== 'end_turn' && a.type !== 'surrender');
        if (!meaningful) {
            assert.equal(label.type, 'end_turn');
            trivial++;
        } else {
            assert.equal(hash(automatic.getState()), hash(state), `${parent.parentId} 自动换手前态不同`);
            // 投降不作为普通策略候选；标签仍严格映射到原冻结宏动作。
            const legal = all.filter(a => a.type !== 'surrender');
            const packet = observe(observationState(state), legal);
            const ordered = packet.codes.map(code => byCode.get(code)!);
            if (command === 'full' || command === 'profile' && localProfiled < parentTarget) {
                const t0 = performance.now();
                const features = extractFeatures(automatic as any, ordered);
                save(`probes/${profiled}.json`, {state, codes:packet.codes, old:features.old, extra:features.extra, ms:performance.now()-t0});
                if (features.stats.exhaustiveFallbacks && !fs.existsSync(path.join(DIR, `fallback-probe-${lane}.json`))) save(`fallback-probe-${lane}.json`, { state, codes: packet.codes, stats: features.stats });
                const ms = performance.now() - t0;
                localMs.push(ms);
                if (command === 'profile') {
                    if (profiled < 3) console.log(JSON.stringify({ parent: parent.parentId, stats: features.stats, units: state.units.length }));
                    timings.push(ms); candidateTimings.push(ms / ordered.length);
                    features.extra.forEach(v => v.forEach((n, i) => { if (n !== 0) coverage[i]++; }));
                    coverageCandidates += ordered.length; profiled++; localProfiled++;
                    
                } else {
                    const encoded = encodeFeatures(packet, oldSchema, features);
                    const target = packet.codes.indexOf(labelCode); assert.ok(target >= 0);
                    const record = { ...encoded, target, weight: row.weight, actionGroups: ordered.map(groupKey),
                        parent: parent.parentId, macro: row.macro, subAction: row.subAction, macroLength: row.macroLength, type: label.type,
                        beforeHash: hash(state), legalHash: hash(packet.codes), featuresSchema: 'tactics-pc-v2', automaticHandoff: true };
                    if (!zip!.write(JSON.stringify(record) + '\n')) await once(zip!, 'drain');
                }
            }
            kept++; candidates += ordered.length; weight += row.weight;
            assert.ok(!automatic.step(label).info.includes('非法动作'));
        }
        assert.ok(!source.step(label).info.includes('非法动作'));
        if (command === 'profile' && localProfiled >= parentTarget) break;
        if (command === 'full' && originalRows % 64 === 0) save(`prepare-${lane}.live.json`, { parent: parent.parentId, originalRows, kept, candidates, seconds: (performance.now() - started) / 1000 });
    }
    if (command === 'full') {
        zip!.end(); await once(output!, 'finish'); fs.renameSync(outputPath + '.partial', outputPath);
        assert.equal(originalRows, entry.Rows);
        assert.deepEqual(Object.fromEntries(boundPaths.map(name => [name, sha(fs.readFileSync(path.resolve(DIR, name)))])), sourceBinding);
        const receipt = { parent: parent.parentId, split: parent.split, sourcePath: sourceFile, sourceSha256: entry.SHA, sourceBinding,
            originalRows, kept, trivial, stateHashChanges, weight, candidates, sha256: sha(fs.readFileSync(outputPath)), seconds: (performance.now() - started) / 1000, latency: quantiles(localMs) };
        save(receiptName, receipt);
        console.log(JSON.stringify(receipt));
        const disk = fs.statfsSync(DIR); if (disk.bavail * disk.bsize < 12 * 1024 ** 3) throw Error('磁盘余量不足12GiB');
    }
    if (command === 'audit') {
        const receipt = { parent: parent.parentId, split: parent.split, originalRows, kept, trivial, stateHashChanges, weight, candidates, sourceSha256: entry.SHA, automaticTrajectoryMatched: true };
        assert.equal(originalRows, entry.Rows);
        save(`source-audit/${parent.parentId}.json`, receipt);
        console.log(JSON.stringify(receipt));
    }
    if (command === 'profile') console.log(JSON.stringify({ parent: parent.parentId, profiled, lastMs: timings.at(-1) }));
}
if (command === 'profile') {
    assert.equal(profiled, 128);
    save('feature-profile-v3-128.json', { states: profiled, candidates: coverageCandidates, scope: '冻结80父局，前48父局各2个其余各1个非平凡状态；开发材料', latencyMs: quantiles(timings), perCandidateMs: quantiles(candidateTimings), coverage: Object.fromEntries(FEATURE_NAMES.map((k, i) => [k, { nonzero: coverage[i], fraction: coverage[i] / coverageCandidates }])) });
}
