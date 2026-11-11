import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import type { Action, GameState } from '../../src/game/types';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { encodeOutcomeTarget } from '../../src/ai_runtime/dual_v2/player_order';
import { confinedFile, inspectAndRead, type Admission } from '../data_acceptance_20261016/phone/compact_reader';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
import { DIR, SOURCE, RELEASE, gzipRows, read, sha, stateHash } from './io';
import { transformAction, transformState, type Symmetry } from './symmetry';

export interface NativeEntry extends Admission { admittedAtoms: number; map: string; planId: string; actualBucket: { configuredPlayerCount: number; configMode: string } }
export interface SourceSample {
    state: GameState; legalActions: Action[]; targetCode: string; targetIndex: number;
    weight: number; valueMask: boolean; winner: number | null; parentId: string; source: 'native' | 'replay';
    sourceBeforeHash: string; currentBeforeHash: string; macro: number; subAction: number;
}
export interface LoaderStats { visited: number; yielded: number; trivial: number; excluded: number; surrendered: number; currentRuleRejected: number; currentStateDrift: number; quarantined: Array<{ source: string; parentId: string; segmentId?: string; macro: number; code: string; reason: string }> }
export const createLoaderStats = (): LoaderStats => ({ visited: 0, yielded: 0, trivial: 0, excluded: 0, surrendered: 0, currentRuleRejected: 0, currentStateDrift: 0, quarantined: [] });
export const nativeEntries = (): NativeEntry[] => fs.readFileSync(path.join(SOURCE, 'phone', RELEASE, 'release-index.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
export const replayEntries = (): any[] => {
    const entries = read(path.join(SOURCE, 'replay/policy-release-index.json')).candidateSources;
    const ids = new Set(entries.map((e: any) => e.responseSha256));
    for (const file of fs.readdirSync(path.join(SOURCE, 'replay/receipts'))) {
        const receipt = read(path.join(SOURCE, 'replay/receipts', file));
        if (receipt.accepted && !ids.has(receipt.responseSha256)) {
            if (receipt.policyRows !== 0) throw Error('未索引真人来源仍包含policy行');
            entries.push({ responseSha256: receipt.responseSha256, packet: receipt.packet, zeroPolicy: true });
        }
    }
    return entries;
};

export interface SplitManifest {
    schema: string; parents: Array<{ id: string; source: string; split: 'train' | 'dev'; stratum: string; group: string }>;
    exclusion: { paths: Array<{ path: string; sha256: string }>; uniqueStates: number; sha256: string };
}
export function loadExclusions(manifest: SplitManifest): Set<string> {
    const hashes = new Set<string>();
    for (const entry of manifest.exclusion.paths) {
        const bytes = fs.readFileSync(path.resolve(DIR, entry.path));
        if (sha(bytes) !== entry.sha256) throw Error('已消费评测排重索引被改写');
        for (const hash of gunzipSync(bytes).toString().trim().split('\n')) if (hash) hashes.add(hash);
    }
    if (hashes.size !== manifest.exclusion.uniqueStates || sha([...hashes].sort().join('\n') + '\n') !== manifest.exclusion.sha256) throw Error('排重集合身份不符');
    return hashes;
}

function admit(state: GameState, legal: Action[], code: string, metadata: Omit<SourceSample, 'state' | 'legalActions' | 'targetIndex' | 'currentBeforeHash' | 'targetCode'>, excluded: ReadonlySet<string>, stats: LoaderStats): SourceSample | null {
    stats.visited++;
    const codes = legal.map(encodeAction);
    if (new Set(codes).size !== codes.length) throw Error('权威合法动作码重复');
    const targetIndex = codes.indexOf(code);
    if (targetIndex < 0) { stats.currentRuleRejected++; throw Error(`当前规则标签非法:${metadata.parentId}/${metadata.macro}/${code}`); }
    if (legal[targetIndex].type === 'surrender') { stats.surrendered++; return null; }
    if (!legal.some(a => a.type !== 'surrender' && a.type !== 'end_turn')) { stats.trivial++; return null; }
    const currentBeforeHash = stateHash(state);
    if (excluded.has(currentBeforeHash) || excluded.has(metadata.sourceBeforeHash) || excluded.has(ruleStateHash(state))) { stats.excluded++; return null; }
    stats.yielded++;
    return { state, legalActions: legal, targetIndex, targetCode: code, currentBeforeHash, ...metadata };
}

/** 来源压缩包先经既有reader完整预检，再逐行重建；驻留内存至多一个压缩分片及一个局面。 */
export async function* streamNativeSegment(entry: NativeEntry, excluded: ReadonlySet<string>, stats = createLoaderStats()): AsyncGenerator<SourceSample> {
    if (!entry.policyLabelEligible || !entry.admittedAtoms) return;
    const root = path.join(SOURCE, 'phone'), checked = await inspectAndRead(root, entry);
    const bytes = fs.readFileSync(confinedFile(root, entry.candidateShard));
    if (sha(bytes) !== checked.sha256) throw Error('预检后来源压缩包发生变化');
    const engine = new GameEngine(checked.header.initialState, { disableAutoAdvanceWhenNoMeaningfulAction: true, applyInitialTurnStart: false });
    let drift = false;
    for await (const row of gzipRows(bytes)) {
        if (row.kind !== 'action' || row.macro >= entry.maxGlobalMacroExclusive) continue;
        const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer);
        if (stateHash(state) !== row.beforeHash) { stats.currentStateDrift++; drift = true; }
        const action = legal.find(a => encodeAction(a) === row.code);
        if (!action) { stats.currentRuleRejected++; stats.quarantined.push({ source: 'native', parentId: entry.parentId, segmentId: entry.segmentId, macro: row.macro, code: row.code, reason: '当前完整合法集合不含来源动作；隔离本段剩余尾部' }); return; }
        const sample = admit(state, legal, row.code, { parentId: entry.parentId, source: 'native', weight: row.weight, sourceBeforeHash: row.beforeHash, valueMask: entry.valueEligible && !drift, winner: entry.nativeWinningAllianceId, macro: row.macro, subAction: row.subAction }, excluded, stats);
        const result = engine.step(action);
        if (result.info.includes('非法动作') || result.info === 'Game already ended') throw Error('当前权威引擎拒绝来源标签');
        if (sample) yield sample;
    }
}

export async function* streamReplay(entry: any, excluded: ReadonlySet<string>, stats = createLoaderStats()): AsyncGenerator<SourceSample> {
    const root = path.join(SOURCE, 'replay'), receipt = read(confinedFile(root, `receipts/${entry.responseSha256}.json`));
    const bytes = fs.readFileSync(confinedFile(root, entry.packet.path));
    if (!receipt.accepted || receipt.responseSha256 !== entry.responseSha256 || receipt.packet.sha256 !== entry.packet.sha256 || sha(bytes) !== entry.packet.sha256) throw Error('真人回放整包准入或SHA失败');
    // 完整读到end并验证CRC之后才允许向消费者发放训练样本。
    let header: any, end: any, count = 0, priorAfter: string | null = null;
    for await (const row of gzipRows(bytes)) {
        if (row.kind === 'game') { if (header) throw Error('真人回放重复包头'); header = row; priorAfter = row.effectiveInitialStateHash; }
        if (row.kind === 'end') { if (end) throw Error('真人回放重复包尾'); end = row; }
        if (row.kind === 'atomic') { if (!header || end || row.atomic !== count || row.beforeHash !== priorAfter) throw Error('真人回放封存摘要链或行序错误'); priorAfter = row.afterHash; count++; }
    }
    if (!header || !end?.accepted || !end.fullyConsumed || header.schema !== 'replay_candidate_stream_v1' || count !== receipt.atomicActions) throw Error('真人回放头尾或原子总数失败');
    const engine = new GameEngine({ ...header.initialState, metadata: header.initialMetadata }, header.engineOptions);
    let weight = 1;
    for await (const row of gzipRows(bytes)) {
        if (row.kind === 'macro') { weight = row.atomicCount ? 1 / row.atomicCount : 0; continue; }
        if (row.kind !== 'atomic') continue;
        const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer);
        // 封存包身份与摘要链保持；后续公共规则修复可改变当前重建状态，单独计数。
        if (ruleStateHash(state) !== row.beforeHash) stats.currentStateDrift++;
        const action = legal.find(a => encodeAction(a) === row.actionCode);
        if (!action) { stats.currentRuleRejected++; stats.quarantined.push({ source: 'replay', parentId: entry.responseSha256, macro: row.macro, code: row.actionCode, reason: '当前完整合法集合不含来源动作；隔离剩余尾部' }); return; }
        const sample = row.labels.policyMask ? admit(state, legal, row.actionCode, { parentId: entry.responseSha256, source: 'replay', weight, sourceBeforeHash: row.beforeHash, valueMask: false, winner: null, macro: row.macro, subAction: row.subAction }, excluded, stats) : null;
        const result = engine.step(action);
        if (result.info.includes('非法动作') || result.info === 'Game already ended') throw Error('真人回放当前权威规则拒绝动作');
        if (sample) yield sample;
    }
}

export async function* streamDataset(manifest: SplitManifest, split: 'train' | 'dev', stats = createLoaderStats()) {
    const excluded = loadExclusions(manifest), selected = new Set(manifest.parents.filter(p => p.split === split).map(p => `${p.source}:${p.id}`));
    for (const entry of nativeEntries()) if (selected.has(`native:${entry.parentId}`)) yield* streamNativeSegment(entry, excluded, stats);
    for (const entry of replayEntries()) if (selected.has(`replay:${entry.responseSha256}`)) yield* streamReplay(entry, excluded, stats);
}

/** 在线增强与编码；不写磁盘特征缓存，迭代器停止时上游随即关闭。 */
export function encodeSample(sample: SourceSample, symmetry: Symmetry = 'id') {
    const state = transformState(sample.state, symmetry), action = sample.legalActions[sample.targetIndex];
    const legal = sample.legalActions.map(a => transformAction(a, state.map.width, state.map.height, symmetry));
    const observation = encodeDualObservation(state, legal), code = encodeAction(transformAction(action, state.map.width, state.map.height, symmetry));
    const targetSourceIndex = legal.findIndex(a => encodeAction(a) === code);
    const target = observation.actions.sourceIndices.indexOf(targetSourceIndex);
    if (target < 0) throw Error('目标动作未进入非投降指针集合');
    const outcome = encodeOutcomeTarget(state, observation.playerOrder, sample.valueMask, sample.winner);
    return { observation, target, outcome, weight: sample.weight };
}
