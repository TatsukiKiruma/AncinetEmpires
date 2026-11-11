import { VALUE_KEYS,SUMMARY_KEYS } from './value_state';
import { read,save,hash } from './io';
const model=read('initial.json'),policy=model.schema,keys=[...Array.from({length:260},(_,i)=>'pooled.'+i),...SUMMARY_KEYS,'army_difference'];
if(keys.length!==297)throw Error('Value字段数量不一致');
save('schema.json',{policy,policyInput151Unchanged:true,value:{version:'state-value-v5',keys,inputDimension:297,hidden:64,layerNormEpsilon:1e-5,residualArmyByPhase:true,commanderRisk:'每个指挥官原位、自己的对手回合，最多一次focusThreat，不执行根候选',summaryDtype:'float32',networkDtype:'float64',armyDifference:'已编码己方军力/1024减已编码敌方军力/1024',policyContextFrozen:true},schemaHash:hash({policy,keys})});
