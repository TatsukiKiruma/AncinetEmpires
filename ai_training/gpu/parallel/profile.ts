/** 从新初态测量困难AI决策热点，不读取或执行历史轨迹。 */
import {GameEngine} from '../../../src/game/engine';
import {mulberry32} from '../../../src/game/env';
import {OriginalApkLikeHardAI} from '../../../src/game/ai/original_apk_like_hard_ai';
import {readJobs,createJobState} from '../hard_jobs';
let steps=0;
for(const job of readJobs().slice(0,21)){
    const initial=createJobState(job),engine=new GameEngine(initial,{applyInitialTurnStart:false});
    const ais=new Map(initial.players.map(p=>[p.id,new OriginalApkLikeHardAI({rng:mulberry32((job.seed^Math.imul(p.id+1,0x9e3779b9))>>>0),compute:{populationLimit:job.setup.unitLimit}})]));
    for(let i=0;i<50;i++){
        const state=engine.getState();if(state.winner!==null)break;
        const action=ais.get(state.currentPlayer)!.getAction(engine,state.currentPlayer);
        if(!engine.hasLegalAction(state.currentPlayer,action))throw Error('热点测试动作非法');
        engine.step(action);steps++;
    }
}
console.log(JSON.stringify({steps,source:'新开局CPU热点采样，不是生产采集'}));
