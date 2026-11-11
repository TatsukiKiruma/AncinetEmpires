import { readFile,writeFile } from 'node:fs/promises';
import { createEvaluationState } from './skirmish_evaluation_state';
import { replayEpisodeDatasetItems } from './skirmish_dataset_export';
import { EndgameMemory } from './skirmish_endgame_memory';

const root='training_runs/endgame_20260918';
const results=JSON.parse(await readFile(`${root}/baseline/results.json`,'utf8'));
const evidence=[];
for(const row of results.filter((r:{timeout:boolean})=>r.timeout).slice(0,3)){
    const {job,episode}=JSON.parse(await readFile(`${root}/baseline/episodes/${row.id}.json`,'utf8'));
    const {env}=await createEvaluationState(job);
    for(const {sample,result} of replayEpisodeDatasetItems(episode,env,{observationMode:'none'})){
        if(sample.turn<80||sample.playerId!==row.subjectId||sample.label.action.type!=='destroy_town')continue;
        const action=sample.label.action;
        const actor=result.state.units.find(u=>u.id===action.unitId)!;
        const target=action.target??actor.pos;
        const tile=result.state.map.tiles[target.y][target.x];
        const memory=new EndgameMemory();memory.observe(result.observation,sample.step);
        evidence.push({caseId:row.caseId,step:sample.step,turn:sample.turn,action:sample.label.actionCode,playerId:sample.playerId,
            tileOwnerId:tile.ownerId,target,adjustment:memory.adjustment(result.observation,action),source:`baseline/episodes/${row.id}.json`});
        break;
    }
}
await writeFile(`${root}/ownership-probe.json`,JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
