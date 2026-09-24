/**
 * 重标注：从 hBase 恢复 teacherFirst/refPid，算出 acting-player 视角结局 outcomeActing。
 * hBase = seedOrig*1000003 + mapIdxCLI*1009 + (teacherFirst?11:977)，故 teacherFirst 可精确恢复。
 * 用法：... learn_duel_relabel.ts --in training_runs/learn_duel/teacher_lp.jsonl --maps liberty,peak --teacher --out training_runs/learn_duel/teacher_lp.labeled.jsonl
 */
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1] ?? fallback;
}

async function main() {
  const inFile = path.resolve(arg('--in', ''));
  const mapOrder = arg('--maps', '').split(',').map(s => s.trim().toLowerCase());
  const isTeacher = process.argv.includes('--teacher');
  const outFile = path.resolve(arg('--out', ''));
  if (!inFile || !outFile || mapOrder.length === 0) throw new Error('need --in --maps --out');
  let checked = 0;
  let battle = 0;
  let bad = 0;
  const out: string[] = [];
  const rl = createInterface({ input: createReadStream(inFile), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const o = JSON.parse(line) as { map: string; seed: number; playerId: number; policy: string; outcome: 1 | -1 | 0 };
    const mapIdx = mapOrder.indexOf(String(o.map).toLowerCase());
    if (mapIdx < 0) throw new Error(`unknown map ${o.map}`);
    const c = (o.seed % 1000003) - mapIdx * 1009;
    let refPid: number;
    if (isTeacher) {
      if (c !== 11 && c !== 977) throw new Error(`bad hBase residue ${c} (seed=${o.seed})`);
      refPid = c === 11 ? 0 : 1;
      if (o.policy === 'battle') {
        battle += 1;
        if (o.playerId !== refPid) { bad += 1; }
      }
    } else {
      refPid = 0;
    }
    const outcomeActing = o.outcome === 0 ? 0 : (o.playerId === refPid ? o.outcome : -o.outcome);
    out.push(JSON.stringify({ ...o, refPid, outcomeActing }));
    checked += 1;
  }
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, out.join('\n') + '\n', 'utf8');
  console.log(`RELABEL done checked=${checked} battle=${battle} bad=${bad} -> ${outFile}`);
  if (bad > 0) process.exitCode = 3;
}

main().catch(e => { console.error(e); process.exit(1); });
