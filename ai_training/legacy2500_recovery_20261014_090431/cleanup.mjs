import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const out=fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(out,'package/manifest.json')));
const check=JSON.parse(fs.readFileSync(path.join(out,'package_verification.json')));
if(!check.passed)throw Error('候选包尚未验证，禁止清理');
for(const f of manifest.files)if(sha(fs.readFileSync(path.join(out,'package',f.file)))!==f.sha256)throw Error('候选包哈希变化，禁止清理');
const deleted=[];
// 仅删除已核验包可重建的逐行临时副本；不递归，不经过 junction 或符号链接。
for(const name of ['candidate_rows','cache']){
 const dir=path.resolve(out,name);if(!dir.startsWith(out+path.sep))throw Error('清理越界');if(!fs.existsSync(dir))continue;
 if(fs.lstatSync(dir).isSymbolicLink()||fs.realpathSync(dir)!==dir)throw Error('清理目标是链接，拒绝');
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.resolve(dir,entry.name);if(!file.startsWith(dir+path.sep)||!entry.isFile()||entry.isSymbolicLink())throw Error('清理目录含子目录、链接或特殊对象，拒绝');
  const size=fs.statSync(file).size;fs.unlinkSync(file);deleted.push({path:path.relative(out,file),bytes:size});
 }
 fs.rmdirSync(dir);
}
fs.writeFileSync(path.join(out,'cleanup_record.json'),JSON.stringify({createdAt:new Date().toISOString(),scope:out,recursive:false,junctionTraversed:false,deleted,deletedBytes:deleted.reduce((s,f)=>s+f.bytes,0),retained:'原始轨迹、压缩归档、旧快照、模型、全部失败证据、断点记录、冻结规则与最终包均保留',resume:'resume.ps1 会按历史快照恢复缺失逐行缓存，校验输入和标签身份，不重复追加逐局记录'},null,2));
console.log(JSON.stringify({deletedFiles:deleted.length,deletedBytes:deleted.reduce((s,f)=>s+f.bytes,0)}));
