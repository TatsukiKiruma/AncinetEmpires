/** 只编译诊断类并尝试类查找，不执行任何APK方法。 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { digest } from './contract.mjs';

const out = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(out, '../..');
const apk = path.join(root, 'ai_training/hard_native_3000_20261022/assets/hard-target.apk');
const target = path.join(out, 'evidence/JVM_PROBE.json');
if (fs.existsSync(target)) throw Error('拒绝覆盖既有JVM检查证据');
if (digest(fs.readFileSync(apk)) !== 'a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48') throw Error('APK身份不符');
const classes = path.join(out, 'evidence/jvm');
fs.mkdirSync(classes, { recursive: true });
const records = [];
for (const [program, argv] of [
    ['javac', ['-encoding', 'UTF-8', '-d', classes, path.join(out, 'NativeClassProbe.java')]],
    ['java', ['-cp', [classes, apk].join(path.delimiter), 'NativeClassProbe']],
]) {
    const startedAt = new Date().toISOString();
    const result = spawnSync(program, argv, { cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true });
    records.push({ program, argv, startedAt, endedAt: new Date().toISOString(), pid: result.pid,
        exitCode: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error ? String(result.error) : null });
    if (result.status !== 0) break;
}
const lookup = records.find(record => record.program === 'java');
const unavailable = lookup?.exitCode === 0 && ['c.a.b.c.j.b', 'aer.extension.ResourcePackHardAi', 'android.webkit.WebView']
    .every(name => lookup.stdout.includes(`${name}=ClassNotFoundException`));
const report = { utc: new Date().toISOString(), pid: process.pid, parentPid: process.ppid, executable: process.execPath,
    apk, apkSha256: digest(fs.readFileSync(apk)), records, ordinaryJvmCannotLoadNativeApkClasses: unavailable,
    gamesStarted: 0, methodsInvokedOnApk: 0, nativeEngineInitialized: false,
    qualification: '只验证当前标准JVM直接装载路径；没有测试DEX转JAR、Android模拟器或完整原生桌面宿主',
};
fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));
if (!unavailable) process.exitCode = 1;
