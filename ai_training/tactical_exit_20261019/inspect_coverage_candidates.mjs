import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),base='revisions/r22/coverage-probe-1792424960789',read=n=>JSON.parse(fs.readFileSync(path.join(here,n),'utf8')),runtime=await import(pathToFileURL(path.join(here,base,'control.mjs'))),model=read('teacher-model.json'),old=read('old-schema.json'),fixtures=read(base+'/cases.json'),reports=[];
for(const item of fixtures){
    const info=runtime.inspect(item.state,model,old),order=info.root.prior.map((_,i)=>i).sort((a,b)=>info.root.prior[b]-info.root.prior[a]||a-b);
    const rows=info.legal.map((a,i)=>({code:runtime.encodeAction(a),index:i,prior:info.root.prior[i],priorRank:order.indexOf(i)+1,focus:info.root.x.focus[i],follow:info.root.x.extra[i].slice(0,4),represented:info.decision.traces.some(v=>v.index===i)})).filter(v=>v.code.startsWith('recruit_')||v.code===item.newRootCode);
    reports.push({slot:item.slot,row:item.row,preferred:info.decision.preferred,newRootCode:item.newRootCode,rows});
}
const out=path.join(here,'revisions/r22/coverage-candidate-details-'+Date.now()+'.json');fs.writeFileSync(out,JSON.stringify(reports),{flag:'wx'});console.log(JSON.stringify(reports));
