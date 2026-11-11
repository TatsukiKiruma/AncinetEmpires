/** 汇总检查与交付摘要；不创建生产采集进程。 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { digest } from './contract.mjs';

const out = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(out, '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(out, name), 'utf8'));
const save = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
if (fs.existsSync(path.join(out, 'DELIVERY_MANIFEST.json'))) throw Error('交付已封存，拒绝覆盖');
const actualDexPath = 'deliverables/original_apk_hard_20261021/static/patch-b.dex.txt';
const dex = fs.readFileSync(path.join(root, actualDexPath));
const snapshot = `source/${actualDexPath}`;
fs.writeFileSync(path.join(out, snapshot), dex, { flag: 'wx' });
save('SUPPLEMENTAL_IDENTITY.json', {
    reason: '首次只读来源清单中困难类反编译文本文件名查询失效；原缺失记录保留，补充实际文件',
    sources: [{ path: actualDexPath, bytes: dex.length, sha256: digest(dex), snapshot }],
    originalInputIdentityUnchanged: true,
});
const gpu = read('evidence/GPU_PROBE.json'), apk = read('evidence/APK_PROBE_LOCAL.json');
const host = read('evidence/HOST_PROBE.json'), jvm = read('evidence/JVM_PROBE.json');
const sourceIdentity = read('INPUT_IDENTITY.json');
save('CAPABILITY.json', {
    utc: new Date().toISOString(), currentGpuTensorCompute: gpu.passed,
    exactOriginalApkAssetIdentity: apk.passed, nativeMapsMatched: apk.maps.filter(row => row.expected === row.apkSha256 && row.expected === row.localSha256).length,
    exactHtmlCpuInitialization: host.populationVariants.every(row => row.passed),
    nativeDecisionCallsExecuted: 0, nativeGameStarts: 0, nativeInitialStatesObserved: 0,
    nativeEngineOnDesktopValidated: false, nativeBCallOnDesktopValidated: false,
    ordinaryJvmClassLookupUnavailable: jvm.ordinaryJvmCannotLoadNativeApkClasses,
    gpuEntryFoundInOriginalDecisionScript: Object.values(host.apiTokenScan).some(Boolean),
    currentGpuCollectorTeacher: '现有2414局2M神经模型，全候选softmax温度1及既有softPriors',
    sourceCompatibleWithExistingGpuCollector: false, productionReady: false,
    phase: 'awaiting_runtime_choice',
    reason: '原生困难AI来源路径与当前GPU神经策略不同；CPU宿主或教师变更须先由用户选择',
    evidence: ['evidence/GPU_PROBE.json', 'evidence/APK_PROBE.json', 'evidence/APK_PROBE_LOCAL.json', 'evidence/HOST_PROBE.json', 'evidence/JVM_PROBE.json'],
    sourceInputsPreserved: sourceIdentity.sources.filter(row => row.exists).length,
    disabled: { strict: 'disabled_by_user', forced: 'disabled_by_user', apkNativeReplay: 'disabled_by_user', training: true, tensorGeneration: true, automaticDatasetAdmission: true },
});
const startedAt = new Date().toISOString();
const checks = spawnSync(process.execPath, ['--test', path.join(out, 'test_contract.mjs')], { cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true });
fs.writeFileSync(path.join(out, 'evidence/contract-tests.tap'), checks.stdout + checks.stderr, { flag: 'wx' });
save('CHECKS.json', { startedAt, endedAt: new Date().toISOString(), command: [process.execPath, '--test', path.join(out, 'test_contract.mjs')], pid: checks.pid,
    exitCode: checks.status, log: 'evidence/contract-tests.tap', scope: '冻结合同回归；不运行规则、决策或重放',
    gpuTensorCheck: gpu.passed, apkIdentityAndMaps: apk.passed, htmlInitializationOnly: host.populationVariants.every(row => row.passed),
    jvmDiagnosticCompleted: jvm.records.length === 2 && jvm.records.every(row => row.exitCode === 0),
    jvmOriginalClassesAvailable: false, nativeEndToEnd: 'not_executed', collection: 'not_started',
    publicLintTestBuild: '本轮未运行；公共测试包含用户禁止的重放，公共代码未改',
});
if (checks.status !== 0 || !gpu.passed || !apk.passed || !host.populationVariants.every(row => row.passed)) throw Error('有限检查存在未解决失败，拒绝封存成功摘要');
function files(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const filename = path.join(directory, entry.name);
        return entry.isDirectory() ? files(filename) : [filename];
    });
}
const entries = files(out).map(filename => {
    const data = fs.readFileSync(filename);
    return { path: path.relative(out, filename).replaceAll('\\', '/'), bytes: data.length, sha256: digest(data) };
}).sort((a, b) => a.path.localeCompare(b.path));
const stat = fs.statfsSync(out, { bigint: true });
save('DELIVERY_MANIFEST.json', {
    generatedAt: new Date().toISOString(), phase: 'awaiting_runtime_choice', collectorStarted: false,
    files: entries, totalFiles: entries.length, totalLogicalBytes: entries.reduce((sum, row) => sum + row.bytes, 0),
    freeBytesAfter: Number(stat.bavail * stat.bsize), selfExcluded: true,
    modelChanges: 0, phoneOperations: 0, gamesStarted: 0, naturalParents: 0, unattempted: 1000,
});
console.log(JSON.stringify({ files: entries.length, bytes: entries.reduce((sum, row) => sum + row.bytes, 0), freeBytes: Number(stat.bavail * stat.bsize), contractExit: checks.status, phase: 'awaiting_runtime_choice' }));
