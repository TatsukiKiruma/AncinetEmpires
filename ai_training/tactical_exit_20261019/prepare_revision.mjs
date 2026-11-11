import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),revision=process.argv[2]??'r12',previousRevision=process.argv[3]??'r11',folder=`revisions/${revision}`;
const read=n=>JSON.parse(fs.readFileSync(path.join(here,n),'utf8').replace(/^\uFEFF/,'')),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),save=(n,v)=>fs.writeFileSync(path.join(here,n),JSON.stringify(v));
// 旧版本仅在数值包完全相同时复用；R18起源码变化必须核对新的真实Chrome收据。
const built=await build({entryPoints:[path.join(here,'browser.ts')],bundle:true,outfile:path.join(here,'browser.js'),platform:'browser',target:'chrome120',write:false,metafile:true});
assert.equal(built.outputFiles.length,1);assert.ok(Buffer.from(built.outputFiles[0].contents).equals(fs.readFileSync(path.join(here,'browser.js'))));
const bundleSha256=sha(path.join(here,'browser.js'));
let evidence;
if(Number(revision.slice(1))>=18){
    const files={};for(const relative of Object.keys(built.metafile.inputs)){const absolute=path.resolve(process.cwd(),relative),key=path.relative(repo,absolute).split(path.sep).join('/');files[key]=sha(absolute);}
    const receipts={};
    for(const name of ['initial','teacher','proposal']){
        const receipt=read(`browser-${name}.json`);assert.ok(receipt.passed&&receipt.argmax&&receipt.expertBatchChecks>=2&&receipt.executedAt);
        for(const key of ['maxForwardError','maxGradientError','maxLossError'])assert.ok(receipt[key]<1e-8);
        assert.equal(receipt.numericCodeBinding.bundleSha256,bundleSha256);assert.deepEqual(receipt.numericCodeBinding.sourceFiles,files);
        for(const [file,expected] of Object.entries(receipt.fileSha256))assert.equal(sha(path.join(here,file)),expected,file);
        assert.deepEqual(read(`numeric-model-${name}.json`),read({initial:'initial.json',teacher:'teacher-model.json',proposal:'base-policy-final.json'}[name]));
        receipts[name]={receiptSha256:sha(path.join(here,`browser-${name}.json`)),executedAt:receipt.executedAt,userAgent:receipt.userAgent};
        fs.copyFileSync(path.join(here,`browser-${name}.json`),path.join(here,folder,`browser-${name}.json`));
    }
    const preflight=read(`${revision}-pre-browser-ready.json`);
    if(preflight.valueHeadChange){assert.ok(read('revisions/r19/cache-consistency-gate.json').passed&&read('revisions/r19/candidate-scalars-exact.json').allRecordsExact&&read('revisions/r19/cache-full-witness-gate.json').passed);const change=read(`${folder}/candidate-scalars-exact.json`);assert.ok(change.passed&&change.valueOnlyModelChange&&change.rootInputAndPrimaryExact&&change.rootCoverageExact&&change.policyConfidenceExact);assert.equal(preflight.valueHeadChange.adoptionSha256,sha(path.join(here,'value-continuation-adoption.json')));}
    else if(preflight.sameUnitCompletionChange){assert.ok(read(`${folder}/cache-consistency-gate.json`).passed&&read(preflight.sameUnitCompletionChange.performanceGate).passed&&read(preflight.sameUnitCompletionChange.regressionGate).passed);const comparison=read(preflight.sameUnitCompletionChange.comparison);assert.ok(comparison.passed&&(comparison.sameUnitCompletionChange||comparison.safeRecruitmentCoverageChange||comparison.rootCapacityChange)&&comparison.rootInputAndPrimaryExact&&comparison.policyConfidenceExact);}
    else{assert.ok(read(`${folder}/cache-consistency-gate.json`).passed);assert.ok(read(`${folder}/candidate-scalars-exact.json`).allRecordsExact);}
    evidence=`${folder}/browser-numeric-evidence.json`;save(evidence,{passed:true,mode:'source-bound-real-chrome',newChromeExecution:true,perModelNewChromeExecution:preflight.valueHeadChange?{initial:false,teacher:true,proposal:false}:{initial:true,teacher:true,proposal:true},reuseReason:preflight.valueHeadChange?'初始及提议沿用R19实际收据，源码/包/输入/权重逐项相同；新Value教师已新执行Chrome':null,bundleSha256,files,receipts});
}else{
assert.equal(bundleSha256,'e3a17dc9e19a86cce74c5a2da02c5ca3bb35cae00f94c8f7ed2e361b59559c30');
const priorEvidence=`revisions/${previousRevision}/reused-browser-numeric-evidence.json`,previous=read(priorEvidence),files={};
for(const relative of Object.keys(built.metafile.inputs)){const absolute=path.resolve(process.cwd(),relative),key=path.relative(repo,absolute).split(path.sep).join('/'),actual=sha(absolute);assert.equal(actual,previous.files[key].sha256,key);files[key]={sha256:actual,matchedPrevious:true};}
const receipts={};
for(const name of ['initial','teacher']){const old=`revisions/r6/browser-${name}.json`,receipt=read(old);assert.ok(receipt.passed&&receipt.argmax&&receipt.expertBatchChecks>=2);for(const [file,expected] of Object.entries(receipt.fileSha256))assert.equal(sha(path.join(here,file)),expected,file);receipts[name]={receiptSha256:sha(path.join(here,old)),userAgent:receipt.userAgent};fs.copyFileSync(path.join(here,old),path.join(here,folder,`browser-${name}.json`));}
evidence=`${folder}/reused-browser-numeric-evidence.json`;save(evidence,{passed:true,mode:'reuse-prior-real-chrome-with-identical-numeric-bundle',priorRevision:'r6',newChromeExecution:false,bundleSha256,files,...receipts,previousEvidence:priorEvidence,previousEvidenceSha256:sha(path.join(here,priorEvidence)),reason:'策略及Value数值图、输入与权重逐字节未变；搜索部署不进入数值包。本收据是已执行Chrome证据复用，不是新执行。'});
}
const ready=read(`${revision}-pre-browser-ready.json`);assert.ok(ready.passed&&ready.freshSearchCalibration&&read('fresh-search-calibration-gate.json').passed);
if(ready.safeRecruitmentCoverageChange){const change=ready.safeRecruitmentCoverageChange,r=read(change.regressionGate);assert.ok(r.passed&&change.originalSixPreserved&&change.commonCandidatePhysicalLeavesExact&&change.maximumRootReplacements===1);assert.equal(r.coreSha256,ready.coreSha256);assert.equal(r.coverageSha256,sha(path.join(here,'safe_recruitment_coverage.ts')));}
if(ready.rootCapacityExpansion){const c=ready.rootCapacityExpansion,r=read(c.regressionGate);assert.ok(r.passed&&r.originalTwelvePreserved&&c.topK===16&&c.maximumOwnNodes===400&&c.allOldCandidateScalarsExact);assert.equal(r.budgetSha256,sha(path.join(here,'search_budget.ts')));}
for(const [key,file] of [['coreSha256','model_battle_search_ai.ts'],['leafSha256','leaf.ts'],['teacherModelSha256','teacher-model.json']])assert.equal(ready[key],sha(path.join(here,file)));
if(ready.rootProposal){for(const [key,file] of [['modelSha256','base-policy-final.json'],['sourceSha256','candidate_proposal.ts'],['browserReceiptSha256','browser-proposal.json'],['reuseGateSha256','proposal-reuse-gate.json']])assert.equal(ready.rootProposal[key],sha(path.join(here,file)));const receipt=read('browser-proposal.json');assert.ok(receipt.passed&&receipt.argmax&&receipt.expertBatchChecks>=2);for(const [file,expected] of Object.entries(receipt.fileSha256))assert.equal(sha(path.join(here,file)),expected,file);assert.deepEqual(read('numeric-model-proposal.json'),read('base-policy-final.json'));}
if(ready.registeredCapacityChange){const capacity=ready.registeredCapacityChange;assert.equal(capacity.budgetSha256,sha(path.join(here,'search_budget.ts')));assert.equal(capacity.speedGateSha256,sha(path.join(here,'search-capacity-speed-gate.json')));const speed=read('search-capacity-speed-gate.json'),topK=ready.rootCapacityExpansion?16:12,nodes=ready.rootCapacityExpansion?400:300;assert.ok(speed.passed&&speed.coreSha256===ready.coreSha256&&capacity.topK===topK&&capacity.maxFollowNodes===24&&capacity.maximumOwnNodes===nodes&&speed.topK===topK&&speed.maximumOwnNodes===nodes);}
const priorReview=path.join(here,folder,'previous-causal-guard-review.json');if(!fs.existsSync(priorReview))fs.copyFileSync(path.join(here,'causal-guard-review.json'),priorReview);
save('causal-guard-review.json',{passed:true,coreSha256:ready.coreSha256,leafSha256:ready.leafSha256,regressions:Object.keys(ready.proofs),rankScoreGate:'rank-score-gate.json',freshSearchCalibration:'fresh-search-calibration-gate.json',armyRiskAccounting:'army-risk-red-green-gate.json',deployment:'deployment-red-green-gate.json',deploymentRealWitness:'deployment-real-witness-gate.json',productiveRealWitness:'productive-real-witness-gate.json',searchCalibration:'search-scale/teacher-calibration.json',scope:'风险、部署真实叶子及重新校准的前置复核，不代表实战资格'});
save(`${revision}-ready.json`,{...ready,browserChecks:{reusedFromRevision:Number(revision.slice(1))>=18?null:'r6',identicalBundleSha256:bundleSha256,evidence,newChromeExecution:Number(revision.slice(1))>=18},searchCalibrationSha256:sha(path.join(here,'search-scale/teacher-calibration.json')),searchPriorConfigSha256:sha(path.join(here,'search_prior_config.ts'))});
save('TASK_STATE.json',{status:'running',complete:false,phase:revision+'前置复核通过，准备完整150槽教师资格；尚无合格教师或专家自走'});console.log(JSON.stringify({passed:true,revision,bundleSha256,sourceFiles:Object.keys(read(evidence).files).length,coreSha256:ready.coreSha256}));
