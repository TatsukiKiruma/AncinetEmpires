// T14-11 独立复核：开发对战 games.jsonl + aggregate 独立重算（只读）
const fs = require('fs');
const path = require('path');
const BASE = 'C:/code/AncinetEmpires/v14/out/v14_20260924_t14/T14-06';

function readJsonl(p) {
  const s = fs.readFileSync(p, 'utf8');
  return s.split('\n').filter(l => l.trim().length > 0).map(l => JSON.parse(l));
}
function outcomeScore(kind) {
  if (kind === 'WIN' || kind === 'NATURAL_WIN') return 1;
  if (kind === 'DRAW') return 0.5;
  return 0;
}

const files = fs.readdirSync(BASE + '/matches').filter(f => f.endsWith('.games.jsonl'));
const report = {};
for (const f of files) {
  const rows = readJsonl(BASE + '/matches/' + f);
  const byArm = {}; const byOutcome = {}; const byArmOutcome = {};
  let errNonEmpty = 0, fallbackTrue = 0, fallbackFalse = 0, nullView = 0;
  const candOutcomes = [];
  for (const r of rows) {
    byArm[r.arm] = (byArm[r.arm] || 0) + 1;
    byOutcome[r.outcomeKind] = (byOutcome[r.outcomeKind] || 0) + 1;
    const k = r.arm + '/' + r.outcomeKind;
    byArmOutcome[k] = (byArmOutcome[k] || 0) + 1;
    if (r.error !== null && r.error !== undefined && String(r.error).length > 0) errNonEmpty++;
    if (r.fallbackUsed === true) fallbackTrue++; else fallbackFalse++;
    if (r.viewedSeat === null || r.viewedSeat === undefined) nullView++;
    if (r.arm === 'CANDIDATE') candOutcomes.push(r.outcomeKind);
  }
  // 独立配对：seat 视角配对（candidateSeat 与 mirror 同 viewedSeat）
  const pairKeys = new Set();
  for (const r of rows) pairKeys.add(r.scenarioId + '#seed=' + r.seed + '#seat=' + r.viewedSeat);
  const diffs = [];
  for (const key of pairKeys) {
    const grp = rows.filter(r => (r.scenarioId + '#seed=' + r.seed + '#seat=' + r.viewedSeat) === key);
    const cand = grp.find(r => r.arm === 'CANDIDATE');
    const mir = grp.find(r => r.arm === 'MIRROR');
    if (!cand || !mir) { diffs.push({ key, kind: 'INCOMPLETE', n: grp.length }); continue; }
    if (cand.error || mir.error) { diffs.push({ key, kind: 'ERROR' }); continue; }
    const vs = mir.viewedSeat;
    const candScore = outcomeScore(cand.outcomeKind);
    const mirScore = (mir.winnerAllianceId === vs) ? 1 : (mir.winnerAllianceId === null || mir.winnerAllianceId === undefined ? 0.5 : 0);
    diffs.push({ key, kind: 'COMPLETE', candOutcome: cand.outcomeKind, mirWinner: mir.winnerAllianceId, vs, candScore, mirScore, d: candScore - mirScore });
  }
  const comp = diffs.filter(d => d.kind === 'COMPLETE');
  const mean = comp.length ? comp.reduce((a, d) => a + d.d, 0) / comp.length : null;
  report[f] = {
    file: f, rows: rows.length, arms: byArm, outcomes: byOutcome, byArmOutcome,
    errorsNonEmpty: errNonEmpty, fallbackTrue, fallbackFalse,
    candidateOutcomes: candOutcomes,
    pairCount: pairKeys.size, complete: comp.length,
    truncatedOrIncomplete: diffs.filter(d => d.kind === 'INCOMPLETE').length,
    pairErrors: diffs.filter(d => d.kind === 'ERROR').length,
    independentMean: mean,
    diffList: comp.map(d => d.d),
    pairDetail: diffs
  };
}

for (const k of Object.keys(report)) {
  const r = report[k];
  console.log('=== ' + r.file);
  console.log('  行数=' + r.rows + '  arms=' + JSON.stringify(r.arms) + '  error非空=' + r.errorsNonEmpty + '  fallbackUsed=true=' + r.fallbackTrue + '  false=' + r.fallbackFalse);
  console.log('  outcomeKind=' + JSON.stringify(r.outcomes));
  console.log('  arm×outcome=' + JSON.stringify(r.byArmOutcome));
  console.log('  独立配对: pairs=' + r.pairCount + ' complete=' + r.complete + ' incomplete=' + r.truncatedOrIncomplete + ' pairErrors=' + r.pairErrors + ' 独立 mean=' + r.independentMean);
  console.log('  独立逐对差值=' + JSON.stringify(r.diffList));
  console.log('');
}

// aggregate 对照
console.log('=== aggregate 文件读数 ===');
for (const f of fs.readdirSync(BASE + '/aggregate').filter(x => x.endsWith('.json'))) {
  const a = JSON.parse(fs.readFileSync(BASE + '/aggregate/' + f, 'utf8'));
  console.log(f + ' :: totalPairs=' + a.totalPairs + ' complete.count=' + a.completePairs.count + ' complete.mean=' + a.completePairs.mean +
    ' truncated.count=' + a.truncatedPairs.count + ' errors.count=' + a.errors.count + ' errors.experimentValid=' + a.errors.experimentValid +
    ' clusterCI.blocks=' + a.clusterCI.blocks + ' orphanCount=' + a.orphanCount);
}
console.log('');
console.log('=== 交叉核对（独立重算 vs aggregate）===');
for (const f of Object.keys(report)) {
  const aggName = f.replace('.games.jsonl', '.aggregate.json');
  const aggPath = BASE + '/aggregate/' + aggName;
  if (!fs.existsSync(aggPath)) { console.log(f + ' -> 无对应 aggregate'); continue; }
  const a = JSON.parse(fs.readFileSync(aggPath, 'utf8'));
  const r = report[f];
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  console.log(aggName + ': totalPairs ' + a.totalPairs + '(' + (a.totalPairs === r.pairCount ? 'MATCH' : 'MISMATCH 独立=' + r.pairCount) + ')' +
    ' complete.count ' + a.completePairs.count + '(' + (a.completePairs.count === r.complete ? 'MATCH' : 'MISMATCH 独立=' + r.complete) + ')' +
    ' complete.mean ' + a.completePairs.mean + '(' + (Math.abs((a.completePairs.mean ?? NaN) - (r.independentMean ?? NaN)) < 1e-12 ? 'MATCH' : 'MISMATCH 独立=' + r.independentMean) + ')' +
    ' truncated ' + a.truncatedPairs.count + '(' + (a.truncatedPairs.count === (r.pairCount - r.complete - r.pairErrors) ? 'MATCH' : 'MISMATCH') + ')' +
    ' errors.count ' + a.errors.count + '(' + (a.errors.count === r.pairErrors ? 'MATCH' : 'MISMATCH 独立pairErrors=' + r.pairErrors) + ')');
}
