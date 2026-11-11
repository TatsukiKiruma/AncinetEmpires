import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const out=fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const log=path.join(out,'snapshot_results.jsonl'),bytes=fs.readFileSync(log),rows=bytes.toString('utf8').trim().split('\n').map(JSON.parse);
const target=rows.find(r=>r.status==='B_VALID_RELABELLED'),file=path.resolve(out,'candidate_rows',target.file);
if(!file.startsWith(out+path.sep)||fs.lstatSync(file).isSymbolicLink()||fs.realpathSync(path.dirname(file))!==path.dirname(file))throw Error('断点测试路径不安全');
const original=JSON.parse(fs.readFileSync(file));
// 只删除有历史原件、来源哈希和正式包的单个可再生缓存，模拟清理后断点恢复。
fs.unlinkSync(file);
const result=spawnSync(process.execPath,['--import','tsx',path.join(out,'relabel_snapshots.ts'),'1'],{cwd:path.resolve(out,'../..'),stdio:'inherit',env:{...process.env,TSX_DISABLE_CACHE:'1',OMP_NUM_THREADS:'1',MKL_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',CUDA_VISIBLE_DEVICES:'-1'}});
if(result.status!==0)throw Error('断点恢复失败');
const restored=JSON.parse(fs.readFileSync(file));
if(original.inputHash!==restored.inputHash||original.stateHash!==restored.stateHash||original.targetActionIndex!==restored.targetActionIndex||hash(bytes)!==hash(fs.readFileSync(log)))throw Error('断点恢复身份或日志一致性失败');
fs.writeFileSync(path.join(out,'resume_verification.json'),JSON.stringify({passed:true,deletedAndRebuiltCache:path.relative(out,file),inputHash:restored.inputHash,stateHash:restored.stateHash,targetActionIndex:restored.targetActionIndex,checkpointLogUnchanged:true,note:'重新生成仅更新教师预算说明文本；真实输入、完整状态、硬标签及断点日志保持身份'},null,2));
console.log('单行缓存删除后的断点恢复验证通过');
