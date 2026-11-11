/** 不加载AI，流式逐行重放全部实际动作与反扑见证，不放宽规则断言。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { gzipJsonRows } from './gzip_rows';

const dir=path.resolve(process.argv[2]),read=(name:string)=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const target=process.argv[3]?path.resolve(process.argv[3]):path.join(dir,'strict.json');
assert.ok(!fs.existsSync(target),'拒绝覆盖已有独立校验回执');
const hash=(state:any)=>crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
const started=read('started.json'),result=read('result.json'),engine=new GameEngine(started.initial,{applyInitialTurnStart:false});
const start=performance.now();let actual=0,response=0,witnessRows=0;
for await(const row of gzipJsonRows(path.join(dir,'actions.jsonl.gz'))){
    assert.equal(hash(engine.getState()),row.beforeHash);
    assert.ok(engine.getLegalActions(engine.getState().currentPlayer).some(action=>encodeAction(action)===row.code));
    const after=engine.step(row.action).state;assert.equal(hash(after),row.afterHash);actual++;
}
assert.equal(actual,result.steps);
assert.equal(hash(engine.getState()),result.finalHash);
for await(const witness of gzipJsonRows(path.join(dir,'witnesses.jsonl.gz'))){
    const replay=new GameEngine(witness.initial,{applyInitialTurnStart:false});
    for(const action of witness.actions){
        assert.ok(replay.getLegalActions(replay.getState().currentPlayer).some(legal=>encodeAction(legal)===encodeAction(action)));
        replay.step(action);response++;
    }
    if(witness.final)assert.deepEqual(replay.getState(),witness.final);
    else assert.equal(JSON.stringify(replay.getState()),witness.finalHash);
    witnessRows++;
    if(witnessRows%1000===0)console.log(JSON.stringify({stage:'streaming-strict',actualActions:actual,responseActions:response,witnessRows,seconds:(performance.now()-start)/1000}));
}
const receipt={passed:true,actualActions:actual,responseActions:response,witnessRows,verifier:'stream-v4',sourceResultSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'result.json'))).digest('hex'),natural:result.natural,qualification:'规则一致不代表反扑完整、对手最优或棋力提升'};
fs.writeFileSync(target,JSON.stringify(receipt,null,2),{flag:'wx'});console.log(JSON.stringify(receipt));
