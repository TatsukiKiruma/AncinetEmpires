// T14-11 独立复核：T14-08 D1 新数据重复采样实证 + 三组 ledger 交叉（只读）
const fs = require('fs');
const B = 'C:/code/AncinetEmpires/v14/out/v14_20260924_t14/T14-08';

function sampleRows(p, n, offsets) {
  const fd = fs.openSync(p, 'r');
  const size = fs.fstatSync(fd).size;
  const out = [];
  for (const off of offsets) {
    const probe = Buffer.alloc(1 << 20);
    const pn = fs.readSync(fd, probe, 0, probe.length, off);
    const nl = probe.subarray(0, pn).indexOf(0x0a);
    if (nl < 0) continue;
    const start = off + nl + 1;
    const b = Buffer.alloc(1 << 20);
    const bn = fs.readSync(fd, b, 0, 1 << 20, start);
    const e = b.subarray(0, bn).indexOf(0x0a);
    if (e < 0) continue;
    out.push(JSON.parse(b.subarray(0, e).toString('utf8')));
  }
  fs.closeSync(fd);
  return out;
}

console.log('### D1/D2 新数据重复度：dagger 源 vs group 数据集 ###');
for (const g of [['D1', 1070], ['D2', 4787]]) {
  const [name, distinct] = g;
  const p = B + '/group_' + name + '.jsonl';
  const size = fs.statSync(p).size;
  const offsets = [];
  for (let i = 0; i < 4000; i++) offsets.push(Math.floor(Math.random() * (size - 1)));
  const rows = sampleRows(p, 4000, offsets);
  const ids = new Set(rows.map(r => r.sampleId));
  const states = new Set(rows.map(r => r.stateHash));
  const srcIds = rows.map(r => r.sourceStateKey);
  const distinctSrc = new Set(srcIds).size;
  // 每个 sourceStateKey 出现次数
  const cnt = {};
  for (const s of srcIds) cnt[s] = (cnt[s] || 0) + 1;
  const maxRep = Math.max(...Object.values(cnt));
  console.log(name + ': 抽样 ' + rows.length + ' 行 | 不同 sampleId=' + ids.size + ' | 不同 stateHash=' + states.size + ' | 不同 sourceStateKey=' + distinctSrc);
  console.log('   声称 dagger 源 distinct=' + distinct + '（split manifest newDistinctStates）; 抽样不同 stateHash=' + states.size);
  console.log('   抽样中最大重复次数（同一 sourceStateKey）=' + maxRep + '，平均=' + (rows.length / distinctSrc).toFixed(2));
  // partition 分布
  const part = {}; for (const r of rows) part[r.partition] = (part[r.partition] || 0) + 1;
  console.log('   partition 分布（随机抽样）=' + JSON.stringify(part));
  // 是否混入旧 root
  const oldLike = rows.filter(r => /#2026092401#|#2026092402#|#2026092403#|#2026092404#/.test(r.sourceStateKey)).length;
  console.log('   旧 root（#20260924xx#）行数=' + oldLike + '/' + rows.length);
}

console.log('');
console.log('### 三组 optimized/planned 交叉 ###');
for (const g of ['D0', 'D1', 'D2']) {
  const o = JSON.parse(fs.readFileSync(B + '/run_' + g + '/optimized.json', 'utf8'));
  const pl = JSON.parse(fs.readFileSync(B + '/run_' + g + '/planned.json', 'utf8'));
  const plannedIds = new Set(pl.train_sample_ids);
  const optIds = new Set(o.optimizedSampleIds);
  let neverSeen = 0;
  for (const id of plannedIds) if (!optIds.has(id)) neverSeen++;
  let foreign = 0;
  for (const id of optIds) if (!plannedIds.has(id)) foreign++;
  console.log(g + ': planned.train_sample_count=' + pl.train_sample_count + ' unique planned ids=' + plannedIds.size +
    ' | optimizedUniqueSamples=' + o.optimizedUniqueSamples + ' ids=' + optIds.size +
    ' | plannedButNeverOptimized(声明)=' + o.plannedButNeverOptimized + ' 独立重算(planned\\opt)=' + neverSeen +
    ' | 优化了但不在计划中的 id=' + foreign);
  console.log('    planned.warning=' + JSON.stringify(pl.warning));
  console.log('    perEpoch epochs=' + Object.keys(o.perEpoch).join(',') + ' updates 合计=' + Object.values(o.perEpoch).reduce((a, e) => a + e.updates, 0) + ' 声明 updates=' + o.updates);
}
