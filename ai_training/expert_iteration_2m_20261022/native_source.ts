/** 原生分片全量顺序重放；Policy和Value分别按稳定摘要抽样，无每局条数上限。 */
import path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { decodeAction, encodeAction } from '../../src/game/env';
import { inspectAndRead } from '../data_acceptance_20261016/phone/compact_reader';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
import { SOURCE, sha, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import type { NativeEntry, SourceSample, LoaderStats } from '../dual_stream_v2_phase3_20261020/source_loader';
export const POLICY_NATIVE_RATE = .01, VALUE_NATIVE_RATE = .08;
const selected = (key: string, rate: number) => parseInt(sha(key).slice(0,8),16)/4294967296 < rate;
export interface TrainingSample extends SourceSample { policyMask: boolean; normalizationScale?: number }
export async function* nativeSamples(entry: NativeEntry, excluded: ReadonlySet<string>, stats: LoaderStats): AsyncGenerator<TrainingSample> {
    if (!entry.policyLabelEligible || !entry.admittedAtoms) return;
    const rows: any[] = [], checked = await inspectAndRead(path.join(SOURCE,'phone'),entry,row=>{rows.push(row);});
    const engine = new GameEngine(checked.header.initialState,{disableAutoAdvanceWhenNoMeaningfulAction:true,applyInitialTurnStart:false});
    let drift = false;
    for (const row of rows) {
        stats.visited++;
        const policyMask = selected('2m-policy-v1:'+row.beforeHash,POLICY_NATIVE_RATE), valueSelected = entry.valueEligible && selected('2m-value-v1:'+row.beforeHash,VALUE_NATIVE_RATE);
        const state = engine.getState(), action = decodeAction(row.code); if (!action) throw Error('原生动作码不能解码');
        let sample: TrainingSample | undefined;
        if (policyMask || valueSelected) {
            const currentBeforeHash = stateHash(state);
            if (currentBeforeHash !== row.beforeHash) { drift = true; stats.currentStateDrift++; }
            const legal = engine.getLegalActions(state.currentPlayer), targetIndex = legal.findIndex(a=>encodeAction(a)===row.code);
            if (targetIndex<0) { stats.currentRuleRejected++; stats.quarantined.push({source:'native',parentId:entry.parentId,segmentId:entry.segmentId,macro:row.macro,code:row.code,reason:'当前权威合法集合不含动作，隔离该分片后缀'}); return; }
            if (action.type==='surrender') stats.surrendered++;
            else if (!legal.some(a=>a.type!=='end_turn'&&a.type!=='surrender')) stats.trivial++;
            else if (excluded.has(row.beforeHash)||excluded.has(currentBeforeHash)||excluded.has(ruleStateHash(state))) stats.excluded++;
            else {
                const valueMask = Boolean(valueSelected&&!drift);
                if (policyMask || valueMask) {
                    sample = {state,legalActions:legal,targetIndex,targetCode:row.code,policyMask,valueMask,winner:valueMask?entry.nativeWinningAllianceId:null,
                        parentId:entry.parentId,source:'native',weight:row.weight,sourceBeforeHash:row.beforeHash,currentBeforeHash,macro:row.macro,subAction:row.subAction};
                    stats.yielded++;
                }
            }
        }
        const result = engine.step(action);
        if (result.info.includes('非法动作')||result.info==='Game already ended') { stats.currentRuleRejected++; stats.quarantined.push({source:'native',parentId:entry.parentId,segmentId:entry.segmentId,macro:row.macro,code:row.code,reason:'当前权威step拒绝，隔离该分片后缀'}); return; }
        if (sample) yield sample;
    }
}
