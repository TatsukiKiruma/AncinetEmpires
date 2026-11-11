import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseRemoteReplay } from './apk_game_get_validate';

const root = 'training_runs/pvp_navigation_20260918';
const audit = JSON.parse(await readFile(`${root}/audit.json`, 'utf8'));
const rows = [];
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value, (_,v) => typeof v === 'bigint' ? v.toString() : v)).digest('hex');
for (const entry of audit) {
    const parsed = await parseRemoteReplay(entry.copiedPath, { inputs: [], rootDir: '', outPath: null, json: false, mode: 'SD', maxRecords: 100000,
        offset: 0, limit: null, uniqueOffset: null, uniqueLimit: null, dedupe: true, allowAmbiguousRecruit: true, strictTerrain: false, forceExecuteReplayActions: false });
    const { metadata: _metadata, ...initial } = parsed.initialState;
    rows.push({ id: entry.id, seed: parsed.config.seed.toString(), playerTypes: parsed.config.playerTypes,
        humanWinnerTeams: parsed.config.playerTypes.flatMap((type,id)=>type===1 && (parsed.initialState.rules?.alliances?.[id] ?? id)===entry.finalWinner?[id]:[]),
        group: hash({ initial, seed: parsed.config.seed }), replay: hash(parsed.actions), records: parsed.actions.length, split: entry.split });
}
const groups = [...new Set(rows.map(r => r.group))].sort();
const duplicated = groups.filter(g => rows.filter(r=>r.group===g).length>1);
// 同一初始局面和种子对应的多份抓包必须放在同一分区。
if (duplicated.length) for (const row of rows) {
    const i=groups.indexOf(row.group);
    row.split=i<Math.floor(groups.length*0.7)?'train':i<Math.floor(groups.length*0.85)?'validation':'test';
    audit.find((e:{id:number})=>e.id===row.id).split=row.split;
}
await writeFile(`${root}/identity-audit.json`,JSON.stringify({groups:groups.length,duplicateGroups:duplicated,rows},null,2));
await writeFile(`${root}/audit.json`,JSON.stringify(audit,null,2));
console.log(JSON.stringify({groups:groups.length,duplicateGroups:duplicated.length,playerTypes:[...new Set(rows.map(r=>JSON.stringify(r.playerTypes)))]}));
