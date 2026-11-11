import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// 最大值不等于最小保留值：独立进程验证显式GC后的真实新生代容量。
const probes = [];
for (const args of [['--max-semi-space-size=128'],['--min-semi-space-size=128','--max-semi-space-size=128']]) {
    const script = "const v8=require('node:v8');gc();console.log(JSON.stringify(v8.getHeapSpaceStatistics().find(s=>s.space_name==='new_space')))";
    const result = spawnSync(process.execPath,['--expose-gc',...args,'-e',script],{encoding:'utf8'});
    if (result.status !== 0) throw Error(result.stderr);
    probes.push({args,statistics:JSON.parse(result.stdout)});
}
const dir = import.meta.dirname;
fs.writeFileSync(path.join(dir,'phase54-audit/gc-space-probe.json'),JSON.stringify({probes,scope:'独立容量探针，不是正式时延或棋力收据'},null,2));
console.log(JSON.stringify(probes));
