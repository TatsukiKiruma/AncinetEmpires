/** 搜索置信分保持分层解码的组优先级，不受组内归一化常数额外惩罚。 */
export function hierarchicalPrior(groups:string[],names:string[],groupLogits:number[],logits:number[]){
    const maximum=Math.max(...groupLogits),out=Array(logits.length).fill(-Infinity);
    names.forEach((name,g)=>{
        const members=groups.map((v,i)=>v===name?i:-1).filter(i=>i>=0),within=Math.max(...members.map(i=>logits[i]));
        for(const i of members)out[i]=groupLogits[g]-maximum+logits[i]-within;
    });
    return out;
}
