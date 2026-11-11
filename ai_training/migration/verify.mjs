import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory,'../..');
const manifest = JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
const changes = new Set(['skirmish_training_runner','skirmish_dual_head_net','skirmish_neural_search','skirmish_network_features','skirmish_action_semantics','skirmish_search_teacher','v7_heuristic_bounded_search'].map(n=>`ai_training/tools/${n}.ts`));
const result = {schema:1,startedAt:new Date().toISOString(),files:0,bytes:0,unchanged:0,sourceChanges:[],regeneratedCaches:[],failures:[]};
async function digest(file){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
for(const item of manifest.files){
  const file=path.join(root,item.to);
  if(!fs.existsSync(file)){result.failures.push({file:item.to,reason:'目标缺失'});continue;}
  const sha=await digest(file);
  if(sha===item.sha256)result.unchanged+=1;
  else if(item.to.includes('/__pycache__/') && item.to.endsWith('.pyc')) {
    // 解释器可以重建字节码缓存；它们不属于模型、数据或历史证据。
    result.regeneratedCaches.push({file:item.to,before:item.sha256,after:sha});
  } else if(changes.has(item.to)){
    const original=path.join(directory,'originals',item.to);
    if(fs.existsSync(original)&&(await digest(original))===item.sha256)result.sourceChanges.push({file:item.to,before:item.sha256,after:sha,original:path.relative(root,original).replaceAll('\\','/')});
    else result.failures.push({file:item.to,reason:'源码原始备份不匹配'});
  }else result.failures.push({file:item.to,reason:'非预期内容变化',before:item.sha256,after:sha});
  result.files+=1;result.bytes+=item.bytes;
  if(result.files%2000===0)console.log(`已核对 ${result.files} 个文件`);
}
result.completedAt = new Date().toISOString();
fs.writeFileSync(path.join(directory,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({files:result.files,unchanged:result.unchanged,sourceChanges:result.sourceChanges.length,failures:result.failures.length}));
process.exitCode=result.failures.length?1:0;
