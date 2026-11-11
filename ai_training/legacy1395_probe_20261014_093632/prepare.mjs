import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const out=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(out,'../..');
const prior=path.join(root,'ai_training/legacy2500_recovery_20261014_090431');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const receipt=JSON.parse(fs.readFileSync(path.join(root,'ai_training/v19/out/data_scale_20261003/recovered_s0/manifest.json')));
const oldFiles=[];function collect(v){if(!v||typeof v!=='object')return;if(v.path&&v.sha256)oldFiles.push(v);for(const x of Object.values(v))collect(x);}collect(receipt.sourceDigests);
const entries=[];
for(const name of ['env','apk_terrain','terrain_rules','abilities','rule_config']){
 const original=execFileSync('git',['show',`${commit}:src/game/${name}.ts`],{cwd:root,maxBuffer:10*1024*1024});
 const expected=oldFiles.find(f=>f.path===`src/game/${name}.ts`)?.sha256;
 const lf=original.toString('utf8').replace(/\r\n/g,'\n');
 const match=sha(original)===expected||sha(lf.replace(/\n/g,'\r\n'))===expected;
 if(expected&&!match)throw Error(`旧恢复凭证与Git源码不符 ${name}`);
 // 旧模块只负责读取历史观测语义；env中的引擎、合法动作与执行仍引用R7冻结实现，禁止调用旧env.step。
 const transformed=lf.replace(/from '\.\/([^']+)'/g,(_,dep)=>`from '${['apk_terrain','terrain_rules','abilities','rule_config'].includes(dep)?'./'+dep:'../' + path.basename(prior)+'/frozen/src/game/'+dep}'`);
 fs.writeFileSync(path.join(out,name+'.ts'),transformed);
 entries.push({name,gitCommit:commit,gitPath:`src/game/${name}.ts`,gitSha256:sha(original),historicalReceiptSha256:expected??null,historicalReceiptMatches:expected?match:null,localSha256:sha(transformed)});
}
fs.writeFileSync(path.join(out,'codec_identity.json'),JSON.stringify({entries,ruleFreeze:JSON.parse(fs.readFileSync(path.join(prior,'freeze_manifest.json'))).ruleVersion,note:'历史观测序列化仅用于匹配原记录身份；动作执行和合法校验始终使用R7冻结环境，不改规则'},null,2));
console.log(JSON.stringify(entries.map(e=>({name:e.name,receiptMatch:e.historicalReceiptMatches}))));
