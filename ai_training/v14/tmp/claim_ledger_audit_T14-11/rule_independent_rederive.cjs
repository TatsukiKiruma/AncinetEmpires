// T14-11 独立复核：按 kind 语义独立重推 145 条谓词的 pass（只读）
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('C:/code/AncinetEmpires/v14/out/v14_20260924_t14/T14-01/rule_suite_results.json', 'utf8'));
const P = k => j.results.flatMap(r => r.predicates.map(p => ({ ...p, fixtureId: r.fixtureId }))).filter(p => p.kind === k);

const report = [];
function check(kind, fn, note) {
  const rows = P(kind);
  let ok = 0, bad = [];
  for (const p of rows) {
    let d;
    try { d = fn(p); } catch (e) { d = 'ERR:' + e.message; }
    if (d === p.pass) ok++; else bad.push({ fixtureId: p.fixtureId, label: p.label, pass: p.pass, derived: d, reading: p.reading, expected: p.expected });
  }
  report.push({ kind, n: rows.length, consistent: ok, inconsistent: bad.length, note, bad });
}

const isAliveReading = r => (typeof r === 'number' ? r > 0 : r !== null && r !== undefined);
const isDeadReading = r => r === null || r === undefined || (typeof r === 'number' && r <= 0);

check('winner', p => JSON.stringify(p.reading) === JSON.stringify(p.expected), 'reading 等于期望 winner');
check('forced_win', p => p.reading && Array.isArray(p.reading.immediateWinActions) && p.reading.immediateWinActions.length > 0, '至少 1 个 immediateWinActions');
check('unit_alive', p => isAliveReading(p.reading), 'reading(hp) > 0');
check('unit_dead', p => isDeadReading(p.reading), 'reading 为 null 或 <=0');
check('hp_equals', p => p.reading === p.expected, 'hp 数值相等');
check('attacker_hp_delta', p => p.reading === p.expected, 'delta 数值相等');
check('attack_attacker_hp_delta', p => p.reading === p.expected, 'delta 数值相等');
check('encoder_counter_semantics', p => p.reading === p.expected, '语义读数相等');
check('unit_at', p => p.reading && p.reading.x === p.expected.x && p.reading.y === p.expected.y, '坐标相等');
check('tile_owner', p => p.reading === p.expected, '归属相等');
check('player_alive', p => p.reading === true, 'reading === true');
check('player_eliminated', p => p.reading === false, 'reading === false（isAlive===false）');
check('gold_equals', p => p.reading === p.expected, '金币相等');
check('legal_action_present', p => p.reading === true, 'reading === true');
check('legal_action_absent', p => p.reading === false, 'reading === false');
check('unreachable_move', p => p.reading && p.reading.reachable === false, 'reachable === false');
check('reachable_move', p => p.reading === true, 'reading === true');
check('trace_types_executed', p => Array.isArray(p.reading) && p.reading.every(t => p.expected.includes(t)), 'reading 是 expected 的子集');
check('accepted', p => typeof p.reading === 'string' && /^Unit .* (attacked|moved|did)/.test(p.reading) || (typeof p.reading === 'string' && p.reading.length > 0), 'reading 非空引擎回执字符串');
check('lethal_attack', p => p.reading && p.reading.targetHpBefore <= p.reading.damage, 'damage >= targetHpBefore');
check('nonlethal_attack', p => p.reading && (p.reading.targetHpAfter === undefined ? p.reading.damage < p.reading.targetHpBefore : p.reading.targetHpAfter > 0), '目标未死');
check('reading', p => JSON.stringify(p.reading) === JSON.stringify(p.expected), '严格相等');

let totalN = 0, totalBad = 0;
for (const r of report) {
  totalN += r.n; totalBad += r.inconsistent;
  console.log(r.kind.padEnd(26) + ' n=' + String(r.n).padStart(3) + '  独立重推一致=' + String(r.consistent).padStart(3) + '  不一致=' + r.inconsistent + '   [' + r.note + ']');
}
console.log('');
console.log('TOTAL predicates=' + totalN + '  独立重推不一致=' + totalBad);
console.log('');
for (const r of report) {
  if (r.inconsistent) {
    console.log('### kind=' + r.kind);
    r.bad.forEach(b => console.log('   fixture=' + b.fixtureId + ' label="' + b.label + '" pass=' + b.pass + ' derived=' + b.derived + '\n     reading=' + JSON.stringify(b.reading) + '\n     expected=' + JSON.stringify(b.expected)));
  }
}
