import assert from 'node:assert/strict';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {GameEngine} from '../../../src/game/engine';
import {encodeAction,mulberry32} from '../../../src/game/env';
import {OriginalApkLikeHardAI} from '../../../src/game/ai/original_apk_like_hard_ai';
import {here,data,read,save,sha} from './io';
const baseline=read(path.join(here,'revisions/plan-b-20261110/AUDIT.json'));const checked=[];
for(const old of baseline.pending){
 const job=read(path.join(data,'gen1',`block-${old.block}.json`))[old.index];
 const db=new DatabaseSync(job.database,{readOnly:true});
 try{
  const p=JSON.parse(String(db.prepare('SELECT value FROM progress WHERE id=1').get()!.value));
  const engine=new GameEngine(job.state,{applyInitialTurnStart:false});
  const hard=new Map(Object.entries(job.roles).filter(([,role])=>role==='hard').map(([id])=>[Number(id),new OriginalApkLikeHardAI({rng:mulberry32(job.seed+Number(id)*10007+31)})]));
  let rng=job.seed>>>0||1,steps=0,hardActions=0;
  const random=()=>{let x=rng;x^=x<<13;x^=x>>>17;x^=x<<5;rng=x>>>0;return rng/2**32;};
  for(const row of db.prepare('SELECT value FROM steps ORDER BY step').iterate()){
   const t=JSON.parse(String(row.value)),s=engine.getState();assert(t.step===++steps&&s.currentPlayer===t.player);
   const ai=hard.get(t.player);
   if(ai){assert.equal(encodeAction(ai.getAction(engine,t.player)),t.code);hardActions++;}
   else if(engine.getLegalActions(t.player).filter(a=>a.type!=='surrender').length>=2){const full=random()<.25;assert.equal(full,t.full);if(!full)random();}
   assert(engine.hasLegalAction(t.player,t.action));engine.step(t.action);
  }
  assert.equal(sha(JSON.stringify(engine.getState())),sha(JSON.stringify(p.state)));assert.equal(steps,p.step);assert.equal(rng,p.rng);
  checked.push({gameId:job.gameId,steps,hardActions,rng,passed:true});
 }finally{db.close();}
}
save(path.join(here,'revisions/plan-b-20261110/PREFIX_REPLAY.json'),{passed:true,checked,sealedAccess:0});console.log(checked);
