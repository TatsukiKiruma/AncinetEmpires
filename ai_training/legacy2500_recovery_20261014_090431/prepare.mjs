import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const out=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(out,'../..');
const r7=path.join(root,'ai_training/r7_training_stage_20261014_083500');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const entries=[];
function copy(src,dst,expected){
  const b=fs.readFileSync(src),sha256=digest(b);
  if(expected && sha256!==expected) throw Error(`冻结身份不匹配 ${src}`);
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  if(fs.existsSync(dst) && digest(fs.readFileSync(dst))!==sha256) throw Error(`禁止覆盖不同冻结版本 ${dst}`);
  fs.writeFileSync(dst,b);
  entries.push({source:path.relative(root,src),target:path.relative(out,dst),sha256,bytes:b.length});
}
const manifest=JSON.parse(fs.readFileSync(path.join(r7,'artifacts/frozen_env_manifest.json')));
for(const [name,sha] of Object.entries(manifest.files))copy(path.join(r7,'env/src_game_frozen',name),path.join(out,'frozen/src/game',name),sha);
for(const name of ['state_hash.ts','prng.ts']){
 const src=path.join(r7,'research',name),dst=path.join(out,'frozen/research',name);copy(src,dst);
 fs.writeFileSync(dst,fs.readFileSync(dst,'utf8').replaceAll('../env/src_game_frozen/','../src/game/'));
}
copy(path.join(root,'ai_training/tools/sd_training_state_generator.ts'),path.join(out,'frozen/tools/sd_training_state_generator.ts'));
copy(path.join(root,'ai_training/training_configs/sd_training_plan_20260705.json'),path.join(out,'frozen/plan.json'));
for(const name of ['frozen_env_manifest.json','parity_verification_report.json'])copy(path.join(r7,'artifacts',name),path.join(out,'evidence/r7_'+name));
copy(path.join(r7,'research/data_collector.ts'),path.join(out,'evidence/r7_data_collector.ts.txt'));
// 仅提取原校验器的完整断言和生成器；执行引擎来自上方同哈希冻结副本。
const src=path.join(root,'ai_training/tools/skirmish_dataset_export.ts');
const original=fs.readFileSync(src,'utf8');
const extracted="import {createHash} from 'node:crypto';\n"+original.slice(original.indexOf('function hashJson('),original.indexOf('export function replayEpisodeToDatasetSamples('));
fs.writeFileSync(path.join(out,'frozen/tools/strict_replay.ts'),extracted);
entries.push({source:path.relative(root,src),sha256:digest(original),target:'frozen/tools/strict_replay.ts',extractedSha256:digest(extracted),transformation:'原文提取 hashJson 至 replayEpisodeDatasetItems 末尾，不改变断言'});
const local=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})) {const p=path.join(dir,ent.name);if(ent.isSymbolicLink())throw Error('不允许冻结目录出现链接');if(ent.isDirectory())walk(p);else local.push({path:path.relative(out,p),sha256:digest(fs.readFileSync(p))});}}
walk(path.join(out,'frozen'));
fs.writeFileSync(path.join(out,'freeze_manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),r7,entries,local,ruleVersion:manifest.files['engine.ts'],note:'固定复制 R7 已冻结的权威实现；不修改规则，不导入活跃主项目规则'},null,2));
console.log(JSON.stringify({frozenFiles:local.length,out}));
