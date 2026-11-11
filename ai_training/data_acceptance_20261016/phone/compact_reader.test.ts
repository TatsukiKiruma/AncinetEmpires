import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { gunzipSync, gzipSync } from 'node:zlib';
import { inspectAndRead, type Admission, confinedFile } from './compact_reader';

const root=path.dirname(fileURLToPath(import.meta.url));
function entry(id:string):Admission{
  const r=JSON.parse(fs.readFileSync(path.join(root,'full_v6/receipts',id+'.json'),'utf8'));
  const shard='full_v6/'+r.candidateShard;
  return {segmentId:id,parentId:r.parentId,receipt:'full_v6/receipts/'+id+'.json',candidateShard:shard,
    shardSha256:createHash('sha256').update(fs.readFileSync(path.join(root,shard))).digest('hex'),
    inputHash:r.inputHash,sourceIdentity:r.sourceIdentity,globalOffset:0,
    maxGlobalMacroExclusive:r.summary.maxAdmissibleGlobalMacroExclusive,
    policyLabelEligible:true,modelSchemaAccepted:false,valueEligible:false,returnEligible:false,
    nativeWinningAllianceId:r.summary.nativeWinner,outcomeKind:'test-only'};
}

test('真实已完成分片可完整读取，宏权重为1且结果mask保持',async()=>{
  let count=0;const e=entry('s0005');
  const result=await inspectAndRead(root,e,row=>{assert.equal(row.valueMask,false);assert.equal(row.outcomeTarget,null);assert.equal(row.modelSchemaAccepted,false);count++;});
  assert.equal(count,result.admittedAtoms);assert.equal(result.admittedMacros,407);
});

test('失败宏步全部撤回，不发布已写的半条计划',async()=>{
  const e=entry('s0003');let maximum=-1;
  const result=await inspectAndRead(root,e,row=>{maximum=Math.max(maximum,row.macro);});
  assert.equal(maximum,e.maxGlobalMacroExclusive-1);
  assert.ok(result.allCandidateAtoms>result.admittedAtoms);
  await assert.rejects(()=>inspectAndRead(root,{...e,maxGlobalMacroExclusive:e.maxGlobalMacroExclusive+1}),/范围/);
});

test('摘要、身份与越界文件引用被拒绝',async()=>{
  const e=entry('s0005');
  await assert.rejects(()=>inspectAndRead(root,{...e,inputHash:'bad'}),/身份/);
  await assert.rejects(()=>inspectAndRead(root,{...e,shardSha256:'bad'}),/SHA/);
  assert.throws(()=>confinedFile(root,'../../../../.git/config'),/越过/);
});

test('已知SHA但gzip尾损坏及宏组残缺时，发布回调保持零次',async()=>{
  const e=entry('s0005'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ae-compact-test-'));
  try{
    fs.copyFileSync(path.join(root,e.receipt),path.join(dir,'receipt.json'));
    const original=fs.readFileSync(path.join(root,e.candidateShard));
    const broken=Buffer.from(original);broken[broken.length-8]^=1;
    const fixture={...e,receipt:'receipt.json',candidateShard:'data.gz'};
    let emitted=0;
    async function reject(bytes:Buffer){
      fs.writeFileSync(path.join(dir,'data.gz'),bytes);
      await assert.rejects(()=>inspectAndRead(dir,{...fixture,shardSha256:createHash('sha256').update(bytes).digest('hex')},()=>{emitted++;}));
      assert.equal(emitted,0);
    }
    await reject(broken);
    const lines=gunzipSync(original).toString().trim().split('\n').map(s=>JSON.parse(s));
    const index=lines.findIndex(r=>r.kind==='action'&&r.macroAtoms>1&&r.subAction===1);
    assert.ok(index>0);lines.splice(index,1);
    await reject(gzipSync(lines.map(r=>JSON.stringify(r)).join('\n')+'\n'));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('缺权重、动作及联盟字段不能成为标签；自然联盟目标不逐原子翻符号',async()=>{
  const e=entry('s0005'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ae-label-test-'));
  try{
    fs.copyFileSync(path.join(root,e.receipt),path.join(dir,'receipt.json'));
    const original=fs.readFileSync(path.join(root,e.candidateShard));
    const text=gunzipSync(original).toString().trim();
    let emitted=0;
    for(const field of ['weight','code','actor','alliance']){
      const parsed=text.split('\n').map(s=>JSON.parse(s));delete parsed.find(r=>r.kind==='action')[field];
      const bytes=gzipSync(parsed.map(r=>JSON.stringify(r)).join('\n')+'\n');fs.writeFileSync(path.join(dir,'data.gz'),bytes);
      await assert.rejects(()=>inspectAndRead(dir,{...e,receipt:'receipt.json',candidateShard:'data.gz',shardSha256:createHash('sha256').update(bytes).digest('hex')},()=>{emitted++;}));
    }
    assert.equal(emitted,0);
    fs.writeFileSync(path.join(dir,'data.gz'),original);
    fs.mkdirSync(path.join(dir,'full_v6/receipts'),{recursive:true});
    const receiptBytes=fs.readFileSync(path.join(root,e.receipt));
    fs.writeFileSync(path.join(dir,'full_v6/receipts',e.segmentId+'.json'),receiptBytes);
    const evidence=Buffer.from(JSON.stringify({parentId:e.parentId,sourceIdentity:e.sourceIdentity,nativeWinningAllianceId:e.nativeWinningAllianceId,
      outcomeKind:'natural_terminal',allSegmentsStrict:true,segmentIds:[e.segmentId],
      segmentReceiptHashes:[{id:e.segmentId,sha256:createHash('sha256').update(receiptBytes).digest('hex')}]}));
    fs.writeFileSync(path.join(dir,'value.json'),evidence);
    const qualified={...e,receipt:'receipt.json',candidateShard:'data.gz',outcomeKind:'natural_terminal',valueEligible:true,
      valueEvidence:{path:'value.json',sha256:createHash('sha256').update(evidence).digest('hex')}};
    const targets=new Set<number>();
    await inspectAndRead(dir,qualified,row=>{assert.equal(row.outcomeTarget,row.alliance===e.nativeWinningAllianceId?1:-1);targets.add(row.outcomeTarget);});
    assert.deepEqual([...targets].sort(),[-1,1]);
    await assert.rejects(()=>inspectAndRead(dir,{...qualified,nativeWinningAllianceId:999}),/赢家/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
