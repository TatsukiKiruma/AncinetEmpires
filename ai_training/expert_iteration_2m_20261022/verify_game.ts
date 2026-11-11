/** 不加载AI，单独进程重放实际轨迹及每条反扑见证。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
const dir=path.resolve(process.argv[2]),read=(n:string)=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
const hash=(s:any)=>crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex');
const lines=(n:string)=>fs.existsSync(path.join(dir,n))?gunzipSync(fs.readFileSync(path.join(dir,n))).toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)):[];
const started=read('started.json'),result=read('result.json'),engine=new GameEngine(started.initial,{applyInitialTurnStart:false});
let actual=0,response=0;
for(const row of lines('actions.jsonl.gz')){
    assert.equal(hash(engine.getState()),row.beforeHash);
    assert.ok(engine.getLegalActions(engine.getState().currentPlayer).some(a=>encodeAction(a)===row.code));
    const after=engine.step(row.action).state;assert.equal(hash(after),row.afterHash);actual++;
}
assert.equal(hash(engine.getState()),result.finalHash);
for(const w of lines('witnesses.jsonl.gz')){
    const replay=new GameEngine(w.initial,{applyInitialTurnStart:false});
    for(const action of w.actions){assert.ok(replay.getLegalActions(replay.getState().currentPlayer).some(a=>encodeAction(a)===encodeAction(action)));replay.step(action);response++;}
    if(w.final)assert.deepEqual(replay.getState(),w.final);else assert.equal(JSON.stringify(replay.getState()),w.finalHash);
}
const receipt={passed:true,actualActions:actual,responseActions:response,sourceResultSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'result.json'))).digest('hex'),natural:result.natural,qualification:'规则一致不代表反扑完整、对手最优或棋力提升'};
fs.writeFileSync(path.join(dir,'strict.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
