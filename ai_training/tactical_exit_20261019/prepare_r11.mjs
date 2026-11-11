import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const read=n=>JSON.parse(fs.readFileSync(path.join(here,n),'utf8').replace(/^\uFEFF/,''));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const save=(n,v)=>fs.writeFileSync(path.join(here,n),JSON.stringify(v));
// 只重建内存中的数值包，不启动浏览器，也不修改已执行的浏览器包。
const built=await build({entryPoints:[path.join(here,'browser.ts')],bundle:true,outfile:path.join(here,'browser.js'),platform:'browser',target:'chrome120',write:false,metafile:true});
assert.equal(built.outputFiles.length,1);
assert.ok(Buffer.from(built.outputFiles[0].contents).equals(fs.readFileSync(path.join(here,'browser.js'))));
const bundleSha256=sha(path.join(here,'browser.js'));
assert.equal(bundleSha256,'e3a17dc9e19a86cce74c5a2da02c5ca3bb35cae00f94c8f7ed2e361b59559c30');
const previous=read('revisions/r10/reused-browser-numeric-evidence.json'),files={};
for(const relative of Object.keys(built.metafile.inputs)){
  const absolute=path.resolve(process.cwd(),relative),key=path.relative(repo,absolute).split(path.sep).join('/');
  const actual=sha(absolute);
  assert.equal(actual,previous.files[key].sha256,key);
  files[key]={sha256:actual,matchedPrevious:true};
}
const receipts={};
for(const name of ['initial','teacher']){
  const old='revisions/r6/browser-'+name+'.json',receipt=read(old);
  assert.ok(receipt.passed&&receipt.argmax&&receipt.expertBatchChecks>=2);
  for(const [file,expected] of Object.entries(receipt.fileSha256)) assert.equal(sha(path.join(here,file)),expected,file);
  receipts[name]={receiptSha256:sha(path.join(here,old)),userAgent:receipt.userAgent};
  fs.copyFileSync(path.join(here,old),path.join(here,'revisions/r11/browser-'+name+'.json'));
}
const evidence='revisions/r11/reused-browser-numeric-evidence.json';
save(evidence,{passed:true,mode:'reuse-prior-real-chrome-with-identical-numeric-bundle',priorRevision:'r6',newChromeExecution:false,bundleSha256,files,...receipts,previousEvidence:'revisions/r10/reused-browser-numeric-evidence.json',previousEvidenceSha256:sha(path.join(here,'revisions/r10/reused-browser-numeric-evidence.json')),reason:'策略及Value数值图、输入与权重逐字节未变；叶子风险记账不进入数值包。本收据是已执行Chrome证据复用，不是新执行。'});
const ready=read('r11-pre-browser-ready.json');
assert.ok(ready.passed&&ready.freshSearchCalibration&&read('fresh-search-calibration-gate.json').passed);
assert.equal(ready.coreSha256,sha(path.join(here,'model_battle_search_ai.ts')));
assert.equal(ready.leafSha256,sha(path.join(here,'leaf.ts')));
assert.equal(ready.teacherModelSha256,sha(path.join(here,'teacher-model.json')));
fs.copyFileSync(path.join(here,'causal-guard-review.json'),path.join(here,'revisions/r11/previous-causal-guard-review.json'));
save('causal-guard-review.json',{passed:true,coreSha256:ready.coreSha256,leafSha256:ready.leafSha256,regressions:Object.keys(ready.proofs),rankScoreGate:'rank-score-gate.json',freshSearchCalibration:'fresh-search-calibration-gate.json',armyRiskAccounting:'army-risk-red-green-gate.json',productiveRealWitness:'productive-real-witness-gate.json',searchCalibration:'search-scale/teacher-calibration.json',scope:'风险记账、计划执行与重新采集校准的前置复核，不代表实战资格'});
save('r11-ready.json',{...ready,browserChecks:{reusedFromRevision:'r6',identicalBundleSha256:bundleSha256,evidence,newChromeExecution:false},searchCalibrationSha256:sha(path.join(here,'search-scale/teacher-calibration.json')),searchPriorConfigSha256:sha(path.join(here,'search_prior_config.ts'))});
save('TASK_STATE.json',{status:'running',complete:false,phase:'r11前置复核通过，准备完整150槽教师资格；尚无合格教师或专家自走'});
console.log(JSON.stringify({passed:true,bundleSha256,sourceFiles:Object.keys(files).length,coreSha256:ready.coreSha256}));
