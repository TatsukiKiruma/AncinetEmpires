// 审核器只回放既有动作，不重新评测、训练或改写旧产物。
import fs from 'node:fs';
import { createSkirmishMatchState } from '../r7_training_stage_20261014_083500/research/eval_runner';
import { computeStateHash, computeGameplayStateKey } from '../r7_training_stage_20261014_083500/research/state_hash';
import { GameEngine } from '../r7_training_stage_20261014_083500/env/src_game_frozen/engine';
import { encodeAction } from '../r7_training_stage_20261014_083500/env/src_game_frozen/env';
import { getApkSkirmishMapManifestEntry } from '../r7_training_stage_20261014_083500/env/src_game_frozen/apk_manifest';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../r7_training_stage_20261014_083500/env/src_game_frozen/ai/spatial_conv_net';
import { encodeGameStateSpatial, encodeCandidateActionsSpatialForSchema, ENCODER_SCHEMA_ID_V19 } from '../r7_training_stage_20261014_083500/env/src_game_frozen/ai/spatial_tensor_encoder';
const base='ai_training/r7_training_stage_20261014_083500';
const out='ai_training/review_r7_20261014_112649';
const final=JSON.parse(fs.readFileSync(`${base}/artifacts/final_eval/final_acceptance_report.json`,'utf8'));
const dev=JSON.parse(fs.readFileSync(`${base}/artifacts/dev_eval/round3_enhanced_v2_best_dev_report.json`,'utf8'));
const rows=[];
const surrenderProbes:any[]=[];
const predictor=new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(`${base}/artifacts/models/round3_enhanced_v2_best.json`,'utf8')));
for (const [panel, records] of [['FINAL', final.results], ['DEV_WIN', dev.results.filter((x:any)=>x.outcomeCategory==='natural_win')]] as const) {
 for (const r of records) {
  const e=new GameEngine(createSkirmishMatchState(r.mapName)); const errors:string[]=[];
  if(computeStateHash(e.getState())!==r.initialStateHash)errors.push('初态哈希');
  for(const s of r.replayTrace){
   const legal=e.getLegalActions(e.getState().currentPlayer);
   const a=legal.find(a=>encodeAction(a)===s.actionEncoded);
   if(!a||legal.length!==s.legalCount||e.getState().currentPlayer!==s.player){errors.push(`步骤 ${s.stepIndex} 合法性或玩家不符`);break;}
   if(panel==='FINAL' && a.type==='surrender'){
    const state=e.getState();const player=state.currentPlayer;
    const pred=predictor.predict(encodeGameStateSpatial(state,player,'v2',{channels:34}),encodeCandidateActionsSpatialForSchema(state,player,legal,'v2',ENCODER_SCHEMA_ID_V19));
    const best=pred.actionLogits.indexOf(Math.max(...pred.actionLogits));
    surrenderProbes.push({gameIndex:r.gameIndex,player,candidateSeat:r.candidateSeat,argmaxType:legal[best].type,surrenderLogit:pred.actionLogits[legal.findIndex(x=>x.type==='surrender')],endTurnLogit:pred.actionLogits[legal.findIndex(x=>x.type==='end_turn')],legalCount:legal.length});
   }
   const step=e.step(a);if(step.info?.includes('非法动作')){errors.push(`步骤 ${s.stepIndex} 拒绝`);break;}
  }
  if(computeStateHash(e.getState())!==r.finalStateHash)errors.push('终态哈希');
  if(e.getWinner()!==r.winner)errors.push('胜者');
  rows.push({panel,gameIndex:r.gameIndex,steps:r.totalSteps,terminal:e.isTerminal(),winner:e.getWinner(),errors});
 }
}
const s=createSkirmishMatchState('(2) Duel.aem');
const variants:any={};
for(const field of ['hasBeenHealedThisTurn','hasBeenSupportedThisTurn']){const t=structuredClone(s);(t.units[0] as any)[field]=true;variants[field]=computeGameplayStateKey(s)===computeGameplayStateKey(t);}
const maps=[...new Set(final.results.map((r:any)=>r.mapName))].map((name:any)=>({name,manifest:getApkSkirmishMapManifestEntry(name)}));
fs.writeFileSync(`${out}/replay_results.json`,JSON.stringify({rows,omittedFieldCollisions:variants,maps,surrenderProbes},null,2));
console.log(JSON.stringify({surrenderProbes,errors:rows.filter(x=>x.errors.length)},null,2));
