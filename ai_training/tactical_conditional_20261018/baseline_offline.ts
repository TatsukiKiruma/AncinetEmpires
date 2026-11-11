import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { encode, forward } from '../sd64x3_phone_20261016/model';
import { tacticalFeatures } from '../sd64x3_phone_20261016/tactics';
import { observationState } from './encoding';
import { initialFor, groupKey } from './sources';
import { DIR, PHONE, read, save, hash, sha, quantiles } from './io';

const lane = Number(process.argv[2]??0), lanes = Number(process.argv[3]??1);
const selection = read('selection.json'), baseline = read('baseline.json');
const contract = JSON.parse(fs.readFileSync(path.join(PHONE,'contract.json'),'utf8'));
for (const [index,parent] of selection.parents.filter((p:any)=>p.split==='validation').entries()) {
    if (index%lanes!==lane) continue;
    const prefix = `baseline-offline/${parent.parentId}`;
    if (fs.existsSync(path.join(DIR,prefix+'.receipt.json'))) continue;
    fs.mkdirSync(path.join(DIR,'baseline-offline'),{recursive:true});
    const entry = contract.Files.find((e:any)=>e.Parent===parent.parentId), sourcePath=path.join(PHONE,entry.Path);
    assert.equal(sha(fs.readFileSync(sourcePath)),entry.SHA);
    const source = new GameEngine(initialFor(parent),{disableAutoAdvanceWhenNoMeaningfulAction:true}), automatic = new GameEngine(initialFor(parent));
    const zip=createGzip({level:3}), outputPath=path.join(DIR,prefix+'.jsonl.gz');
    if(fs.existsSync(outputPath+'.partial')) fs.renameSync(outputPath+'.partial',outputPath+'.interrupted-'+Date.now());
    const output=fs.createWriteStream(outputPath+'.partial',{flags:'wx'}); zip.pipe(output);
    const lines=createInterface({input:fs.createReadStream(sourcePath).pipe(createGunzip()),crlfDelay:Infinity});
    let count=0; const times:number[]=[],start=performance.now();
    for await(const line of lines){
        const original=JSON.parse(line), state=source.getState(), full=source.getLegalActions(state.currentPlayer);
        const labelCode=original.codes[original.target], label=full.find(a=>encodeAction(a)===labelCode); assert.ok(label);
        if(full.some(a=>a.type!=='end_turn'&&a.type!=='surrender')){
            assert.equal(hash(automatic.getState()),hash(state));
            const legal=full.filter(a=>a.type!=='surrender'), packet=observe(observationState(state),legal);
            const map=new Map(legal.map(a=>[encodeAction(a),a]));
            const ordered=packet.codes.map(c=>map.get(c)!);
            const t0=performance.now();
            const input=encode(packet,baseline.schema,tacticalFeatures(automatic,ordered)), prediction=forward(input,baseline.schema,baseline.weights);
            times.push(performance.now()-t0);
            const record={parent:parent.parentId,macro:original.macro,subAction:original.subAction,codes:packet.codes,logits:prediction.logits,value:prediction.value,target:packet.codes.indexOf(labelCode),weight:original.weight,type:label.type,actionGroups:ordered.map(groupKey),beforeHash:hash(state),inputHash:hash(input)};
            if(!zip.write(JSON.stringify(record)+'\n')) await once(zip,'drain');
            count++; automatic.step(label);
            if(count%64===0) save(`baseline-offline-${lane}.live.json`,{parent:parent.parentId,rows:count,seconds:(performance.now()-start)/1000});
        }
        source.step(label);
    }
    zip.end();await once(output,'finish');fs.renameSync(outputPath+'.partial',outputPath);
    const expected=read(`source-audit/${parent.parentId}.json`);assert.equal(count,expected.kept);
    save(prefix+'.receipt.json',{parent:parent.parentId,rows:count,sha256:sha(fs.readFileSync(outputPath)),sourceSha256:entry.SHA,modelSha256:hash(baseline),seconds:(performance.now()-start)/1000,latency:quantiles(times),optimizerUpdates:0,exactLegacyFeatures:true});
    console.log(JSON.stringify({parent:parent.parentId,rows:count,seconds:(performance.now()-start)/1000}));
}
