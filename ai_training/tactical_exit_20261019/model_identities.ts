import fs from 'node:fs';
import path from 'node:path';
import { read,save,hash,sha,DIR } from './io';
const phase=process.argv[2]??'development',files:Record<string,string>={hierarchical:'../tactical_scale_20261018/group-best.json',pure:'../tactical_value_search_20261018/model-final.json',teacher_search:'teacher-model.json',stage5_pure:'model-final.json',stage5_search:'model-final.json'};
const models=Object.fromEntries(Object.entries(files).filter(([,file])=>fs.existsSync(path.resolve(DIR,file))).map(([name,file])=>[name,{file:path.resolve(DIR,file),fileSha256:sha(fs.readFileSync(path.resolve(DIR,file))),semanticSha256:hash(read(file))}]));
if(models.teacher_search){const t=read('teacher-model.json'),p=read(files.pure);if(JSON.stringify(t.weights)!==JSON.stringify(p.weights)||JSON.stringify(t.schema.groupTypeBias)!==JSON.stringify(p.schema.groupTypeBias))throw Error('教师策略权重与阶段4不一致');}
const proposalFile='base-policy-final.json',proposal={file:path.resolve(DIR,proposalFile),fileSha256:sha(fs.readFileSync(path.resolve(DIR,proposalFile))),semanticSha256:hash(read(proposalFile)),role:'复用根编码的独立扩量策略候选提议；不替换主策略默认或Value',maximumAdditionalRootForwards:1};
save(`${phase}-model-identities.json`,{models,proposal,teacherPolicyEqualsStage4:true});
