import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const comparison=JSON.parse(fs.readFileSync(path.join(here,'COMPARISON.json'),'utf8'));
for(const [name,hash] of Object.entries(comparison.candidate.sources))if(sha(fs.readFileSync(path.join(root,name)))!==hash)throw Error('最终来源不符：'+name);
const files=[];
function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())visit(file);else if(entry.name!=='DELIVERY_MANIFEST.json'){const bytes=fs.readFileSync(file);files.push({path:path.relative(here,file).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)});}}}
visit(here);
fs.writeFileSync(path.join(here,'DELIVERY_MANIFEST.json'),JSON.stringify({completedAt:new Date().toISOString(),sourcesMatch:true,formalCollection:'paused',files},null,2));
console.log(JSON.stringify({files:files.length,sourcesMatch:true}));
