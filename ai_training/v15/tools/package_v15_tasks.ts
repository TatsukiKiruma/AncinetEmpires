/**
 * V15/T15-11：汇总任务状态、网关结论与证据链（owner A）。
 *
 * 设计原则（任务书 §12）：
 *   1. **不按目录存在自动生成 DONE**：每个任务的 status 取该任务自己写出的
 *      `task_status.json`；缺失时记 NOT_STARTED，而不是从文件存在推断。
 *   2. **gate 结论只引用各 gate 自己写出的 JSON**（`gate_GL.json` / `gate_GE.json` / `gate_GP.json`），
 *      并附字节 SHA，便于第三方复算。
 *   3. **源码身份必须区分启动时与最终**：最终 HEAD/工作区摘要只用于说明「哪些改动在哪些运行之后」，
 *      不能用来追认历史运行。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/package_v15_tasks.ts \
 *     --run-id v15_YYYYMMDD_<用途>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

function arg(name: string, fallback: string | null = null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
const RUN_ID = arg('--run-id') ?? process.env.V15_RUN_ID ?? null;
if (!RUN_ID) {
    console.error('usage: ... v15/tools/package_v15_tasks.ts --run-id <runId>');
    process.exit(2);
}
const REPO = process.cwd();
const RUN_DIR = path.resolve(REPO, 'v15', 'out', RUN_ID);

const sha256File = (abs: string): string => createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
const rel = (abs: string): string => path.relative(REPO, abs).split(path.sep).join('/');

/** 任务清单来自任务书 §1~§12（含子段），不依赖目录扫描。 */
const TASK_CATALOG: Array<{ id: string; title: string; owner: string; dir: string; gate: string | null }> = [
    { id: 'T15-00', title: '冻结工作区、勘误与可执行预算', owner: 'A', dir: 'T15-00', gate: 'G0' },
    { id: 'T15-01', title: '真实窗口恢复与独立标签器 L1', owner: 'D', dir: 'T15-01', gate: 'GL' },
    { id: 'T15-02', title: '修复反击结算投影与 schema 分派', owner: 'B', dir: 'T15-02', gate: 'GR' },
    { id: 'T15-03', title: '训练预算、final、恢复和按更新采样', owner: 'C', dir: 'T15-03', gate: 'GO' },
    { id: 'T15-04', title: '去污染数据与历史模型正确重评', owner: 'E', dir: 'T15-04', gate: 'GD' },
    { id: 'T15-05', title: '新输入、导出与 TS/Python 一致性', owner: 'F', dir: 'T15-05', gate: 'GP' },
    { id: 'T15-06', title: '完成干净 C2 三 seed 基线', owner: 'C', dir: 'T15-06', gate: 'GC' },
    { id: 'T15-07', title: '结合回合规则归因真实失败', owner: 'D', dir: 'T15-07', gate: null },
    { id: 'T15-08', title: '重做匹配工作量的 D0/D1/D2', owner: 'C+E', dir: 'T15-08', gate: 'GI' },
    { id: 'T15-09A', title: '评测自测、成本校准与清单冻结', owner: 'A', dir: 'T15-09', gate: 'GE' },
    { id: 'T15-09B', title: '开发面板', owner: 'A', dir: 'T15-09', gate: null },
    { id: 'T15-09C', title: '条件独立确认', owner: 'A', dir: 'T15-09', gate: null },
    { id: 'T15-10', title: '回合与联盟感知的搜索教师研究', owner: 'D', dir: 'T15-10', gate: 'GT' },
    { id: 'T15-11', title: '最终交付与独立核验', owner: 'A', dir: 'T15-11', gate: null },
];

const GATE_FILES: Record<string, string> = {
    G0: 'T15-00/task_status.json',
    GL: 'T15-01/gate_GL.json',
    GR: 'T15-02/gate_GR.json',
    GO: 'T15-03/gate_GO.json',
    GD: 'T15-04/gate_GD.json',
    GP: 'T15-05/gate_GP.json',
    GC: 'T15-06/gate_GC.json',
    GE: 'T15-09/gate_GE.json',
    GI: 'T15-08/gate_GI.json',
    GT: 'T15-10/gate_GT.json',
};

interface TaskEntry {
    id: string;
    title: string;
    owner: string;
    status: string;
    reason: string | null;
    acceptance: unknown;
    evidence: string[];
    commands: string[];
    remainingWork: string[];
    resumeCommand: string | null;
    statusFile: { path: string; sha256: string } | null;
    artifactCount: number;
    artifactBytes: number;
}

const tasks: TaskEntry[] = [];
for (const t of TASK_CATALOG) {
    const dirAbs = path.join(RUN_DIR, t.dir);
    // V15/T15-11：状态文件必须**按任务**定位，不能共享。
    //
    // 为什么：T15-09A/B/C 与 T15-11 的目标目录与父任务相同（例如都在 `T15-09/`）。
    // 如果它们都去读 `T15-09/task_status.json`，B/C 会被父任务的状态“顺带”标成 DONE，
    // 这正是任务书 §12 第 1 条禁止的「按目录存在自动生成 DONE」的一种变体。
    // 因此：只有主任务读默认名，子段只读自己的带后缀文件名。
    let statusCandidates: string[];
    if (/^T15-\d{2}[A-C]$/.test(t.id)) {
        statusCandidates = [path.join(dirAbs, `task_status_${t.id.slice(-1).toLowerCase()}.json`)];
    } else {
        statusCandidates = [path.join(dirAbs, 'task_status.json')];
    }
    const statusPath = statusCandidates.find((p) => fs.existsSync(p)) ?? null;
    let artifactCount = 0;
    let artifactBytes = 0;
    if (fs.existsSync(dirAbs)) {
        const walk = (dir: string): void => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(abs);
                else {
                    artifactCount += 1;
                    artifactBytes += fs.statSync(abs).size;
                }
            }
        };
        walk(dirAbs);
    }

    if (!statusPath) {
        tasks.push({
            id: t.id, title: t.title, owner: t.owner, status: 'NOT_STARTED',
            reason: '该任务没有写出 task_status.json；不按目录存在推断 DONE。',
            acceptance: null, evidence: [], commands: [], remainingWork: [],
            resumeCommand: null, statusFile: null, artifactCount, artifactBytes,
        });
        continue;
    }
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    tasks.push({
        id: t.id,
        title: t.title,
        owner: t.owner,
        status: String(status.status ?? 'UNKNOWN'),
        reason: status.reason ?? null,
        acceptance: status.acceptance ?? null,
        evidence: Array.isArray(status.evidence) ? status.evidence : [],
        commands: Array.isArray(status.commands) ? status.commands : [],
        remainingWork: Array.isArray(status.remainingWork) ? status.remainingWork : [],
        resumeCommand: status.resumeCommand ?? null,
        statusFile: { path: rel(statusPath), sha256: sha256File(statusPath) },
        artifactCount,
        artifactBytes,
    });
}

const gates = Object.entries(GATE_FILES).map(([gate, relPath]) => {
    const abs = path.join(RUN_DIR, relPath);
    if (!fs.existsSync(abs)) {
        return { gate, file: relPath, present: false, passed: null, sha256: null, detail: null };
    }
    const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
    // V15/T15-11：各 gate 文件的结论字段并不统一（有的是布尔 `passed`，
    // 有的是字符串 `status` / `conclusion`）。这里按优先级读取，任何一种都不写死：
    // 三者都缺失时记 null = UNKNOWN，**不**从文件存在推断通过。
    let passed: boolean | null = null;
    if (typeof data.passed === 'boolean') passed = data.passed;
    else if (typeof data.conclusion === 'string') passed = data.conclusion.toUpperCase() === 'PASSED'
        || data.conclusion.toUpperCase() === 'PASS';
    else if (typeof data.status === 'string') passed = data.status === 'DONE';
    return {
        gate,
        file: relPath,
        present: true,
        passed,
        conclusionSource: typeof data.passed === 'boolean' ? 'passed'
            : (typeof data.conclusion === 'string' ? 'conclusion'
                : (typeof data.status === 'string' ? 'status' : null)),
        sha256: sha256File(abs),
        detail: data.contract ?? data.gateCondition ?? data.gate ?? null,
        checks: Array.isArray(data.checks) ? data.checks.map((c: any) => ({
            id: c.id, pass: c.pass, requirement: c.requirement, actual: c.actual,
        })) : (Array.isArray(data.items) ? data.items.map((c: any) => ({
            id: c.id, pass: c.pass, requirement: c.requirement, actual: c.actual,
        })) : null),
    };
});

const statusCounts: Record<string, number> = {};
for (const t of tasks) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;

const payload = {
    schema: 'v15_task_status_1',
    task: 'T15-11',
    owner: 'A',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    contract: '每个任务的 status 取自该任务自己写出的 task_status.json；缺失记 NOT_STARTED。'
        + '状态含义：NOT_STARTED / RUNNING / DONE / FAILED / BLOCKED / INCONCLUSIVE / BUDGET_EXHAUSTED / DEFERRED。',
    statusCounts,
    gates,
    tasks,
};

const outPath = path.join(RUN_DIR, 'task_status.json');
if (fs.existsSync(outPath)) throw new Error(`拒绝覆盖已存在的产物：${outPath}`);
fs.mkdirSync(RUN_DIR, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`[T15-11] runId=${RUN_ID} tasks=${tasks.length}`);
console.log(`[T15-11] statusCounts=${JSON.stringify(statusCounts)}`);
for (const g of gates) {
    console.log(`  gate ${g.gate.padEnd(3)} ${g.present ? (g.passed === null ? 'UNKNOWN' : (g.passed ? 'PASS' : 'FAIL')) : 'MISSING'} ${g.file}`);
}
for (const t of tasks) {
    console.log(`  ${t.id.padEnd(9)} ${t.status.padEnd(14)} artifacts=${t.artifactCount} ${t.statusFile ? '' : '(no task_status.json)'}`);
}
console.log(`[T15-11] wrote ${rel(outPath)}`);
