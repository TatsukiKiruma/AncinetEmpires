/** 从无损随机寻址副本读取指定独立前态；请求顺序就是训练顺序。 */
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { GameEngine } from '../../../src/game/engine';
import { createRecordExpansionOptions, expandApkReplayRecordToProjectActions } from '../../../src/game/apk_replay';
import { readNativeSnapshot } from '../../data_acceptance_20261016/native_reader/reader';
import { nativeRecord, projectSnapshot } from '../../data_acceptance_20261016/phone/projection';
import { HERE, read, sha, directory, encode, phaseOf, type Decision } from '../stage1/io';
import { preflight, sealedAllowed } from './identity';
preflight();
const sealed = process.argv.includes('--sealed');
if (sealed) sealedAllowed();

const frozen = read(path.join(HERE, 'PARTITIONS.json')), parents = new Map<string, any>(frozen.parents.map((p: any) => [p.parentId, p]));
const store = 'D:/AncientEmpiresData/continuation_stage1_20261030_v1/raw-store';
const parentCache = new Map<string, any>(), chunkCache = new Map<string, Buffer>(); let cacheBytes = 0;
function source(p: any) {
    if (parentCache.has(p.parentId)) return parentCache.get(p.parentId);
    const index = read(path.join(store, p.parentId + '.json'));
    const expected = p.files[index.sourceFile], digest = typeof expected === 'string' ? expected : expected.sha256;
    if (index.parentId !== p.parentId || index.sourceSha256 !== digest || index.records !== p.actions) throw Error('无损副本的输入身份不符');
    const config = p.source.includes('replica') ? null : fs.readFileSync(path.join(directory(p), 'config.bin'));
    const records = config ? gunzipSync(fs.readFileSync(path.join(directory(p), 'actions.jsonl.gz'))).toString().trim().split(/\r?\n/).map(s => nativeRecord(JSON.parse(s).fields)) : null;
    const value = { index, config, records }; parentCache.set(p.parentId, value);
    if (parentCache.size > 64) parentCache.delete(parentCache.keys().next().value!);
    return value;
}
function decision(p: any, request: any): Decision {
    const { index, config, records } = source(p), b = index.blocks.find((r: any) => request.macro >= r.first && request.macro < r.first + r.rows);
    if (!b) throw Error('随机寻址宏超出范围'); const key = p.parentId + ':' + b.first;
    let raw = chunkCache.get(key);
    if (!raw) {
        const fd = fs.openSync(index.path, 'r'), compressed = Buffer.alloc(b.bytes);
        try { if (fs.readSync(fd, compressed, 0, b.bytes, b.offset) !== b.bytes) throw Error('随机寻址块截断'); } finally { fs.closeSync(fd); }
        if (sha(compressed) !== b.sha256) throw Error('随机寻址块摘要不符'); raw = gunzipSync(compressed);
        chunkCache.set(key, raw); cacheBytes += raw.length;
        while (cacheBytes > 128 * 2 ** 20 && chunkCache.size > 1) { const first = chunkCache.keys().next().value!; cacheBytes -= chunkCache.get(first)!.length; chunkCache.delete(first); }
    }
    if (!config) {
        const r = JSON.parse(raw.toString().split('\n')[request.macro - b.first]);
        if (request.sub !== 0 || r.step !== request.macro) throw Error('项目样本位置不符'); return { state: r.before, action: r.action, macro: request.macro, sub: 0, phase: phaseOf(r.before) };
    }
    let offset = 0, bytes: Buffer | undefined;
    for (let i = b.first; i <= request.macro; i++) { const length = raw.readInt32BE(offset); offset += 4; bytes = raw.subarray(offset, offset + length); offset += length; }
    const state = projectSnapshot(readNativeSnapshot(bytes!), config, p.map);
    const actions = expandApkReplayRecordToProjectActions(records[request.macro], state, createRecordExpansionOptions(records, request.macro, { allowAmbiguousRecruitDeployFirstMatch: false, onNotice: n => { throw Error('标签信息损失：' + JSON.stringify(n)); } }));
    const sub = request.sub < 0 ? request.choice % actions.length : request.sub;
    if (sub >= actions.length || sub < 0) throw Error('子动作游标越界');
    const engine = new GameEngine(state, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
    for (let i = 0; i < sub; i++) { if (!engine.hasLegalAction(engine.getState().currentPlayer, actions[i])) throw Error('宏内结算动作不合法'); const r = engine.step(actions[i]); if (r.info.includes('非法动作')) throw Error('宏内结算失败'); }
    const current = engine.getState(); return { state: current, action: actions[sub], macro: request.macro, sub, phase: phaseOf(current) };
}
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    const request = JSON.parse(line);
    for (const item of request) {
        const p = parents.get(item.parentId); if (!p || !(sealed ? ['test'] : ['train', 'dev']).includes(p.split)) throw Error('封存测试或隔离样本禁止读取');
        if (item.split && item.split !== p.split) throw Error('请求分区不符');
        if (sealed) fs.appendFileSync('D:/AncientEmpiresData/continuation_stage3_20261030_v1/run-v2-batch8/SEALED_ACCESS.jsonl', JSON.stringify({parentId:p.parentId, macro:item.macro, purpose:'locked-final-offline'}) + '\n');
        const packed = encode(p, decision(p, item)); if (!process.stdout.write(packed.bytes)) await once(process.stdout, 'drain');
    }
}
