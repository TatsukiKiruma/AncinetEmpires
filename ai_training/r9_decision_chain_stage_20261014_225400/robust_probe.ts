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
const config={diagnosticOnly:true,notIndependentEvaluation:true,pairsPerMap:10,maxSteps:500,maxHandoffs:8,maxBranchMs:10000,maxBatchMs:480000,continuation:'R8 model both branches; only first action differs',teacherSeed:91341,scope:'Historical FINAL consumed for diagnosis; no win-rate claim',preregisteredAt:new Date().toISOString()};
fs.writeFileSync(path.join(O,'protocol.json'),JSON.stringify(config,null,2),{flag:'wx'});
const student=policy({type:'model',model},1,0); // 按座位分开创建，保持输入视角。
const students=[student,policy({type:'model',model},1,1)];
const summary:any[]=[],cases:any[]=[],eventsTable:any[]=[];const start=performance.now();
function facts(e:any,seat:number){const s=e.getState(),legal=e.isTerminal()?[]:e.getLegalActions(seat),own=s.units.filter((u:any)=>u.ownerId===seat);return {castles:s.map.tiles.flat().filter((t:any)=>t.terrainId===10&&t.ownerId===seat).length,villages:s.map.tiles.flat().filter((t:any)=>t.terrainId===9&&t.ownerId===seat).length,recruitLegal:s.currentPlayer===seat?legal.filter((a:any)=>a.type.startsWith('recruit')).length:null,gold:s.players[seat].gold,units:own.length,hp:own.reduce((n:number,u:any)=>n+u.hp,0),commanderHp:own.filter((u:any)=>u.unitClass==='commander').reduce((n:number,u:any)=>n+u.hp,0)};}
function branch(state:any,seat:number,first:any,rng:any){const e=new GameEngine(structuredClone(state));const opp=policy({},1,1-seat);Object.assign(opp.rng,rng);const t0=performance.now(),trace:any[]=[];let handoffs=0,reason='handoff_window';let firstCastle:any=null,firstRecruitAvailable:any=null,firstRecruit:any=null;for(let step=0;step<config.maxSteps&&!e.isTerminal()&&handoffs<config.maxHandoffs;step++){if(performance.now()-t0>config.maxBranchMs){reason='wall_truncated';break;}const s=e.getState(),who=s.currentPlayer,legal=e.getLegalActions(who);const f=facts(e,seat);if(f.castles&&firstCastle===null)firstCastle=step;if(f.recruitLegal&&firstRecruitAvailable===null)firstRecruitAvailable=step;const a=step===0?first:(who===seat?students[seat]:opp).act(structuredClone(s),structuredClone(legal));const before=hash(s),rngBefore=opp.rng.snapshot();strictStep(e,legal,a);if(a.type.startsWith('recruit')&&who===seat&&firstRecruit===null)firstRecruit=step;if(e.getState().currentPlayer!==who)handoffs++;trace.push({step,player:who,action:a,code:encodeAction(a),before,after:hash(e.getState()),rngBefore,rngAfter:opp.rng.snapshot(),facts:f});}if(trace.length===config.maxSteps&&!e.isTerminal())reason='step_truncated';const winner=e.getWinner();return {reason:e.isTerminal()?'natural_terminal':reason,winner:e.isTerminal()?winner:null,steps:trace.length,handoffs,facts:facts(e,seat),firstCastle,firstRecruitAvailable,firstRecruit,elapsedMs:performance.now()-t0,trace,finalState:e.getState()};}

for(const g of [4,5,18,19]){
 const stem=S+'/runs/final_r8/game_'+g,r=JSON.parse(fs.readFileSync(stem+'.json','utf8'));assert(r.mapName.includes('Swamplands'));
 const events=fs.readFileSync(stem+'.jsonl','utf8').trim().split('\n').map(JSON.parse);const e=new GameEngine(createState(r.mapName));
 let saved:any=null;
 for(const tr of events.filter((x:any)=>x.type==='step')){assert.equal(hash(e.getState()),tr.beforeHash);const s=e.getState(),legal=e.getLegalActions(s.currentPlayer);if(s.currentPlayer===r.candidateSeat){const a=policy({},91341+g*1000+tr.step,s.currentPlayer).act(structuredClone(s),structuredClone(legal));saved={game:g,seat:r.candidateSeat,state:structuredClone(s),legal,actual:tr.action,alternative:a,step:tr.step,rng:events.filter((x:any)=>x.type==='step'&&x.player!==r.candidateSeat&&x.step<tr.step).at(-1)?.rngAfter??{state:r.seeds[1-r.candidateSeat]>>>0,calls:0}};break;}strictStep(e,legal,tr.action);}
 for(let variant=0;variant<3;variant++){const rng=variant===0?saved.rng:{state:(saved.rng.state+variant*191177)>>>0,calls:0};const original=branch(saved.state,saved.seat,saved.actual,rng),alternative=branch(saved.state,saved.seat,saved.alternative,rng);const row={game:g,seat:saved.seat,variant,modelCode:encodeAction(saved.actual),alternativeCode:encodeAction(saved.alternative),sameFirstAction:encodeAction(saved.actual)===encodeAction(saved.alternative),original:{...original,trace:undefined,finalState:undefined},alternative:{...alternative,trace:undefined,finalState:undefined}};summary.push(row);cases.push({...saved,rng,variant,original,alternative});console.log(JSON.stringify(row));}
}
fs.writeFileSync(path.join(O,'cases.json.gz'),gzipSync(JSON.stringify(cases)),{flag:'wx'});fs.writeFileSync(path.join(O,'results.json'),JSON.stringify({diagnosticOnly:true,scope:'First candidate decision of all four consumed Swamplands slots; conditional RNG variants; eight handoffs',summary},null,2),{flag:'wx'});for(const x of protectedFiles)assert.equal(fileHash(x.path),x.sha256,x.path);fs.writeFileSync(path.join(O,'protection_after.json'),JSON.stringify({passed:true,files:protectedFiles.length}),{flag:'wx'});
