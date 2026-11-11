// T14-11 独立复核：重扫 T14-02/dataset_v14.jsonl（抽样 + 全量候选计数下界核对）
// 只读；对 466MB 文件采用「文件头顺序采样 2000 行 + 均匀分布随机采样 2000 行」。
const fs = require('fs');
const crypto = require('crypto');

const ROOT = 'C:/code/AncinetEmpires/v14/out/v14_20260924_t14/T14-02';
const FILE = ROOT + '/dataset_v14.jsonl';
const N_HEAD = 2000;
const N_RAND = 2000;
const CHUNK = 64 * 1024;

function parseLine(raw, where) {
  let o;
  try { o = JSON.parse(raw); } catch (e) { return { parseError: e.message + ' @' + where }; }
  const finite = (arr) => { for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return i; return -1; };
  const c = [];
  if (o.candidateCountStored !== o.candidateActionCodes.length) c.push('candidateCountStored(' + o.candidateCountStored + ')!=len(candidateActionCodes)(' + o.candidateActionCodes.length + ')');
  if (o.candidateCountStored !== o.candidateCountPolicyAllowed) c.push('candidateCountStored(' + o.candidateCountStored + ')!=candidateCountPolicyAllowed(' + o.candidateCountPolicyAllowed + ')');
  if (o.candidateCountEngineLegal !== o.candidateCountPolicyAllowed + o.filteredActionCodes.length)
    c.push('engineLegal(' + o.candidateCountEngineLegal + ')!=policyAllowed(' + o.candidateCountPolicyAllowed + ')+filtered(' + o.filteredActionCodes.length + ')');
  if (o.targetActionCode !== o.candidateActionCodes[o.targetActionIndex])
    c.push('targetActionCode(' + o.targetActionCode + ')!=candidateActionCodes[' + o.targetActionIndex + '](' + o.candidateActionCodes[o.targetActionIndex] + ')');
  if (o.spatialTensor.length !== 26 * 400) c.push('spatialTensor len=' + o.spatialTensor.length + ' != 10400');
  if (o.globalFeatures.length !== 20) c.push('globalFeatures len=' + o.globalFeatures.length + ' != 20');
  if (o.candidateActions.length !== o.candidateActionCodes.length) c.push('len(candidateActions)(' + o.candidateActions.length + ')!=len(candidateActionCodes)');
  // 候选语义长度（按实际字段名探测）
  const s0 = o.candidateActions[0];
  const semKey = s0 ? Object.keys(s0).find(k => Array.isArray(s0[k]) && s0[k].length > 5) : null;
  if (s0) {
    const sl = s0[semKey] ? s0[semKey].length : -1;
    if (sl !== 53) c.push('candidate semantics len=' + sl + ' (key=' + semKey + ') != 53');
  }
  const badSpatial = finite(o.spatialTensor);
  if (badSpatial >= 0) c.push('spatialTensor 非有限值 at ' + badSpatial);
  const badGlobal = finite(o.globalFeatures);
  if (badGlobal >= 0) c.push('globalFeatures 非有限值 at ' + badGlobal);
  if (s0 && semKey) { const bad = finite(s0[semKey]); if (bad >= 0) c.push('candidate[0].' + semKey + ' 非有限值 at ' + bad); }
  for (let i = 0; i < o.candidateActions.length; i++) {
    const a = o.candidateActions[i];
    const arr = semKey ? a[semKey] : null;
    if (!arr) { c.push('candidate[' + i + '] 缺语义数组'); break; }
    const bad = finite(arr);
    if (bad >= 0) { c.push('candidate[' + i + '].' + semKey + ' 非有限值 at ' + bad); break; }
  }
  if (o.missingActionCodes.length !== 0) c.push('missingActionCodes 非空 (' + o.missingActionCodes.length + ')');
  return { o, c, semKey };
}

const fd = fs.openSync(FILE, 'r');
const size = fs.fstatSync(fd).size;

// ---- 1. 文件头顺序采样 ----
const headRows = [];
let pos = 0, carry = Buffer.alloc(0);
while (headRows.length < N_HEAD && pos < size) {
  const buf = Buffer.alloc(CHUNK);
  const n = fs.readSync(fd, buf, 0, CHUNK, pos);
  if (n <= 0) break;
  pos += n;
  const chunk = Buffer.concat([carry, buf.subarray(0, n)]);
  let start = 0, idx;
  while ((idx = chunk.indexOf(0x0a, start)) >= 0) {
    if (headRows.length >= N_HEAD) { carry = chunk.subarray(start); break; }
    headRows.push(chunk.subarray(start, idx).toString('utf8'));
    start = idx + 1;
  }
  if (headRows.length >= N_HEAD) break;
  carry = chunk.subarray(start);
}

// ---- 2. 均匀分布随机采样（按字节偏移定位整行）----
const rndRows = [];
const rndOffsets = [];
for (let i = 0; i < N_RAND; i++) rndOffsets.push(Math.floor(Math.random() * (size - 1)));
rndOffsets.sort((a, b) => a - b);
let cur = 0;
for (const off of rndOffsets) {
  // 找到 >= off 的第一个换行，再读完整一行
  let p = off, lineStart = -1;
  const probe = Buffer.alloc(Math.min(1 << 20, size - off));
  const pn = fs.readSync(fd, probe, 0, probe.length, off);
  const nl = probe.subarray(0, pn).indexOf(0x0a);
  if (nl < 0) continue;
  lineStart = off + nl + 1;
  let end = -1, chunkBuf;
  for (let k = 0; k < 8; k++) {
    const b = Buffer.alloc(CHUNK);
    const n = fs.readSync(fd, b, 0, CHUNK, lineStart + k * CHUNK);
    if (n <= 0) break;
    const e = b.subarray(0, n).indexOf(0x0a);
    if (e >= 0) { end = lineStart + k * CHUNK + e; chunkBuf = b; break; }
  }
  if (end < 0) continue;
  const len = end - lineStart;
  const lb = Buffer.alloc(len);
  fs.readSync(fd, lb, 0, len, lineStart);
  rndRows.push(lb.toString('utf8'));
}
fs.closeSync(fd);

// ---- 3. 校验 ----
function scan(name, rows) {
  let bad = 0, parseErr = 0, semKeys = new Set();
  const issues = [];
  const counts = { stored: 0, engine: 0, policy: 0, filtered: 0 };
  const parts = {};
  for (let i = 0; i < rows.length; i++) {
    const r = parseLine(rows[i], name + '#' + i);
    if (r.parseError) { parseErr++; issues.push({ i, err: r.parseError }); continue; }
    if (r.semKey) semKeys.add(r.semKey);
    counts.stored += r.o.candidateCountStored;
    counts.engine += r.o.candidateCountEngineLegal;
    counts.policy += r.o.candidateCountPolicyAllowed;
    counts.filtered += r.o.filteredActionCodes.length;
    parts[r.o.partition] = (parts[r.o.partition] || 0) + 1;
    if (r.c.length) { bad++; if (issues.length < 25) issues.push({ i, sampleId: r.o.sampleId, checks: r.c }); }
  }
  return { name, n: rows.length, bad, parseErr, issues, counts, parts, semKeys: [...semKeys] };
}

const h = scan('head2000', headRows);
const r = scan('random2000', rndRows);
for (const s of [h, r]) {
  console.log('=== ' + s.name + ' | rows=' + s.n + ' | 违反不变式的行数=' + s.bad + ' | JSON 解析失败=' + s.parseErr);
  console.log('    候选累计: stored=' + s.counts.stored + ' engineLegal=' + s.counts.engine + ' policyAllowed=' + s.counts.policy + ' filtered=' + s.counts.filtered);
  console.log('    stored==policyAllowed? ' + (s.counts.stored === s.counts.policy) + '   engine==policy+filtered? ' + (s.counts.engine === s.counts.policy + s.counts.filtered));
  console.log('    partition 分布=' + JSON.stringify(s.parts));
  console.log('    语义字段名=' + JSON.stringify(s.semKeys));
  if (s.issues.length) { console.log('    问题明细:'); s.issues.forEach(x => console.log('      ' + JSON.stringify(x))); }
  console.log('');
}
console.log('抽样合计: rows=' + (h.n + r.n) + '  违反不变式=' + (h.bad + r.bad) + '  解析失败=' + (h.parseErr + r.parseErr));
