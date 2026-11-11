import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { calculateDamage } from '../../src/game/rules';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { commanderHealthProtection } from './commander_health_guard';
import { retaliation } from './leaf';
import { auditSearchRisks } from './audit_search_risks';
import { DIR,read,save,hash,sha } from './io';
const phase=process.argv[2]??'teacher-r15',plan=read('teacher-battle-plan.json'),model=read('teacher-model.json'),old=read('old-schema.json');let inspected=0,missing=0;
for(const slot of plan.slots.filter((s:any)=>s.model==='teacher_search')){
    const folder=path.join(DIR,phase+'-battles/slots',slot.id);if(!fs.existsSync(path.join(folder,'result.json')))continue;
    const result=read(path.join(folder,'result.json')),purePath=path.join(DIR,phase+'-battles/slots',slot.id.replace('teacher_search','pure'),'result.json');
    if(result.classification==='natural_win'||!fs.existsSync(purePath)||read(purePath).classification!=='natural_win')continue;
    const bytes=fs.readFileSync(path.join(folder,'actions.jsonl.gz')),rows=gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)),engine=new GameEngine(read(plan.maps[slot.mapIndex].path));
    for(const row of rows){
        assert.equal(hash(engine.getState()),row.beforeHash);const search=row.search;
        if(search?.reason?.startsWith('Veto')){
            const primary=search.traces.find((v:any)=>encodeAction(v.action)===search.preferred),selected=search.traces.find((v:any)=>encodeAction(v.action)===search.selected),threats=new Set<string>();
            for(const risk of primary.risks.filter((r:any)=>r.lethal))for(const a of risk.witness??[])if(a.type==='attack')threats.add(a.attackerId);
            if(primary.actorLost&&primary.action.type==='attack')threats.add(primary.action.targetId);
            const before=engine.getState(),rootCodes=new Set(search.traces.map((v:any)=>encodeAction(v.action))),actions=engine.getLegalActions(row.player).filter(a=>a.type==='attack'&&threats.has(a.targetId)&&!rootCodes.has(encodeAction(a)));
            actions.sort((a,b)=>b.type==='attack'&&a.type==='attack'?calculateDamage(before,b.attackerId,b.targetId)-calculateDamage(before,a.attackerId,a.targetId):0);
            inspected++;missing+=actions.length;
            const primaryBranch=engine.clone();primaryBranch.step(primary.action);for(const step of primary.plan??[])primaryBranch.step(step.action);
            for(const action of actions){
                const v=new ModelBattleSearchAI(model,old).evaluateCandidate(engine,row.player,action);
                if(!v.naturalWin&&(!v.complete||!v.riskKnown||v.commanderLethal||v.actorLethal||v.tactical<primary.tactical-.15||v.score<=selected.score+1e-10))continue;
                if(!v.naturalWin&&!commanderHealthProtection(before,row.player,{...primary,state:primaryBranch.getState()},v).every(r=>r.preserved))continue;
                let protection:ReturnType<typeof retaliation>|undefined;
                if(!v.naturalWin&&primary.highValueActor&&primary.actorLethal&&v.actor!==primary.actor){
                    protection=retaliation(v.branch,row.player,primary.actor);if(!protection.known||!protection.risks.some(r=>r.id===primary.actor&&!r.lethal))continue;
                    for(const risk of protection.risks)if(!v.risks.some(r=>r.id===risk.id))v.risks.push(risk);
                }
                const audit=auditSearchRisks(engine,{traces:[v]}),receipt={passed:true,coverageGap:true,phase,slot:slot.id,row:row.i,beforeHash:row.beforeHash,logSha256:sha(bytes),preferred:search.preferred,selected:search.selected,selectedScore:selected.score,missingDefensiveAction:encodeAction(action),betterScore:v.score,threatIds:[...threats],inspected,missingCandidates:missing,protectedOriginalActor:primary.actor,originalProtection:protection?{known:protection.known,risks:protection.risks.map(r=>({...r,replyState:undefined,focus:undefined}))}:null,audit,trace:{...v,branch:undefined,state:undefined,risks:v.risks.map(r=>({...r,replyState:undefined,focus:undefined}))},state:before,scope:'存在未覆盖且满足原有全部守卫的更高叶子值反制；不是对战胜率证明'};
                save(phase+'-defensive-coverage-gate.json',receipt);console.log({...receipt,state:undefined,trace:undefined,originalProtection:undefined});process.exit(0);
            }
        }
        assert.ok(!engine.step(row.action).info.includes('非法动作'));assert.equal(hash(engine.getState()),row.afterHash);
    }
}
save(phase+'-defensive-coverage-gate.json',{passed:true,coverageGap:false,phase,inspected,missingCandidates:missing,scope:'未找到满足全部守卫且分数更高的缺失反制，不据此修改候选覆盖'});console.log({coverageGap:false,inspected,missing});
