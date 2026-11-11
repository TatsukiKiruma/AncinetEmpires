import { read,save,quantiles } from './io';
import { GameEngine } from '../../src/game/engine';
import { stateTokens,pooledContext,stateSummary,commanderRisks } from './value_state';
import { extractFeatures } from '../tactical_scale_20261018/complete_tactics';
import { extendFeatures } from '../tactical_value_search_20261018/features';
import { legalActions } from './policy_runtime';
const samples:Record<string,number[]>={tokens:[],context:[],summary:[],risk:[],summaryNoRisk:[],base:[],focus:[]},model=read('initial.json'),old=read('old-schema.json');
for(const item of read('browser-states.json')){
    const e=new GameEngine(item.state),legal=legalActions(e),stats:any={};
    const time=(k:string,f:()=>any)=>{const t=performance.now(),out=f();samples[k].push(performance.now()-t);return out;};
    const x=time('tokens',()=>stateTokens(e.getState(),old));time('context',()=>pooledContext(x,model));const risk=time('risk',()=>commanderRisks(e));time('summaryNoRisk',()=>stateSummary(e,risk));time('summary',()=>stateSummary(e));
    const b=time('base',()=>extractFeatures(e,legal));stats.base=b.stats;time('focus',()=>extendFeatures(e,legal));
}
const result=Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,quantiles(v)]));save('profile.json',result);console.log(result);
