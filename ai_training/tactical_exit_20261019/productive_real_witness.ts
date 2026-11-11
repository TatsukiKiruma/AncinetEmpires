import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { DIR,read,save,sha,hash } from './io';
const plan=read('teacher-battle-plan.json'),folder='teacher-r9-battles/slots';let replayed=0;
for(const name of fs.readdirSync(path.join(DIR,folder)).sort()){
    const base=path.join(DIR,folder,name),result=JSON.parse(fs.readFileSync(path.join(base,'result.json'),'utf8'));if(result.slot.model!=='teacher_search')continue;
    const bytes=fs.readFileSync(path.join(base,'actions.jsonl.gz')),rows=gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)),engine=new GameEngine(read(plan.maps[result.slot.mapIndex].path));
    for(const [i,row] of rows.entries()){
        assert.equal(hash(engine.getState()),row.beforeHash);const search=row.search,trace=search?.traces?.find((v:any)=>encodeAction(v.action)===search.selected),next=rows[i+1];
        if(search?.preferred===search?.selected&&!search?.planCommitted&&trace?.complete&&trace.riskKnown&&!trace.commanderLethal&&!trace.actorLethal&&trace.plan?.some((p:any)=>p.action.type!=='wait')&&(trace.captures>0||trace.enemyKills>0||trace.net>0||trace.healingNet>0||trace.freeAttacks>0)&&next&&next.player===row.player&&next.code!==encodeAction(trace.plan[0].action)){
            const state=engine.getState(),branch=engine.clone();assert.ok(!branch.step(row.action).info.includes('非法动作'));
            for(const p of trace.plan){assert.ok(branch.getLegalActions(branch.getState().currentPlayer).some(a=>encodeAction(a)===encodeAction(p.action)));assert.ok(!branch.step(p.action).info.includes('非法动作'));}
            const result={passed:true,slot:name,row:row.i,beforeHash:row.beforeHash,logSha256:sha(bytes),root:row.code,simulatedFollow:trace.plan.map((p:any)=>encodeAction(p.action)),actualNext:next.code,leafScore:trace.score,sourceRevision:'r9',replayed,scope:'证明估值计划未提交导致下一步偏离，不以该局胜负反选',state};save('productive-real-witness-gate.json',result);console.log({...result,state:undefined});process.exit(0);
        }
        assert.ok(!engine.step(row.action).info.includes('非法动作'));assert.equal(hash(engine.getState()),row.afterHash);replayed++;
    }
}
throw Error('实际日志未找到安全有收益计划与实际下一步偏离的证据');
