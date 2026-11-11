import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const out=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('交付目录不允许包含链接');if(entry.isDirectory())walk(file);else if(file!==path.join(out,'delivery_manifest.json'))files.push({path:path.relative(out,file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))});}}
walk(out);
const manifest=JSON.parse(fs.readFileSync(path.join(out,'package/manifest.json')));
const report=JSON.parse(fs.readFileSync(path.join(out,'package_verification.json')));
if(!report.passed||report.checkedRows!==manifest.uniqueInputs)throw Error('交付数量校验失败');
for(const f of manifest.files){const actual=files.find(x=>x.path===path.join('package',f.file));if(!actual||actual.sha256!==f.sha256)throw Error('最终包文件身份失败');}
fs.writeFileSync(path.join(out,'delivery_manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),files,uniqueInputs:manifest.uniqueInputs,authoredSourceFiles:files.filter(f=>!f.path.startsWith('frozen'+path.sep)&&!f.path.startsWith('evidence'+path.sep)&&/\.(ts|mjs|py|ps1)$/.test(f.path)),note:'仅密封当前隔离目录；不修改主项目、历史原件或R7。后续恢复会更新报告，应重新运行本脚本生成交付hash。'},null,2));
console.log(JSON.stringify({files:files.length,totalBytes:files.reduce((s,f)=>s+f.bytes,0),uniqueInputs:manifest.uniqueInputs}));
