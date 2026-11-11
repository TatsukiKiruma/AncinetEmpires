/**
 * V14/T14-00 共享身份工具。
 *
 * 本模块只提供“如何计算身份”的纯函数，不写任何实验结论：
 * - realSha256：真实文件字节摘要（绝不用 Git blob id 冒充 SHA-256）；
 * - fileIdentity：分块哈希任意大小文件，避免一次性读入 900MB 级别的池文件；
 * - gitInfo：真实 HEAD / 分支 / 工作区改动清单；
 * - digestJson：对规范化 JSON 计算摘要，用于配置指纹；
 * - loadIsolatedFunction：从 TS 源码中抽取单个函数并转译执行，
 *   避免导入带 main 副作用的脚本（沿用 v14/review/audit_v13_evidence.mjs 的做法）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/** 仓库根目录：v14/tools/identity_lib.mjs -> 上溯两级 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 真实 SHA-256（流式，适用于任意大小）。 */
export function realSha256(filePath) {
    const hash = crypto.createHash('sha256');
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.allocUnsafe(1 << 20);
    try {
        for (;;) {
            const read = fs.readSync(fd, buf, 0, buf.length, null);
            if (read <= 0) break;
            hash.update(buf.subarray(0, read));
        }
    } finally {
        fs.closeSync(fd);
    }
    return hash.digest('hex');
}

/** 文本摘要（用于内联字符串身份，如 git 输出）。 */
export function textSha256(value) {
    return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * 中文：去除行尾差异后的内容摘要。
 *
 * 为什么需要：本仓库的工作区在 Windows 上会混用 CRLF 与 LF（同一个文件里两种都存在），
 * 而读写路径不同（Node 文本读 / Python 二进制读 / git autocrlf）会得到不同的字节摘要。
 * 只用字节 SHA-256 比较两次运行的源码，会把「纯粹的换行差异」误报成「源码被改动」。
 * 因此同时记录：
 * - sha256：真实文件字节摘要（身份，不解释语义）；
 * - textSha256：把 CRLF 归一化成 LF 后再摘要（跨读写路径可比较的内容身份）。
 */
export function normalizedTextSha256(filePath) {
    const text = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
    return textSha256(text);
}

/** 规范化 JSON 摘要：键排序后序列化，保证同一语义配置得到同一指纹。 */
export function digestJson(value) {
    const canonical = (v) => {
        if (Array.isArray(v)) return v.map(canonical);
        if (v && typeof v === 'object') {
            const out = {};
            for (const key of Object.keys(v).sort()) out[key] = canonical(v[key]);
            return out;
        }
        return v;
    };
    return textSha256(JSON.stringify(canonical(value)));
}

/** 统一的文件身份记录：存在则给真实摘要与大小，不存在明确标记而不是省略。 */
export function fileIdentity(relPath, options = {}) {
    const abs = path.isAbsolute(relPath) ? relPath : path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(abs)) {
        return { path: relPath, exists: false, sha256: null, bytes: null };
    }
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
        return { path: relPath, exists: true, kind: 'directory', sha256: null, bytes: null };
    }
    const record = {
        path: relPath,
        exists: true,
        sha256: realSha256(abs),
        bytes: stat.size,
        lastWriteTimeUtc: stat.mtime.toISOString(),
    };
    if (options.withTextHash) {
        record.textSha256 = normalizedTextSha256(abs);
    }
    if (options.withLines) {
        record.lines = fs.readFileSync(abs, 'utf8').split('\n').length - 1;
    }
    return record;
}

/** 一组文件的身份记录；缺文件不静默跳过。 */
export function fileIdentities(relPaths, options = {}) {
    return relPaths.map((p) => fileIdentity(p, options));
}

/**
 * 执行 git 并取回 stdout。
 *
 * 默认走管道（最干净、无临时文件）。若当前运行环境不允许创建管道
 * （受限沙箱里 Node 的 `execFileSync` 默认 `stdio: 'pipe'` 会抛 EPERM，
 * 这是环境限制而不是命令失败），则退回到「重定向到临时文件再读回」：
 * 该路径不创建管道，因此在同一环境下仍可得到真实 git 输出。
 */
function git(args) {
    try {
        return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trimEnd();
    } catch (error) {
        if (!isPipeUnavailable(error)) throw error;
        return gitViaTempFile(args);
    }
}

/** 判断错误是否为「本环境无法创建管道」。 */
function isPipeUnavailable(error) {
    const code = error?.code ?? '';
    const message = String(error?.message ?? '');
    return code === 'EPERM' || code === 'ENOTSUP' || /EPERM|spawnSync .* EPERM|pipe/i.test(message);
}

/**
 * 中文：经临时文件读取 git 输出。
 *
 * 直接把已打开的普通文件描述符当作子进程 stdout —— 全程不创建管道，
 * 因此在禁管道的受限沙箱里仍然可用；临时目录随即删除，不留副作用。
 */
function gitViaTempFile(args) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v14-git-'));
    const outFile = path.join(tmpDir, 'stdout.txt');
    const errFile = path.join(tmpDir, 'stderr.txt');
    const outFd = fs.openSync(outFile, 'w');
    const errFd = fs.openSync(errFile, 'w');
    try {
        let failed = null;
        try {
            execFileSync('git', args, { cwd: REPO_ROOT, stdio: ['ignore', outFd, errFd] });
        } catch (error) {
            failed = error;
        }
        fs.closeSync(outFd);
        fs.closeSync(errFd);
        const stdout = fs.readFileSync(outFile, 'utf8').trimEnd();
        if (failed && !stdout) {
            const stderr = fs.readFileSync(errFile, 'utf8').trim();
            throw new Error(`git ${args.join(' ')} 失败（exit=${failed.status}）：${stderr}`);
        }
        return stdout;
    } finally {
        try { fs.closeSync(outFd); } catch { /* 已关闭 */ }
        try { fs.closeSync(errFd); } catch { /* 已关闭 */ }
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

/** 真实分支、HEAD 与工作区改动清单。 */
export function gitInfo() {
    let branch = null;
    try {
        branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    } catch {
        branch = '(unknown)';
    }
    const head = git(['rev-parse', 'HEAD']);
    const shortStatus = git(['status', '--porcelain=v1']);
    const entries = shortStatus
        ? shortStatus.split('\n').map((line) => ({
            x: line.slice(0, 1),
            y: line.slice(1, 2),
            path: line.slice(3),
        }))
        : [];
    return {
        branch,
        head,
        headShort: git(['rev-parse', '--short', 'HEAD']),
        subject: git(['log', '-1', '--pretty=%s']),
        commitDate: git(['log', '-1', '--pretty=%cI']),
        worktreeClean: entries.length === 0,
        worktreeChanges: entries,
    };
}

/**
 * 从 TS 源码里抽取一个具名函数并就地转译执行。
 * 仅用于“只读复现历史脚本内部逻辑”，不用于新增业务逻辑。
 */
export function loadIsolatedFunction(tsFilePath, functionName, kind = 'function') {
    const ts = require('typescript');
    const abs = path.isAbsolute(tsFilePath) ? tsFilePath : path.join(REPO_ROOT, tsFilePath);
    const source = fs.readFileSync(abs, 'utf8');
    const ast = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true);
    const node = ast.statements.find((stmt) => (kind === 'function'
        ? ts.isFunctionDeclaration(stmt) && stmt.name?.text === functionName
        : ts.isVariableStatement(stmt)
            && stmt.declarationList.declarations.some((d) => d.name?.text === functionName)));
    if (!node) throw new Error(`未找到 ${kind}：${tsFilePath}#${functionName}`);
    const code = ts.transpileModule(node.getText(ast), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    new Function('exports', 'require', code)(exports, require);
    return exports[functionName];
}

/** 确保输出目录存在并返回绝对路径。 */
export function ensureDir(relOrAbs) {
    const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(REPO_ROOT, relOrAbs);
    fs.mkdirSync(abs, { recursive: true });
    return abs;
}

/** 写入 JSON（带尾换行，便于 git 友好的 diff）。 */
export function writeJson(relOrAbs, value) {
    const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(REPO_ROOT, relOrAbs);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${JSON.stringify(value, null, 2)}\n`);
    return abs;
}

/** 写入文本。 */
export function writeText(relOrAbs, value) {
    const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(REPO_ROOT, relOrAbs);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, value);
    return abs;
}

/** 相对仓库根的显示路径。 */
export function rel(absPath) {
    return path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
}