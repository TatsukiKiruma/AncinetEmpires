import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, read, save, sha } from './common';
import { gzipRows, stateHash } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';

// 原始1050ms超时保持原件；这里只核对相同前态、随机游标和真实动作的热态成本。
const plan = read('generations/gen_04/league-plan.json'), slot = plan.slots.find((s: any) => s.id === 'league-4-051');
const directory = path.join(DIR,'generations/gen_04/games',slot.id), result = read(path.join(directory,'result.json'));
const engine = new GameEngine(read(slot.initialPath)); let rngState = slot.seed;
for await (const row of gzipRows(fs.readFileSync(path.join(directory,'actions.jsonl.gz')))) {
    assert.equal(stateHash(engine.getState()),row.beforeHash);
    const action = engine.getLegalActions(engine.getState().currentPlayer).find(a => encodeAction(a) === row.code); assert.ok(action);
    engine.step(action); rngState = row.rngAfter;
}
const state = engine.getState(); assert.equal(stateHash(state),result.finalHash);
const actions = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender').sort((a,b) => encodeAction(a).localeCompare(encodeAction(b)));
const times: number[] = [], codes: string[] = [];
for (let i=0;i<8;i++) {
    let cursor = rngState >>> 0;
    const rng = () => { cursor = (cursor + 0x6D2B79F5) >>> 0; let t = cursor; t = Math.imul(t ^ t >>> 15,t | 1); t ^= t + Math.imul(t ^ t >>> 7,t | 61); return ((t ^ t >>> 14) >>> 0)/4294967296; };
    const ai = new HeuristicAI(rng), start = performance.now(), action = ai.getAction(engine,state.currentPlayer,actions); times.push(performance.now()-start); codes.push(encodeAction(action));
    assert.equal(stateHash(engine.getState()),result.finalHash);
}
const receipt = { slot:slot.id, beforeHash:result.finalHash, originalMs:result.failedDecision.ms, originalCode:result.failedDecision.code, rngState, units:state.units.length, map:[state.map.width,state.map.height], legalActions:actions.length, times,codes, originalActionReproduced:codes.every(c => c === result.failedDecision.code), executionArgs:process.execArgv, heuristicSha256:sha(fs.readFileSync(path.resolve(DIR,'../../src/game/ai/heuristic_ai.ts'))),scope:'相同前态热态成本诊断，不能抹去正式对手超时'};
save(process.env.LEAGUE_OPPONENT_DIAG_OUTPUT ?? 'phase53-audit/gen4-opponent-timeout-diagnosis.json',receipt); console.log(JSON.stringify(receipt));
