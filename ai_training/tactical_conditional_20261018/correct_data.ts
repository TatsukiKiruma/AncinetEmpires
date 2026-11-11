import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createGunzip,createGzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {GameEngine} from '../../src/game/engine';
import {decodeAction,encodeAction} from '../../src/game/env';
import {correctAuraFeatures,requiresAuraCorrection} from './complete_tactics';
import {initialFor} from './sources';
import {DIR,read,save,hash,sha} from './io';

const lane=Number(process.argv[2]??0),lanes=Number(process.argv[3]??1);
const selection=read('selection.json'),oldCount=read('old-schema.json').candidate.keys.length;
const versionPaths=['correct_data.ts','complete_tactics.ts','tactics.ts','threat.ts','encoding.ts','sources.ts','../../src/game/engine.ts','../../src/game/rules.ts','../../src/game/abilities.ts','../../src/game/map.ts','../../src/game/ai/tactical_pathfinding.ts'];
const sourceBinding=Object.fromEntries(versionPaths.map(p=>[p,sha(fs.readFileSync(path.resolve(DIR,p)))]));
for(const [index,parent] of selection.parents.entries()){
    if(index%lanes!==lane)continue;
    const prefix=`data-v3/${parent.parentId}`;
    if(fs.existsSync(path.join(DIR,prefix+'.receipt.json')))continue;
    while(!fs.existsSync(path.join(DIR,`data-v2/${parent.parentId}.receipt.json`)))await new Promise(resolve=>setTimeout(resolve,1000));
    const old=read(`data-v2/${parent.parentId}.receipt.json`),input=path.join(DIR,`data-v2/${parent.parentId}.jsonl.gz`);
    assert.equal(sha(fs.readFileSync(input)),old.sha256);
    const engine=new GameEngine(initialFor(parent));
    fs.mkdirSync(path.join(DIR,'data-v3'),{recursive:true});
    const outputPath=path.join(DIR,prefix+'.jsonl.gz');
    if(fs.existsSync(outputPath+'.partial'))fs.renameSync(outputPath+'.partial',outputPath+'.interrupted-'+Date.now());
    const zip=createGzip({level:3}),output=fs.createWriteStream(outputPath+'.partial',{flags:'wx'});zip.pipe(output);
    const lines=createInterface({input:fs.createReadStream(input).pipe(createGunzip()),crlfDelay:Infinity});
    let rows=0,changedStates=0,changedCandidates=0,completeBranches=0;const started=performance.now();
    for await(const line of lines){
        const row=JSON.parse(line),state=engine.getState();assert.equal(hash(state),row.beforeHash);
        const action=decodeAction(row.codes[row.target]);assert.ok(action);
        if(requiresAuraCorrection(state)){
            const ordered=row.codes.map(decodeAction);
            const maps=row.candidates.map((sparse:[number,number][])=>new Map(sparse));
            const features={old:maps.map((m:Map<number,number>)=>Array.from({length:10},(_,i)=>m.get(oldCount-10+i)??0)),extra:maps.map((m:Map<number,number>)=>Array.from({length:22},(_,i)=>m.get(oldCount+i)??0))};
            const correction=correctAuraFeatures(engine,ordered,features);
            changedStates+=Number(correction.changed>0);changedCandidates+=correction.changed;completeBranches+=correction.branches;
            row.candidates=row.candidates.map((sparse:[number,number][],i:number)=>{
                // 稀疏表中原来为零的列也必须写入，不能只替换已有非零项。
                const base=sparse.filter(([key])=>key<oldCount-10);
                features.old[i].forEach((value,k)=>{if(value!==0)base.push([oldCount-10+k,value]);});
                features.extra[i].forEach((value,k)=>{if(value!==0)base.push([oldCount+k,value]);});
                return base.sort((a,b)=>a[0]-b[0]);
            });
            row.candidates.forEach((sparse:[number,number][],i:number)=>{
                const restored=new Map(sparse);
                features.old[i].forEach((value,k)=>assert.equal(restored.get(oldCount-10+k)??0,value));
                features.extra[i].forEach((value,k)=>assert.equal(restored.get(oldCount+k)??0,value));
            });
        }
        row.featuresSchema='tactics-pc-v3-aura-complete';
        if(!zip.write(JSON.stringify(row)+'\n'))await once(zip,'drain');
        assert.ok(engine.getLegalActions(state.currentPlayer).some(a=>encodeAction(a)===row.codes[row.target]));
        assert.ok(!engine.step(action).info.includes('非法动作'));rows++;
        if(rows%128===0)save(`correct-${lane}.live.json`,{parent:parent.parentId,rows,changedStates,changedCandidates,seconds:(performance.now()-started)/1000});
    }
    zip.end();await once(output,'finish');fs.renameSync(outputPath+'.partial',outputPath);
    assert.equal(rows,old.kept);
    assert.deepEqual(Object.fromEntries(versionPaths.map(p=>[p,sha(fs.readFileSync(path.resolve(DIR,p)))])),sourceBinding);
    const receipt={...old,sha256:sha(fs.readFileSync(outputPath)),sourceBinding,v2Sha256:old.sha256,v2ReceiptSha256:sha(fs.readFileSync(path.join(DIR,`data-v2/${parent.parentId}.receipt.json`))),
        correction:{changedStates,changedCandidates,completeBranches,seconds:(performance.now()-started)/1000},featureRevision:'v3-aura-complete'};
    save(prefix+'.receipt.json',receipt);console.log(JSON.stringify({parent:parent.parentId,rows,correction:receipt.correction}));
}
