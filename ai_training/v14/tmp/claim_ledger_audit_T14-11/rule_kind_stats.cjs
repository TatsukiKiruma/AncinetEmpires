// T14-11 独立复核：按 kind 统计谓词读数契约（只读）
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('C:/code/AncinetEmpires/v14/out/v14_20260924_t14/T14-01/rule_suite_results.json', 'utf8'));

function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

const byKind = new Map();
const strictMismatch = [];
let total = 0;
for (const r of j.results) {
  for (const p of r.predicates) {
    total++;
    const k = p.kind;
    if (!byKind.has(k)) byKind.set(k, { n: 0, passTrue: 0, passFalse: 0, strictEq: 0, strictNe: 0, examples: [] });
    const s = byKind.get(k);
    s.n++;
    if (p.pass === true) s.passTrue++; else s.passFalse++;
    const d = (typeof p.reading === 'object' && p.reading !== null) ? eq(p.reading, p.expected) : Object.is(p.reading, p.expected);
    if (d) s.strictEq++; else { s.strictNe++; if (s.examples.length < 2) s.examples.push({ f: r.fixtureId, label: p.label, reading: p.reading, expected: p.expected, pass: p.pass }); }
    if (!d) strictMismatch.push({ f: r.fixtureId, kind: k, label: p.label, reading: p.reading, expected: p.expected, pass: p.pass });
  }
}
console.log('total predicates = ' + total);
console.log('');
console.log('kind | n | pass=true | pass=false | reading===expected | reading!==expected');
for (const [k, s] of byKind) {
  console.log([k, s.n, s.passTrue, s.passFalse, s.strictEq, s.strictNe].join(' | '));
}
console.log('');
console.log('--- 全部 reading!==expected 的谓词（' + strictMismatch.length + ' 条）---');
strictMismatch.forEach((m, i) => {
  console.log((i + 1) + '. fixture=' + m.f + ' kind=' + m.kind + ' pass=' + m.pass + ' label="' + m.label + '"');
  console.log('     reading=' + JSON.stringify(m.reading));
  console.log('     expected=' + JSON.stringify(m.expected));
});
