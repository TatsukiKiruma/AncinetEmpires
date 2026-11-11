// T14-11 独立复核：T14-08 D0/D1/D2（只读）
const fs = require('fs');
const crypto = require('crypto');
const B = 'C:/code/AncinetEmpires/v14/out/v14_20260924_t14/T14-08';

function sha256(p) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(p, 'r'); const buf = Buffer.alloc(8 << 20); let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd); return h.digest('hex');
}
function lineCount(p) {
  const fd = fs.openSync(p, 'r'); const buf = Buffer.alloc(8 << 20); let n, cnt = 0, lastNl = true;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
    for (let i = 0; i < n; i++) if (buf[i] === 0x0a) cnt++;
    lastNl = buf[n - 1] === 0x0a;
  }
  fs.closeSync(fd); return cnt + (lastNl ? 0 : 1);
}

console.log('### 大文件行数 + sha256 ###');
const big = ['group_D0.jsonl', 'group_D1.jsonl', 'group_D2.jsonl', 'dagger_D1.jsonl', 'dagger_D2.jsonl'];
const facts = {};
for (const f of big) {
  const p = B + '/' + f;
  const t = Date.now();
  const h = sha256(p); const n = lineCount(p);
  facts[f] = { bytes: fs.statSync(p).size, lines: n, sha256: h };
  console.log(f.padEnd(18) + ' bytes=' + fs.statSync(p).size + ' lines=' + n + ' sha256=' + h + '  (' + ((Date.now() - t) / 1000).toFixed(1) + 's)');
}

console.log('');
console.log('### 训练集实际行数（metrics.train_samples 对照）###');
for (const g of ['D0', 'D1', 'D2']) {
  const m = JSON.parse(fs.readFileSync(B + '/run_' + g + '/' + g + '_metrics.json', 'utf8'));
  console.log(g + ': train_samples=' + m.train_samples + ' val_samples=' + m.val_samples + ' optimizerUpdates=' + m.optimizerUpdates + ' epochsCompleted=' + m.epochsCompleted);
}

console.log('');
console.log('### split manifest oldRows/newRows/newDistinctStates ###');
for (const g of ['D0', 'D1', 'D2']) {
  const s = JSON.parse(fs.readFileSync(B + '/group_' + g + '_split_manifest.json', 'utf8'));
  console.log(g + ': oldRows=' + s.oldRows + ' newRows=' + s.newRows + ' newDistinctStates=' + s.newDistinctStates +
    ' newRootFamilies=' + s.newRootFamilies.length + ' trainRootFamilies=' + s.trainRootFamilies.length +
    ' valRows=' + s.valRows + ' newSource=' + s.newSource);
}

console.log('');
console.log('### D1/D2 dagger 报告 ###');
for (const g of ['D1', 'D2']) {
  const r = JSON.parse(fs.readFileSync(B + '/dagger_' + g + '_report.json', 'utf8'));
  console.log(g + ': written=' + r.written + ' skipped=' + r.skipped + ' skipReasons=' + JSON.stringify(r.skipReasons) +
    ' behaviorAgreement=' + JSON.stringify(r.behaviorAgreement) + ' distinctRoots=' + JSON.stringify(r.distinctRoots) +
    ' outputSha256=' + r.outputSha256 + ' targetTypes=' + JSON.stringify(r.targetTypes));
  console.log('   output=' + r.output);
  const fn = r.output.replace(/^.*T14-08\//, '');
  if (facts[fn]) {
    console.log('   -> 实测 ' + fn + ' lines=' + facts[fn].lines + ' bytes=' + facts[fn].bytes + ' sha256=' + facts[fn].sha256 +
      ' | written 一致? ' + (facts[fn].lines === r.written) + ' | sha 一致? ' + (facts[fn].sha256 === r.outputSha256));
  }
}

console.log('');
console.log('### run_*/optimized.json 与 planned.json（唯一优化样本）###');
for (const g of ['D0', 'D1', 'D2']) {
  for (const kind of ['optimized', 'planned']) {
    const p = B + '/run_' + g + '/' + kind + '.json';
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const topKeys = Object.keys(j);
    let n = null, uniq = null, extra = '';
    if (Array.isArray(j)) n = j.length;
    else {
      for (const k of topKeys) if (Array.isArray(j[k])) { n = j[k].length; }
      if (j.uniqueSampleIds) uniq = j.uniqueSampleIds.length;
      else if (j.sampleIds) uniq = new Set(j.sampleIds).size;
      extra = ' keys=' + topKeys.join(',');
    }
    console.log('run_' + g + '/' + kind + '.json: 顶层keys=' + topKeys.join(',') + (Array.isArray(j) ? ' (array len=' + n + ')' : '') + (uniq !== null ? ' uniq=' + uniq : ''));
  }
}

console.log('');
console.log('### 三组对战 ###');
function readJsonl(p) { return fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l)); }
function outcomeScoreSeat(kind, winner, seat) {
  if (kind === 'NATURAL_DRAW') return 0.5;
  if (kind === 'NATURAL_WIN') return 1;
  if (kind === 'NATURAL_LOSS') return 0;
  return null;
}
for (const g of ['D0', 'D1', 'D2']) {
  const rows = readJsonl(B + '/matches/duel2p_' + g + '.games.jsonl');
  const byArm = {}, byOut = {}, byArmOut = {};
  let err = 0, fb = 0;
  for (const r of rows) {
    byArm[r.arm] = (byArm[r.arm] || 0) + 1;
    byOut[r.outcomeKind] = (byOut[r.outcomeKind] || 0) + 1;
    byArmOut[r.arm + '/' + r.outcomeKind] = (byArmOut[r.arm + '/' + r.outcomeKind] || 0) + 1;
    if (r.error !== null && r.error !== undefined && String(r.error).length) err++;
    if (r.fallbackUsed === true) fb++;
  }
  const keys = [...new Set(rows.map(r => r.scenarioId + '#seed=' + r.seed + '#seat=' + r.viewedSeat))];
  const ds = [];
  for (const k of keys) {
    const grp = rows.filter(r => (r.scenarioId + '#seed=' + r.seed + '#seat=' + r.viewedSeat) === k);
    const c = grp.find(r => r.arm === 'CANDIDATE'), m = grp.find(r => r.arm === 'MIRROR');
    if (!c || !m) { ds.push(null); continue; }
    const sc = c.outcomeKind === 'NATURAL_WIN' ? 1 : (c.outcomeKind === 'NATURAL_DRAW' ? 0.5 : (c.outcomeKind === 'NATURAL_LOSS' ? 0 : null));
    const sm = m.outcomeKind === 'NATURAL_WIN' ? 1 : (m.outcomeKind === 'NATURAL_DRAW' ? 0.5 : (m.outcomeKind === 'NATURAL_LOSS' ? 0 : null));
    ds.push((sc === null || sm === null) ? null : sc - sm);
  }
  const comp = ds.filter(d => d !== null);
  const mean = comp.length ? comp.reduce((a, b) => a + b, 0) / comp.length : null;
  const agg = JSON.parse(fs.readFileSync(B + '/matches/duel2p_' + g + '.run.json', 'utf8'));
  console.log(g + ': rows=' + rows.length + ' arms=' + JSON.stringify(byArm) + ' outcomes=' + JSON.stringify(byOut) + ' arm×outcome=' + JSON.stringify(byArmOut));
  console.log('    error非空=' + err + ' fallbackUsed=true=' + fb + ' | 独立 pairs=' + keys.length + ' complete=' + comp.length + ' mean=' + mean);
  console.log('    run.json=' + JSON.stringify(agg));
}
