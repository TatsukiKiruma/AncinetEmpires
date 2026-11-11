/** 复用冻结准入器只读复算标签与权重，不写训练回执或更新排重索引。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expertSamples } from '../../execution_v5/expert_source';
import { ruleStateHash } from '../../../data_acceptance_20261016/replay/core';
import { getAllianceId } from '../../../../src/game/rule_config';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const result:any={qualification:'原训练回执excludedByCanonical均为0；复用权威准入器与canonical去重重算，并核对最终样本总数。只写诊断目录。',generations:{}};
for(const gen of [1,2]){
    const source:any={},seen=new Set<string>();let duplicates=0,emitted=0,policy=0,value=0;
    for await(const s of expertSamples(path.join(root,`execution_v5/generations/gen_0${gen}/expert-manifest.json`),new Set())){
        const canonical=ruleStateHash(s.state);if(seen.has(canonical)){duplicates++;continue;}seen.add(canonical);emitted++;
        const sourceName=s.origin,winning=s.valueMask?getAllianceId(s.state,s.state.currentPlayer)===s.winner:null;
        const row=source[sourceName]??={samples:0,policy:0,value:0,policyWeight:0,valueWeight:0,softEntropyWeight:0,softTopProbabilitySum:0,softRows:0,winner:0,loser:0,unknown:0};
        row.samples++;row.policy+=Number(s.policyMask);row.value+=Number(s.valueMask);
        row[winning===null?'unknown':winning?'winner':'loser']++;
        const pw=s.weight*(s.normalizationScale??1)*(sourceName==='search-expert'?4:1)*Number(s.policyMask);
        const vw=s.weight*(s.normalizationScale??1)*Number(s.valueMask);
        row.policyWeight+=pw;row.valueWeight+=vw;policy+=Number(s.policyMask);value+=Number(s.valueMask);
        if(s.searchTarget){
            const scores=new Map<string,number>();for(const t of s.searchTarget)scores.set(t.code,Math.max(scores.get(t.code)??-Infinity,t.score));
            const a=[...scores.values()],mx=Math.max(...a),e=a.map(v=>Math.exp((v-mx)/.5)),sum=e.reduce((a,b)=>a+b,0),p=e.map(v=>v/sum);
            row.softEntropyWeight+=pw*-p.reduce((s,p)=>s+(p?p*Math.log(p):0),0);
            row.softTopProbabilitySum+=Math.max(...p);row.softRows++;
        }
    }
    const expected=gen===1?73485:93266;if(emitted!==expected)throw Error(`准入量与回执不一致：${gen}/${emitted}/${expected}`);
    result.generations[gen]={emitted,duplicates,policy,value,sources:source};console.log(JSON.stringify({gen,emitted,duplicates,policy,value,sources:source}));
}
fs.writeFileSync(path.join(here,'label-mass.json'),JSON.stringify(result,null,2));
