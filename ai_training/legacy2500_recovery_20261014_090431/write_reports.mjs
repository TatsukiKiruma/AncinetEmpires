import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const out=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(out,'../..');
const read=f=>JSON.parse(fs.readFileSync(path.join(out,f),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const m=read('package/manifest.json'),inventory=read('inventory_summary.json'),scenarios=read('scenario_report.json'),dedup=read('dedup_leakage.json'),cross=read('cross_task_overlap.json'),checks=read('package_verification.json');
const rowResults=fs.readFileSync(path.join(out,'snapshot_results.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const bySnapshot=new Map(rowResults.map(r=>[r.snapshotId,r]));
const failedEvidence=read('snapshot_failure_evidence.json');
for(const r of failedEvidence){const key=path.basename(path.dirname(r.source))+':'+r.lineIndex,final=bySnapshot.get(key);r.finalStatus=final?.status;r.finalError=final?.error??null;r.note=final?.status==='B_VALID_RELABELLED'?'堆叠观察命中，但符合冻结引擎合法pending条件；不计入1125行隔离数量':'当前状态校验未通过，保留完整来源和异常字段';}
fs.writeFileSync(path.join(out,'snapshot_failure_evidence.json'),JSON.stringify(failedEvidence,null,2));
const categories=m.archiveCategoryCounts;
const discarded={};for(const r of rowResults)if(r.status==='QUARANTINE')discarded[r.error]=(discarded[r.error]??0)+1;
const rows=['train','validation'].flatMap(split=>fs.readFileSync(path.join(out,'package',split+'.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
const byMap={};for(const row of rows){const c=byMap[row.mapName]??{uniqueInputs:0,train:0,validation:0};c.uniqueInputs++;c[row.split]++;byMap[row.mapName]=c;}
fs.writeFileSync(path.join(out,'map_report.json'),JSON.stringify(byMap,null,2));
const byPlayer={};for(const r of rows){const p=r.stateJson.players.length;byPlayer[p]=(byPlayer[p]??0)+1;}
const before=fs.readFileSync(path.join(out,'git_status_before.txt'),'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/),after=fs.readFileSync(path.join(out,'git_status_after.txt'),'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/);
const freeze=read('freeze_manifest.json'),sourceChecks=[];
for(const entry of freeze.entries){const p=path.join(root,entry.source);sourceChecks.push({path:entry.source,capturedSha256:entry.sha256,currentSha256:sha(fs.readFileSync(p))});}
const protection={generatedAt:new Date().toISOString(),writeRoot:out,rootRuleFilesModifiedByTask:0,r7Writes:0,trainingProcessesStarted:0,gpuUsed:false,processingWorkers:1,sourceChecks,sourceChanges:sourceChecks.filter(x=>x.capturedSha256!==x.currentSha256),gitStatusAdded:after.filter(x=>!before.includes(x)),gitStatusRemoved:before.filter(x=>!after.includes(x)),note:'git状态属于共享工作区快照，其他agent的新增产物或变化不归因于本任务；本任务所有写入API均指向隔离目录，原件只读。'};
fs.writeFileSync(path.join(out,'protection_record.json'),JSON.stringify(protection,null,2));
const table='| 场景 | 归档局数 | 本地原局 | A整局 | B有可用状态 | C缺失原局 | D后续待恢复 | 独特输入 |\n|---|---:|---:|---:|---:|---:|---:|---:|\n'+scenarios.map(s=>`| ${s.planId} | ${s.archiveEpisodes} | ${s.rawEpisodes} | ${s.A} | ${s.B} | ${s.C} | ${s.D} | ${s.uniqueInputs} |`).join('\n');
const time=new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
const report=`# 历史2500局数据审计报告

生成时间：${time}（北京时间）。任务目录：\`${path.basename(out)}\`。未启动模型训练，未修改或接入R7数据。

## 可以使用什么

独立候选包包含 **${m.uniqueInputs} 个真实网络独特输入**，来自 **${m.usableSourceEpisodes} 局的 ${m.packagedSourceRows} 行完整历史快照**。训练 ${m.train} 行，内部验证 ${m.validation} 行；${m.families} 个保守地图家族。先有50局475行通过状态验证，再隔离7组非元数据编码碰撞（19行），余下456行去重为454输入。它们属于B类：完整快照在冻结规则下通过独立状态检查后重新编码、重新标注。没有把新标签当作旧轨迹恢复证据。

整局严格恢复通过 **0 局**。当前普通开局和明确标记的历史无首次收入入口均保留初态哈希检查；1395局全部在初始观测身份处失败，因此本次没有验证其9219721步后续转移和终局。不能将“初态观测不兼容”推广成“每一步动作都非法”。

归档2500局最终分类：A=${categories.A}、B=${categories.B}、C=${categories.C}、D=${categories.D}。C是缺少本地原始轨迹、无法从哈希特征可靠反推棋盘的1105局；D的1345局已做初态严格检查，但没有可复用快照，本轮未完成进一步旧观测版本适配或状态恢复。D并非“已证明永久不可恢复”。\`episode_results.jsonl\` 是最终逐局分类；\`replay_results.jsonl\` 是入口检查阶段日志，其临时C判定由最终分类取代。

## 冻结合同和规则边界

- 使用R7的 \`env/src_game_frozen\`，81份本地冻结文件及相关来源见 \`freeze_manifest.json\`。规则是权威实现的同哈希副本，没有另写或放宽规则。
- engine SHA-256：\`${m.ruleVersion}\`；冻结集合身份：\`${m.freezeIdentity}\`。
- schema：\`${m.encoderSchema}\`，空间34×20×20、全局20、每候选53维语义及三组坐标；候选保持R7的合法动作原顺序。
- R7现有100状态TS/Python一致性报告保存于 \`evidence/r7_parity_verification_report.json\`；本任务另做全包重新编码和重新标注一致性验证，结果见 \`package_verification.json\`。未运行训练或GPU前向。
- 教师是相同冻结 \`HeuristicAI\`，每状态一次 \`getAction\`，保留教师内部原生评估，不追加外部rollout。随机种子取实际输入哈希前32位，使重标注可重现；这不冒称与R7按对局PRNG生成的标签逐位相同。
- 本地APK的20张加密地图均只读解密，与冻结内嵌地图逐项一致；见 \`map_source_check.json\`。无APK原件被复制到候选包。

## 资产和缺失

归档实际保存三份tar.xz，压缩约1.005GB，内含250份checkpoint manifest和406个哈希特征分片，共656个成员、25,812,272,838字节。压缩包及每个成员都重新计算SHA-256，与历史回执/最终manifest一致，缺失、重复成员、大小/哈希错误均为0。没有落盘展开25GB数据；\`archive_audit.json\` 保存逐成员证据。这只证明历史字节完整，不证明当前训练适用。

原始轨迹本地为11个文件、1395局、9219721步：432局双人、496局三人、467局四人；历史summary宣称1003局terminal、392局timeout。它们是原始记录分布，不是本次重新证实的自然胜负。10个原始文件与归档来源hash完全一致；四人正常补充文件只剩35/80局且hash不同。另8个原始文件缺失；总差额1105局。缺失局的精确身份未由本地证据确定，不伪造其seed或行号。

历史哈希特征、原始动作轨迹、完整状态快照、重新编码的网络输入为四种不同资产。哈希特征没有被逆向捏造为状态；旧1600行特征和标签均未直接复用，只读取其带哈希的完整stateJson和来源。

## 抽验与扩量

先按场景、地图、人数、终止类型、长度桶固定抽取100局：20张地图、11个本地场景；双人84、三人8、四人8；terminal62、timeout38；短局46、中局15、长局39。派生残局与正常开局均覆盖。技能/高阶/建筑专项原始文件缺失，不能伪称覆盖。

100局入口抽验约2.6秒；发现均为初始hash不兼容后，将廉价入口审计扩展到全部1395局，增量约38.4秒。完整快照首批50行约5.1秒；随后审计全部1600行，正式一轮约47.6秒。没有把重计算预算投入三四人长局逐步重放。

独立状态检查包括地图结构及冻结地形语义、单位身份/位置/血量、合法招募pending、墓碑有效范围、玩家与规则配置一致性、引擎/规则/环境合法动作及固定索引mask一致性、克隆单步及引擎环境转移一致性。完整状态与原局来源hash、step的玩家/回合锚点也逐条验证。以上证明其可作为当前规则下的独立课程状态，不证明旧轨迹可达性或旧赢家标签。

1600行中475行通过，1125行隔离：1121行含hp>maxHp；另4行不满足冻结规则的招募堆叠条件。没有钳制血量、移动单位、强制执行旧动作。有效快照的新目标全部由冻结教师产生，valueTarget=null、valueLossMask=false，旧reward/value/winner不入训练。

审计器自身试验中曾过严地排除寿命为0的墓碑和合法指挥官招募堆叠；读取冻结引擎确认后修正审计器并全量重新执行，未改游戏规则。旧审计日志保存在 \`evidence/*superseded*\`，不作为最终结果。负对照覆盖初态、合法动作数、动作码、reward、done、winner；另验证超上限血量拒绝、零寿命墓碑及合法pending接纳。

## 去重、碰撞和泄漏

按R7实际输入的Float32字节、有序候选坐标和语义去重；教师分数、动作代码、状态ID不混入网络输入hash。475行对应461个输入，8组输入各自关联不同完整状态；同输入硬目标冲突0组。其中7组差异涉及rules.unitLimit，虽然当前硬目标一致，但规则信息发生编码丢失，因此整组19行隔离，不修改R7编码器迁就旧数据。剩余456行只合并纯元数据重复，发布454个输入。碰撞字段、隔离标记及全部来源stateHash见 \`dedup_leakage.json\`；B中2局所有行因编码碰撞隔离，最终包实际来自48局。

历史未完整记录派生父局，因此同地图的所有场景、种子、原局及派生状态保守归为同一地图家族；共享输入还进行传递合并。训练/验证输入、家族、原局交叉数均为0。验证仅作历史课程内部回归；不能当作新的独立验收集。数据原玩家数分布（独特输入）：${JSON.stringify(byPlayer)}。地图分布见 \`map_report.json\`；历史50局未覆盖Duel，候选包不补造Duel状态。

R7交叉检查读取了当时可见文件的固定字节前缀：${cross.files.reduce((s,f)=>s+f.compared,0)}行，重叠${cross.inputOverlaps.length}。R7仍在追加写入，故结论为 **尚未完成跨任务去重**。来源前缀hash、读取时间、可读评估登记manifest hash见 \`cross_task_overlap.json\`。后续采用之前须对R7最终训练清单复核，不自动接入。

## 分场景结论

${table}

场景独特输入按关联来源归属，同一输入可能关联多个场景，因此表内输入总和不要求等于全局${m.uniqueInputs}。逐场景状态丢弃原因及编码碰撞隔离行数见 \`scenario_report.json\`。优先用途是少量双人、多地图历史课程的策略模仿补充；三四人状态单列，不以其数量替代双人目标覆盖。技能、高阶和建筑专项缺原局，本轮只能留档。

## 交付和未验证范围

可使用 \`package/train.jsonl\`、\`package/validation.jsonl\`，合同见 \`package/schema.json\`，来源/身份见每行allProvenance及 \`package/state_index.jsonl\`，文件hash见 \`package/manifest.json\`。全包${checks.checkedRows}行重新编码、教师重新求值及分割检查均通过。

继续保留：三份旧哈希归档、所有原始轨迹与历史模型报告、1125行失败快照的原件和失败证据。仍未验证：全部原始轨迹在新规则下的完整转移/终局、D类进一步恢复潜力、缺失1105局原始状态、与R7最终数据的重叠、任何模型收益或棋力改善。

默认单工作进程，数值线程1、GPU禁用。四小时重计算上限未耗尽；本轮因初态合同不兼容选择完成独立状态候选包，不为凑2500局继续重放长局。当前计时是单步骤实测，未宣称总峰值内存已测量。可用 \`resume.ps1\` 串行断点恢复，并对单次恢复设置四小时硬上限。
`;
fs.writeFileSync(path.join(out,'DATA_AUDIT_REPORT.md'),report);
fs.writeFileSync(path.join(out,'HANDOFF.md'),`# 历史2500局候选数据包交接

交付：${time}（北京时间）。**可用${m.uniqueInputs}个独特空间输入，来自${m.usableSourceEpisodes}局的${m.packagedSourceRows}行独立验证快照；旧整局严格恢复通过0局。** 未启动训练，未改R7。

- A 0局：没有现行规则下整条旧轨迹严格通过。
- B 50局：475行完整状态独立验证通过；隔离人口上限编码碰撞后，最终使用48局456行，去重得到训练${m.train}行、内部验证${m.validation}行。
- C 1105局：本地原始轨迹缺失；哈希特征不能恢复棋盘，当前只能留档。
- D 1345局：初态检查已确认不兼容；进一步恢复尚未完成，不能据此声称永久不可恢复。

## 使用合同

读取 [manifest](package/manifest.json)、[schema](package/schema.json)，再读取 [训练数据](package/train.jsonl) 和 [内部验证数据](package/validation.jsonl)。使用R7同哈希冻结引擎、34/20/53编码器和HeuristicAI；候选按引擎原顺序，targetActionIndex为新教师硬标签。必须关闭value loss，不使用旧reward/winner。每行保留stateJson、stateHash和全部来源。

这是 \`legacy-no-initial-income-v1\` 历史课程，不能作为当前正常开局数据，也不能作为新独立验收集。地图家族划分不得重拆为逐行随机分割。建议只作后续独立实验的少量课程补充；尚无训练收益证据。

**尚未完成跨任务去重**：读取R7运行中文件前缀未见重叠，但它不是最终清单。采用前须再次核对；本任务不写入R7、不自动接入训练。

## 证据入口

- [完整报告](DATA_AUDIT_REPORT.md)、[逐场景统计](scenario_report.json)、[地图统计](map_report.json)
- [资产清单](asset_inventory.json)、[缺失清单](missing_assets.json)、[压缩成员完整性](archive_audit.json)
- [逐局最终结果](episode_results.jsonl)、[原始轨迹入口日志](replay_results.jsonl)、[逐快照结果](snapshot_results.jsonl)
- [失败证据](snapshot_failure_evidence.json)、[全包复验](package_verification.json)、[负对照](checks.json)
- [冻结身份](freeze_manifest.json)、[去重/碰撞/泄漏](dedup_leakage.json)、[跨任务重叠](cross_task_overlap.json)
- [文件保护记录](protection_record.json)、[清理记录](cleanup_record.json)

## 断点恢复

在仓库根目录的PowerShell 7执行：

\`\`\`powershell
pwsh -NoProfile -File .\\ai_training\\${path.basename(out)}\\resume.ps1
\`\`\`

只使用已安装Node/tsx和Python标准库；不安装依赖、不启动模型训练。命令串行运行、限制线程、禁GPU，最多四小时；校验冻结身份和原始记录hash，跳过已完成记录。清理过的逐行缓存可按旧完整快照重建，重建结果必须与断点输入/标签身份相同。

只核验已发布包（约30秒）：

\`\`\`powershell
$env:TSX_DISABLE_CACHE='1'
node --import tsx .\\ai_training\\${path.basename(out)}\\verify_package.ts
\`\`\`

恢复后的报告/清理可运行 \`node .../write_reports.mjs\`、\`node .../cleanup.mjs\`；清理只处理本目录的可再生逐行缓存，拒绝链接，不递归。原始轨迹、旧归档、历史模型、唯一失败证据均不得删除。
`);
console.log(JSON.stringify({reportsWritten:true,sourceChanges:protection.sourceChanges.length,byPlayer}));
