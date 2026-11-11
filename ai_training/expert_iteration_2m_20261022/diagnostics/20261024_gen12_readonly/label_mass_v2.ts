/** 按已保存的实际消费状态集合重建权重；只写诊断目录，不改动态排除索引。 */
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expertSamples } from '../../execution_v5/expert_source';
import { ruleStateHash } from '../../../data_acceptance_20261016/replay/core';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const sha=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const contexts=[1,2].map(gen=>{
    const prefix=`v5_gen_0${gen}`,name=fs.readdirSync(path.join(root,'stream-receipts')).find(n=>n.startsWith(prefix)&&n.includes('-e0-c0-train.json'))!;
    const receiptPath=path.join(root,'stream-receipts',name),receipt=read(receiptPath);
    const statePath=path.join(root,'execution_v5/state-receipts',name.replace('.json','.txt.gz'));
    const allowed=new Set(gunzipSync(fs.readFileSync(statePath)).toString().trim().split('\n'));
    const manifest=read(path.join(root,`execution_v5/generations/gen_0${gen}/expert-manifest.json`));
    const ids=new Set<string>(manifest.games.map((g:any)=>read(path.join(g.directory,'started.json')).job.id));
    const meanSteps=manifest.games.reduce((sum:number,g:any)=>sum+read(path.join(g.directory,'result.json')).steps,0)/manifest.games.length;
    if(allowed.size!==receipt.emitted)throw Error('状态回执数量失配');
    return {gen,receipt,allowed,ids,meanSteps,seen:new Set<string>(),sources:{} as Record<string,any>,parents:{} as Record<string,any>,emitted:0,policy:0,value:0,notConsumed:0,duplicate:0,identity:{receiptPath,receiptSha256:sha(receiptPath),statePath,stateSha256:sha(statePath)}};
});
let count=0;
for await(const sample of expertSamples(path.join(root,'execution_v5/generations/gen_02/expert-manifest.json'),new Set())){
    const canonical=ruleStateHash(sample.state);
    for(const c of contexts){
        if(!c.ids.has(sample.parentId))continue;
        if(!c.allowed.has(canonical)){c.notConsumed++;continue;}
        if(c.seen.has(canonical)){c.duplicate++;continue;}
        c.seen.add(canonical);c.emitted++;c.policy+=Number(sample.policyMask);c.value+=Number(sample.valueMask);
        const p=c.parents[`replay:${sample.parentId}`]??={policy:0,value:0};
        p.policy+=Number(sample.policyMask);p.value+=Number(sample.valueMask);
        const r=c.sources[sample.origin]??={samples:0,policy:0,value:0,policyWeight:0,valueWeight:0,softRows:0,softEntropyWeight:0};
        r.samples++;r.policy+=Number(sample.policyMask);r.value+=Number(sample.valueMask);
        const pw=sample.weight*c.meanSteps*(sample.origin==='search-expert'?4:1)*Number(sample.policyMask);
        r.policyWeight+=pw;r.valueWeight+=sample.weight*c.meanSteps*Number(sample.valueMask);
        if(sample.searchTarget){
            const scores=new Map<string,number>();
            for(const t of sample.searchTarget)scores.set(t.code,Math.max(scores.get(t.code)??-Infinity,t.score));
            const a=[...scores.values()],mx=Math.max(...a),e=a.map(v=>Math.exp((v-mx)/.5)),sum=e.reduce((a,b)=>a+b,0),prob=e.map(v=>v/sum);
            r.softRows++;r.softEntropyWeight+=pw*-prob.reduce((s,p)=>s+(p?p*Math.log(p):0),0);
        }
    }
    if(++count%10000===0)console.log(JSON.stringify({rawEligible:count,emitted:contexts.map(c=>c.emitted)}));
}
const generations:any={};
for(const c of contexts){
    if(c.emitted!==c.receipt.emitted||c.policy!==c.receipt.policyCount||c.value!==c.receipt.valueCount)throw Error(`消费总量失配：${c.gen}`);
    for(const [id,r] of Object.entries(c.receipt.consumed) as [string,any][]){
        if(c.parents[id]?.policy!==r.policy||c.parents[id]?.value!==r.value)throw Error(`父局消费量失配：${c.gen}/${id}`);
    }
    const expected:Record<string,number>={};
    for(const [k,n] of Object.entries(c.receipt.distribution) as [string,number][])expected[k.split('/')[0]]=(expected[k.split('/')[0]]??0)+n;
    for(const [source,n] of Object.entries(expected))if(c.sources[source]?.samples!==n)throw Error(`来源量失配：${c.gen}/${source}`);
    const {seen,allowed,ids,receipt,parents,...summary}=c;
    generations[c.gen]={...summary,checks:'总量、Policy/Value、每父局及每来源计数均与历史消费回执一致'};
}
const output=path.join(here,'label-mass-v2.json');
fs.writeFileSync(output,JSON.stringify({qualification:'消费状态回执约束的重建。复用冻结expertSamples与权威引擎，按当时代已消费canonical集合筛选并保留首条。不是从现有动态排除索引独立重演历史准入；未证明重复canonical的首条beforeHash身份全部一致。计数与每父局/来源断言用于验证标签权重统计。旧label_mass.ts的空排除集失败不代表训练故障。',generations},null,2),{flag:'wx'});
console.log(JSON.stringify({saved:output,generations}));
