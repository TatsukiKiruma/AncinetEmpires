/**
 * V15/T15-00：工作区身份、环境与协议冻结工具。
 *
 * 职责（A：协调/评测）：
 *   1. 记录真实 branch/HEAD、tracked/untracked 修改、字符级字节 SHA；
 *   2. 记录运行环境（Node/Python/torch/CPU/内存/依赖版本）；
 *   3. 保存源码字节快照索引与可恢复内容（用于 `source_bundle/`）；
 *   4. 把 V15 实验协议实例化为含实际 roots、预算、caps、对局 ID 的冻结配置。
 *
 * 本工具**不修改**任何仓库文件，只读取并写入 `v15/out/<runId>/T15-00/`。
 * 输出目录已存在时拒绝覆盖：每次执行使用新的 runId。
 *
 * 用法：
 *   node v15/tools/identity_v15.mjs --run-id v15_YYYYMMDD_<用途> [--bundle]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
    const out = { runId: null, bundle: false, label: 'start', gitJson: null, pythonJson: null };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--run-id') out.runId = argv[++i];
        else if (a === '--label') out.label = argv[++i];
        else if (a === '--git-json') out.gitJson = argv[++i];
        else if (a === '--python-json') out.pythonJson = argv[++i];
        else if (a === '--bundle') out.bundle = true;
        else throw new Error(`unknown argument: ${a}`);
    }
    if (!out.runId) throw new Error('usage: node v15/tools/identity_v15.mjs --run-id <runId> [--label start|runtime|final] [--git-json <path>] [--python-json <path>] [--bundle]');
    return out;
}

const args = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------- helpers

function sha256Bytes(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256File(abs) {
    try {
        return sha256Bytes(fs.readFileSync(abs));
    } catch (err) {
        return null;
    }
}

/** UTF-8/LF 规范化摘要：只用于解释换行差异，不能替代字节 SHA。 */
function normalizedSha256File(abs) {
    try {
        const text = fs.readFileSync(abs, 'utf8');
        return sha256Bytes(Buffer.from(text.replace(/\r\n/g, '\n'), 'utf8'));
    } catch (err) {
        return null;
    }
}

function git(gitArgs) {
    // Windows 上 `git` 是 git.exe（不是 .cmd），用 execFileSync 直接解析即可；
    // 失败时返回 {ok:false}，调用方必须区分“无变更”与“命令未执行”。
    try {
        const stdout = execFileSync('git', gitArgs, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        return { ok: true, stdout: stdout.replace(/\r\n/g, '\n').replace(/\n+$/, '') };
    } catch (err) {
        return { ok: false, stdout: null, error: String(err && err.message ? err.message : err) };
    }
}

function gitText(gitArgs) {
    const r = git(gitArgs);
    return r.ok ? r.stdout : null;
}

function tryJson(cmd, cmdArgs) {
    try {
        const out = execFileSync(cmd, cmdArgs, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
        return { ok: true, stdout: out.trim(), stderr: '' };
    } catch (err) {
        return { ok: false, stdout: (err.stdout || '').toString().trim(), stderr: (err.stderr || String(err.message)).toString().trim() };
    }
}

// ---------------------------------------------------------------- 1. git 身份

/**
 * Git 身份输入。
 *
 * 为什么不让本工具自己跑 `git`：在当前 DSH 文件沙箱下，Node 的
 * `child_process.spawnSync` 被拒绝（`spawnSync git EPERM`，无法打开命名管道），
 * 而 PowerShell 自身的管线不受影响。因此 git 读数由 `v15/tools/capture_git_identity.ps1`
 * 生成 JSON，本工具只负责校验并合并；两者都不修改仓库内容。
 */
let gitInput = null;
let gitInputError = null;
if (args.gitJson) {
    try {
        gitInput = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, args.gitJson), 'utf8'));
    } catch (err) {
        gitInputError = String(err && err.message ? err.message : err);
    }
}

const headResult = gitInput
    ? { ok: typeof gitInput.head === 'string' && gitInput.head.length === 40, stdout: gitInput.head }
    : git(['rev-parse', 'HEAD']);
const headSha = headResult.ok ? headResult.stdout : null;
const statusResult = gitInput
    ? { ok: Array.isArray(gitInput.statusShort), stdout: (gitInput.statusShort || []).join('\n') }
    : git(['status', '--short']);
const statusShort = statusResult.ok ? statusResult.stdout : '';
const porcelain = statusShort.length > 0 ? statusShort.split('\n') : [];
const branchLine = gitInput ? gitInput.branchLine ?? null : gitText(['status', '--short', '--branch']);

const trackedChanges = porcelain.filter((l) => !l.startsWith('??'));
const untracked = porcelain.filter((l) => l.startsWith('??')).map((l) => l.slice(3).trim());

// ---------------------------------------------------------------- 2. 受管源码清单

/**
 * 受管文件 = 本次任务声明会读取/修改的源码与配置。
 * 全部路径相对于仓库根；不存在时记 null（不猜内容）。
 */
const MANAGED_FILES = [
    // 规则与引擎
    'src/game/rules.ts',
    'src/game/engine.ts',
    'src/game/env.ts',
    'src/game/types.ts',
    'src/game/ai/heuristic_ai.ts',
    'src/game/ai/shared_spatial_policy.ts',
    'src/game/ai/spatial_tensor_encoder.ts',
    'src/game/ai/spatial_conv_net.ts',
    // Python 训练与模型
    'python/train_spatial_resnet.py',
    'python/spatial_resnet_model.py',
    'python/verify_parity.py',
    'python/v14_spatial_encoder.py',
    'python/v14_training_ledger.py',
    'python/v14_build_dagger_groups.py',
    'python/v14_check_permutation_invariance.py',
    'python/v14_tiny_fit.py',
    // V14 研究工具（V15 复用/审查对象）
    'v14/tools/rule_suite.test.ts',
    'v14/tools/codec_roundtrip.test.ts',
    'v14/tools/teacher_qualification_probe.ts',
    'v14/tools/collect_student_states.ts',
    'v14/tools/build_v14_dataset.ts',
    'v14/tools/collect_v14_roots.ts',
    'v14/tools/eval_v14_protocol.ts',
    'v14/tools/eval_v14_match.ts',
    'v14/tools/eval_v14_aggregate.ts',
    'v14/tools/failure_attribution.ts',
    'v14/tools/forward_parity_probe.ts',
    'v14/tools/run_dev_matches.mjs',
    'v14/tools/summarize_dev_matches.mjs',
    'v14/tools/identity_lib.mjs',
    'v14/tools/freeze_identity.mjs',
    'v14/tools/capture_environment.mjs',
    'v14/tools/tiny_fit_ts_verify.ts',
    'v14/tools/make_tiny_fit_inputs.py',
    'v14/tools/tiny_fit_acceptance.py',
    'v14/review/audit_v14b_windows.ts',
    'v14/review/audit_v14b_combat.ts',
    // 运行入口
    'v12/tools/run-tool.mjs',
    'package.json',
    'tsconfig.json',
];

const sourceFiles = MANAGED_FILES.map((rel) => {
    const abs = path.resolve(REPO_ROOT, rel);
    const exists = fs.existsSync(abs);
    let bytes = null;
    let mtimeMs = null;
    if (exists) {
        const st = fs.statSync(abs);
        bytes = st.size;
        mtimeMs = Math.round(st.mtimeMs);
    }
    return {
        path: rel.split(path.sep).join('/'),
        exists,
        bytes,
        mtimeMs,
        sha256: exists ? sha256File(abs) : null,
        sha256NormalizedLf: exists ? normalizedSha256File(abs) : null,
    };
});

// ---------------------------------------------------------------- 3. 环境

function pythonProbe() {
    // 与 git 同理：Node 在当前沙箱下无法 spawn 子进程，因此优先消费由
    // `v15/tools/capture_git_identity.ps1` 采集好的 JSON；只有显式未提供时才尝试自行探测。
    if (args.pythonJson) {
        try {
            const info = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, args.pythonJson), 'utf8'));
            return { attempts: [{ command: info.command ?? 'captured', ok: true, source: 'capture_git_identity.ps1' }], info };
        } catch (err) {
            return { attempts: [{ command: 'captured', ok: false, error: String(err && err.message ? err.message : err) }], info: null };
        }
    }
    const candidates = [
        'py',
        'python',
        'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
    ];
    const code = [
        'import json,sys,os,platform',
        'd={"executable":sys.executable,"python":platform.python_version(),"impl":platform.python_implementation()}',
        'try:',
        '    import torch; d["torch"]=torch.__version__; d["cuda"]=bool(torch.cuda.is_available()); d["torchThreads"]=int(torch.get_num_threads()); d["cudaDeviceCount"]=int(torch.cuda.device_count())',
        'except Exception as e: d["torch"]=None; d["torchError"]=str(e)',
        'try:',
        '    import numpy; d["numpy"]=numpy.__version__',
        'except Exception as e: d["numpy"]=None; d["numpyError"]=str(e)',
        'd["cpuCount"]=os.cpu_count()',
        'print("V15ENV"+json.dumps(d))',
    ].join('\n');
    const attempts = [];
    for (const cmd of candidates) {
        const res = tryJson(cmd, ['-c', code]);
        const line = (res.stdout || '').split('\n').find((l) => l.startsWith('V15ENV'));
        attempts.push({ command: cmd, ok: res.ok && Boolean(line), stderrTail: res.stderr.slice(-400) });
        if (line) return { attempts, info: JSON.parse(line.slice('V15ENV'.length)) };
    }
    return { attempts, info: null };
}

const py = pythonProbe();

function nodeTool(rel) {
    const abs = path.resolve(REPO_ROOT, rel);
    return { path: rel, exists: fs.existsSync(abs), sha256: fs.existsSync(abs) ? sha256File(abs) : null };
}

const environment = {
    schema: 'v15_environment_1',
    task: 'T15-00',
    runId: args.runId,
    label: args.label,
    generatedAt: new Date().toISOString(),
    node: {
        version: process.version,
        v8: process.versions.v8,
        execPath: process.execPath,
        platform: process.platform,
        arch: process.arch,
        cpus: os.cpus().length,
        totalMemGB: Math.round((os.totalmem() / 1024 ** 3) * 100) / 100,
        freeMemGB: Math.round((os.freemem() / 1024 ** 3) * 100) / 100,
    },
    python: py,
    tools: {
        typescript: nodeTool('node_modules/typescript/package.json'),
        vite: nodeTool('node_modules/vite/package.json'),
        vitest: nodeTool('node_modules/vitest/package.json'),
    },
    note: '本文件只记录实测读数；未安装项记 null 与错误信息，不写推测值。',
};

// ---------------------------------------------------------------- 4. 源码包（可选）

const bundleDir = path.resolve(REPO_ROOT, 'v15', 'out', args.runId, 'T15-00', 'source_bundle');
let bundleEntries = [];
if (args.bundle) {
    fs.mkdirSync(bundleDir, { recursive: true });
    for (const f of sourceFiles) {
        if (!f.exists) continue;
        const src = path.resolve(REPO_ROOT, f.path);
        const dst = path.join(bundleDir, f.path);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
        const copied = sha256File(dst);
        bundleEntries.push({ path: f.path, copiedSha256: copied, matchesSource: copied === f.sha256 });
    }
}

// ---------------------------------------------------------------- 5. 输出

const outDir = path.resolve(REPO_ROOT, 'v15', 'out', args.runId, 'T15-00');
fs.mkdirSync(outDir, { recursive: true });

const sourcePayload = {
    schema: 'v15_source_identity_1',
    task: 'T15-00',
    runId: args.runId,
    label: args.label,
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    git: {
        head: headSha,
        branch: branchLine,
        statusCommandOk: statusResult.ok,
        revParseCommandOk: headResult.ok,
        commandError: headResult.ok && statusResult.ok ? null : [headResult, statusResult].filter((r) => !r.ok).map((r) => r.error),
        trackedChangeCount: trackedChanges.length,
        untrackedCount: untracked.length,
        trackedChanges,
        untracked,
        note: 'HEAD 不能独立标识本次代码；实际实现含工作区未提交修改。',
    },
    managedFileCount: sourceFiles.length,
    presentFileCount: sourceFiles.filter((f) => f.exists).length,
    files: sourceFiles,
    errorCorrection: {
        managedFileMissing: sourceFiles.filter((f) => !f.exists).map((f) => f.path),
    },
    bundle: args.bundle
        ? { dir: path.relative(REPO_ROOT, bundleDir).split(path.sep).join('/'), entries: bundleEntries }
        : { dir: null, entries: [], note: '未请求 --bundle；本次只记录字节 SHA，未复制内容。' },
    unknownFields: [
        '无法恢复的历史工作区内容一律记 UNKNOWN，不以 mtime 推断“仅换行差异”。',
    ],
};

const sourcePath = path.join(outDir, `source_${args.label}.json`);
if (fs.existsSync(sourcePath)) {
    throw new Error(`refusing to overwrite existing identity snapshot: ${sourcePath}`);
}
fs.writeFileSync(sourcePath, `${JSON.stringify(sourcePayload, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(outDir, `environment_${args.label}.json`), `${JSON.stringify(environment, null, 2)}\n`, 'utf8');

console.log(`[T15-00] runId=${args.runId} label=${args.label} head=${headSha}`);
console.log(`[T15-00] managed files present=${sourcePayload.presentFileCount}/${sourcePayload.managedFileCount}`);
if (sourcePayload.errorCorrection.managedFileMissing.length > 0) {
    console.log(`[T15-00] MISSING: ${sourcePayload.errorCorrection.managedFileMissing.join(', ')}`);
}
console.log(`[T15-00] wrote ${path.relative(REPO_ROOT, sourcePath)}`);
if (args.bundle) console.log(`[T15-00] bundle entries=${bundleEntries.length} allMatch=${bundleEntries.every((e) => e.matchesSource)}`);
