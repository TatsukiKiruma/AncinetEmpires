import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { GameEngine } from '../../../src/game/engine';
import { optimizationPlugin } from './encoding_optimization';
import { hash } from '../io';

const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.resolve(here,'../..');
const target=path.join(here,'revisions/xiaomi_20261020','observation-parity-'+Date.now());fs.mkdirSync(target);
const entry=path.join(target,'entry.ts');
fs.writeFileSync(entry,`export {observe} from ${JSON.stringify(repo+'/src/ai_runtime/sd_v1/observation.ts')};\nexport {observationState} from ${JSON.stringify(repo+'/ai_training/tactical_scale_20261018/encoding.ts')};\n`,{flag:'wx'});
for(const variant of ['original','optimized'])await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',outfile:path.join(target,variant+'.mjs'),plugins:variant==='optimized'?[optimizationPlugin(repo,target)]:[]});
const original=await import(pathToFileURL(path.join(target,'original.mjs')).href),optimized=await import(pathToFileURL(path.join(target,'optimized.mjs')).href);
let roots=0,tokens=0,candidates=0;
for(let shard=0;shard<4;shard++){
    const rows=gunzipSync(fs.readFileSync(path.join(here,`search-scale/roots-${shard}.jsonl.gz`))).toString().trim().split('\n');
    for(const line of rows){
        const row=JSON.parse(line),engine=new GameEngine(row.state),state=engine.getState();
        assert.equal(hash(state),row.stateHash);
        const before=hash(state),legal=engine.getLegalActions(state.currentPlayer).filter(action=>action.type!=='surrender');
        const a=original.observe(original.observationState(state),legal),b=optimized.observe(optimized.observationState(state),legal);
        assert.equal(JSON.stringify(a),JSON.stringify(b),row.id);
        assert.equal(JSON.stringify(original.observe(original.observationState(state),[])),JSON.stringify(optimized.observe(optimized.observationState(state),[])),row.id);
        assert.equal(hash(state),before,'投影或观察污染了输入');
        tokens+=a.tokens.length;candidates+=a.candidates.length;roots++;
    }
    console.log(JSON.stringify({shard,roots}),);
}
assert.equal(roots,1557);
const report={passed:true,roots,tokens,candidates,fullAndEmptyCandidatePacketsByteExact:true,inputStatesUnchanged:true,
    scope:'固定1557根全部模型可见观察逐字节相同；只核验分配优化，不重新拟合系数，不作为棋力或性能通过'};
fs.writeFileSync(path.join(target,'PARITY.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({output:target,...report}));
