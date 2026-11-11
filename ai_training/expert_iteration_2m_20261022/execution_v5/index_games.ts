/** 流式消费开发轨迹与见证，保留旧排重索引的SHA归档。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createGzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { GameEngine } from '../../../src/game/engine';
import { ruleStateHash } from '../../data_acceptance_20261016/replay/core';
import { gzipLines,gzipJsonRows } from '../execution_v4/gzip_rows';

const dir=path.dirname(fileURLToPath(import.meta.url)),folder=path.resolve(process.argv[2]),target=path.join(dir,'seen-evaluation-exclusions.txt.gz');
const hashes=new Set<string>();for await(const hash of gzipLines(target))hashes.add(hash);
let actions=0,witnessActions=0;
async function walk(directory:string):Promise<void>{
    for(const entry of fs.readdirSync(directory,{withFileTypes:true}))if(entry.isDirectory())await walk(path.join(directory,entry.name));
    if(!fs.existsSync(path.join(directory,'started.json')))return;
    const started=JSON.parse(fs.readFileSync(path.join(directory,'started.json'),'utf8')),engine=new GameEngine(started.initial,{applyInitialTurnStart:false});hashes.add(ruleStateHash(engine.getState()));
    for await(const row of gzipJsonRows(path.join(directory,'actions.jsonl.gz'))){engine.step(row.action);hashes.add(ruleStateHash(engine.getState()));actions++;}
    for await(const witness of gzipJsonRows(path.join(directory,'witnesses.jsonl.gz'))){
        const replay=new GameEngine(witness.initial,{applyInitialTurnStart:false});hashes.add(ruleStateHash(replay.getState()));
        for(const action of witness.actions){replay.step(action);hashes.add(ruleStateHash(replay.getState()));witnessActions++;}
    }
}
await walk(folder);
if(fs.existsSync(target)){
    const raw=fs.readFileSync(target),identity=crypto.createHash('sha256').update(raw).digest('hex'),archive=path.join(dir,'new-index-history');fs.mkdirSync(archive,{recursive:true});
    const saved=path.join(archive,identity+'.txt.gz');if(!fs.existsSync(saved))fs.copyFileSync(target,saved);
}
const sorted=[...hashes].sort();
function* output(){for(const hash of sorted)yield hash+'\n';}
await pipeline(Readable.from(output()),createGzip(),fs.createWriteStream(target+'.pending',{flags:'wx'}));fs.renameSync(target+'.pending',target);
const receipt={directory:folder,actions,witnessActions,uniqueStates:hashes.size,sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),internalUnloggedNodesRecoverable:false,reader:'stream-v4'};
fs.appendFileSync(path.join(dir,'new-index-history.jsonl'),JSON.stringify(receipt)+'\n');console.log(JSON.stringify(receipt));
