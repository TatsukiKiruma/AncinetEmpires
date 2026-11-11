/** 从真实评测前缀恢复同一局面，直接核算两种攻击顺序的规则后果。 */
import fs from 'node:fs';
import { createDefaultEnvFactory } from '../../../tools/skirmish_dataset_export';
import { playOne, UNPACK_DIR, SD_PLAN_FILE } from '../../../v14/tools/eval_v14_match';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../../src/game/ai/spatial_conv_net';
import { GameEngine } from '../../../src/game/engine';
import { calculateDamage, estimateCounterDamage } from '../../../src/game/rules';
import { encodeAction } from '../../../src/game/env';
import type { GameState } from '../../../src/game/types';

async function main() {
    const trace=JSON.parse(fs.readFileSync('v19/out/run_20260929_v19_02/diag/trace.json','utf8'));
    const first=trace.results[0];
    const window=first.windows[0];
    const modelPath=trace.modelB;
    const predictor=new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(modelPath,'utf8')));
    const envFactory=await createDefaultEnvFactory(UNPACK_DIR,SD_PLAN_FILE);
    let saved:GameState|null=null;
    const shortRun=await playOne({runId:'review_icy_order_20260930',scenarioId:`SDPLAN:sd-normal:${first.family.mapName}`,
        seed:first.family.seed,candidateSeat:0,viewedSeatHint:0,maxSteps:window.engineStepIndex+1,maxPlies:null,
        wallTimeoutMs:120000,predictor,checkpointSha256:first.modelB.sha,requestedPolicyId:'review_theta2',envFactory,
        emitIdentity:false,mirrorViewRecompute:false,captureStateOnStep:true,
        onStep:t=>{if(t.stepIndex===window.engineStepIndex && t.stateBeforeJson) saved=JSON.parse(t.stateBeforeJson);}});
    if(!saved) throw new Error('没有恢复到指定分歧状态');
    const base=saved as GameState;
    const summarize=(s:GameState)=>({currentPlayer:s.currentPlayer,turn:s.turn,winner:s.winner,
        units:s.units.filter(u=>['u_22','apk_u0','u_23'].includes(u.id)).map(u=>({id:u.id,cls:u.unitClass,hp:u.hp,level:u.level,exp:u.exp,status:u.status})),
        players:s.players.map(p=>({id:p.id,gold:p.gold,alive:p.isAlive}))});
    const branches=[];
    for(const order of [['u_22','apk_u0'],['apk_u0','u_22']]) {
        const engine=new GameEngine(base);
        const steps=[];
        for(const attacker of order) {
            const code=`attack:${attacker}:u_23`;
            const state=engine.getState();
            const action=engine.getLegalActions(state.currentPlayer).find(a=>encodeAction(a)===code);
            if(!action){steps.push({code,legal:false,state:summarize(state)});break;}
            const damage=calculateDamage(state,attacker,'u_23');
            const counter=estimateCounterDamage(state,attacker,'u_23');
            engine.step(action);
            steps.push({code,legal:true,damage,counter,after:summarize(engine.getState())});
        }
        branches.push({order,steps});
    }
    const result={note:'只复现原seed/模型到分歧点并比较两步规则后果，不是新完整胜率评测，也不独立复跑原报告的长局反事实。',
        prefixSteps:shortRun.steps,engineStepIndex:window.engineStepIndex,before:summarize(base),branches};
    fs.writeFileSync('v19/review/r123_20260930/icy_order.json',JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
