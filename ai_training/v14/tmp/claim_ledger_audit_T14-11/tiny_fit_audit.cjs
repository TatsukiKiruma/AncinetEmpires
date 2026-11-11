// T14-11 独立复核：T14-04 tiny fit 数据集与诊断（只读）
const fs = require('fs');
const crypto = require('crypto');
const B = 'C:/code/AncinetEmpires/v14/out/v14_20260924_t14/T14-04';

function rows(p) { return fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l)); }

function audit(p, label) {
  const rs = rows(p);
  const spatialShape = {}, globalDims = {}, semDims = {};
  let nonFinite = 0, emptyCand = 0, minC = Infinity, maxC = -Infinity, sumC = 0;
  const problems = [];
  for (let i = 0; i < rs.length; i++) {
    const o = rs[i];
    spatialShape[o.spatialTensor.length] = (spatialShape[o.spatialTensor.length] || 0) + 1;
    globalDims[o.globalFeatures.length] = (globalDims[o.globalFeatures.length] || 0) + 1;
    const n = o.candidateActions.length;
    if (n === 0) emptyCand++;
    minC = Math.min(minC, n); maxC = Math.max(maxC, n); sumC += n;
    for (const a of o.candidateActions) semDims[a.semantics.length] = (semDims[a.semantics.length] || 0) + 1;
    const check = arr => { for (const v of arr) if (!Number.isFinite(v)) return false; return true; };
    if (!check(o.spatialTensor) || !check(o.globalFeatures)) { nonFinite++; problems.push({ i, sampleId: o.sampleId, what: 'tensor 非有限值' }); }
    for (const a of o.candidateActions) if (!check(a.semantics)) { nonFinite++; problems.push({ i, sampleId: o.sampleId, what: 'semantics 非有限值' }); break; }
    // 不变式
    if (o.candidateCountStored !== n) problems.push({ i, sampleId: o.sampleId, what: 'candidateCountStored!=len(candidateActions)' });
    if (o.candidateCountEngineLegal !== o.candidateCountPolicyAllowed + o.filteredActionCodes.length) problems.push({ i, sampleId: o.sampleId, what: 'engineLegal!=policy+filtered' });
    if (o.targetActionCode !== o.candidateActionCodes[o.targetActionIndex]) problems.push({ i, sampleId: o.sampleId, what: 'targetActionCode!=candidateActionCodes[targetActionIndex]', targetActionIndex: o.targetActionIndex, got: o.candidateActionCodes[o.targetActionIndex] });
  }
  console.log('=== ' + label + ' (' + p.replace(/^.*T14-04\//, 'T14-04/') + ')');
  console.log('  rows=' + rs.length);
  console.log('  spatialTensor 形状分布=' + JSON.stringify(spatialShape));
  console.log('  globalFeatures 维度分布=' + JSON.stringify(globalDims));
  console.log('  候选 semantics 维度分布=' + JSON.stringify(semDims));
  console.log('  candidateCount min=' + minC + ' max=' + maxC + ' mean=' + (sumC / rs.length) + ' 合计=' + sumC);
  console.log('  非有限张量行数=' + nonFinite + ' 空候选行=' + emptyCand);
  console.log('  不变式/有限性问题数=' + problems.length);
  problems.slice(0, 10).forEach(x => console.log('    ' + JSON.stringify(x)));
  console.log('  sha256=' + crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
  console.log('  bytes=' + fs.statSync(p).size);
  return { rows: rs.length, spatialShape, globalDims, semDims, minC, maxC, sumC, nonFinite, emptyCand, problems };
}

const a1 = audit(B + '/tiny_fit_dataset.jsonl', 'tiny_fit_dataset.jsonl（T14-04 记忆诊断数据集）');
console.log('');
const a2 = audit(B + '/tiny_fit_with_val.jsonl', 'tiny_fit_with_val.jsonl（run_s42 实训练数据集）');
console.log('');
console.log('=== tiny_fit_link_diagnosis.json 声称值 vs 实测 ===');
const d = JSON.parse(fs.readFileSync(B + '/tiny_fit_link_diagnosis.json', 'utf8'));
console.log('  声称 checks=' + JSON.stringify(d.checks));
console.log('  声称 rows=' + d.rows + '  实测 rows=' + a1.rows + '  一致? ' + (d.rows === a1.rows));
console.log('  声称 candidateCountMax=' + d.checks.candidateCountMax + ' 实测=' + a1.maxC + ' 一致? ' + (d.checks.candidateCountMax === a1.maxC));
console.log('  声称 candidateCountMin=' + d.checks.candidateCountMin + ' 实测=' + a1.minC + ' 一致? ' + (d.checks.candidateCountMin === a1.minC));
console.log('  声称 candidateCountMean=' + d.checks.candidateCountMean + ' 实测=' + (a1.sumC / a1.rows) + ' 一致? ' + (d.checks.candidateCountMean === a1.sumC / a1.rows));
console.log('  声称 nonFiniteTensors=' + d.checks.nonFiniteTensors + ' 实测=' + a1.nonFinite + ' 一致? ' + (d.checks.nonFiniteTensors === a1.nonFinite));
console.log('  声称 semanticDims=' + JSON.stringify(d.checks.semanticDims) + ' 实测=' + JSON.stringify(a1.semDims) + ' 一致? ' + (JSON.stringify(d.checks.semanticDims) === JSON.stringify(a1.semDims)));
console.log('  声称 spatialShapes=' + JSON.stringify(d.checks.spatialShapes) + ' 实测=' + JSON.stringify(a1.spatialShape) + ' 一致? ' + (JSON.stringify(d.checks.spatialShapes) === JSON.stringify(a1.spatialShape)));
console.log('  声称 globalDims=' + JSON.stringify(d.checks.globalDims) + ' 实测=' + JSON.stringify(a1.globalDims) + ' 一致? ' + (JSON.stringify(d.checks.globalDims) === JSON.stringify(a1.globalDims)));
console.log('  声称 problems=' + JSON.stringify(d.problems) + ' 实测problems=' + a1.problems.length);
