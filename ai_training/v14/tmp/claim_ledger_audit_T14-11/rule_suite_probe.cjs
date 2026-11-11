// T14-11 独立复核：T14-01 规则套件谓词复核（只读）
const fs = require('fs');
const path = 'C:/code/AncinetEmpires/v14/out/v14_20260924_t14/T14-01/rule_suite_results.json';
const j = JSON.parse(fs.readFileSync(path, 'utf8'));

function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

const targets = process.argv.slice(2);
for (const t of targets) {
  const r = j.results.find(x => x.fixtureId === t);
  if (!r) { console.log('NOT FOUND ' + t); continue; }
  console.log('=== ' + t + ' | scenario=' + r.scenario + ' | pass=' + r.pass + ' | verified=' + r.verified);
  console.log('  actionCodes=' + JSON.stringify(r.actionCodes));
  console.log('  unknownReasons=' + JSON.stringify(r.unknownReasons));
  r.predicates.forEach((p, i) => {
    const d = (typeof p.reading === 'object' && p.reading !== null) ? eq(p.reading, p.expected) : Object.is(p.reading, p.expected);
    console.log('  [' + i + '] kind=' + p.kind + ' pass=' + p.pass + ' derived=' + d +
      ' reading=' + JSON.stringify(p.reading) + ' expected=' + JSON.stringify(p.expected) +
      ' label="' + p.label + '"' + (p.note ? ' note=' + p.note : ''));
  });
  console.log('');
}
