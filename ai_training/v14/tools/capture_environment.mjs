/**
 * V14/T14-00 运行环境与工具可用性校准。
 *
 * 只做实测：不沿用历史结论（例如“vitest 必然不可用”）。
 * 对每个候选入口实际执行一次最小命令，记录退出码、耗时与输出摘要。
 *
 * 用法：
 *   node v14/tools/capture_environment.mjs --run-id v14_20260924_t14
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, ensureDir, writeJson, rel } from './identity_lib.mjs';

const args = process.argv.slice(2);
function argOf(name, fallback) {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const runId = argOf('--run-id', 'v14_20260924_t14');
// 中文：Windows 机器未必安装 Python Launcher；允许冻结实际训练所用解释器路径。
const pythonCommand = argOf('--python', 'py');
const outDir = ensureDir(path.join('v14', 'out', runId, 'T14-00'));

/**
 * 执行一条命令并取回 stdout/stderr。
 *
 * 优先使用管道；受限沙箱里 Node 的子进程管道会抛 EPERM（环境限制，不是命令失败），
 * 此时退回到「把已打开的普通文件描述符当作子进程 stdio」的路径 —— 不创建管道，
 * 因此同一环境下仍能得到真实退出码与真实输出。
 */
function runCaptured(command, commandArgs, options = {}) {
    const timeout = options.timeoutMs ?? 180000;
    try {
        const result = spawnSync(command, commandArgs, {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            timeout,
            maxBuffer: 64 * 1024 * 1024,
        });
        if (result.error && (result.error.code === 'EPERM' || result.error.code === 'ENOTSUP')) {
            return runCapturedViaFile(command, commandArgs, timeout);
        }
        return {
            status: result.status,
            signal: result.signal ?? null,
            error: result.error ?? null,
            stdout: (result.stdout ?? '').toString(),
            stderr: (result.stderr ?? '').toString(),
        };
    } catch (error) {
        if (error?.code === 'EPERM' || error?.code === 'ENOTSUP') {
            return runCapturedViaFile(command, commandArgs, timeout);
        }
        throw error;
    }
}

/** 中文：把子进程 stdout/stderr 直接写到临时文件，全程不使用管道。 */
function runCapturedViaFile(command, commandArgs, timeout) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v14-env-'));
    const outFile = path.join(tmpDir, 'stdout.txt');
    const errFile = path.join(tmpDir, 'stderr.txt');
    const outFd = fs.openSync(outFile, 'w');
    const errFd = fs.openSync(errFile, 'w');
    let result;
    try {
        result = spawnSync(command, commandArgs, {
            cwd: REPO_ROOT,
            timeout,
            // 中文：.cmd/.bat 是脚本入口，必须经 shell 才能执行；这不改变被执行的命令本身。
            shell: /\.(cmd|bat)$/i.test(String(command)),
            windowsHide: true,
            stdio: ['ignore', outFd, errFd],
        });
    } finally {
        try { fs.closeSync(outFd); } catch { /* 已关闭 */ }
        try { fs.closeSync(errFd); } catch { /* 已关闭 */ }
    }
    const record = {
        status: result.status,
        signal: result.signal ?? null,
        error: result.error ?? null,
        stdout: fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '',
        stderr: fs.existsSync(errFile) ? fs.readFileSync(errFile, 'utf8') : '',
        capturedViaFile: true,
    };
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return record;
}

/** 执行一条命令并记录真实结果；超时不算通过。 */
function probe(label, command, commandArgs, options = {}) {
    const started = Date.now();
    const result = runCaptured(command, commandArgs, { timeoutMs: options.timeoutMs ?? 180000 });
    const elapsedMs = Date.now() - started;
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    return {
        label,
        command: [command, ...commandArgs].join(' '),
        exitCode: result.status,
        signal: result.signal ?? null,
        spawnError: result.error ? String(result.error.code ?? result.error.message) : null,
        timedOut: result.error?.code === 'ETIMEDOUT',
        elapsedMs,
        stdoutTail: stdout.split('\n').slice(-20).join('\n'),
        stderrTail: stderr.split('\n').slice(-20).join('\n'),
    };
}

/** 采集 Python / Torch 侧环境（无 torch 时明确记录而不是猜）。 */
function pythonProbe() {
    const script = [
        'import json,sys',
        'info={"python":sys.version.split()[0],"executable":sys.executable}',
        'try:',
        '    import torch;info["torch"]=torch.__version__;info["cuda"]=torch.cuda.is_available();info["torchThreads"]=torch.get_num_threads()',
        'except Exception as e:',
        '    info["torch"]=None;info["torchError"]=repr(e)',
        'try:',
        '    import numpy;info["numpy"]=numpy.__version__',
        'except Exception as e:',
        '    info["numpy"]=None;info["numpyError"]=repr(e)',
        'print(json.dumps(info))',
    ].join('\n');
    const r = runCaptured(pythonCommand, ['-c', script], { timeoutMs: 300000 });
    let parsed = null;
    try {
        parsed = JSON.parse((r.stdout ?? '').trim().split('\n').pop());
    } catch {
        parsed = null;
    }
    return {
        command: pythonCommand + ' -c <env probe>',
        exitCode: r.status,
        spawnError: r.error ? String(r.error.code ?? r.error.message) : null,
        stderrTail: (r.stderr ?? '').split('\n').slice(-8).join('\n'),
        info: parsed,
    };
}

/** 磁盘可用空间：不依赖 CIM（部分环境拒绝访问）。 */
function diskInfo() {
    const out = [];
    for (const drive of ['C', 'D']) {
        try {
            const r = spawnSync('powershell', ['-NoProfile', '-Command',
                '$d=Get-PSDrive -Name ' + drive + ' -ErrorAction Stop; "$($d.Free)|$($d.Used)"'],
                { encoding: 'utf8', timeout: 60000 });
            const [free, used] = (r.stdout ?? '').trim().split('|').map(Number);
            out.push(Number.isFinite(free)
                ? { drive, freeBytes: free, usedBytes: used, freeGB: +(free / 1073741824).toFixed(2) }
                : { drive, freeBytes: null });
        } catch {
            out.push({ drive, freeBytes: null });
        }
    }
    return out;
}

const probes = [];
// 中文：逐个实测候选入口，记录真实退出码与耗时；失败保留原始尾部输出。
// npx 在 Windows 上是 npx.cmd（脚本入口），spawnSync 直接执行会得到 ENOENT/EINVAL；
// 因此改为直接执行仓库内已安装的 JS 入口（node <bin> ...），
// 这样既绕开 .cmd 包装，又验证的是真实的本地版本，而不是「入口没找到」。
const TSC_BIN = path.join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const VITEST_BIN = path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs');
probes.push(probe('node-version', process.execPath, ['--version'], { timeoutMs: 60000 }));
probes.push(probe('local-tsc-noEmit', process.execPath, [TSC_BIN, '--noEmit', '-p', 'tsconfig.json'], { timeoutMs: 900000 }));
probes.push(probe('local-vitest-version', process.execPath, [VITEST_BIN, '--version'], { timeoutMs: 300000 }));
probes.push(probe('run-tool-eval-v3-core', process.execPath, ['--openssl-legacy-provider', 'v12/tools/run-tool.mjs', 'v13/tools/eval_v3_core.test.ts'], { timeoutMs: 600000 }));
probes.push(probe('python-unittest-v13', pythonCommand, ['-m', 'unittest', 'discover', '-s', 'python/tests', '-p', 'test_v13_*.py'], { timeoutMs: 1800000 }));
probes.push(probe('python-unittest-v11', pythonCommand, ['-m', 'unittest', 'discover', '-s', 'python/tests', '-p', 'test_v11_*.py'], { timeoutMs: 1800000 }));
probes.push(probe('trainer-help', pythonCommand, ['python/train_spatial_resnet.py', '--help'], { timeoutMs: 300000 }));

const record = {
    schema: 'v14_environment_1',
    task: 'T14-00',
    runId,
    generatedAt: new Date().toISOString(),
    note: '本文件只记录实测环境与真实命令退出码；未通过项在协议中作为约束保留，不写成方法失效。',
    machine: {
        platform: process.platform,
        arch: process.arch,
        osRelease: os.release(),
        hostname: os.hostname(),
        logicalCpuCount: os.cpus().length,
        cpuModel: os.cpus()[0]?.model ?? null,
        totalMemBytes: os.totalmem(),
        totalMemGB: +(os.totalmem() / 1073741824).toFixed(2),
        freeMemGB: +(os.freemem() / 1073741824).toFixed(2),
        tmpdir: os.tmpdir(),
    },
    node: {
        version: process.version,
        v8: process.versions.v8,
        uvThreadpool: process.env.UV_THREADPOOL_SIZE ?? null,
    },
    python: pythonProbe(),
    pythonCommand,
    disks: diskInfo(),
    env: {
        UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE ?? null,
        OMP_NUM_THREADS: process.env.OMP_NUM_THREADS ?? null,
        MKL_NUM_THREADS: process.env.MKL_NUM_THREADS ?? null,
    },
    probes,
    toolAvailability: Object.fromEntries(probes.map((p) => [p.label, {
        exitCode: p.exitCode,
        ok: p.exitCode === 0,
        elapsedMs: p.elapsedMs,
        timedOut: p.timedOut,
        spawnError: p.spawnError,
    }])),
};

const outPath = writeJson(path.join(outDir, 'environment.json'), record);
console.log('[T14-00] environment.json -> ' + rel(outPath));
for (const p of probes) {
    console.log('  ' + (p.exitCode === 0 ? 'ok  ' : 'FAIL') + ' ' + p.label + ' exit=' + p.exitCode + ' ' + p.elapsedMs + 'ms' + (p.timedOut ? ' TIMEOUT' : '') + (p.spawnError ? ' spawnError=' + p.spawnError : ''));
}
if (record.python.info) {
    console.log('  python ' + record.python.info.python + ' torch=' + record.python.info.torch + ' cuda=' + record.python.info.cuda + ' threads=' + record.python.info.torchThreads + ' numpy=' + record.python.info.numpy);
}
if (!fs.existsSync(path.join(REPO_ROOT, 'python', 'spatial_resnet_model.py'))) {
    console.log('  警告：缺少 spatial_resnet_model.py');
}
