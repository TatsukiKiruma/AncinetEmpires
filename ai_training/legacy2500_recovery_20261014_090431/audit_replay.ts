import fs from 'node:fs';
import path from 'node:path';
import {OUT,sha,readEpisode,makeEnv,verifyFreeze,clone} from './recovery_core';
import {replayEpisodeDatasetItems} from './frozen/tools/strict_replay';
const identity=verifyFreeze(),start=Date.now(),limit=Number(process.argv[2]??100);
const index=fs.readFileSync(path.join(OUT,'episode_index.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const pilot=JSON.parse(fs.readFileSync(path.join(OUT,'selection_100.json'),'utf8')).selected;
const first=new Set(pilot.map((e:any)=>e.id));
const order=[...pilot,...index.filter((e:any)=>!first.has(e.id)).sort((a:any,b:any)=>(a.players===2?0:1)-(b.players===2?0:1)||a.steps-b.steps)].slice(0,limit);
const resultsPath=path.join(OUT,'replay_results.jsonl');
const done=new Set(fs.existsSync(resultsPath)?fs.readFileSync(resultsPath,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l).id):[]);
function attempt(e:any,legacy:boolean){const begin=Date.now(),env=makeEnv(e,legacy),initial=env.reset(e.seed);let steps=0;const snapshots=[];
 const result:any={mode:legacy?'legacy-no-initial-income-v1':'current-normal',initialObservationHash:sha(initial.observation),recordedInitialObservationHash:e.initialObservationHash,initialGold:initial.state.players.map(p=>p.gold)};
 try{for(const item of replayEpisodeDatasetItems(e,env,{observationMode:'none'})){if(Date.now()-begin>60000)throw Error('EPISODE_BUDGET_EXCEEDED');if(steps%Math.max(1,Math.floor(e.steps.length/16))===0)snapshots.push({stepIndex:steps,stateJson:clone(item.result.state)});steps++;}
  const final=env.getState(),last=e.steps.at(-1);if(steps!==e.steps.length||steps!==e.summary.stepCount||!last)throw Error('SUMMARY_STEP_COUNT');
  if(final.turn!==e.summary.finalTurn||final.currentPlayer!==e.summary.finalCurrentPlayer||final.winner!==e.summary.winnerAlliance||last.done!==e.summary.terminal)throw Error('SUMMARY_TERMINAL_MISMATCH');
  result.status='PASS';result.finalStateHash=sha(final);result.naturalTerminal=final.winner!==null;result.timeout=e.summary.timeout;
  fs.mkdirSync(path.join(OUT,'strict_states'),{recursive:true});fs.writeFileSync(path.join(OUT,'strict_states',sha([e.scenario.id,e.seed,legacy])+'.json'),JSON.stringify(snapshots));
 }catch(err){result.status=String(err).includes('BUDGET')?'D':'FAIL';result.error=String(err);}
 return {...result,verifiedSteps:steps,elapsedMs:Date.now()-begin};
}
for(const meta of order){if(done.has(meta.id))continue;if(Date.now()-start>4*3600000)break;const e=readEpisode(meta);const current=attempt(e,false),legacy=current.status==='PASS'?null:attempt(e,true);const record={...meta,freezeIdentity:identity,pilot:first.has(meta.id),current,legacy,category:current.status==='PASS'?'A':legacy?.status==='PASS'?'B':current.status==='D'||legacy?.status==='D'?'D':'C',classificationNote:'C 表示现有原始动作记录尚不能可靠恢复状态；若独立完整快照核验通过将在最终逐局结果提升为B；禁止关闭初态检查'};fs.appendFileSync(resultsPath,JSON.stringify(record)+'\n');done.add(meta.id);if(done.size%20===0)console.log(JSON.stringify({done:done.size,total:order.length,elapsedMs:Date.now()-start}));}
verifyFreeze();console.log(JSON.stringify({completed:true,attempted:done.size,elapsedMs:Date.now()-start}));
