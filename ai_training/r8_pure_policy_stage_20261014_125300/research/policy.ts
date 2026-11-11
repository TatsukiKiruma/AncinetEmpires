import fs from 'node:fs';
import { GameEngine, RNG, features, type GameState, type Action } from './common';
import { HeuristicAI } from '../frozen/src/game/ai/heuristic_ai';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../frozen/src/game/ai/spatial_conv_net';
import { encodeGameStateSpatial,encodeCandidateActionsSpatialForSchema,ENCODER_SCHEMA_ID_V19 } from '../frozen/src/game/ai/spatial_tensor_encoder';
import { createB100Policy } from '../frozen/ai_training/v17/teachers/b100_policy';
export function policy(cfg:any,seed:number,seat:number){
 const rng=new RNG(seed);let handle:any;
 const weights=cfg.model?loadSpatialResNetFromJson(fs.readFileSync(cfg.model,'utf8')):null;
 const predictor=weights?new SpatialResNetPredictor(weights):null;
 const ai=new HeuristicAI(rng.next);
 if(cfg.type==='b100')handle=createB100Policy({variant:cfg.variant,rootSeed:seed,querySeed:seed,seat});
 const act=(state:GameState,legal:Action[])=>{
  if(cfg.type==='hang'){while(true){};}
  if(cfg.type==='slow'){const end=Date.now()+2000;while(Date.now()<end){};}
  if(cfg.type==='illegal')return {type:'move',unitId:'不存在',to:{x:-999,y:-999}} as Action;
  if(cfg.type==='mutate'){state.players[0].gold=999999;legal.splice(0,legal.length,{type:'move',unitId:'伪造',to:{x:-1,y:-1}} as Action);return legal[0];}
  if(cfg.type==='surrender')return legal.find(x=>x.type==='surrender')!;
  if(cfg.type==='nan')throw Error('非有限logits');
  if(cfg.type==='b100')return handle.policy({state,playerId:seat,allowed:legal,seat,seed});
  if(predictor){
   const channels=weights!.stem.inChannels;
   const enc=encodeGameStateSpatial(state,seat,'v2',{channels});
   const feats=encodeCandidateActionsSpatialForSchema(state,seat,legal,'v2',channels===26?'spatial26_global20_actionSemantics53_v15':ENCODER_SCHEMA_ID_V19);
   const pred=predictor.predict(enc,feats);
   if(pred.actionLogits.length!==legal.length||pred.actionLogits.some(x=>!Number.isFinite(x))||!Number.isFinite(pred.value))throw Error('非有限或长度不匹配logits');
   let best=0;for(let i=1;i<legal.length;i++)if(pred.actionLogits[i]>pred.actionLogits[best])best=i;
   return legal[best];
  }
  return ai.getAction(new GameEngine(state),seat,legal);
 };
 return {act,rng,diagnostics:()=>handle?{decision:handle.decisions.at(-1),exceptions:handle.exceptions,config:handle.config,rng:handle.rngStateHex()}:null};
}
