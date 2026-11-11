import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const arm=process.argv[2],dest=path.join(here,'source_'+arm);
if(fs.existsSync(dest))throw Error('来源快照已存在');
const run=JSON.parse(fs.readFileSync(path.join(here,arm+'_full/RUN.json'),'utf8'));
for(const [name,sha] of Object.entries(run.identity.sources)){
    const bytes=fs.readFileSync(path.join(root,name));
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('来源变化：'+name);
    const file=path.join(dest,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
}
console.log(JSON.stringify({arm,files:Object.keys(run.identity.sources).length}));
