import fs from 'node:fs';
import crypto from 'node:crypto';
import { GameEngine } from '../frozen/src/game/engine';
import { createApkSkirmishGameState } from '../frozen/src/game/apk_skirmish';
import { parseAppApkSkirmishMap } from '../frozen/src/game/apk_skirmish_map_assets';
import { encodeAction } from '../frozen/src/game/env';
import { encodeGameStateSpatial, encodeCandidateActionsSpatialForSchema, ENCODER_SCHEMA_ID_V19 } from '../frozen/src/game/ai/spatial_tensor_encoder';
import type { Action, GameState } from '../frozen/src/game/types';
export { GameEngine, encodeAction };
export type { Action, GameState };
export const MAPS=['Duel','Liberty Port','Swamplands','The Crossing','Icy Paths','Peak Island','Crossed swords'].map(x=>`(2) ${x}.aem`);
export const canonical=(v:any):any=>v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(canonical):Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
export const hash=(v:any)=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(canonical(v))).digest('hex');
export const fileHash=(p:string)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function createState(mapName:string){return createApkSkirmishGameState(parseAppApkSkirmishMap(mapName),{mode:'SD',mapName,setup:{initialGold:300,unitLimit:30,levelCap:3},applyInitialTurnStart:true});}
export class RNG {
 state:number; calls=0;
 constructor(seed:number){this.state=seed>>>0;}
 next=()=>{this.calls++;let t=this.state=(this.state+0x6d2b79f5)>>>0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 snapshot(){return {state:this.state,calls:this.calls};}
}
export function features(state:GameState,legal:Action[]){
 const enc=encodeGameStateSpatial(state,state.currentPlayer,'v2',{channels:34});
 const acts=encodeCandidateActionsSpatialForSchema(state,state.currentPlayer,legal,'v2',ENCODER_SCHEMA_ID_V19);
 const coord=(a:any)=>a?[a.x,a.y]:[-1,-1];
 return {spatial:Array.from(enc.spatialTensor),global:Array.from(enc.globalFeatures),candidateActorCoords:acts.map(a=>coord(a.actorCoord)),candidateLandingCoords:acts.map(a=>coord(a.landingCoord)),candidateTargetCoords:acts.map(a=>coord(a.targetCoord)),candidateSemantics:acts.map(a=>Array.from(a.semantics))};
}
export function inputHash(s:ReturnType<typeof features>){
 const h=crypto.createHash('sha256');
 const floats=(a:number[])=>h.update(Buffer.from(new Float32Array(a).buffer));
 floats(s.spatial);floats(s.global);h.update(`candidates:${s.candidateSemantics.length};`);
 s.candidateSemantics.forEach((v,i)=>{const a=s.candidateActorCoords[i],l=s.candidateLandingCoords[i],t=s.candidateTargetCoords[i];h.update(`[${a[0]},${a[1]}][${l[0]},${l[1]}][${t[0]},${t[1]}]:`);floats(v);});return h.digest('hex');
}
export function strictStep(engine:GameEngine,original:Action[],action:Action){
 const codes=original.map(encodeAction); const code=encodeAction(action);
 if(!codes.includes(code))throw Error('非法策略动作');
 const result=engine.step(structuredClone(original[codes.indexOf(code)]));
 if(result.info?.includes('非法动作')||!Number.isFinite(result.reward)||result.done!==engine.isTerminal())throw Error('引擎拒绝或结算合同不符');
 return result;
}
