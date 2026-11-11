import { GameEngine } from '../../../src/game/engine';
import { borrowedEngine } from './borrowed_engine';
import { installCompatibility } from './compat';
import { extractFeatures } from '../combined_tactics';
import { ModelBattleSearchAI } from '../model_battle_search_ai';

installCompatibility();
const models=new Map<number,{model:any;old:any}>();
const scope=globalThis as any;
scope.onmessage=(event:any)=>{
    const {id,kind,...payload}=event.data;
    try{
        let value:any;
        if(kind==='model'){models.set(payload.key,{model:payload.model,old:payload.old});value=true;}
        else if(kind==='features')value=extractFeatures(borrowedEngine(new GameEngine(payload.state)),payload.actions);
        else if(kind==='candidates'){
            const entry=models.get(payload.key);if(!entry)throw Error('Worker模型身份未初始化');
            const engine=borrowedEngine(new GameEngine(payload.state));
            value=payload.items.map((item:any)=>{
                const ai=new ModelBattleSearchAI(entry.model,entry.old,payload.options);
                const evaluation=ai.evaluateCandidate(engine,payload.player,item.action,item.index);
                // 主线程的最终审计元数据本来就省略focus和replyState，避免复制无用分支图。
                const risks=(rows:any[])=>rows.map(({focus:_focus,replyState:_reply,...row})=>row);
                const {branch:_branch,...record}=evaluation;
                return {...record,risks:risks(record.risks),finishRecovery:record.finishRecovery?{...record.finishRecovery,risks:risks(record.finishRecovery.risks)}:undefined};
            });
        }else throw Error('未知Worker任务');
        scope.postMessage({id,value});
    }catch(error){scope.postMessage({id,error:String(error)+'\n'+(error as Error).stack});}
};
