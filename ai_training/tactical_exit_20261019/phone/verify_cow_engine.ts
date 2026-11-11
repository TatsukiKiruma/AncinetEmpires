import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { GameEngine } from '../../../src/game/engine';
import { cowPlugin } from './cow_optimization';

const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.resolve(here,'../..');
const advanced=process.argv.includes('--advanced-cow'),target=path.join(here,'revisions/xiaomi_20261020',(advanced?'cow-advanced-replay-':'cow-engine-replay-')+Date.now());fs.mkdirSync(target);
const entry=path.join(target,'entry.ts');fs.writeFileSync(entry,`export {GameEngine} from ${JSON.stringify(repo+'/src/game/engine.ts')};`,{flag:'wx'});
const output=path.join(target,'engine.mjs');await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',outfile:output,plugins:[cowPlugin(repo,target,advanced)]});
const optimized=await import(pathToFileURL(output).href),read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const stop=read(path.join(here,'revisions/xiaomi_20261020/20261020T010559/R24_PC_STOP.json')),plan=read(path.join(here,'teacher-battle-plan.json'));
const entries=stop.completed.filter((entry:any)=>entry.actions>=300).slice(0,24);assert.equal(entries.length,24);
let steps=0,cloneChecks=0,masks=0,retainedSnapshots=0;
for(const entry of entries){
    const slot=plan.slots.find((slot:any)=>slot.id===entry.slot),initial=read(plan.maps[slot.mapIndex].path);
    const rows=gunzipSync(fs.readFileSync(path.join(here,'teacher-r24-battles/slots',entry.slot,'actions.jsonl.gz'))).toString().trim().split('\n').slice(0,300).map(line=>JSON.parse(line));
    for(const readonly of [false,true]){
        const original=new GameEngine(initial),actual=new optimized.GameEngine(initial);if(readonly)actual.phoneBorrowSnapshots();
        for(const [index,row] of rows.entries()){
            const snapshot=actual.getState(),before=JSON.stringify(snapshot);assert.equal(before,JSON.stringify(original.getState()));
            assert.deepEqual(actual.getLegalActions(snapshot.currentPlayer),original.getLegalActions(snapshot.currentPlayer));masks++;
            if(index%25===0){
                const a=original.clone(),b=actual.clone();assert.deepEqual(b.step(row.action),a.step(row.action));
                assert.equal(JSON.stringify(actual.getState()),before);cloneChecks++;
                if(!readonly){const outside=b.getState();outside.map.tiles[0][0].ownerId=999;assert.notEqual(b.getState().map.tiles[0][0].ownerId,999);}
            }
            const expected=original.step(row.action),result=actual.step(row.action);assert.deepEqual(result,expected);
            assert.equal(JSON.stringify(snapshot),before,'先前快照被后续动作改写');retainedSnapshots++;
            steps++;
        }
    }
    console.log(JSON.stringify({slot:entry.slot,steps}));
}
const result={passed:true,sourceSlots:24,committedSourceActions:7200,replayModes:['public_mutable_snapshot','private_readonly_snapshot'],steps,cloneChecks,fullLegalOrderAndMaskChecks:masks,retainedSnapshotsUnchanged:retainedSnapshots,newGamesStarted:0,scope:'只重放已strict历史PC前缀，权威结果逐字节相同；不计为新PC或真机对局'};
fs.writeFileSync(path.join(target,'REPLAY.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({output:target,...result}));
