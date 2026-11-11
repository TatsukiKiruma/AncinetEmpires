import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { GameEngine } from '../../src/game/engine';
import { getLegalActions } from '../../src/game/rules';
import { buildFixedActionMask,encodeAction } from '../../src/game/env';
import { read,save,DIR } from './io';
import type { GameState } from '../../src/game/types';
const folder=process.env.STAGE5_QUERY_DIR??'performance_query_cache',out=path.join(DIR,folder),proposal=fs.readFileSync(path.join(out,'engine.ts.proposed'),'utf8');
await build({stdin:{contents:proposal,loader:'ts',sourcefile:path.resolve(DIR,'../../src/game/engine.ts'),resolveDir:path.resolve(DIR,'../../src/game')},bundle:true,platform:'node',format:'esm',outfile:path.join(out,'proposed-engine.mjs')});
const Proposed=(await import(pathToFileURL(path.join(out,'proposed-engine.mjs')).href)).GameEngine as typeof GameEngine;
const maps=read('final-battle-plan.json').maps,states:GameState[]=[...read('browser-states.json').map((v:any)=>v.state),...maps.map((v:any)=>read(v.path))];
const dense=fs.readdirSync(path.join(DIR,'teacher-r3-battles/slots')).map(id=>({id,...read(`teacher-r3-battles/slots/${id}/result.json`)})).filter(r=>!r.terminal).sort((a,b)=>read(`teacher-r3-battles/slots/${b.id}/final.json`).units.length-read(`teacher-r3-battles/slots/${a.id}/final.json`).units.length).slice(0,3);
for(const item of dense)states.push(read(`teacher-r3-battles/slots/${item.id}/final.json`));
let queries=0,clones=0,steps=0,masks=0;
for(const initial of states){
    const a=new GameEngine(initial),b=new Proposed(initial),s=a.getState();assert.deepEqual(b.getState(),s);
    for(const player of s.players){
        const ids=[undefined,...s.units.filter(u=>u.ownerId===player.id).slice(0,2).map(u=>u.id),...s.units.filter(u=>u.ownerId!==player.id).slice(0,1).map(u=>u.id),'不存在',''];
        for(const unitId of ids)for(let flags=0;flags<8;flags++){
            const query={unitId,skipMovement:!!(flags&1),skipRecruitment:!!(flags&2),onlyAttacks:!!(flags&4)},expected=getLegalActions(s,player.id,query);
            const actual=b.getLegalActions(player.id,query);assert.deepEqual(actual,expected);queries++;
            const move=actual.find(v=>'to' in v);if(move&&'to' in move)move.to.x=-100;actual.length=0;
            assert.deepEqual(b.getLegalActions(player.id,{onlyAttacks:query.onlyAttacks,skipRecruitment:query.skipRecruitment,unitId:query.unitId,skipMovement:query.skipMovement}),expected);queries++;
        }
        const factories=[()=>Object.create({unitId:s.units[0]?.id,skipMovement:true}),()=>Object.defineProperty({},'onlyAttacks',{get:()=>true}),()=>({unitId:null}),()=>({skipMovement:1}),()=>({skipMovement:true,unknown:true})];
        for(const make of factories){assert.deepEqual(b.getLegalActions(player.id,make() as any),getLegalActions(s,player.id,make() as any));queries++;}
        const full=b.getLegalActions(player.id);assert.deepEqual(full,a.getLegalActions(player.id));assert.deepEqual(buildFixedActionMask(s,full),buildFixedActionMask(s,a.getLegalActions(player.id)));masks++;
    }
    const legal=a.getLegalActions(s.currentPlayer).filter(v=>v.type!=='surrender');
    if(legal.length&&!a.isTerminal()){
        const ca=a.clone(),cb=b.clone(),action=legal[0];assert.deepEqual(cb.step(action),ca.step(action));assert.deepEqual(b.getState(),s);clones++;
        assert.deepEqual(b.step(action),a.step(action));const next=a.getState();assert.deepEqual(b.getLegalActions(next.currentPlayer),a.getLegalActions(next.currentPlayer));steps++;
    }
    const reset=structuredClone(s);reset.players[0].gold=0;assert.deepEqual(b.reset(reset),a.reset(reset));assert.deepEqual(b.getLegalActions(reset.currentPlayer),a.getLegalActions(reset.currentPlayer));
    save(folder+'/query-cache.live.json',{states:states.indexOf(initial)+1,queries,clones,steps,masks});
}
for(let game=0;game<4;game++){
    const initial=read(maps[game].path),a=new GameEngine(initial),b=new Proposed(initial);
    for(let i=0;i<300&&!a.isTerminal();i++){
        const s=a.getState(),legal=a.getLegalActions(s.currentPlayer).filter(v=>v.type!=='surrender');assert.deepEqual(b.getLegalActions(s.currentPlayer),a.getLegalActions(s.currentPlayer));
        const action=legal[(i*7919+game*37)%legal.length];assert.deepEqual(b.step(action),a.step(action));steps++;
        if(i%17===0){const q={skipMovement:true,skipRecruitment:true};assert.deepEqual(b.getLegalActions(b.getState().currentPlayer,q),a.getLegalActions(a.getState().currentPlayer,q));queries++;}
    }
}
const result={passed:true,states:states.length,queries,clones,steps,masks,authorityQueriesAndOrderExact:true,externalMutationIsolated:true,cloneAndResetIsolated:true,publicSourceUnchanged:true};save(folder+'/query-cache-gate.json',result);console.log(result);
