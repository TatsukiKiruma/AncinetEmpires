// 从实际ready消息检查权威七地图与首次收入后的初态，不能只信配置中的地图名。
import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';import assert from 'node:assert/strict';import {createState,MAPS,hash} from './common';
const S=path.resolve(__dirname,'..'),expected=new Map(MAPS.map(m=>[m,hash(createState(m))])),rows:any[]=[];
async function main(){for(const dir of fs.readdirSync(path.join(S,'runs')).filter(x=>x.startsWith('dev_')||x==='final_r8')){
 const full=path.join(S,'runs',dir);if(!fs.statSync(full).isDirectory())continue;
 for(const f of fs.readdirSync(full).filter(x=>/^game_\d+\.json$/.test(x))){
  const r=JSON.parse(fs.readFileSync(path.join(full,f),'utf8'));const lines=readline.createInterface({input:fs.createReadStream(path.join(full,f.replace(/\.json$/,'.jsonl'))),crlfDelay:Infinity});let ready:any;
  for await(const line of lines){const x=JSON.parse(line);if(x.type==='ready'){ready=x;break;}}
  assert(ready);assert.equal(hash(ready.initialState),expected.get(r.mapName));assert.equal(r.initialStateHash,expected.get(r.mapName));rows.push({panel:dir,game:r.gameIndex,map:r.mapName,initialStateHash:r.initialStateHash});
 }
}
fs.writeFileSync(path.join(S,`evidence/initial_identity_${process.argv[2]??'current'}.json`),JSON.stringify({passed:true,games:rows.length,expected:Object.fromEntries(expected),rows},null,2));console.log('地图与初态身份通过',rows.length);}
main();
