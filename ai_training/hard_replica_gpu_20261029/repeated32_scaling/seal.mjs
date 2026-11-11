import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const run=JSON.parse(fs.readFileSync(path.join(dir,'batch-32/RUN.json'),'utf8'));
for(const [file,hash] of Object.entries(run.identity.sources)){
    const b=fs.readFileSync(path.join(root,file));if(sha(b)!==hash)throw Error('来源变化：'+file);
    const dest=path.join(dir,'sources',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b);
}
const files=[];
function visit(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())visit(f);else if(e.name!=='MANIFEST.json'){const b=fs.readFileSync(f);files.push({path:path.relative(dir,f).replaceAll('\\','/'),bytes:b.length,sha256:sha(b)});}}}
visit(dir);fs.writeFileSync(path.join(dir,'MANIFEST.json'),JSON.stringify({completedAt:new Date().toISOString(),sourcesVerified:true,files},null,2));console.log({files:files.length});
