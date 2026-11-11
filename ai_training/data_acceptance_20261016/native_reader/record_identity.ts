import fs from 'node:fs';
import crypto from 'node:crypto';

// 记录实际用于格式实现的本地源码身份，不调用外部反编译器。
const java = 'APK/_analysis/jadx_output/java/';
const base = 'p036c/p037a/';
const names = [
  `${base}p038a/C0571a.java`, `${base}p038a/C0573c.java`, `${base}p038a/C0574d.java`,
  ...['C0577a', 'C0585e', 'C0600q', 'C0601r'].map(name => `${base}p039b/p040a/${name}.java`),
  ...['C0606a', 'C0607b', 'C0610c', 'C0611d', 'C0612e', 'C0613f'].map(name => `${base}p039b/p040a/p042t/${name}.java`),
  ...['C0616a', 'C0617b'].map(name => `${base}p039b/p040a/p043u/${name}.java`),
  ...['C0618a', 'C0619b', 'C0620c'].map(name => `${base}p039b/p040a/p044v/${name}.java`),
  ...['C0631b', 'C0632c', 'C0634e', 'C0635f'].map(name => `${base}p039b/p040a/p047y/${name}.java`),
];
const local = 'ai_training/data_acceptance_20261016/native_reader/';
const paths = [...names.map(name => java + name), 'tools/phone_training/worker.rhino.js', 'tools/apk_game_get_report.ts', ...['reader.ts', 'types.ts', 'reader.test.ts', 'FORMAT.md', 'extract_fixtures.py'].map(name => local + name)];
const rows = paths.map(path => {
  const bytes = fs.readFileSync(path);
  return { path, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
const record = { capturedAt: new Date().toISOString(), evidence: '仅本地已存在JADX源码，未执行或安装反编译器、APK、ADB或Frida', rows };
fs.writeFileSync(local + 'source-identity.json', JSON.stringify(record, null, 2), { flag: 'wx' });
console.log(`已记录${rows.length}份源码/实现身份`);
