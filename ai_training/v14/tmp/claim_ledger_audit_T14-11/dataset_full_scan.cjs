// T14-11 独立复核：dataset_v14.jsonl 全量扫描 partition × lineage 交集 + stateHash 重复 + targetType 分布
const fs = require('fs');
const P = 'C:/code/AncinetEmpires/v14/out/v14_20260924_t14/T14-02/dataset_v14.jsonl';
const t0 = Date.now();
const fd = fs.openSync(P, 'r');
const buf = Buffer.alloc(1 << 24);
let carry = '', n, rows = 0;
const partLineage = {}, partFamily = {};
const stateSeen = new Map();
let dupState = 0;
const targetType = {}, candType = {};
const perPartRows = {};
const sampleIdSeen = new Set(); let dupSampleId = 0;
const candSum = { stored: 0, policy: 0, engine: 0, filtered: 0 };
let invariantViolations = 0; const violationExamples = [];
while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
  const chunk = carry + buf.subarray(0, n).toString('utf8');
  let s = 0, idx;
  while ((idx = chunk.indexOf('\n', s)) >= 0) {
    const line = chunk.slice(s, idx); s = idx + 1;
    if (!line) continue;
    const o = JSON.parse(line);
    rows++;
    perPartRows[o.partition] = (perPartRows[o.partition] || 0) + 1;
    (partLineage[o.partition] ||= new Set()).add(o.lineageId);
    (partFamily[o.partition] ||= new Set()).add(o.rootFamilyId);
    if (stateSeen.has(o.stateHash)) dupState++; else stateSeen.set(o.stateHash, o.partition);
    if (sampleIdSeen.has(o.sampleId)) dupSampleId++; else sampleIdSeen.add(o.sampleId);
    const t = o.targetActionCode.split(':')[0];
    targetType[t] = (targetType[t] || 0) + 1;
    for (const c of o.candidateActionCodes) { const k = c.split(':')[0]; candType[k] = (candType[k] || 0) + 1; }
    candSum.stored += o.candidateCountStored; candSum.policy += o.candidateCountPolicyAllowed; candSum.engine += o.candidateCountEngineLegal; candSum.filtered += o.filteredActionCodes.length;
    const c = [];
    if (o.candidateCountStored !== o.candidateActionCodes.length) c.push('stored!=len(codes)');
    if (o.candidateCountStored !== o.candidateCountPolicyAllowed) c.push('stored!=policyAllowed');
    if (o.candidateCountEngineLegal !== o.candidateCountPolicyAllowed + o.filteredActionCodes.length) c.push('engine!=policy+filtered');
    if (o.targetActionCode !== o.candidateActionCodes[o.targetActionIndex]) c.push('target!=codes[idx]');
    if (o.missingActionCodes.length !== 0) c.push('missingActionCodes非空');
    if (c.length) { invariantViolations++; if (violationExamples.length < 10) violationExamples.push({ sampleId: o.sampleId, c }); }
  }
  carry = chunk.slice(s);
}
fs.closeSync(fd);
console.log('全量行数=' + rows + '  (耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
console.log('partition 行数=' + JSON.stringify(perPartRows));
console.log('重复 stateHash 计数=' + dupState + '  不同 stateHash=' + stateSeen.size);
console.log('重复 sampleId 计数=' + dupSampleId);
console.log('不变式违反行数=' + invariantViolations);
violationExamples.forEach(x => console.log('   ' + JSON.stringify(x)));
console.log('候选累计 stored=' + candSum.stored + ' policyAllowed=' + candSum.policy + ' engineLegal=' + candSum.engine + ' filtered=' + candSum.filtered);
const parts = Object.keys(partLineage);
console.log('');
console.log('partition lineage 集合大小=' + JSON.stringify(Object.fromEntries(parts.map(p => [p, partLineage[p].size]))));
console.log('partition rootFamily 集合大小=' + JSON.stringify(Object.fromEntries(parts.map(p => [p, partFamily[p].size]))));
let interLineage = [], interFamily = [];
for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
  const a = [...partLineage[parts[i]]].filter(x => partLineage[parts[j]].has(x));
  const b = [...partFamily[parts[i]]].filter(x => partFamily[parts[j]].has(x));
  if (a.length) interLineage.push({ p: parts[i] + '∩' + parts[j], n: a.length, ex: a.slice(0, 3) });
  if (b.length) interFamily.push({ p: parts[i] + '∩' + parts[j], n: b.length, ex: b.slice(0, 3) });
}
console.log('lineage 交集（任意两分区）=' + JSON.stringify(interLineage));
console.log('rootFamily 交集（任意两分区）=' + JSON.stringify(interFamily));
// stateHash 是否跨分区复用
const crossPart = new Map();
for (const [h, p] of stateSeen) { }
console.log('');
console.log('targetType 计数=' + JSON.stringify(targetType));
console.log('candidateType 计数=' + JSON.stringify(candType));
