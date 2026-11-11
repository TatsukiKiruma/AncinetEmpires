import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const out=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(out,'../..'),prior=path.resolve(out,'../legacy2500_recovery_20261014_090431');
const read=f=>JSON.parse(fs.readFileSync(path.join(out,f))),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const m=read('package/manifest.json'),actions=read('action_differences.json');
const inventory=JSON.parse(fs.readFileSync(path.join(prior,'asset_inventory.json'))),archives=JSON.parse(fs.readFileSync(path.join(prior,'archive_audit.json')));
const storage=read('storage_decision.json');storage.assets={rawEpisodeBytes:inventory.assets.filter(a=>a.kind==='raw_episode'&&a.exists).reduce((s,a)=>s+a.bytes,0),compressedHashedFeatureBytes:archives.archives.reduce((s,a)=>s+a.compressedBytes,0),expandedHashedFeatureBytesAvoided:25812272838};
fs.writeFileSync(path.join(out,'storage_decision.json'),JSON.stringify(storage,null,2));
const exclusionCounts={};for(const x of m.excluded)exclusionCounts[x.reason]=(exclusionCounts[x.reason]??0)+1;
fs.writeFileSync(path.join(out,'REPORT.md'),`# 1395局旧轨迹：小规模观测适配与严格恢复

结论：**初态哈希不一致可以可靠解决，旧轨迹仍有价值，不应据此删除。** 本轮48局、8张双人地图，旧观测身份48/48精确匹配；仅5局完整记录通过R7冻结执行，其余43局在严格合法动作检查处停止。没有修改R7、主项目规则、原始episode或其hash，也没有强制执行非法动作。

## 初态差异及解决方式

1. 历史观测env、地形表、地形读取、abilities和rule_config从Git提交8c441c02b59e5714d37c386e0d753d221c960704取出，其SHA-256与2026-10-03历史恢复凭证一致（env等Git LF文件还原历史CRLF后匹配）。原始和本地导入改写后的hash见codec_identity.json。
2. R7观测增加isLand、capturable、variants、graphicsType；旧APK地形表的kind、linked字段、移动消耗、回血等值也不同。只删除新增四个字段，48局中0局hash匹配，因此不能通过随意删字段绕过检查。
3. 普通开局还存在首次收入差异。用历史编码但保留当前正常初始化，只匹配8局派生残局；明确使用无首次收入历史初始化后，48局全部匹配原始hash。原记录hash始终原样保留。
4. bridge.ts只在reset返回观测时使用有来源凭证的历史序列化。合法动作、固定mask/索引、动作执行、reward/done/winner全部来自R7冻结环境，历史env的step从未用于执行。

这是一种经过身份核验的观测版本适配，不是关闭初态检查；它也不把历史无首次收入课程改称当前正常开局。对1395局其余部分尚未验证，不能把48/48外推为全量通过。

## 严格回放结果

样本为每张双人地图：正常局最短及中位长度各1、低金币最短1、高金币最短1、高人口上限最短1、小优势残局最短1。总计48局，覆盖Duel等8图。该小样本有明确选短局倾向，不用5/48估计全体通过率。

- 初态hash通过：48；初始合法动作数量不一致：8；后续合法动作数量不一致：35。
- 完整轨迹通过：5；均为记录自然终局、无timeout；对应步骤数250、161、194、136、206，总计947步。
- 全部样本累计严格核对的转移：${m.totalVerifiedTransitions}步；实际回放约${(m.elapsedReplayMs/1000).toFixed(2)}秒，单进程、无GPU。
- 真实历史通过局作为正对照；初态hash、初始合法数、动作码、reward、done、winner、初态金币篡改7项负对照全部被拦截。

每一步核对记录所提供的玩家/回合、合法数量、固定动作索引、动作码、reward、done、winner，并核对最终summary。旧记录未保存逐步完整stateHash，因此不宣称恢复状态与旧运行每个隐藏字段逐位相同。

对43个失败点，只作诊断地在同一个R7状态上计算旧合法动作；${actions.filter(r=>r.oldRulesOnCurrentStateMatchRecordedCount).length}个点的旧数量可匹配原日志。差异涉及wolf、golem、指挥官、狼骑射手、弓箭手、heal/summon等地形移动或技能动作。其余16个点不能仅归因于当下动作枚举，也可能包含此前状态结算的分歧。未用旧规则推动新轨迹，也未修改新规则迁就它们。详见action_differences.json。

## 已处理的数据

从严格可核对前缀及初态身份单独通过的局面提取${m.rawIndependentRows}行，经独立状态校验、冻结编码器和教师重新标注，再隔离非元数据编码碰撞和剔除上一包重复输入，发布**新增${m.newUniqueInputs}个独特输入**，训练${m.train}、内部验证${m.validation}，来自${m.newSourceEpisodes}局。排除组数：${JSON.stringify(exclusionCounts)}。

每行保存完整stateJson、stateHash、原局逐记录hash、原始步骤、观测版本、规则冻结身份、教师种子和恢复方式。fullTrajectoryPassed与verifiedPrefixTransitions明确区分整局通过、前缀和仅初态恢复。旧标签不使用，valueLossMask=false。发布前逐行重新编码与教师复算保持一致。

沿用上一包的地图家族划分，不把同地图派生家族拆进不同集合。新增包与旧454行包的输入重叠为0；两包可作为同一历史课程候选池，共513个独特输入（训练346、内部验证167），仍不构成新独立验收。与R7最终训练清单尚未完成跨任务去重，因此不自动接入R7。

## 删除与空间决定

用户已授权对无法恢复且无价值的旧规则数据删除，但本轮找到可靠的初态适配、5局完整通过和可用状态，故**该删除条件不成立，历史数据删除0项**。尤其不能删除另外1105局仅存的哈希归档，或因合法动作分歧就把所有原始轨迹认定为无用。

本地原始轨迹约${(storage.assets.rawEpisodeBytes/1024**3).toFixed(2)}GiB；2500局哈希归档已压缩至约${(storage.assets.compressedHashedFeatureBytes/1024**3).toFixed(2)}GiB，并没有仍占25GB的解压副本可直接清理。开始时磁盘剩余约30.52GiB，本轮不展开压缩归档、不复制4GB轨迹，只新增小型补充包和诊断。仅清理本轮可再生逐行缓存，删除路径、字节和无链接检查写入storage_decision.json。

后续优先建议：继续在双人低金币短局和无复杂技能片段寻找严格兼容轨迹；对规则分歧之后的状态如需利用，应独立验证后重新rollout，不能冒称旧轨迹恢复。大规模训练仍优先使用当前规则新采集的数据。空间紧张时可将已校验的旧压缩归档外移到其他盘；本轮没有擅自选择外部目标或删除唯一证据。

## 文件及恢复命令

- codec_identity.json / observation_differences.json：旧版本身份与逐字段差异。
- initial_probe.json / replay_results.jsonl：48局初态及逐局结果，失败时保留完整状态。
- checks.json / action_differences.json：负对照与新旧动作集合差异。
- package/manifest.json / train.jsonl / validation.jsonl：已处理补充数据及hash。
- storage_decision.json：保留和清理记录。

在仓库根目录PowerShell执行：

\`\`\`powershell
$env:TSX_DISABLE_CACHE='1'
$env:OMP_NUM_THREADS='1'
$env:MKL_NUM_THREADS='1'
$env:OPENBLAS_NUM_THREADS='1'
$env:CUDA_VISIBLE_DEVICES='-1'
node --import tsx ai_training/${path.basename(out)}/checks.ts
node --import tsx ai_training/${path.basename(out)}/replay.ts
node --import tsx ai_training/${path.basename(out)}/finish.ts
node ai_training/${path.basename(out)}/report.mjs
\`\`\`

replay会跳过完整断点；已清理的逐行缓存会重新生成，结果必须与历史断点一致，不重复追加逐局记录。单局120秒，总回放30分钟上限。只使用前一任务已冻结的R7实现；不能删除前一任务frozen目录作为“缓存”。
`);
const oldIdentity=read('codec_identity.json');for(const entry of oldIdentity.entries)if(sha(fs.readFileSync(path.join(out,entry.name+'.ts')))!==entry.localSha256)throw Error('旧观测源码漂移');
for(const f of m.files)if(sha(fs.readFileSync(path.join(out,'package',f.file)))!==f.sha256)throw Error('包身份改变');
const deleted=[];
for(const name of fs.readdirSync(out).filter(f=>/^rows_[0-9a-f]+\.jsonl$/.test(f))){const target=path.resolve(out,name);if(!target.startsWith(out+path.sep)||fs.lstatSync(target).isSymbolicLink()||fs.realpathSync(out)!==out)throw Error('清理路径不安全');const bytes=fs.statSync(target).size;fs.unlinkSync(target);deleted.push({path:name,bytes});}
storage.newCacheDeleted.push(...deleted);storage.newCacheDeletedBytes=storage.newCacheDeleted.reduce((s,f)=>s+f.bytes,0);fs.writeFileSync(path.join(out,'storage_decision.json'),JSON.stringify(storage,null,2));
console.log(JSON.stringify({report:'REPORT.md',newInputs:m.newUniqueInputs,historicalDeleted:0,cacheDeletedBytes:storage.newCacheDeletedBytes}));
