import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { isCommanderUnit } from '../../src/game/rule_config';
import { movingThreat as reference,nextOpponent,beginThreatScope } from '../tactical_scale_20261018/threat';
import { movingThreat,beginSingleScope,SINGLE_AUDIT } from './single_threat';
import { actorId } from '../tactical_scale_20261018/tactics';
import { legalActions } from './policy_runtime';
import { read,save,hash } from './io';
const frames=read('performance_query_cache/slow-frames.json').results,slow=frames.map((v:any)=>read(`performance_query_cache/slow-state-${v.id}.json`));
const states=[...slow,...read('browser-states.json').map((v:any)=>v.state),...read('teacher-battle-plan.json').maps.map((v:any)=>read(v.path))];
let branches=0,targets=0,proposals=0,representatives=0,grouped=0,fallbacks=0,referenceMs=0,proposedMs=0;
for(const [index,s] of states.entries()){
    const engine=new GameEngine(s),initial=engine.getState(),before=hash(initial),player=initial.currentPlayer,all=legalActions(engine);
    const actions=index<slow.length?all:all.filter((_,i)=>i%Math.max(1,Math.floor(all.length/24))===0);
    beginThreatScope();beginSingleScope();
    for(const action of actions){
        const branch=engine.clone(),after=branch.step(action).state,id=actorId(action,initial,after),reply=nextOpponent(branch,player);if(!reply.known)continue;
        const rs=reply.branch.getState(),units=rs.units.filter(u=>u.id===id||u.ownerId===player&&isCommanderUnit(rs,u,player));
        let t=performance.now();const expected=reference(reply.branch,units);referenceMs+=performance.now()-t;t=performance.now();const actual=movingThreat(reply.branch,units);proposedMs+=performance.now()-t;
        assert.deepEqual(actual,expected,`${index}/${JSON.stringify(action)}`);targets+=units.length;branches++;
    }
    assert.equal(hash(engine.getState()),before);proposals+=SINGLE_AUDIT.proposals;representatives+=SINGLE_AUDIT.representatives;grouped+=SINGLE_AUDIT.grouped;fallbacks+=SINGLE_AUDIT.fallbacks;
    save(`performance_query_cache/${process.env.STAGE5_SINGLE_NAME??'single-threat'}.live.json`,{states:index+1,branches,targets,proposals,representatives,grouped,fallbacks,referenceMs,proposedMs});
}
const result={passed:true,states:states.length,branches,targets,proposals,representatives,grouped,fallbacks,referenceMs,proposedMs,allValuesAndWitnessOrderExact:true,authorityEngineUnchanged:true};save(`performance_query_cache/${process.env.STAGE5_SINGLE_NAME??'single-threat'}-gate.json`,result);console.log(result);
