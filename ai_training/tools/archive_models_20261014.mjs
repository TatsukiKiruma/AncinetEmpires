import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// 本次整理只移动明确列出的历史目录；所有文件保留，原路径建立兼容联接。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archive = path.join(root, 'archive/model_retirement_20261014');
const manifestPath = path.join(archive, 'manifest.json');
const slash = p => p.split(path.sep).join('/');
const relative = p => slash(path.relative(root, p));
function inside(p) {
  const resolved = path.resolve(root, p);
  if (!resolved.startsWith(root + path.sep)) throw new Error(`路径越界：${p}`);
  return resolved;
}
function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (fs.lstatSync(p).isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...walk(p));
    else if (entry.isFile()) files.push(p);
  }
  return files;
}
function hash(p) {
  const fd = fs.openSync(p, 'r');
  const digest = crypto.createHash('sha256');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) digest.update(buffer.subarray(0, count));
  } finally { fs.closeSync(fd); }
  return digest.digest('hex');
}
function writeJson(p, value) {
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
}
function children(p, predicate = () => true) {
  if (!fs.existsSync(inside(p))) return [];
  return fs.readdirSync(inside(p), { withFileTypes: true })
    .filter(e => e.isDirectory() && predicate(e.name)).map(e => `${p}/${e.name}`);
}
function isModel(p) {
  if (/\.(pt|pth|onnx|safetensors)$/i.test(p)) return true;
  if (!p.endsWith('.json') || fs.statSync(p).size < 20000) return false;
  const fd = fs.openSync(p, 'r');
  const head = Buffer.alloc(8192);
  let count;
  try { count = fs.readSync(fd, head, 0, head.length, 0); }
  finally { fs.closeSync(fd); }
  return /"(?:stem|weights|policyWeights|state_dict|stateDict)"\s*:/.test(head.subarray(0, count).toString());
}
function classify(p) {
  if (/\.pt$|\.pth$/.test(p)) return '训练状态或权重容器，完整保留，未反序列化判定恢复字段';
  return 'JSON权重';
}
function makePlan() {
  fs.mkdirSync(archive, { recursive: true });
  if (fs.existsSync(manifestPath)) throw new Error('清单已经存在，请使用 --verify 或 --apply');
  const selected = [];
  const add = (paths, reason) => paths.forEach(p => {
    if (fs.existsSync(inside(p))) selected.push({ original: p, reason });
  });
  add(['training_runs/models', 'v12/models'], '早期基线与旧规则训练模型，停止当前配方，保留归档对照');
  for (const run of children('training_runs', n => n.startsWith('agent_upgrade_') && n !== 'agent_upgrade_20260921_v8_final_01')) {
    add([`${run}/checkpoints`], '历史训练检查点；应用登记的v8_final权重保留原位');
  }
  for (const run of children('v14/out')) {
    add(children(`${run}/T14-04`, n => n.startsWith('run_')), '早期tiny-fit调试训练，保留全部恢复文件和日志');
    add(children(`${run}/T14-06`, n => /^c\d+_s/.test(n)), '旧版训练对照，已有后继研究代表');
  }
  const v15 = 'v15/out/v15_20260925_core';
  add([`${v15}/T15-05/tiny_fit`, `${v15}/T15-05/comparable`], '拟合与一致性调试资产');
  add(children(`${v15}/T15-06`, n => /^c2_/.test(n)), '旧规则C2及错误schema对照，完整封存');
  add(children(`${v15}/T15-08`, n => /^d[012]_/.test(n)), '旧规则D系列实验，未作为后续代表');
  add(children('v16/out/v16_20260926_core/experiments', n => ['A0', 'A1', 'W1'].includes(n)), 'V16非代表分支，P1全目录原位保留');
  add(children('v17/out/v17_20260926_r2/experiments', n => !['_data', '_scratch', 'B0'].includes(n)), 'V17未超过基线的实验分支，保留B0作为代表');
  add(children('v18/out/run_20260927_v18_01/experiments'), 'V18未晋升分支及重复A臂；重复关系以字节哈希另行核对');
  add(children('v19/out/run_20260928_v19_01/experiments', n => n.startsWith('ppo_') && n !== 'ppo_w2_v19schema'), '早期PPO失败配方；保留34通道代表及价值预热资产');
  add(children('v19/out/run_20260929_v19_02/experiments', n => ['ppo_w2', 'ppo_w3', 'r2_control'].includes(n)), '重复PPO后续波次及对照；保留θ1和r2_fix代表');
  add(children('v19/out/data_scale_20261003/training'), '六组旧池规模对照未优于θ1，保留数据与全部检查点证据');
  add(children('r8_pure_policy_stage_20261014_125300/checkpoints', n => n !== 'r1_warm'), 'R8未领先分支及第二种子负结果，保留所有恢复状态与训练台账');
  selected.sort((a, b) => a.original.localeCompare(b.original));
  for (const item of selected) {
    const p = inside(item.original);
    if (fs.lstatSync(p).isSymbolicLink()) throw new Error(`不移动联接：${p}`);
    if (selected.some(other => other !== item && item.original.startsWith(other.original + '/'))) throw new Error('目录重叠');
    item.archived = `archive/model_retirement_20261014/payload/${item.original}`;
    item.files = walk(p).map(file => ({ path: slash(path.relative(p, file)), bytes: fs.statSync(file).size, sha256: hash(file) }));
    item.status = 'planned';
  }
  const inventory = [];
  // 跳过工作区支持链接及既有归档，避免把公共源码、node_modules和归档副本算作新模型。
  for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory() || ['archive', 'migration', 'APK', 'src', 'captures', 'node_modules'].includes(dir.name)) continue;
    const p = path.join(root, dir.name);
    if (fs.lstatSync(p).isSymbolicLink()) continue;
    for (const file of walk(p)) {
      if (relative(file).includes('/archive/') || !isModel(file)) continue;
      const name = relative(file);
      const group = selected.find(item => name.startsWith(item.original + '/'));
      inventory.push({ path: name, bytes: fs.statSync(file).size, sha256: hash(file), kind: classify(file), disposition: group ? 'archived' : 'retained', archiveGroup: group?.original ?? null });
    }
  }
  const manifest = { schema: 'model-retirement-20261014-v1', createdAt: new Date().toISOString(), root, status: 'planned', policy: '不删除；保持字节、mtime和原路径可访问；不宣称精确文件去重等于参数去重；不合并优化器或RNG状态', groups: selected, inventory };
  writeJson(manifestPath, manifest);
  const byHash = new Map();
  for (const item of inventory) {
    if (!byHash.has(item.sha256)) byHash.set(item.sha256, []);
    byHash.get(item.sha256).push(item);
  }
  writeJson(path.join(archive, 'duplicates.json'), [...byHash.entries()].filter(([, items]) => items.length > 1).map(([sha256, items]) => ({ sha256, bytesPerCopy: items[0].bytes, preferredPath: items.find(i => i.disposition === 'retained')?.path ?? items[0].path, copies: items.map(i => ({ path: i.path, disposition: i.disposition })) })));
  console.log(JSON.stringify({ groups: selected.length, archivedFiles: selected.reduce((n, g) => n + g.files.length, 0), archivedBytes: selected.reduce((n, g) => n + g.files.reduce((s, f) => s + f.bytes, 0), 0), modelContainers: inventory.length, duplicateGroups: [...byHash.values()].filter(v => v.length > 1).length }));
}
function validateFiles(base, files) {
  for (const file of files) {
    const p = path.join(base, file.path);
    if (fs.statSync(p).size !== file.bytes || hash(p) !== file.sha256) throw new Error(`文件变化：${p}`);
  }
}
function apply() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  // 先验证所有待移动文件；任何变化都在移动前终止。
  for (const group of manifest.groups) validateFiles(inside(group.status === 'archived' ? group.archived : group.original), group.files);
  for (const group of manifest.groups) {
    if (group.status === 'archived') continue;
    const original = inside(group.original), target = inside(group.archived);
    if (fs.existsSync(target) || fs.lstatSync(original).isSymbolicLink()) throw new Error(`目标已存在或源为联接：${original}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(original, target);
    try { fs.symlinkSync(target, original, 'junction'); }
    catch (error) { fs.renameSync(target, original); throw error; }
    group.status = 'archived';
    writeJson(manifestPath, manifest);
  }
  manifest.status = 'archived';
  writeJson(manifestPath, manifest);
  verify();
}
function verify() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  for (const group of manifest.groups) {
    const original = inside(group.original), target = inside(group.archived);
    if (group.status === 'archived') {
      if (!fs.lstatSync(original).isSymbolicLink() || fs.realpathSync(original) !== fs.realpathSync(target)) throw new Error(`兼容路径错误：${original}`);
      const actual = walk(target).map(p => slash(path.relative(target, p))).sort();
      if (JSON.stringify(actual) !== JSON.stringify(group.files.map(f => f.path).sort())) throw new Error(`归档文件集合变化：${target}`);
    }
    validateFiles(group.status === 'archived' ? target : original, group.files);
  }
  for (const model of manifest.inventory) if (hash(inside(model.path)) !== model.sha256) throw new Error(`模型变化：${model.path}`);
  const report = { checkedAt: new Date().toISOString(), passed: true, status: manifest.status, groups: manifest.groups.length, files: manifest.groups.reduce((n, g) => n + g.files.length, 0), modelContainers: manifest.inventory.length, originalPathsAccessible: true };
  writeJson(path.join(archive, 'verification.json'), report);
  console.log(JSON.stringify(report));
}
function restore() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  // 恢复前完整验证，且仅移除本清单登记的联接本身，不递归删除目录。
  verify();
  for (const group of manifest.groups.filter(g => g.status === 'archived')) {
    const original = inside(group.original), target = inside(group.archived);
    fs.rmdirSync(original);
    try { fs.renameSync(target, original); }
    catch (error) { fs.symlinkSync(target, original, 'junction'); throw error; }
    group.status = 'restored';
    writeJson(manifestPath, manifest);
  }
  manifest.status = 'restored';
  writeJson(manifestPath, manifest);
  verify();
}
function report() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  const duplicates = JSON.parse(fs.readFileSync(path.join(archive, 'duplicates.json')));
  const dedupPath = path.join(archive, 'deduplication_verification.json');
  const dedup = fs.existsSync(dedupPath) ? JSON.parse(fs.readFileSync(dedupPath)) : null;
  const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const rows = [['原路径（相对ai_training）', '归档后实际路径', '分类', '文件类型', '字节数', 'SHA256']];
  for (const item of manifest.inventory) {
    const group = manifest.groups.find(g => g.original === item.archiveGroup);
    rows.push([item.path, group ? `${group.archived}/${item.path.slice(group.original.length + 1)}` : item.path, item.disposition === 'archived' ? '归档' : '原位保留', item.kind, item.bytes, item.sha256]);
  }
  fs.writeFileSync(path.join(archive, '模型文件清单.csv'), '\ufeff' + rows.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n');
  const files = manifest.groups.flatMap(g => g.files);
  const movedModels = manifest.inventory.filter(i => i.disposition === 'archived').length;
  const text = `# 模型整理归档清单（2026-10-14）

本次只整理资产，不训练、不重跑棋力评测、不晋升模型。低优先级表示当前配方没有足够继续投入的证据，不表示参数永远没有迁移价值。

## 实际结果

- ${manifest.groups.length}个历史实验目录已归档，共${files.length}个文件、${files.reduce((n, f) => n + f.bytes, 0).toLocaleString('en-US')}字节（约768 MiB）。其中包含${movedModels}个权重/状态容器及${files.filter(f => /\.(pt|pth)$/.test(f.path)).length}个PyTorch文件。
- 训练工作区本轮识别${manifest.inventory.length}个权重/状态容器，按文件SHA-256有${new Set(manifest.inventory.map(i => i.sha256)).size}种不同内容、${duplicates.length}组完全相同副本。它们不是相同数量的独立训练模型；best/last、初始化、恢复状态、序列化导出均会影响计数。
- 扫描跳过公共源码等支持链接、migration、既有archive；此数字不是整个项目模型总数。基于JSON头部结构识别权重，不能保证覆盖所有私有格式。
- 全部历史路径和文件内容保留，不合并不同内容的优化器或RNG状态。${dedup?.status === 'deduplicated' ? `按用户后续要求完成硬链接去重：${dedup.consolidatedCopies}份重复存储合并，${dedup.accessiblePaths}个路径共享${dedup.uniqueEntities}个文件实体，文件内容占用减少${dedup.reducedFileContentBytes.toLocaleString('en-US')}字节（约248 MiB，非磁盘空闲空间实测）。` : '重复副本随所属实验封存，并登记优先使用路径；单纯移动归档没有释放磁盘空间。'}
- 每个原目录建立Windows目录联接，旧脚本和报告路径继续可访问。历史报告、数据划分、评测回放保持原文。

## 继续研究的代表与保留位置

以下路径均相对ai_training；“保留”代表研究或复现价值，不代表已经通过正式验收。

|代表|位置|保留原因与恢复状态|
|---|---|---|
|应用内置模型|主项目src/game/ai/models/|应用依赖和兼容基线，未迁移|
|登记的v8_final|training_runs/agent_upgrade_20260921_v8_final_01/|登记表及历史工具依赖，未迁移|
|P1|v16/out/v16_20260926_core/experiments/P1/|旧规则基线，全目录及现有train_state.pt保留；最新R8复测0/20|
|θ1|v19/out/run_20260929_v19_02/experiments/ppo_w1/|暖启动来源，ppo_w1.train_state.pt及权重保留；最新R8复测0/20|
|V17 B0|v17/out/v17_20260926_r2/experiments/B0/|复现基线；V18 A与其best/final存在字节相同副本|
|V19 34通道PPO代表|v19/out/run_20260928_v19_01/experiments/ppo_w2_v19schema/|表示迁移与PPO研究对照|
|V19阶段修正|v19/out/run_20260929_v19_02/experiments/r2_fix/|单变量修正代表，保留现有恢复状态|
|R6暖启动及从零锚点|r6_model_training_20261014_063500/artifacts/models/|仅有现存JSON导出；未发现本阶段.pt，不能声称能完整恢复训练。保留两臂用于公平对照|
|R7冻结候选及必要对照组|r7_training_stage_20261014_083500/artifacts/models/|冻结候选round3_enhanced_v2及现有best/last/initial .pt、ledger原位保留；同目录各轮对照一并保留，不认定每个分支都值得续训|
|R8暖启动|r8_pure_policy_stage_20261014_125300/checkpoints/r1_warm/|best.json、best.pt、last.json、last.pt、initial.json、config.json、ledger.jsonl全保留；FINAL 1/20且独立性验收失败|
|B100-Q/R搜索|src/game/ai/battle_search_ai.ts及R6–R8冻结研究代码/证据|搜索策略没有可用于暖启动的网络权重；R8同面板各4/20，分别8/7场截断|
|待复核研究资产|v19/out/continuous16_20261003/、coverage_20261004/、coverage_fit_20261004/等|缺少足够统一新规则评测以裁定退休；保守保留，不能把旧ACTIVE标签当实时进程|

所有归档分支的现有恢复状态也完整保留。这里只验证文件字节与可访问性，没有反序列化每个.pt或重演训练恢复，不能承诺每份历史容器都包含优化器、调度器和RNG。

## 归档范围

|原目录|文件数|归档理由|
|---|---:|---|
${manifest.groups.map(g => `|${g.original}|${g.files.length}|${g.reason}|`).join('\n')}

实际位置统一为archive/model_retirement_20261014/payload/加上原目录。原位链接只是访问入口，写入旧路径也会修改归档；如需续训，应使用新输出目录。

## 重复副本

详见[duplicates.json](duplicates.json)，每组列出SHA-256、全部副本、优先使用路径。确认的例子：

- V18 T18_02_A/A_final.json、A_best.u4000.json与V17 B0/B0_final.json完全相同；优先使用V17 B0。
- R8 r2_dagger/initial.json、r3_balanced/initial.json与r1_warm/best.json相同；优先使用暖启动best，同时保留各轮初始化证据。
- R7 theta1_baseline.json与R8暖启动initial.json相同。θ1其他不同序列化版本不能仅凭文件哈希判定参数相异。

${dedup?.status === 'deduplicated' ? '硬链接去重明细见[deduplication.json](deduplication.json)，实体及哈希核验见[deduplication_verification.json](deduplication_verification.json)。独立目录联接和文件硬链接分别保留旧目录与文件路径。硬链接共享文件内容及时间戳，后续对任一别名原位写入会影响同组文件；继续训练应写入新文件。原时间戳已登记在去重台账，不将字节相同等同于独立的物理备份。' : ''}

## 评测证据

- 最新统一比较及R8失败裁决：[R8报告](../../r8_pure_policy_stage_20261014_125300/STAGE_REPORT.md)，其identity/、evidence/、runs/和数据分区原位保留。
- R6、R7的COMPARISON_REPORT.md、TRAINING_REPORT.md、artifacts/dev_eval或dev_benchmarks、final_eval、replays原位保留。
- V12–V19各版本报告、模型卡、数据池和评测目录保留；随实验目录移动的ledger、metrics、配置和manifest仍由原路径联接访问。
- R8统一面板：P1/θ1/R6从零均0%；R6暖启动/R7锚点/R8暖启动均5%；B100-Q/R均20%，截断仍计入20局分母。旧协议胜率不能跨规则合并。

## 核验、复查和恢复

逐文件原路径、实际位置、类型、大小和哈希见[模型文件清单.csv](模型文件清单.csv)。完整移动清单见[manifest.json](manifest.json)，核验结果见[verification.json](verification.json)。manifest保存归档全部文件的哈希，含非模型文件；CSV只列本轮识别出的权重/状态容器。

在项目根目录执行：

\`\`\`powershell
node ai_training/tools/archive_models_20261014.mjs --verify
node ai_training/tools/archive_models_20261014.mjs --restore
\`\`\`

restore先核验全部资产，再移除本清单登记的目录联接本身并将真实目录移回；不递归删除历史目录。Windows创建或恢复联接可能需要提高工具权限。归档后原路径存在，不能对联接运行递归清理。备份或迁移到其他磁盘时应同时保存payload和清单，并重新创建联接。
`;
  fs.writeFileSync(path.join(archive, 'README.md'), text);
}
const command = process.argv[2];
if (command === '--plan') makePlan();
else if (command === '--apply') apply();
else if (command === '--verify') verify();
else if (command === '--restore') restore();
else if (command === '--report') report();
else throw new Error('用法：node ai_training/tools/archive_models_20261014.mjs --plan|--apply|--verify|--restore|--report');
