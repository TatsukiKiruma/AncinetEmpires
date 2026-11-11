import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { DIR,read,save,hash,sha } from './io';

const scheduling=read('battle-rescheduling-retained.json'),plan=read('battle-plan.json');
for(const [id,files] of Object.entries(scheduling.completed) as [string,Record<string,string>][])for(const [name,digest] of Object.entries(files))assert.equal(sha(fs.readFileSync(path.join(DIR,'battles/slots',id,name))),digest,'已完成结果必须原样保留');
const audits=[];let strictActions=0,sharedActions=0;
for(const folder of scheduling.interrupted as string[]){
    const started=JSON.parse(fs.readFileSync(path.join(folder,'started.json'),'utf8')),slot=started.slot;
    const raw=fs.readFileSync(path.join(folder,'actions.jsonl'),'utf8');assert.ok(!raw.length||raw.endsWith('\n'),'中断日志须为完整动作记录');
    const rows=raw.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
    const fresh=gunzipSync(fs.readFileSync(path.join(DIR,'battles/slots',slot.id,'actions.jsonl.gz'))).toString().trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
    const freshStarted=read('battles/slots/'+slot.id+'/started.json');assert.deepEqual(freshStarted.slot,slot);assert.equal(freshStarted.modelHash,started.modelHash);
    const engine=new GameEngine(read(plan.maps[slot.mapIndex].path));assert.equal(hash(engine.getState()),started.initialHash);
    for(const [i,row] of rows.entries()){
        assert.equal(hash(engine.getState()),row.beforeHash);const legal=engine.getLegalActions(engine.getState().currentPlayer).filter(a=>a.type!=='surrender').map(encodeAction).sort();
        assert.equal(hash(legal),row.legalHash);assert.ok(legal.includes(row.code));assert.ok(!engine.step(row.action).info.includes('非法动作'));assert.equal(hash(engine.getState()),row.afterHash);strictActions++;
        if(i<fresh.length){for(const key of ['code','beforeHash','afterHash','legalHash','rngBefore','rngAfter'])assert.deepEqual(row[key],fresh[i][key]);sharedActions++;}
    }
    const result={passed:true,id:slot.id,strictActions:rows.length,sharedPrefixActions:Math.min(rows.length,fresh.length),freshActions:fresh.length,finalPrefixHash:hash(engine.getState()),freshEndedBeforeArchivedPrefix:fresh.length<rows.length};
    fs.writeFileSync(path.join(folder,'strict-prefix-audit.json'),JSON.stringify(result));audits.push(result);
}
for(const [name,digest] of Object.entries(read('battle-dynamic-source-freeze.json')) as [string,string][])assert.equal(sha(fs.readFileSync(path.resolve(DIR,name))),digest,'调度不能改变局内源码或模型');
save('interrupted-prefix-audit.json',{passed:true,retainedResults:Object.keys(scheduling.completed).length,interruptedSlots:audits.length,strictActions,sharedActions,sourceAndModelUnchanged:true,audits});console.log({passed:true,strictActions,sharedActions});
