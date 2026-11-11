// T14-11 独立复核：group_D1/D2 新 root 行 vs dagger 源 逐 stateHash 重合（只读，流式）
const fs = require('fs');
const B = 'C:/code/AncinetEmpires/v14/out/v14_20260924_t14/T14-08';

function readAll(p) {
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(1 << 24);
  let carry = '', n, out = [];
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
    const chunk = carry + buf.subarray(0, n).toString('utf8');
    let s = 0, idx;
    while ((idx = chunk.indexOf('\n', s)) >= 0) { const l = chunk.slice(s, idx); s = idx + 1; if (l) out.push(JSON.parse(l)); }
    carry = chunk.slice(s);
  }
  fs.closeSync(fd); return out;
}

const d1 = readAll(B + '/dagger_D1.jsonl');
const d2 = readAll(B + '/dagger_D2.jsonl');
const d1Set = new Set(d1.map(r => r.stateHash));
const d2Set = new Set(d2.map(r => r.stateHash));
console.log('dagger_D1.jsonl rows=' + d1.length + ' distinct stateHash=' + d1Set.size);
console.log('dagger_D2.jsonl rows=' + d2.length + ' distinct stateHash=' + d2Set.size);

for (const [g, srcSet, manifest] of [['D1', d1Set, JSON.parse(fs.readFileSync(B + '/group_D1_split_manifest.json', 'utf8'))], ['D2', d2Set, JSON.parse(fs.readFileSync(B + '/group_D2_split_manifest.json', 'utf8'))]]) {
  const fam = new Set(manifest.newRootFamilies);
  const rows = readAll(B + '/group_' + g + '.jsonl');
  const newRows = rows.filter(r => fam.has(r.rootFamilyId) || fam.has(r.baseRootId));
  const cnt = {};
  for (const r of newRows) cnt[r.stateHash] = (cnt[r.stateHash] || 0) + 1;
  const states = Object.keys(cnt);
  const inSrc = states.filter(s => srcSet.has(s)).length;
  const notInSrc = states.filter(s => !srcSet.has(s));
  const mult = Object.values(cnt);
  const rep = {}; for (const m of mult) rep[m] = (rep[m] || 0) + 1;
  console.log('');
  console.log('=== group_' + g + '.jsonl 新 root 行（按 newRootFamilies 筛）===');
  console.log('  新 root 行数=' + newRows.length + '  不同 stateHash=' + states.length);
  console.log('  其中出现在 dagger 源里的=' + inSrc + '  未出现=' + notInSrc.length);
  if (notInSrc.length) console.log('    未出现示例=' + JSON.stringify(notInSrc.slice(0, 5)));
  console.log('  每 stateHash 重复次数分布=' + JSON.stringify(rep));
  console.log('  平均重复倍数=' + (newRows.length / (states.length || 1)).toFixed(3));
  console.log('  与 split manifest newDistinctStates=' + manifest.newDistinctStates + ' 一致? ' + (states.length === manifest.newDistinctStates));
  console.log('  与 split manifest newRows=' + manifest.newRows + ' 一致? ' + (newRows.length === manifest.newRows));
  // partition 检查
  const part = {}; for (const r of newRows) part[r.partition] = (part[r.partition] || 0) + 1;
  console.log('  新 root 行 partition 分布=' + JSON.stringify(part));
}
