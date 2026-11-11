import type {BeamOptions} from './beam_search';
/** 应用和门禁评测共用配置：1000ms外部期限下使用750ms搜索预算。 */
export function deploymentSearchOptions(modelVersion:string,options:Partial<BeamOptions>={}):BeamOptions {
    const budget=options.budgetMs??750;
    const scale=Math.max(1,Math.floor(budget/150));
    return {modelVersion,budgetMs:budget,maxNodes:scale*80,rootCandidates:Math.min(6,scale),beamWidth:Math.min(4,scale),
        maxUnits:1,ownFraction:.4,ownTurnRollout:true,intermediateValue:false,finalists:2,responseVariants:1,responseUnits:24,
        requireModelDecision:true,rootPriorScale:1,...options,disableActionQueue:true};
}
