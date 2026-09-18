import { readFile,writeFile } from 'node:fs/promises';
import { AncientEmpiresEnv,decodeAction } from '../src/game/env';
import { loadBcModel,buildCandidateFeatures } from './skirmish_bc_train';
import { buildLiveBcSample,createBcRankerPolicy } from './skirmish_training_runner';

// 在同一快照比较离线候选子集与完整合法集合，避免仅凭候选数量推测原因。
const root='training_runs/endgame_20260918';
const manifest=JSON.parse(await readFile(`${root}/curriculum-manifest.json`,'utf8'));
const selected=JSON.parse(await readFile(`${root}/selected.json`,'utf8'));
const models=await Promise.all([
    {name:'v4-ai-only',file:'training_runs/pvp_navigation_20260918/fresh-v4-p0.json'},
    {name:'trained-raw',file:selected.model}
].map(async x=>({...x,model:await loadBcModel(x.file)})));
const rows=[];
for(const item of manifest.filter((x:{accepted:boolean;verifiedSteps:number})=>x.accepted&&x.verifiedSteps===2)){
    const {episode}=JSON.parse(await readFile(item.source,'utf8'));
    const snapshot=JSON.parse(await readFile(item.snapshotFile,'utf8'));
    const compactRows=(await readFile(item.file,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    const env=new AncientEmpiresEnv({initialState:snapshot.state,seed:episode.seed,maxPlies:400});
    let result=env.reset();
    for(const step of episode.steps){
      const compact=compactRows.find(x=>x.step===step.step)!;
      const context={result,playerId:item.subjectId,stepNumber:step.step,episodeSeed:episode.seed,scenario:episode.scenario};
      const sample=buildLiveBcSample(context);
      for(const entry of models){
        const index=createBcRankerPolicy(entry.model).selectFixedActionIndex(context);
        const actual=result.legalActionEntries.find(e=>e.fixedActionIndex===index)!;
        const score=(features:Iterable<[number,number]>)=>{let sum=0;for(const [i,v] of features)sum+=entry.model.weights[i]*v;return sum;};
        const offline=compact.candidates.map((c:{actionCode:string;features:Array<[number,number]>})=>({actionCode:c.actionCode,score:score(c.features)})).sort((a:{score:number},b:{score:number})=>b.score-a.score);
        const online=result.legalActionEntries.filter(e=>e.action.type!=='surrender').map(e=>({actionCode:e.code,score:score(buildCandidateFeatures(sample,e.code,entry.model.featureDim,entry.model.featureExtractor)!)})).sort((a,b)=>b.score-a.score);
        const expected=step.actionCode;
        rows.push({snapshotId:item.id,step:step.step,split:item.split,model:entry.name,expected,offlineChoice:offline[0].actionCode,onlineChoice:actual.code,
            offlineCorrect:offline[0].actionCode===expected,onlineCorrect:actual.code===expected,expectedOnlineRank:online.findIndex(e=>e.actionCode===expected)+1,
            offlineCandidates:offline.length,onlineCandidates:online.length,onlineChoiceOmittedOffline:!offline.some((c:{actionCode:string})=>c.actionCode===actual.code)});
      }
      result=env.stepAction(decodeAction(step.actionCode)!);
    }
}
await writeFile(`${root}/candidate-probe.json`,JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows,null,2));
