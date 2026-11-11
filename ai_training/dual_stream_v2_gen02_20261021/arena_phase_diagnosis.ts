import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, read, save } from './common';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';

const panels = ['champion-pure-arena', 'champion-search-arena', 'generations/gen_02/arena'];
const groups: Record<string, any> = {}, ownership: any[] = [], paired: any[] = [];
for (const arena of panels) {
    const plan = read(arena + '/plan.json');
    for (const slot of plan.slots) {
        const prefix = arena + '/battles/' + slot.id;
        if (!fs.existsSync(path.join(DIR, prefix, 'result.json'))) continue;
        const result = read(prefix + '/result.json'), receipt = read(prefix + '/strict-replay.json');
        assert.ok(receipt.passed && receipt.actions === result.actions);
        const engine = new GameEngine(read(plan.maps[slot.mapIndex].path));
        for await (const row of gzipRows(fs.readFileSync(path.join(DIR, prefix, 'actions.jsonl.gz')))) {
            const state = engine.getState(); assert.equal(stateHash(state), row.beforeHash);
            const phase = state.turn <= 5 ? 'opening' : state.turn <= 15 ? 'middle' : 'late';
            const key = `${arena.startsWith('champion') ? 'gen00' : 'gen02'}/${slot.mode}/${slot.panel}/${phase}/${row.side}`;
            groups[key] ??= { actions: 0, types: {}, rootSearches: 0, queued: 0, takeovers: 0, vetoes: 0, retaliationAttempts: 0, retaliationComplete: 0 };
            const g = groups[key]; g.actions++;
            const action = engine.getLegalActions(state.currentPlayer).find(a => encodeAction(a) === row.code); assert.ok(action);
            g.types[action.type] = (g.types[action.type] ?? 0) + 1;
            if (row.telemetry) {
                const t = row.telemetry;
                g.queued += Number(t.queued);
                if (!t.queued) { g.rootSearches++; g.takeovers += Number(t.takeover); g.vetoes += Number(t.veto); g.retaliationAttempts += t.retaliationAttempts; g.retaliationComplete += t.retaliationComplete; }
            }
            const next = engine.step(action); assert.equal(stateHash(next.state), row.afterHash);
        }
        assert.equal(stateHash(engine.getState()), result.finalHash);
        if (result.classification === 'error' || result.classification === 'decision_timeout') ownership.push({ arena, id: slot.id, classification: result.classification, owner: result.failedDecision?.owner ?? (slot.modelSeats.includes(engine.getState().currentPlayer) ? 'model' : 'opponent'), ownerBasis: result.failedDecision ? '未提交决策的直接记录' : 'strict恢复后的当前行动席位；异常是否源自引擎须结合stack', error: result.error, failedDecision: result.failedDecision });
        paired.push({ generation: arena.startsWith('champion') ? 0 : 2, mode: slot.mode, panel: slot.panel, stage3Id: slot.stage3Id, opponentSeed: slot.opponentSeed, seat: slot.seat, initialSha256: plan.maps[slot.mapIndex].sha256, classification: result.classification, finalTurn: result.finalTurn, path: prefix, actions: result.actions });
        if (paired.length % 28 === 0) console.log(JSON.stringify({ phaseAuditSlots: paired.length, total: 224 }));
    }
}
save('phase-diagnosis.json', { groups, ownership, rulesReplayed: true, evaluationIsDevelopment: true, selectionBias: '阶段统计只描述实际到达该阶段的动作，不作为独立条件胜率' });
save('paired-slots.json', paired);
console.log(JSON.stringify({ groups: Object.keys(groups).length, slots: paired.length, classifiedFailures: ownership.length }));
