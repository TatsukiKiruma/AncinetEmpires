/**
 * V10-fix common utilities.
 *
 * Goals:
 * - Keep the historical v10/*.json artifacts untouched; new outputs go to v10/fix_01.
 * - Never assume `python` has torch; use V10_PYTHON (or PYTHON) and fail loudly.
 * - Use execFileSync for python calls so paths/spaces cannot corrupt the command.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const RUN_ID = process.env.RUN_ID || 'agent_upgrade_20260923_v10_fix_01';
export const RUN_DIR = path.resolve(process.env.V10_RUN_DIR || `training_runs/${RUN_ID}`);
export const REPORT_DIR = path.resolve(process.env.V10_REPORT_DIR || `docs/training/reports/${RUN_ID}`);
export const V10_DIR = path.resolve(process.env.V10_OUT_DIR || 'v10/fix_01');

export function ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
}

export function getSha256(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
}

export function readJson<T = any>(file: string): T {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function writeJson(file: string, value: any): void {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

export function readJsonl<T = any>(file: string): T[] {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8')
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line) as T);
}

/**
 * Synchronous append is intentional: datasets must be fully flushed before
 * spawning a training process, otherwise the new samples can be silently skipped.
 */
export function appendJsonlSync(file: string, records: any[]): void {
    ensureDir(path.dirname(file));
    if (records.length === 0) return;
    fs.appendFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

export function writeJsonl(file: string, records: any[]): void {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''), 'utf8');
}

export function resolvePythonCommand(): string {
    return process.env.V10_PYTHON || process.env.PYTHON || 'python';
}

export function assertTorchPython(): string {
    const python = resolvePythonCommand();
    try {
        execFileSync(python, ['-c', 'import torch, numpy; print(torch.__version__)'], { stdio: 'pipe' });
    } catch (e: any) {
        throw new Error(
            `Python interpreter "${python}" cannot import torch/numpy. ` +
            `Set V10_PYTHON to a torch-enabled interpreter before running training. ` +
            `Original error: ${e?.message ?? e}`
        );
    }
    return python;
}

export function runPythonScript(scriptRelativePath: string, args: string[]): void {
    const python = assertTorchPython();
    execFileSync(python, [scriptRelativePath, ...args], { stdio: 'inherit', cwd: process.cwd() });
}

export function isMain(scriptBasename: string): boolean {
    const argv1 = process.argv[1] ?? '';
    return argv1.endsWith(scriptBasename);
}

export function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

export function countLinesSync(file: string): number {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(1 << 20);
    let bytes = 0;
    let count = 0;
    try {
        while ((bytes = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
            for (let i = 0; i < bytes; i++) {
                if (buf[i] === 10) count++;
            }
        }
    } finally {
        fs.closeSync(fd);
    }
    return count;
}
export function relPosix(file: string): string {
    return path.relative(process.cwd(), file).split(path.sep).join('/');
}
