import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { actorId } from '../tactical_scale_20261018/tactics';
import { evaluateLeaf } from './leaf';
import { auditSearchRisks } from './audit_search_risks';
import { commanderHealthProtection } from './commander_health_guard';
import { DIR,read,save,hash,sha } from './io';
const phase='teacher-r17',plan=read('teacher-battle-plan.json'),model=read('teacher-model.json'),old=read('old-schema.json');let inspected=0,alternatives=0;
for(const slot of plan.slots.filter((s:any)=>s.model==='teacher_search')){
    const base=path.join(DIR,phase+'-battles/slots',slot.id),pure=path.join(DIR,phase+'-battles/slots',slot.id.replace('teacher_search','pure'),'result.json');if(!fs.existsSync(pure))continue;
    const result=read(path.join(base,'result.json'));if(result.classification==='natural_win'||read(pure).classification!=='natural_win')continue;assert.ok(read(path.join(base,'strict-replay.json')).passed);
    const bytes=fs.readFileSync(path.join(base,'actions.jsonl.gz')),rows=gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)),engine=new GameEngine(read(plan.maps[slot.mapIndex].path));
    for(const row of rows){
        assert.equal(hash(engine.getState()),row.beforeHash);
        const d=row.search,before=engine.getState();
        if(row.side==='model'&&d?.preferredPolicyEvaluated)for(const trace of d.traces??[]){
            const bad=trace.finishRecovery??trace;if(trace.action.type!=='move'||!bad.riskKnown||!bad.commanderLethal&&!bad.actorLethal)continue;
            const branch=engine.clone(),moved=branch.step(trace.action).state,id=actorId(trace.action,before,moved),actorStart=before.units.find(u=>u.id===id);if(!id||!actorStart||branch.isTerminal()||moved.currentPlayer!==row.player)continue;
            const unit=moved.units.find(u=>u.id===id)!;const follows=branch.getLegalActions(row.player,{unitId:id,skipRecruitment:true}).filter(a=>['attack','capture','heal','summon','destroy_town','repair','support','wait','post_attack_move'].includes(a.type));
            const stays=(a:any)=>a.type==='wait'||a.type==='post_attack_move'&&a.to.x===unit.pos.x&&a.to.y===unit.pos.y;follows.sort((a,b)=>Number(stays(b))-Number(stays(a))||(encodeAction(a)<encodeAction(b)?-1:1));
            const chosen=(bad.plan??[]).find((p:any)=>p.action.type==='attack')?.action,threats=new Set<string>();for(const risk of bad.risks??[])if(risk.lethal)for(const a of risk.witness??[])if(a.type==='attack')threats.add(a.attackerId);
            inspected++;
            for(const action of follows.slice(0,24)){
                if(action.type!=='attack'||action.targetId===chosen?.targetId||!threats.has(action.targetId))continue;
                const alt=branch.clone(),after=alt.step(action).state;if(after.currentPlayer===row.player&&alt.getLegalActions(row.player,{unitId:id,skipRecruitment:true}).length)continue;
                alternatives++;const leaf=evaluateLeaf(before,alt,row.player,id,model,old,actorStart);
                if(!leaf.riskKnown||leaf.commanderLethal||leaf.actorLethal||leaf.score<=trace.score+1e-10||after.units.some(u=>u.id===action.targetId))continue;
                const primary=d.traces.find((v:any)=>encodeAction(v.action)===d.preferred),primaryBranch=engine.clone();primaryBranch.step(primary.action);for(const p of primary.plan??[])primaryBranch.step(p.action);
                if(!commanderHealthProtection(before,row.player,{...primary,state:primaryBranch.getState()},{...leaf,state:after}).every(v=>v.preserved))continue;
                const audit=auditSearchRisks(engine,{traces:[{...leaf,action:trace.action,index:trace.index,actor:id,complete:true,plan:[{action}],state:undefined}]}),receipt={passed:true,coverageGap:true,phase,slot:slot.id,row:row.i,beforeHash:row.beforeHash,logSha256:sha(bytes),rootAction:encodeAction(trace.action),oldPlan:trace.plan,badPlan:bad.plan,oldScore:trace.score,newScore:leaf.score,alternativeFollow:action,enumeratedIndex:follows.indexOf(action),usesAlreadyEnumeratedOwnNode:true,inspected,alternatives,audit,state:before,trace,leaf:{...leaf,risks:leaf.risks.map(r=>({...r,replyState:undefined,focus:undefined}))},scope:'同一根移动已枚举的另一完结攻击可斩杀致死见证攻击者，完整且满足原安全与健康约束；不增加己方节点，不是实战增益证明'};save('teacher-r17-follow-coverage-gate.json',receipt);console.log({...receipt,state:undefined,trace:undefined,leaf:undefined});process.exit(0);
            }
        }
        engine.step(row.action);assert.equal(hash(engine.getState()),row.afterHash);
    }
}
const receipt={passed:true,coverageGap:false,inspected,alternatives,scope:'未找到已枚举且斩杀致死见证攻击者、完整安全并高于旧完结的替代，不据此改同单位选择'};save('teacher-r17-follow-coverage-gate.json',receipt);console.log(receipt);
