/** 第一阶段独立前态读取、身份与编码合同；不串接历史宏或项目动作。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createGunzip, gunzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { createRecordExpansionOptions, expandApkReplayRecordToProjectActions } from '../../../src/game/apk_replay';
import { readNativeSnapshot } from '../../data_acceptance_20261016/native_reader/reader';
import { projectSnapshot, nativeRecord, comparableState } from '../../data_acceptance_20261016/phone/projection';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { trainingValueTarget } from '../../../src/ai_runtime/dual_v3/value_target';
import { softPriors, PRIOR_VERSION } from '../../../src/ai_runtime/dual_v3/search_policy';
import { packTensorBatch } from '../../dual_stream_v2_phase1_20261020/tensor_bridge';
import type { GameState, Action } from '../../../src/game/types';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');
export const INDEX = 'D:/AncientEmpiresData/collection_20261030_pc64_to3000_v1/MERGED_QUALIFIED_INDEX.json';
export const OLD_SPLIT = path.join(ROOT, 'ai_training/phone_2m_scratch100_20261024/SPLIT.json');
export const CHECKPOINT = path.join(ROOT, 'ai_training/phone_2m_continue414_20261027/completion/job/output/checkpoint-1.pt');
export const sha = (v: string | Uint8Array) => crypto.createHash('sha256').update(v).digest('hex');
export const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
export const fileSha = (p: string) => sha(fs.readFileSync(p));
export function save(p: string, value: unknown) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p + '.pending', JSON.stringify(value, null, 2) + '\n'); fs.renameSync(p + '.pending', p); }
export const tally = (rows: any[], key: (r: any) => string) => rows.reduce((o, r) => { const k = key(r); o[k] = (o[k] ?? 0) + 1; return o; }, {} as Record<string, number>);
export function stable(v: any): string { return v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'; }
export const semantic = (s: GameState) => comparableState(s);
export const stateKey = (s: GameState) => sha(stable(semantic(s)));
export function actionToken(s: GameState, a: Action) {
    const entities = new Map(s.units.map(u => [u.id, [u.ownerId, u.unitClass, u.pos.x, u.pos.y]]));
    return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, k.endsWith('Id') && typeof v === 'string' ? entities.get(v) ?? s.graves?.find(g => g.id === v)?.pos ?? v : v]));
}
export async function* lines(file: string): AsyncGenerator<any> {
    const input = fs.createReadStream(file), gzip = createGunzip(); input.on('error', e => gzip.destroy(e)); input.pipe(gzip);
    const stream = createInterface({ input: gzip, crlfDelay: Infinity });
    try { for await (const line of stream) if (line) yield JSON.parse(line); } finally { stream.close(); input.destroy(); gzip.destroy(); }
}
export async function* frames(file: string): AsyncGenerator<Buffer> {
    const input = fs.createReadStream(file), gzip = createGunzip(); input.on('error', e => gzip.destroy(e)); input.pipe(gzip);
    let pending = Buffer.alloc(0), size: number | null = null;
    try { for await (const chunk of gzip) { pending = Buffer.concat([pending, chunk]); while (true) {
        if (size === null) { if (pending.length < 4) break; size = pending.readInt32BE(); pending = pending.subarray(4); if (size < 1 || size > 2 ** 26) throw Error('快照长度无效'); }
        if (pending.length < size) break; const b = Buffer.from(pending.subarray(0, size)); pending = pending.subarray(size); size = null; yield b;
    } } if (size !== null || pending.length) throw Error('快照流截断'); } finally { input.destroy(); gzip.destroy(); }
}
export const directory = (p: any) => p.localDirectory ?? p.directory;
export function verifyFiles(p: any) {
    const hashes: Record<string, string> = {};
    for (const [name, entry] of Object.entries(p.files) as [string, any][]) {
        const expected = typeof entry === 'string' ? entry : entry.sha256;
        const actual = fileSha(path.join(directory(p), name)); if (actual !== expected) throw Error('输入摘要变化：' + name); hashes[name] = actual;
    }
    return hashes;
}
export interface Decision { state: GameState; action: Action; macro: number; sub: number; phase: string }
export function phaseOf(s: GameState) { return s.turn <= 5 ? 'opening' : s.turn <= 15 ? 'middle' : 'late'; }
export async function* decisions(p: any, chosen?: Set<number>): AsyncGenerator<Decision> {
    const dir = directory(p); let macro = 0;
    if (p.source?.includes('replica')) {
        for await (const r of lines(path.join(dir, 'decisions.jsonl.gz'))) {
            if (r.step !== macro) throw Error('项目决策编号不连续');
            if (!chosen || chosen.has(macro)) { if (!r.before?.map) throw Error('缺独立完整项目前态'); yield { state: r.before, action: r.action, macro, sub: 0, phase: phaseOf(r.before) }; }
            macro++; if (chosen && macro > Math.max(...chosen)) return;
        }
    } else {
        const config = fs.readFileSync(path.join(dir, 'config.bin'));
        const raw = gunzipSync(fs.readFileSync(path.join(dir, 'actions.jsonl.gz'))).toString().trim().split(/\r?\n/).map(s => JSON.parse(s));
        const records = raw.map(r => nativeRecord(r.fields));
        for await (const b of frames(path.join(dir, 'states.bin.gz'))) {
            if (macro >= raw.length) throw Error('快照多于宏动作');
            if (!chosen || chosen.has(macro)) {
                const state = projectSnapshot(readNativeSnapshot(b), config, p.map);
                const actions = expandApkReplayRecordToProjectActions(records[macro], state, createRecordExpansionOptions(records, macro, { allowAmbiguousRecruitDeployFirstMatch: false, onNotice: n => { throw Error('宏标签信息损失：' + JSON.stringify(n)); } }));
                const engine = new GameEngine(state, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
                for (let sub = 0; sub < actions.length; sub++) {
                    const current = engine.getState(); yield { state: current, action: actions[sub], macro, sub, phase: phaseOf(current) };
                    // 宏之间始终读取保存前态，只在宏内后续原子确有需要时结算。
                    if (sub + 1 < actions.length) { if (!engine.hasLegalAction(current.currentPlayer, actions[sub])) throw Error('宏内动作被权威规则拒绝'); const r = engine.step(actions[sub]); if (r.info.includes('非法动作')) throw Error('宏内结算拒绝'); }
                }
            }
            macro++; if (chosen && macro > Math.max(...chosen)) return;
        }
        if (macro !== raw.length) throw Error('快照少于宏动作');
    }
    if (macro !== p.actions) throw Error('动作记录数量与索引不同');
}
export function initialState(p: any): GameState {
    const dir = directory(p);
    return p.source?.includes('replica') ? read(path.join(dir, 'initial.json')).projectState : projectSnapshot(readNativeSnapshot(fs.readFileSync(path.join(dir, 'initial.bin'))), fs.readFileSync(path.join(dir, 'config.bin')), p.map);
}
export function encode(p: any, r: Decision) {
    const state = r.state, engine = new GameEngine(state, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
    const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
    const codes = legal.map(encodeAction), code = encodeAction(r.action), index = codes.indexOf(code);
    if (index < 0 || new Set(codes).size !== codes.length) throw Error('候选标签缺失或候选动作码不唯一');
    const context = new ReachabilityContext(state), observation = encodeDualObservation(state, legal, context);
    const target = observation.actions.sourceIndices.indexOf(index); if (target < 0) throw Error('因子候选缺少示范标签');
    const value = trainingValueTarget(state, observation.playerOrder, true, p.winner);
    const prior = softPriors(state, legal, context), pack = packTensorBatch([observation], [{ target, policyMask: true, valueMask: value.valueMask, valueTarget: value.target, weight: 1 }]);
    const source = { parentId: p.parentId, corpus: p.corpus, groupId: p.groupId, split: p.split, players: p.players, category: p.category, source: p.source, map: p.map, macro: r.macro, subAction: r.sub, phase: r.phase, before: stateKey(state), code, playerOrder: observation.playerOrder, priorVersion: PRIOR_VERSION, prior: Array.from(observation.actions.sourceIndices, i => prior[i]) };
    const meta = Buffer.from(JSON.stringify({ ...pack.metadata, sources: [source] })), header = Buffer.alloc(8); header.writeUInt32LE(meta.length); header.writeUInt32LE(pack.bytes.length, 4);
    return { bytes: Buffer.concat([header, meta, pack.bytes]), source, observation, target, value };
}
