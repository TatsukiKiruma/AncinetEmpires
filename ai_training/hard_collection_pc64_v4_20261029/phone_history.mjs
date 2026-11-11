/** 关联旧手机实际启动与失败证据；不重置、修改或执行旧任务。 */
import path from 'node:path';
import {ROOT,OUT,read,save,fileSha,hash,originalJobs,tally} from './common.mjs';
const base=path.join(ROOT,'ai_training/hard_curriculum3000_execution_20261027');
const sources=['mi8-delivery-20261029/待补完整输入.json','mi8-delivery-20261029/FAILED_ATTEMPTS.json','samsung-v1/delivery-20261029/待补321局完整输入.json','samsung-v1/audit-20261029T045728Z/FAILED_ATTEMPTS.json'];
const documents=sources.map(name=>({name,path:path.join(base,name),sha256:fileSha(path.join(base,name)),content:read(path.join(base,name))}));
const failures=documents.filter(d=>d.name.endsWith('FAILED_ATTEMPTS.json')).flatMap(d=>d.content.map(a=>({...a,evidenceDocument:d.path,evidenceSha256:d.sha256})));
const gaps=documents.filter(d=>!d.name.endsWith('FAILED_ATTEMPTS.json')).flatMap(d=>d.content.jobs.map(j=>({input:j,evidenceDocument:d.path,evidenceSha256:d.sha256})));
save('ORIGINAL_PHONE_ATTEMPT_HISTORY.json',{created:new Date().toISOString(),phoneExecutionDisabled:true,oldBudgetsUnchanged:true,pcBudgetIsNewVersion:true,documents:documents.map(({content,...d})=>d),failedAttempts:failures.length,failuresByReason:tally(failures,a=>a.reason??a.status??'unknown'),gaps:gaps.map(g=>{const seq=g.input.executionSequence??g.input.job?.executionSequence??g.input.sequence;const j=originalJobs.find(j=>j.executionSequence===seq);return {...g,originalJobSha256:j?hash(j):null};})});
console.log(JSON.stringify({oldPhoneFailures:failures.length,gaps:gaps.length,documents:documents.length}));
