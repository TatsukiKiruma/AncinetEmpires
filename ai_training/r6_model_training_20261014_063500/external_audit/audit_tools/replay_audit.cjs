require('./ts_loader.cjs');
const fs=require('fs'), path=require('path');
const root=process.argv[2];
if(!root)throw new Error('Usage: node replay_audit.cjs <extracted_bundle_dir> [output_json]');
const stage=path.join(root,'ai_training/r5_eval_teacher_v2_20261014_023500');
const {replayMatch}=require(path.join(stage,'research/match_runner.ts'));
const {GameEngine}=require(path.join(root,'src/game/engine.ts'));
const {encodeAction}=require(path.join(root,'src/game/env.ts'));
const {computeStateHash,computeGameplayStateKey}=require(path.join(stage,'research/state_hash.ts'));
const out=[];
for(const name of fs.readdirSync(path.join(stage,'artifacts/failed_replays')).filter(x=>x.endsWith('.json')).sort()){
 const rec=JSON.parse(fs.readFileSync(path.join(stage,'artifacts/failed_replays',name),'utf8'));
 const replay=replayMatch(rec);
 const eng=new GameEngine(rec.initialState);let actualHandoffs=0;let player=eng.getState().currentPlayer;
 for(const step of rec.steps){const st=eng.getState(); const a=eng.getLegalActions(st.currentPlayer).find(a=>encodeAction(a)===step.actionCode);if(!a)throw new Error('illegal replay');eng.step(a);const np=eng.getState().currentPlayer;if(np!==player){actualHandoffs++;player=np;}}
 const final=eng.getState();
 const timings={};
 for(const [pid,policy] of Object.entries(rec.policies)){
  const vals=rec.steps.filter(s=>s.playerId===Number(pid)).map(s=>s.stepDurationMs).sort((a,b)=>a-b);
  const sum=vals.reduce((s,x)=>s+x,0);
  timings[policy]={decisions:vals.length,sumMs:sum,meanMs:sum/(vals.length||1),p50Ms:vals[Math.floor(vals.length*.5)],p95Ms:vals[Math.min(vals.length-1,Math.floor(vals.length*.95))],maxMs:vals.at(-1),over3000Ms:vals.filter(x=>x>3000).length};
 }
 out.push({file:name,replay,initialHash:rec.initialStateHash,map:rec.initialState.metadata?.apkMapName,initialTurn:rec.initialState.turn,outcome:rec.outcome,actualHandoffs,timings,rootEngineMatchesFinalHash:computeStateHash(final)===rec.outcome.finalStateHash,finalUnits:final.units.length,finalPlayers:final.players});
}
// Minimal counterexamples for repeat-state hashing, with no policy or match evaluation.
const rec=JSON.parse(fs.readFileSync(path.join(stage,'artifacts/failed_replays/gate_b_failure_1.json'),'utf8'));
const s=rec.initialState, variants={};
for(const [name,edit] of Object.entries({gold:t=>t.players[0].gold+=100,unitOwner:t=>t.units[0].ownerId=1-t.units[0].ownerId,movementRemaining:t=>t.units[0].movementRemaining=(t.units[0].movementRemaining??0)+1,commanderDeaths:t=>t.players[0].commanderDeathCount+=1,postAttackMove:t=>t.units[0].hasPostAttackMoved=!t.units[0].hasPostAttackMoved})){
 const t=JSON.parse(JSON.stringify(s)); edit(t);
 variants[name]={fullHashChanges:computeStateHash(s)!==computeStateHash(t),gameplayHashChanges:computeGameplayStateKey(s)!==computeGameplayStateKey(t)};
}
const result={scope:'Existing replay verification and deterministic state-hash counterexamples only; no training and no new arena games.',records:out,repeatHashCounterexamples:variants};
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
