import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {GameEngine,createState,hash,fileHash,encodeAction,strictStep,MAPS,features,inputHash} from '../r8_pure_policy_stage_20261014_125300/research/common';
import {policy} from '../r8_pure_policy_stage_20261014_125300/research/policy';
const O=path.dirname(process.argv[1]), S='ai_training/r8_pure_policy_stage_20261014_125300';
const model=path.resolve(S,'checkpoints/r1_warm/best.json');
assert.equal(fileHash(model),'44570e4c18a7ba0cf99a239fc58501b2d34e1e2c1dcc2b60bca0a4a4cd4ec812');
const manifest=JSON.parse(fs.readFileSync(`${S}/identity/manifest.json`,'utf8'));
const protectedFiles=manifest.files.flatMap((x:any)=>[{path:x.source,sha256:x.sourceSha256},{path:path.join(S,x.frozen),sha256:x.frozenSha256}]);
protectedFiles.push({path:model,sha256:fileHash(model)});
for(const x of protectedFiles)assert.equal(fileHash(x.path),x.sha256,x.path);
fs.writeFileSync(path.join(O,'protection_before.json'),JSON.stringify(protectedFiles,null,2),{flag:'wx'});
const config={diagnosticOnly:true,notIndependentEvaluation:true,pairsPerMap:10,maxSteps:240,maxHandoffs:4,maxBranchMs:5000,maxBatchMs:480000,continuation:'R8 model both branches; only first action differs',teacherSeed:91341,scope:'Historical FINAL consumed for diagnosis; no win-rate claim',preregisteredAt:new Date().toISOString()};
fs.writeFileSync(path.join(O,'protocol.json'),JSON.stringify(config,null,2),{flag:'wx'});
const student=policy({type:'model',model},1,0); // 按座位分开创建，保持输入视角。
const students=[student,policy({type:'model',model},1,1)];
const summary:any[]=[],cases:any[]=[],eventsTable:any[]=[];const start=performance.now();
function facts(e:any,seat:number){const s=e.getState(),legal=e.isTerminal()?[]:e.getLegalActions(seat),own=s.units.filter((u:any)=>u.ownerId===seat);return {castles:s.map.tiles.flat().filter((t:any)=>t.terrainId===10&&t.ownerId===seat).length,villages:s.map.tiles.flat().filter((t:any)=>t.terrainId===9&&t.ownerId===seat).length,recruitLegal:s.currentPlayer===seat?legal.filter((a:any)=>a.type.startsWith('recruit')).length:null,gold:s.players[seat].gold,units:own.length,hp:own.reduce((n:number,u:any)=>n+u.hp,0),commanderHp:own.filter((u:any)=>u.unitClass==='commander').reduce((n:number,u:any)=>n+u.hp,0)};}
function branch(state:any,seat:number,first:any,rng:any){const e=new GameEngine(structuredClone(state));const opp=policy({},1,1-seat);Object.assign(opp.rng,rng);const t0=performance.now(),trace:any[]=[];let handoffs=0,reason='handoff_window';let firstCastle:any=null,firstRecruitAvailable:any=null,firstRecruit:any=null;for(let step=0;step<config.maxSteps&&!e.isTerminal()&&handoffs<config.maxHandoffs;step++){if(performance.now()-t0>config.maxBranchMs){reason='wall_truncated';break;}const s=e.getState(),who=s.currentPlayer,legal=e.getLegalActions(who);const f=facts(e,seat);if(f.castles&&firstCastle===null)firstCastle=step;if(f.recruitLegal&&firstRecruitAvailable===null)firstRecruitAvailable=step;const a=step===0?first:(who===seat?students[seat]:opp).act(structuredClone(s),structuredClone(legal));const before=hash(s),rngBefore=opp.rng.snapshot();strictStep(e,legal,a);if(a.type.startsWith('recruit')&&who===seat&&firstRecruit===null)firstRecruit=step;if(e.getState().currentPlayer!==who)handoffs++;trace.push({step,player:who,action:a,code:encodeAction(a),before,after:hash(e.getState()),rngBefore,rngAfter:opp.rng.snapshot(),facts:f});}if(trace.length===config.maxSteps&&!e.isTerminal())reason='step_truncated';const winner=e.getWinner();return {reason:e.isTerminal()?'natural_terminal':reason,winner:e.isTerminal()?winner:null,steps:trace.length,handoffs,facts:facts(e,seat),firstCastle,firstRecruitAvailable,firstRecruit,elapsedMs:performance.now()-t0,trace,finalState:e.getState()};}
for(let g=0;g<20;g++){
 if(performance.now()-start>config.maxBatchMs)break;
 const stem=`${S}/runs/final_r8/game_${g}`,r=JSON.parse(fs.readFileSync(stem+'.json','utf8'));
 const events=fs.readFileSync(stem+'.jsonl','utf8').trim().split('\n').map(JSON.parse),steps=events.filter((x:any)=>x.type==='step');
 const e=new GameEngine(createState(r.mapName));const diffs:any[]=[];const first:any={};let ownDecisions=0;
 for(const tr of steps){assert.equal(hash(e.getState()),tr.beforeHash);const s=e.getState(),legal=e.getLegalActions(s.currentPlayer),seat=r.candidateSeat;
 if(s.currentPlayer===seat){ownDecisions++;const f=facts(e,seat);for(const [k,v] of Object.entries({castle:f.castles>0,recruitAvailable:!!f.recruitLegal,recruit:tr.action.type.startsWith('recruit'),village:f.villages>0,commanderLost:f.commanderHp===0})){if(v&&first[k]===undefined)first[k]=tr.step;}
 if((summary.filter(x=>x.map===r.mapName).length+diffs.length)<10){const teacher=policy({},config.teacherSeed+g*1000+tr.step,seat);const a=teacher.act(structuredClone(s),structuredClone(legal));if(encodeAction(a)!==tr.actionCode)diffs.push({game:g,map:r.mapName,seat,step:tr.step,state:structuredClone(s),legal,actual:tr.action,alternative:a,opponentRng:events.filter((x:any)=>x.type==='step'&&x.player!==seat&&x.step<tr.step).at(-1)?.rngAfter??{state:r.seeds[1-seat]>>>0,calls:0},before:f});}}
 strictStep(e,legal,tr.action);assert.equal(hash(e.getState()),tr.afterHash);
 }
 eventsTable.push({game:g,map:r.mapName,seat:r.candidateSeat,first,ownDecisions,outcome:r.outcome});
 for(const c of diffs){if(performance.now()-start>config.maxBatchMs)break;const original=branch(c.state,c.seat,c.actual,c.opponentRng),alternative=branch(c.state,c.seat,c.alternative,c.opponentRng);const d:any={};for(const k of ['castles','villages','gold','units','hp','commanderHp'])d[k]=alternative.facts[k]-original.facts[k];const row={id:cases.length,game:g,map:r.mapName,seat:c.seat,step:c.step,earlyHalf:c.step<r.steps/2,modelCode:encodeAction(c.actual),alternativeCode:encodeAction(c.alternative),delta:d,original:{...original,trace:undefined,finalState:undefined},alternative:{...alternative,trace:undefined,finalState:undefined}};summary.push(row);cases.push({...c,inputHash:inputHash(features(c.state,c.legal)),original,alternative});fs.writeFileSync(path.join(O,'progress.json'),JSON.stringify({pairs:summary.length,last:row,elapsedMs:performance.now()-start},null,2));console.log(JSON.stringify({pair:row.id,map:row.map,step:row.step,delta:d,handoffs:[original.handoffs,alternative.handoffs]}));}
}
fs.writeFileSync(path.join(O,'cases.json.gz'),gzipSync(JSON.stringify(cases)) ,{flag:'wx'});
fs.writeFileSync(path.join(O,'results.json'),JSON.stringify({config,elapsedMs:performance.now()-start,eventsTable,summary},null,2),{flag:'wx'});
for(const x of protectedFiles)assert.equal(fileHash(x.path),x.sha256,x.path);
fs.writeFileSync(path.join(O,'protection_after.json'),JSON.stringify({passed:true,files:protectedFiles.length}),{flag:'wx'});
