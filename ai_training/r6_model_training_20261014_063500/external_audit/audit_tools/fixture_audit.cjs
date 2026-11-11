require('./ts_loader.cjs');
const fs=require('fs'),path=require('path');const root=process.argv[2],out=process.argv[3];
const stage=path.join(root,'ai_training/r5_eval_teacher_v2_20261014_023500');
const {GameEngine}=require(path.join(root,'src/game/engine.ts'));
const {encodeAction}=require(path.join(root,'src/game/env.ts'));
const {computeStateHash}=require(path.join(stage,'research/state_hash.ts'));
const {encodeStateAndActions,encodeEntities}=require(path.join(stage,'research/features.ts'));
const {SearchTeacherV2}=require(path.join(stage,'research/search_teacher_v2.ts'));
const result={scope:'Fixture validation, encoder counterexamples and one zero-rollout search probe only. No training or new arena games.',suites:{}};
for(const name of ['tactical_suite_original.json','tactical_suite_v2.json']){
 const cases=JSON.parse(fs.readFileSync(path.join(stage,'eval',name),'utf8'));
 const records=cases.map(c=>{
 const e=new GameEngine(c.state),legal=e.getLegalActions(c.state.currentPlayer),codes=legal.map(encodeAction);
 const expected=c.expectedActionCodes??[];
 const transitions=expected.map(code=>{const a=legal.find(a=>encodeAction(a)===code);if(!a)return {code,legal:false};const ec=e.clone();ec.step(a);const ns=ec.getState();return {code,legal:true,terminal:ec.isTerminal(),winner:ns.winner??null,playerAlive:ns.players.map(p=>({id:p.id,isAlive:p.isAlive,gold:p.gold})),unitsRemaining:ns.units.length};});
 return {id:c.id,category:c.category,diagnostic:c.isDiagnostic,stateHash:computeStateHash(c.state),expectedCount:expected.length,illegalExpected:expected.filter(x=>!codes.includes(x)),legalActionCount:legal.length,provenOptimal:c.provenOptimal,transitions};
 });
 const summarize=rs=>({rows:rs.length,uniqueStates:new Set(rs.map(x=>x.stateHash)).size,illegalExpectedCount:rs.reduce((n,x)=>n+x.illegalExpected.length,0),emptyExpected:rs.filter(x=>!x.expectedCount).length});
 result.suites[name]={all:summarize(records),acceptance:summarize(records.filter(x=>!x.diagnostic)),diagnostic:summarize(records.filter(x=>x.diagnostic)),records};
}
const cases=JSON.parse(fs.readFileSync(path.join(stage,'eval/tactical_suite_v2.json'),'utf8'));
const base=cases[0].state;
function feat(s){const e=new GameEngine(s),l=e.getLegalActions(s.currentPlayer);const f=encodeStateAndActions(s,l,s.currentPlayer,computeStateHash(s));return {input:JSON.stringify([f.spatialBuffer,f.entityBuffer,f.globalBuffer,f.actionBuffer,f.legalMask,f.eligibleMask]),codes:f.candidateCodes};}
result.encoderCounterexamples={};
for(const [name,edit] of Object.entries({commanderDeaths:s=>s.players[0].commanderDeathCount=(s.players[0].commanderDeathCount??0)+1,statusDuration:s=>{s.units[0].status={type:'blinded',remainingTurns:1};}})){
 const a=JSON.parse(JSON.stringify(base)),b=JSON.parse(JSON.stringify(base));
 if(name==='statusDuration'){a.units[0].status={type:'blinded',remainingTurns:1};b.units[0].status={type:'blinded',remainingTurns:2};}else edit(b);
 const fa=feat(a),fb=feat(b);result.encoderCounterexamples[name]={stateChanged:computeStateHash(a)!==computeStateHash(b),inputIdentical:fa.input===fb.input,legalCodesIdentical:JSON.stringify(fa.codes)===JSON.stringify(fb.codes)};
}
// Synthetic capacity unit test; this is not a claim the 60-unit fixture was reached in an actual match.
const crowded=JSON.parse(JSON.stringify(base));crowded.units=Array.from({length:60},(_,i)=>({...crowded.units[0],id:'audit-'+i,ownerId:i<30?0:1,pos:{x:i%13,y:Math.floor(i/13)}}));crowded.pendingUnitId='audit-59';
const enc=encodeEntities(crowded,0);result.entityCapacityProbe={synthetic:true,totalUnits:60,encodedUnits:enc.entityIdMap.size,pendingEncoded:enc.entityIdMap.has(crowded.pendingUnitId)};
// No simulation rollout: confirms incomplete candidates do not always trigger explicit fallback.
const e=new GameEngine(base);const teacher=new SearchTeacherV2('audit_zero_rollout',{targetK:4,maxOwnSteps:0,maxSimulationSteps:0,maxWallMs:10000});
const legal=e.getLegalActions(base.currentPlayer);const oldRandom=Math.random;Math.random=()=>0.5;const trace=teacher.search({engineClone:e,observerPlayerId:base.currentPlayer,legalActions:legal,candidateCodes:legal.map(encodeAction),stepIndex:0});Math.random=oldRandom;
result.zeroRolloutProbe={searched:trace.searchedCount,completed:trace.completedCount,fallback:trace.fallbackReason,chosen:trace.chosenActionCode,trace:trace.candidateTraces};
fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,suites:Object.fromEntries(Object.entries(result.suites).map(([k,v])=>[k,{all:v.all,acceptance:v.acceptance,diagnostic:v.diagnostic,illegal:v.records.filter(x=>x.illegalExpected.length),lethal:v.records.filter(x=>x.category==='lethal_commander')}]))},null,2));
