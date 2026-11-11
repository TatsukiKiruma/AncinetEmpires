import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { decodeAction, encodeAction } from '../../src/game/env';
import { inspectAndRead } from '../data_acceptance_20261016/phone/compact_reader';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
import { SOURCE, sha, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import type { NativeEntry, SourceSample, LoaderStats } from './source_loader';

/** 原始包仍完整预检；非入池帧仅由权威step定向验证，避免全候选和规范哈希的重复计算。 */
export async function* streamSparseNative(entry: NativeEntry, excluded: ReadonlySet<string>, stats: LoaderStats): AsyncGenerator<SourceSample> {
    if (!entry.policyLabelEligible || !entry.admittedAtoms) return;
    const groups = new Map<string, Array<{ rank: string; key: string }>>(), rows: any[] = [];
    const checked = await inspectAndRead(path.join(SOURCE, 'phone'), entry, row => {
        rows.push(row);
        const type = row.code.split(':')[0];
        const family = type === 'attack' ? 'attack' : type === 'capture' ? 'capture' : type.startsWith('recruit_') ? 'recruit' : ['heal', 'support', 'summon'].includes(type) ? 'support' : type === 'move' || type === 'post_attack_move' ? 'move' : 'finish';
        const key = `${row.turn <= 5 ? 0 : row.turn <= 15 ? 1 : 2}/${family}`;
        const pool = groups.get(key) ?? []; groups.set(key, pool);
        pool.push({ rank: sha('stage3-source:' + row.beforeHash), key: `${row.macro}:${row.subAction}` });
        pool.sort((a, b) => a.rank.localeCompare(b.rank)); if (pool.length > 16) pool.pop();
    });
    const selected = new Set([...groups.values()].flat().map(r => r.key));
    const engine = new GameEngine(checked.header.initialState, { disableAutoAdvanceWhenNoMeaningfulAction: true, applyInitialTurnStart: false });
    let state = engine.getState(), drift = false;
    for (const row of rows) {
        stats.visited++;
        const currentBeforeHash = stateHash(state);
        if (currentBeforeHash !== row.beforeHash) { stats.currentStateDrift++; drift = true; }
        const action = decodeAction(row.code); if (!action) throw Error('原生动作码不能解码');
        let sample: SourceSample | null = null;
        if (selected.has(`${row.macro}:${row.subAction}`)) {
            const legal = engine.getLegalActions(state.currentPlayer), targetIndex = legal.findIndex(a => encodeAction(a) === row.code);
            if (targetIndex < 0) {
                stats.currentRuleRejected++; stats.quarantined.push({ source: 'native', parentId: entry.parentId, segmentId: entry.segmentId, macro: row.macro, code: row.code, reason: '当前完整合法集合不含来源动作；隔离本段尾部' }); return;
            }
            if (action.type === 'surrender') stats.surrendered++;
            else if (!legal.some(a => a.type !== 'surrender' && a.type !== 'end_turn')) stats.trivial++;
            else if (excluded.has(row.beforeHash) || excluded.has(currentBeforeHash) || excluded.has(ruleStateHash(state))) stats.excluded++;
            else {
                stats.yielded++;
                sample = { state, legalActions: legal, targetIndex, targetCode: row.code, weight: row.weight,
                    valueMask: entry.valueEligible && !drift, winner: entry.nativeWinningAllianceId, parentId: entry.parentId,
                    source: 'native', sourceBeforeHash: row.beforeHash, currentBeforeHash, macro: row.macro, subAction: row.subAction };
            }
        }
        const result = engine.step(action);
        if (result.info.includes('非法动作') || result.info === 'Game already ended') {
            stats.currentRuleRejected++; stats.quarantined.push({ source: 'native', parentId: entry.parentId, segmentId: entry.segmentId, macro: row.macro, code: row.code, reason: '当前权威定向step拒绝动作；隔离本段尾部' }); return;
        }
        state = result.state;
        if (sample) yield sample;
    }
}
