import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bridge,verifyCodec} from './bridge';
import {readEpisode,makeEnv,sha,verifyFreeze,clone,encodeAndLabel} from '../legacy2500_recovery_20261014_090431/recovery_core';
import {replayEpisodeDatasetItems} from '../legacy2500_recovery_20261014_090431/frozen/tools/strict_replay';
const out=path.dirname(fileURLToPath(import.meta.url));
const selected=JSON.parse(fs.readFileSync(path.join(out,'initial_probe.json'),'utf8'));
const output=path.join(out,'replay_results.jsonl'),completed=new Map(fs.existsSync(output)?fs.readFileSync(output,'utf8').trim().split('\n').filter(Boolean).map(l=>{const r=JSON.parse(l);return [r.id,r];}):[]);
const freezeIdentity=verifyFreeze(),codecIdentity=sha(fs.readFileSync(path.join(out,'codec_identity.json')));
const started=Date.now();
verifyCodec();
for(const meta of selected){if(completed.has(meta.id)&&fs.existsSync(path.join(out,'rows_'+sha(meta.id).slice(0,16)+'.jsonl')))continue;if(Date.now()-started>30*60000)break;const begin=Date.now(),e=readEpisode(meta),env=bridge(e),snapshots:any[]=[],result:any={id:meta.id,mapName:meta.mapName,planId:meta.planId,sourceRecordSha256:meta.recordSha256,expectedSteps:e.steps.length,freezeIdentity,codecIdentity,mode:'R7-transitions-with-verified-historical-observation-schema',initialization:'legacy-no-initial-income-v1'};let yields=0,calls=0;
 const step=env.stepAction.bind(env);env.stepAction=((a:any)=>{calls++;return step(a);}) as any;
 try{for(const item of replayEpisodeDatasetItems(e,env,{observationMode:'none'})){if(Date.now()-begin>120000)throw Error('EPISODE_TIMEOUT');if(yields===0||[16,64,256,1024].includes(yields))snapshots.push({stepIndex:yields,state:clone(item.result.state)});yields++;}
  const state=env.getState(),last=e.steps.at(-1);if(e.summary.stepCount!==yields||e.summary.finalTurn!==state.turn||e.summary.finalCurrentPlayer!==state.currentPlayer||e.summary.winnerAlliance!==state.winner||e.summary.terminal!==last?.done)throw Error('SUMMARY_MISMATCH');
  Object.assign(result,{status:'STRICT_TRAJECTORY_PASS',verifiedTransitions:calls,naturalWinner:state.winner,timeout:e.summary.timeout});
 }catch(err){const error=String(err);Object.assign(result,{status:error.includes('TIMEOUT')?'TIMEOUT':'STRICT_TRAJECTORY_FAIL',error,verifiedTransitions:/reward 错位|done 错位|winner 错位/.test(error)?Math.max(0,calls-1):calls,failureState:clone(env.getState()),expectedStep:e.steps[Math.min(calls,e.steps.length-1)]});}
 const rows=[];
 for(const snapshot of snapshots){if(snapshot.stepIndex>result.verifiedTransitions)continue;try{const row=encodeAndLabel(snapshot.state);rows.push({...row,provenance:{sourceEpisode:meta.id,sourceRecordSha256:meta.recordSha256,sourceStep:snapshot.stepIndex,mapName:meta.mapName,planId:meta.planId,familyId:'legacy-map:'+meta.mapName,freezeIdentity,codecIdentity,recoveryMethod:'initial-identity-verified-current-engine-prefix',initialization:'legacy-no-initial-income-v1',fullTrajectoryPassed:result.status==='STRICT_TRAJECTORY_PASS',verifiedPrefixTransitions:result.verifiedTransitions,oldLabelsUsed:false,independentAcceptanceEligible:false}});}catch(err){(result.stateRejections??=[]).push({step:snapshot.stepIndex,error:String(err)});}}
 fs.writeFileSync(path.join(out,'rows_'+sha(meta.id).slice(0,16)+'.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+(rows.length?'\n':''));result.rows=rows.length;result.elapsedMs=Date.now()-begin;
 const previous:any=completed.get(meta.id);if(previous){if(previous.status!==result.status||previous.verifiedTransitions!==result.verifiedTransitions||previous.rows!==result.rows)throw Error('断点重算结果不一致');}else fs.appendFileSync(output,JSON.stringify(result)+'\n');
 console.log(JSON.stringify({id:meta.id,status:result.status,verifiedTransitions:result.verifiedTransitions,rows:rows.length,error:result.error,elapsedMs:result.elapsedMs}));
}
verifyFreeze();
