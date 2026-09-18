import { GameEngine } from '../src/game/engine';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { EndgameMemory } from './skirmish_endgame_memory';
import { buildCandidateFeatures, type SkirmishBcModel } from './skirmish_bc_train';
import { buildLiveBcSample, type SkirmishPolicy } from './skirmish_training_runner';

/** 战术评分负责安全约束，BC 仅提供有界偏好；持续目标与历史负责打破长期循环。 */
export function createEndgamePolicy(model?:SkirmishBcModel, options:{useMemory?:boolean}={}):SkirmishPolicy & {diagnostics:EndgameMemory['stats']} {
    const memory=new EndgameMemory();
    // 固定评分噪声，避免候选数量变化消耗不同的随机序列。
    const teacher=new HeuristicAI(()=>0.5);
    return {name:model?'bc-finish':'teacher-finish',diagnostics:memory.stats,selectFixedActionIndex(context){
        const {result,playerId}=context;
        memory.observe(result.observation,context.stepNumber);
        const entries=result.legalActionEntries.filter(e=>e.fixedActionIndex!==null&&e.action.type!=='surrender');
        if(!entries.length)return result.fixedLegalActionIndexes[0]??-1;
        const scores=teacher.scoreCandidateActions(new GameEngine(result.state),playerId,entries.map(e=>e.action));
        const urgent=scores.reduce((a,b,i)=>b.score>scores[a].score?i:a,0);
        if(scores[urgent].score>=50000){memory.selected(entries[urgent].action);return entries[urgent].fixedActionIndex!;}
        const sample=model?buildLiveBcSample(context):null;
        const bc=model?entries.map(e=>[...buildCandidateFeatures(sample!,e.code,model.featureDim,model.featureExtractor)!].reduce((sum,[i,v])=>sum+model.weights[i]*v,0)):[];
        const ordered=[...bc].sort((a,b)=>a-b);
        const ranks=new Map<number,number>();ordered.forEach((score,i)=>{if(!ranks.has(score))ranks.set(score,i);});
        let best=0,bestScore=-Infinity;
        for(let i=0;i<entries.length;i++){
            // BC 的最大影响限定在 1200 分，不能压过明确的战术机会。
            const preference=model?1200*(2*ranks.get(bc[i])!/Math.max(1,ordered.length-1)-1):0;
            const value=scores[i].score+preference+(options.useMemory===false?0:memory.adjustment(result.observation,entries[i].action));
            if(value>bestScore){best=i;bestScore=value;}
        }
        memory.selected(entries[best].action);
        return entries[best].fixedActionIndex!;
    }};
}
