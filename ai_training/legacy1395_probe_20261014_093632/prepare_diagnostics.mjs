import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
const out=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(out,'../..'),commit=JSON.parse(fs.readFileSync(path.join(out,'codec_identity.json'))).entries[0].gitCommit;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),entries=[];
for(const name of ['rules','map']){const original=execFileSync('git',['show',`${commit}:src/game/${name}.ts`],{cwd:root});const local=original.toString('utf8').replace(/from '\.\/([^']+)'/g,(_,dep)=>`from '${dep==='map'?'./diagnostic_map':['abilities','rule_config','terrain_rules','apk_terrain'].includes(dep)?'./'+dep:'../legacy2500_recovery_20261014_090431/frozen/src/game/'+dep}'`);fs.writeFileSync(path.join(out,'diagnostic_'+name+'.ts'),local);entries.push({gitPath:'src/game/'+name+'.ts',gitCommit:commit,originalSha256:sha(original),localSha256:sha(local)});}
fs.writeFileSync(path.join(out,'diagnostic_identity.json'),JSON.stringify({purpose:'只比较同一局面的旧/新合法动作，绝不用于推进恢复轨迹',entries},null,2));
