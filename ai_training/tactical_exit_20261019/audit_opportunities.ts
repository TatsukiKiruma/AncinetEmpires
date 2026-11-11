import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { DIR,read,save,hash,sha } from './io';
const phase=process.argv[2]??'final',lane=Number(process.argv[3]??0),lanes=Number(process.argv[4]??1),teacher=phase.startsWith('teacher'),folder=teacher?phase+'-battles':'battles',plan=read(teacher?'teacher-battle-plan.json':'final-battle-plan.json'),toolSha256=sha(fs.readFileSync(new URL(import.meta.url)));
const empty=()=>({turnExits:0,automaticTurnExits:0,turnExitsWithRecruitOption:0,attackTargetDeaths:0,actualFocusDeaths:0,actualThreeAttackerDeaths:0,damagedUnitTurns:0});
for(const [i,slot] of plan.slots.entries()){
    if(i%lanes!==lane)continue;
    const prefix=`${folder}/slots/${slot.id}`,base=path.join(DIR,prefix);if(!fs.existsSync(path.join(base,'result.json')))continue;
    const result=read(prefix+'/result.json'),strict=read(prefix+'/strict-replay.json');assert.ok(strict.passed&&strict.actions===result.actions);
    const bytes=fs.readFileSync(path.join(base,'actions.jsonl.gz')),logSha256=sha(bytes),output=prefix+'/opportunity-audit.json';
    if(fs.existsSync(path.join(DIR,output))){const previous=read(output);assert.ok(previous.passed&&previous.logSha256===logSha256&&previous.toolSha256===toolSha256);continue;}
    const engine=new GameEngine(read(plan.maps[slot.mapIndex].path)),rows=gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)),metrics={model:empty(),opponent:empty()},rootLatencySamples:number[]=[],queuedLatencySamples:number[]=[],hits=new Map<string,{owner:number;attackers:Set<string>}>();
    const side=(owner:number)=>owner===slot.seat?'model':'opponent';
    const flush=()=>{for(const item of hits.values())metrics[side(item.owner)].damagedUnitTurns++;hits.clear();};
    for(const row of rows){
        const before=engine.getState();assert.equal(hash(before),row.beforeHash);
        const legal=engine.getLegalActions(before.currentPlayer).filter(a=>a.type!=='surrender');assert.ok(legal.some(a=>encodeAction(a)===row.code));const recruit=legal.some(a=>a.type.startsWith('recruit_'));
        const after=engine.step(row.action).state;assert.equal(hash(after),row.afterHash);
        if(row.side==='model')(row.search?.preferredPolicyEvaluated===false?queuedLatencySamples:rootLatencySamples).push(row.ms);
        if(row.action.type==='attack'){
            const target=before.units.find(u=>u.id===row.action.targetId)!,remaining=after.units.find(u=>u.id===target.id);
            if(target.hp>(remaining?.hp??0)){
                const item=hits.get(target.id)??{owner:target.ownerId,attackers:new Set<string>()};item.attackers.add(row.action.attackerId);hits.set(target.id,item);
                if(!remaining){const m=metrics[side(target.ownerId)];m.attackTargetDeaths++;m.actualFocusDeaths+=Number(item.attackers.size>=2);m.actualThreeAttackerDeaths+=Number(item.attackers.size>=3);}
            }
        }
        const exits=after.currentPlayer!==before.currentPlayer||after.turn!==before.turn;
        if(exits&&!engine.isTerminal()){
            const m=metrics[side(before.currentPlayer)];m.turnExits++;m.automaticTurnExits+=Number(row.action.type!=='end_turn');m.turnExitsWithRecruitOption+=Number(recruit&&!row.action.type.startsWith('recruit_'));
        }
        if(exits)flush();
    }
    flush();assert.equal(rows.length,result.actions);assert.equal(hash(engine.getState()),result.finalHash);
    save(output,{passed:true,version:'opportunity-audit-v1',actions:rows.length,logSha256,toolSha256,strictReceiptSha256:sha(fs.readFileSync(path.join(base,'strict-replay.json'))),metrics,rootLatencySamples,queuedLatencySamples,definitions:{recruit:'非自然终局换手前，完整合法集合中可招募但本次未招募；包含自动换手，是机会关闭指标，不等同于每次都是错误',focus:'同一敌方行动回合中，目标在至少两名不同主动攻击者结算后发生净HP下降，并在其中一次攻击结算及其权威后效中消失；不含反击者自身阵亡',rootLatency:'实际已提交模型动作中排除已验证队列的决策时延，未提交超时由原result单列'}});
    console.log(JSON.stringify({slot:slot.id,actions:rows.length,passed:true}));
}
