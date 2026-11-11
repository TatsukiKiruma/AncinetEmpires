import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { projectSnapshot, nativeRecord, importedConfig } from '../data_acceptance_20261016/phone/projection';
import { readNativeSnapshot } from '../data_acceptance_20261016/native_reader/reader';
import { getLegalActions } from '../../src/game/rules';
import { canRecruitUnitClass, getRecruitableUnits, getCurrentUnitCount, getCurrentPopulation, getUnitCost } from '../../src/game/rule_config';
import { expandApkReplayRecordToProjectActions } from '../../src/game/apk_replay';

// 只读故障附近的原生独立快照与候选，不执行动作或跨步重放。
const here=path.dirname(fileURLToPath(import.meta.url));
const plan=JSON.parse(fs.readFileSync(path.join(here,'PLAN.json'),'utf8'));
const parent=plan.inputs.find((p:{parentId:string})=>p.parentId==='native-hard-20261022-1947');
const config=fs.readFileSync(path.join(parent.directory,'config.bin'));
const rows=gunzipSync(fs.readFileSync(path.join(parent.directory,'actions.jsonl.gz'))).toString('utf8').trim().split('\n').map(s=>JSON.parse(s));
const bytes=gunzipSync(fs.readFileSync(path.join(parent.directory,'states.bin.gz')));
const out=[];
for(let offset=0,index=0;offset<bytes.length;index++){
 const length=bytes.readInt32BE(offset);offset+=4;
 const frame=bytes.subarray(offset,offset+length);offset+=length;
 if(index<1299)continue;
 if(index>1302)break;
 const raw=readNativeSnapshot(frame),state=projectSnapshot(raw,config,parent.map);
 const legal=getLegalActions(state,state.currentPlayer),record=nativeRecord(rows[index].fields);
 let expansion:unknown;
 try{expansion=expandApkReplayRecordToProjectActions(record,state);}catch(e){expansion=String(e);}
 out.push({index,row:rows[index],record,turn:state.turn,currentPlayer:state.currentPlayer,winner:state.winner,
  pendingUnitId:state.pendingUnitId,rawPending:raw.components.e?.d,runtime:raw.components.f,
  player:state.players.find(p=>p.id===state.currentPlayer),rules:state.rules,
  unitCount:getCurrentUnitCount(state,state.currentPlayer),population:getCurrentPopulation(state,state.currentPlayer),
  recruitable:getRecruitableUnits(state,state.currentPlayer),witchCost:getUnitCost(state,state.currentPlayer,'witch'),
  canRecruitWitch:canRecruitUnitClass(state,state.currentPlayer,'witch'),castle:state.map.tiles[4][13],
  occupant:state.units.find(u=>u.pos.x===13&&u.pos.y===4),rawOccupant:raw.components.d?.e?.[13]?.[4],
  ownUnits:state.units.filter(u=>u.ownerId===state.currentPlayer),legalRecruit:legal.filter(a=>a.type.startsWith('recruit')),
  expansion,rawPlayers:raw.components.e});
}
const report={parentId:parent.parentId,parentDirectory:parent.directory,trainingOrdinal:parent.trainingOrdinal,config:importedConfig(config),snapshots:out,strictReplayExecuted:false,engineActionsExecuted:0};
fs.mkdirSync(path.join(here,'repairs/03'),{recursive:true});
const name=process.argv.includes('--after')?'DIAGNOSIS_AFTER.json':'DIAGNOSIS.json';
fs.writeFileSync(path.join(here,'repairs/03',name),JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
console.log(JSON.stringify(out.map(s=>({index:s.index,turn:s.turn,currentPlayer:s.currentPlayer,pendingUnitId:s.pendingUnitId,player:s.player,unitCount:s.unitCount,population:s.population,witchCost:s.witchCost,canRecruitWitch:s.canRecruitWitch,expansion:s.expansion})),null,2));
