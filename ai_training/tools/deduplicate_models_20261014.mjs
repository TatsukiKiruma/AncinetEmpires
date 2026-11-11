import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// 仅处理已登记且逐字节相同的模型文件，保留全部路径和恢复状态。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'archive/model_retirement_20261014');
const ledgerPath = path.join(directory, 'deduplication.json');
function checked(p) {
  const absolute = fs.realpathSync(path.resolve(root, p));
  if (!absolute.startsWith(root + path.sep) || !fs.statSync(absolute).isFile()) throw new Error(`文件不在训练工作区内：${p}`);
  return absolute;
}
function digest(p) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(p, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    let size;
    while ((size = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, size));
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function identity(p) {
  const stat = fs.statSync(p, { bigint: true });
  return `${stat.dev}:${stat.ino}`;
}
function save(ledger) {
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
}
function validate(ledger, requireLinks = false) {
  let files = 0;
  for (const group of ledger.groups) {
    const canonical = checked(group.canonical);
    for (const file of group.files) {
      const actual = checked(file.path);
      if (fs.statSync(actual).size !== group.bytes || digest(actual) !== group.sha256) throw new Error(`文件内容变化：${file.path}`);
      if (requireLinks && identity(actual) !== identity(canonical)) throw new Error(`未共享实体：${file.path}`);
      files++;
    }
  }
  return files;
}
function plan() {
  if (fs.existsSync(ledgerPath)) throw new Error('清单已存在，请执行 --apply 或 --verify');
  const duplicates = JSON.parse(fs.readFileSync(path.join(directory, 'duplicates.json')));
  const groups = duplicates.map(group => ({
    sha256: group.sha256, bytes: group.bytesPerCopy, canonical: group.preferredPath,
    files: group.copies.map(copy => {
      const stat = fs.statSync(checked(copy.path));
      return { path: copy.path, originalIdentity: identity(checked(copy.path)), originalMtimeMs: stat.mtimeMs, originalAtimeMs: stat.atimeMs, status: copy.path === group.preferredPath ? 'canonical' : 'planned' };
    }),
  }));
  const ledger = { schema: 'model-hardlink-deduplication-v1', createdAt: new Date().toISOString(), status: 'planned', method: 'NTFS硬链接；相同字节共享文件实体，原路径全部保留', groups };
  validate(ledger);
  save(ledger);
  console.log(JSON.stringify({ groups: groups.length, paths: groups.reduce((n, g) => n + g.files.length, 0), potentialBytes: groups.reduce((n, g) => n + (new Set(g.files.map(f => f.originalIdentity)).size - 1) * g.bytes, 0) }));
}
function apply() {
  const ledger = JSON.parse(fs.readFileSync(ledgerPath));
  // 在任何替换前核验全部路径，冻结文件发生变化时立即停止。
  validate(ledger);
  for (const group of ledger.groups) {
    const canonical = checked(group.canonical);
    for (const file of group.files) {
      const actual = checked(file.path);
      if (actual === canonical || identity(actual) === identity(canonical)) continue;
      if (digest(actual) !== group.sha256 || digest(canonical) !== group.sha256) throw new Error(`替换前内容变化：${actual}`);
      const backup = actual + '.dedup-backup-20261014';
      if (fs.existsSync(backup)) throw new Error(`发现未处理的备份：${backup}`);
      fs.renameSync(actual, backup);
      try {
        fs.linkSync(canonical, actual);
        if (identity(actual) !== identity(canonical) || digest(actual) !== group.sha256) throw new Error(`硬链接核验失败：${actual}`);
      } catch (error) {
        if (fs.existsSync(actual)) fs.unlinkSync(actual);
        fs.renameSync(backup, actual);
        throw error;
      }
      // 只移除已经由校验通过的硬链接替代的单个备份，绝不递归清理。
      fs.unlinkSync(backup);
      file.status = 'linked';
      save(ledger);
    }
  }
  ledger.status = 'deduplicated';
  ledger.completedAt = new Date().toISOString();
  save(ledger);
  verify();
}
function verify() {
  const ledger = JSON.parse(fs.readFileSync(ledgerPath));
  const files = validate(ledger, ledger.status === 'deduplicated');
  const result = {
    checkedAt: new Date().toISOString(), passed: true, status: ledger.status,
    groups: ledger.groups.length, accessiblePaths: files,
    uniqueEntities: new Set(ledger.groups.flatMap(g => g.files.map(f => identity(checked(f.path))))).size,
    consolidatedCopies: ledger.status === 'deduplicated' ? files - ledger.groups.length : 0,
    reducedFileContentBytes: ledger.status === 'deduplicated' ? ledger.groups.reduce((n, g) => n + (new Set(g.files.map(f => f.originalIdentity)).size - 1) * g.bytes, 0) : 0,
    note: '字节数为去重文件内容占用的逻辑估算，不是磁盘空闲空间实测；原路径及哈希均保留。硬链接共享后续原位写入，继续训练必须使用新输出文件。',
  };
  fs.writeFileSync(path.join(directory, 'deduplication_verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
const command = process.argv[2];
if (command === '--plan') plan();
else if (command === '--apply') apply();
else if (command === '--verify') verify();
else throw new Error('用法：node ai_training/tools/deduplicate_models_20261014.mjs --plan|--apply|--verify');
