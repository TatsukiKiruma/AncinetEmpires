/** 新开发轨迹与见证永久排重；每次替换索引前保留旧SHA版本。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync,gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../src/game/engine';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
const dir=path.dirname(fileURLToPath(import.meta.url)),folder=path.resolve(process.argv[2]),target=path.join(dir,'new-evaluation-exclusions.txt.gz');
const hashes=new Set<string>(fs.existsSync(target)?gunzipSync(fs.readFileSync(target)).toString().trim().split('\n').filter(Boolean):[]);
const rows=(p:string)=>fs.existsSync(p)?gunzipSync(fs.readFileSync(p)).toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)):[];
let actions=0,witnessActions=0;
function walk(p:string){for(const e of fs.readdirSync(p,{withFileTypes:true}))if(e.isDirectory())walk(path.join(p,e.name));
    if(!fs.existsSync(path.join(p,'started.json')))return;
    const started=JSON.parse(fs.readFileSync(path.join(p,'started.json'),'utf8')),engine=new GameEngine(started.initial,{applyInitialTurnStart:false});hashes.add(ruleStateHash(engine.getState()));
    for(const row of rows(path.join(p,'actions.jsonl.gz'))){engine.step(row.action);hashes.add(ruleStateHash(engine.getState()));actions++;}
    for(const w of rows(path.join(p,'witnesses.jsonl.gz'))){const replay=new GameEngine(w.initial,{applyInitialTurnStart:false});hashes.add(ruleStateHash(replay.getState()));for(const a of w.actions){replay.step(a);hashes.add(ruleStateHash(replay.getState()));witnessActions++;}}
}
walk(folder);
if(fs.existsSync(target)){const raw=fs.readFileSync(target),identity=crypto.createHash('sha256').update(raw).digest('hex'),archive=path.join(dir,'new-index-history');fs.mkdirSync(archive,{recursive:true});const saved=path.join(archive,identity+'.txt.gz');if(!fs.existsSync(saved))fs.writeFileSync(saved,raw);}
fs.writeFileSync(target+'.pending',gzipSync([...hashes].sort().join('\n')+'\n'));fs.renameSync(target+'.pending',target);
const receipt={directory:folder,actions,witnessActions,uniqueStates:hashes.size,sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),internalUnloggedNodesRecoverable:false};
fs.appendFileSync(path.join(dir,'new-index-history.jsonl'),JSON.stringify(receipt)+'\n');console.log(JSON.stringify(receipt));
