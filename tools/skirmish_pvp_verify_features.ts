import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { AncientEmpiresEnv } from '../src/game/env';
import { buildLiveBcSample } from './skirmish_training_runner';
import { buildCandidateFeatures, sparseFeaturesToEntries } from './skirmish_bc_train';

const root='training_runs/pvp_navigation_20260918';
const summary=JSON.parse(await readFile(`${root}/feature-summary.json`,'utf8'));
let samples=0, candidates=0;
for(const split of ['train','validation','test']) {
    const games=summary.filter((e:{kind:string;split:string;samples:number})=>e.kind==='pvp'&&e.split===split&&e.samples>0).slice(0,3);
    for(const game of games) {
        const states=(await readFile(`${root}/states/${game.id}.jsonl`,'utf8')).trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
        for(const version of ['v3','v4'] as const) {
            const rows=(await readFile(`${root}/features/pvp-${game.id}-${version}.jsonl`,'utf8')).trim().split(/\r?\n/).filter(Boolean).slice(0,3).map(line=>JSON.parse(line));
            for(const row of rows) {
                const snapshot=states.find(s=>s.actionIndex===row.source.stepIndex);
                const env=new AncientEmpiresEnv({initialState:snapshot.state});
                const result=env.reset();
                assert.equal(result.state.currentPlayer,row.playerId);
                assert.equal(result.state.turn,row.turn);
                const sample=buildLiveBcSample({result,playerId:row.playerId,stepNumber:row.step,episodeSeed:row.seed,scenario:row.scenario});
                for(const candidate of row.candidates) {
                    assert.ok(result.legalActionCodes.includes(candidate.actionCode));
                    assert.deepEqual(sparseFeaturesToEntries(buildCandidateFeatures(sample,candidate.actionCode,4096,`hashed-action-${version}`)!),candidate.features);
                    candidates++;
                }
                samples++;
            }
        }
    }
}
await writeFile(`${root}/feature-parity.json`,JSON.stringify({samples,candidates,passed:true,note:'从严格回放状态重建在线 sample，与落盘的 v3/v4 全部候选特征逐项比较'},null,2));
console.log(`在线/离线特征一致：${samples} 条样本、${candidates} 个候选`);
