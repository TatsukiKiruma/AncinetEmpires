import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AncientEmpiresEnv,decodeAction } from '../src/game/env';
import { GameEngine } from '../src/game/engine';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { replayEpisodeDatasetItems } from './skirmish_dataset_export';
import { buildCandidateFeatures,sparseFeaturesToEntries } from './skirmish_bc_train';
import { selectStratifiedHardNegativeCandidates } from './skirmish_candidate_sampling';

const root='training_runs/endgame_20260918';
const states=JSON.parse(await readFile(`${root}/curriculum-states.json`,'utf8'));
const results=JSON.parse(await readFile(`${root}/curriculum/results.json`,'utf8'));
await mkdir(`${root}/curriculum-features`,{recursive:true});
const summaries=[];
const townAudit=[];
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
for(const entry of states){
    const winners=results.filter((r:{caseId:number;naturalWin:boolean;timeout:boolean;illegalActionCount:number;stoppedByMaxSteps:boolean;stoppedByStagnation:boolean})=>r.caseId===3000+entry.id&&r.naturalWin&&!r.timeout&&!r.illegalActionCount&&!r.stoppedByMaxSteps&&!r.stoppedByStagnation);
    winners.sort((a:{finalTurn:number;stepCount:number;id:number},b:{finalTurn:number;stepCount:number;id:number})=>a.finalTurn-b.finalTurn||a.stepCount-b.stepCount||a.id-b.id);
    if(!winners.length){summaries.push({...entry,accepted:false,samples:0});continue;}
    const selected=winners[0],source=`${root}/curriculum/episodes/${selected.id}.json`;
    const bytes=await readFile(source,'utf8');const {episode}=JSON.parse(bytes);
    if(episode.summary.winnerAlliance!==selected.subjectAlliance)throw new Error('终局胜者不匹配');
    const snapshot=JSON.parse(await readFile(entry.snapshotFile,'utf8'));
    const env=new AncientEmpiresEnv({initialState:snapshot.state,seed:episode.seed,maxPlies:400});
    const own=episode.steps.filter((s:{playerId:number})=>s.playerId===selected.subjectId);
    // 连续收官尾段加上起始纠错片段；整个来源轨迹必须通过自然胜利及严格重放。
    const chosen=new Set([...own.slice(0,64),...own.slice(-192)].map((s:{step:number})=>s.step));
    const lines:string[]=[];
    let verifiedSteps=0;
    let excludedDestruction=0;
    for(const {sample,result} of replayEpisodeDatasetItems(episode,env,{observationMode:'none',inputFile:source,episodeIndex:entry.id})){
        verifiedSteps++;
        if(!chosen.has(sample.step))continue;
        if(sample.label.action.type==='destroy_town'){
            const action=sample.label.action,actor=result.state.units.find(u=>u.id===action.unitId)!;
            const target=action.target??actor.pos,tile=result.state.map.tiles[target.y][target.x];
            const alliances=result.observation.rules.alliances;
            const excluded=tile.ownerId===null||(alliances[tile.ownerId]??tile.ownerId)===(alliances[sample.playerId]??sample.playerId);
            townAudit.push({snapshotId:entry.id,step:sample.step,actionCode:sample.label.actionCode,playerId:sample.playerId,tileOwnerId:tile.ownerId,excluded});
            // 最终获胜不能为破坏己方收入点背书；这类动作不作为正标签。
            if(excluded){excludedDestruction++;continue;}
        }
        sample.observation=result.observation;
        const key=`${entry.group}:${sample.step}`;
        const subset=selectStratifiedHardNegativeCandidates(sample.legalActionCodes.filter(c=>c!=='surrender').map(actionCode=>({actionCode,teacherScore:0})),sample.label.actionCode,{maxCandidates:96,hardNegativeRatio:0,deterministicKey:key});
        const scores=new HeuristicAI(()=>0.5).scoreCandidateActions(new GameEngine(result.state),sample.playerId,subset.map(c=>decodeAction(c.actionCode)!));
        const candidates=selectStratifiedHardNegativeCandidates(subset.map((c,i)=>({...c,teacherScore:scores[i].score})),sample.label.actionCode,{maxCandidates:64,hardNegativeRatio:0.5,deterministicKey:key});
        candidates.sort((a,b)=>hash(`${key}:${a.actionCode}`).localeCompare(hash(`${key}:${b.actionCode}`)));
        lines.push(JSON.stringify({kind:'skirmish_feature_sample',version:1,featureExtractor:'hashed-action-v4',featureDim:4096,
            source:sample.source,scenario:{...sample.scenario,id:`VERIFIED:${entry.group}`},seed:sample.seed,step:sample.step,turn:sample.turn,playerId:sample.playerId,
            policy:'terminal-verified-winner',label:{actionCode:sample.label.actionCode,fixedActionIndex:sample.label.fixedActionIndex},
            sequence:{sourceGroup:entry.group,segment:own.slice(0,64).some((s:{step:number})=>s.step===sample.step)?'start':'terminal-tail',terminalWinner:selected.subjectAlliance},
            candidates:candidates.map(c=>({actionCode:c.actionCode,teacherScore:c.teacherScore,features:sparseFeaturesToEntries(buildCandidateFeatures(sample,c.actionCode,4096,'hashed-action-v4')!)}))}));
    }
    if(verifiedSteps!==episode.steps.length||env.getState().winner!==selected.subjectAlliance)throw new Error('轨迹未完整重放到自然胜利');
    const file=`${root}/curriculum-features/${entry.id}.jsonl`;
    await writeFile(file,lines.join('\n')+'\n');
    summaries.push({...entry,accepted:true,samples:lines.length,file,source,sourceHash:hash(bytes),sourceVariant:selected.variant,
        finalTurn:selected.finalTurn,verifiedSteps,excludedDestruction,sha256:hash(lines.join('\n')+'\n')});
    console.log(`验证胜局 #${entry.id} ${entry.split}：重放 ${verifiedSteps} 步，导出 ${lines.length} 条`);
}
await writeFile(`${root}/curriculum-manifest.json`,JSON.stringify(summaries,null,2));
await writeFile(`${root}/curriculum-town-audit.json`,JSON.stringify(townAudit,null,2));
