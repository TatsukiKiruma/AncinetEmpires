import proposalModel from './base-policy-final.json';
import { forwardGroup } from './group_model';
import { hierarchicalPrior } from './hierarchical_prior';
import type { Inference } from './policy_runtime';

/** 复用与权重无关的根编码，只补一次扩量策略前向；不访问引擎或分支。 */
export function proposeRootCandidate(root:Inference,represented:number[]){
    const out=forwardGroup(root.x,proposalModel),prior=hierarchicalPrior(root.x.actionGroups,out.groupNames,out.groupLogits,out.logits);
    // 两个策略已经共同覆盖首选时不补更低排名动作，避免无依据挤掉现有安全解。
    return {index:represented.includes(out.best)?undefined:out.best,out,prior};
}
