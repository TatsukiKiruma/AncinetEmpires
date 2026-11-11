import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';
import { infer } from './policy_runtime';
import { read,save } from './io';
const model=read('teacher-model.json'),old=read('old-schema.json'),rows:any[]=[];
for(const [i,item] of read('browser-states.json').entries()){
    const root=infer(new GameEngine(item.state),item.codes.map(decodeAction),model,old),best=root.prior.reduce((b,v,j)=>v>root.prior[b]+1e-10?j:b,0);
    const ranked=root.prior.map((_,j)=>j).sort((a,b)=>root.prior[b]-root.prior[a]||a-b),preferred=root.out.best,group=root.x.actionGroups[preferred];
    const members=root.x.actionGroups.map((g,j)=>g===group?j:-1).filter(j=>j>=0).sort((a,b)=>root.out.logits[b]-root.out.logits[a]||a-b);
    rows.push({i,candidates:root.x.codes.length,preferred:root.x.codes[preferred],jointBest:root.x.codes[best],preferredGroup:group,jointBestGroup:root.x.actionGroups[best],mismatch:preferred!==best,preferredRank:ranked.indexOf(preferred)+1,preferredGroupSecondRank:members[1]===undefined?null:ranked.indexOf(members[1])+1});
}
const result={states:rows.length,mismatches:rows.filter(r=>r.mismatch).length,rows};save('search-prior-diagnostic.json',result);console.log(result);
