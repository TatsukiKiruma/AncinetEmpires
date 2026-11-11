// T14-11 独立复核：全量扫描 group_D0/D1/D2.jsonl 的 stateHash 与 sourceStateKey 计数（只读，流式）
const fs = require('fs');
const B = 'C:/code/AncinetEmpires/v14/out/v14_20260924_t14/T14-08';

function scan(g) {
  const p = B + '/group_' + g + '.jsonl';
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(1 << 24);
  let carry = '', rows = 0, nl;
  const partCount = {};
  const statePerPart = {};          // partition -> Set(stateHash)
  const newRootStateCount = {};     // stateHash -> 次数（新 root）
  const newRootPartCount = {};
  let oldRows = 0, newRows = 0, otherRows = 0;
  const br = { open: false, n: 0 };
  while ((nl = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
    const chunk = carry + buf.subarray(0, nl).toString('utf8');
    let start = 0, idx;
    while ((idx = chunk.indexOf('\n', start)) >= 0) {
      const line = chunk.slice(start, idx);
      start = idx + 1;
      if (!line) continue;
      const o = JSON.parse(line);
      rows++;
      partCount[o.partition] = (partCount[o.partition] || 0) + 1;
      if (!statePerPart[o.partition]) statePerPart[o.partition] = new Set();
      statePerPart[o.partition].add(o.stateHash);
      const k = o.sourceStateKey || '';
      if (/^V14DAGGER:/.test(k)) { newRows++; newRootStateCount[o.stateHash] = (newRootStateCount[o.stateHash] || 0) + 1; newRootPartCount[o.partition] = (newRootPartCount[o.partition] || 0) + 1; }
      else if (/#202609(2[0-9])/.test(k)) oldRows++;
      else otherRows++;
    }
    carry = chunk.slice(start);
  }
  fs.closeSync(fd);
  const newStates = Object.keys(newRootStateCount);
  const mult = newStates.map(s => newRootStateCount[s]);
  const rep = {};
  for (const m of mult) rep[m] = (rep[m] || 0) + 1;
  console.log('=== group_' + g + '.jsonl 全量扫描 ===');
  console.log('  行数=' + rows + '  partition 分布=' + JSON.stringify(partCount));
  for (const part of Object.keys(statePerPart)) console.log('  partition=' + part + ' 行数=' + partCount[part] + ' 不同 stateHash=' + statePerPart[part].size);
  console.log('  旧 root 行数=' + oldRows + '  新（V14DAGGER:）root 行数=' + newRows + '  其它=' + otherRows);
  console.log('  新 root 不同 stateHash 数=' + newStates.length + '  新 root partition 分布=' + JSON.stringify(newRootPartCount));
  console.log('  新 root 每 stateHash 重复次数分布（次数->stateHash 个数）=' + JSON.stringify(rep));
  console.log('  平均重复倍数=' + (newRows / (newStates.length || 1)).toFixed(3));
}

for (const g of ['D0', 'D1', 'D2']) scan(g);
