import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createInterface} from 'node:readline';
import {OUT,sha,verifyFreeze,encodeAndLabel} from './recovery_core';
const start=Date.now(),manifest=JSON.parse(fs.readFileSync(path.join(OUT,'package/manifest.json'),'utf8'));
assert.equal(verifyFreeze(),manifest.freezeIdentity);
for(const entry of manifest.files)assert.equal(sha(fs.readFileSync(path.join(OUT,'package',entry.file))),entry.sha256);
const inputs=new Set(),families=new Map(),episodes=new Map(),counts:any={};let checked=0;
for(const split of ['train','validation']){
 const lines=createInterface({input:fs.createReadStream(path.join(OUT,'package',split+'.jsonl'))});counts[split]=0;
 for await(const line of lines){const row=JSON.parse(line),fresh=encodeAndLabel(row.stateJson);
  assert.equal(fresh.inputHash,row.inputHash);assert.equal(fresh.stateHash,row.stateHash);assert.equal(fresh.targetActionIndex,row.targetActionIndex);
  for(const key of ['spatial','global','candidateActorCoords','candidateLandingCoords','candidateTargetCoords','candidateSemantics','orderedActionCodes'])assert.deepEqual(row[key],fresh[key]);
  assert.equal(row.valueLossMask,false);assert.equal(row.valueTarget,null);assert.equal(row.split,split);assert.ok(!inputs.has(row.inputHash));inputs.add(row.inputHash);
  assert.ok(!families.has(row.familyId)||families.get(row.familyId)===split);families.set(row.familyId,split);
  for(const p of row.allProvenance){assert.equal(p.historicalFullReplayPassedUnderCurrentRules,false);assert.equal(p.oldLabelsUsed,false);assert.ok(!episodes.has(p.sourceEpisode)||episodes.get(p.sourceEpisode)===split);episodes.set(p.sourceEpisode,split);}
  counts[split]++;checked++;
 }
}
assert.equal(checked,manifest.uniqueInputs);assert.equal(counts.train,manifest.train);assert.equal(counts.validation,manifest.validation);
const report={passed:true,checkedRows:checked,counts,allRowsReencodedAndRelabelled:true,artifactHashesVerified:true,frozenIdentityVerified:true,uniqueNumericInputs:true,crossSplitInputOverlap:0,crossSplitFamilyOverlap:0,crossSplitEpisodeOverlap:0,elapsedMs:Date.now()-start,limits:'不验证旧整局可达性；不构成R7最终跨任务去重或新独立验收'};
fs.writeFileSync(path.join(OUT,'package_verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
