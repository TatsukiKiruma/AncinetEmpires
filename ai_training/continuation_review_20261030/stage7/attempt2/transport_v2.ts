import { decodeResponse } from './binary_response';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { withinSearchBudget, isSearchBudgetExpired, SearchBudgetExpiredError } from '../../../src/ai_runtime/dual_v3/search_budget';

export class InferenceTransportError extends Error {
    readonly code = 'INFERENCE_TRANSPORT_ERROR';
    constructor(message: string) { super(message); this.name = 'InferenceTransportError'; }
}
interface Request {
    id: number; label: string; started: number; count: number; detached: boolean; deadline?: number; done: Promise<any[]>;
    resolve: (v: any[]) => void; reject: (e: Error) => void; timer: NodeJS.Timeout;
}
export interface TransportLaunch { command: string; args: string[]; env?: NodeJS.ProcessEnv }

/** 单连接只允许一个在途请求；软截止只取消消费者，迟到包必须先排空再发送下一包。 */
export class InferenceTransport {
    private readonly child: ChildProcessWithoutNullStreams;
    private buffer = Buffer.alloc(0);
    private pending: Request | null = null;
    private failure: InferenceTransportError | null = null;
    private closing = false;
    private termination: Promise<void> | null = null;
    private label = '';
    private readonly counters = { requests: 0, observations: 0, completed: 0, lateResponses: 0, softDeadlines: 0, drainWaits: 0, hardTimeouts: 0, wireMs: 0, peakBatchSize: 0, bytes: 0,
        decisionRequests: 0, decisionObservations: 0, completedDecisionObservations: 0, decisionWireMs: 0, decisionPeakBatchSize: 0 };
    private readonly events: any[] = [];
    constructor(launch: TransportLaunch, private readonly watchdogMs = 10000) {
        if (!Number.isFinite(watchdogMs) || watchdogMs <= 0) throw Error('传输看门狗必须为正数');
        this.child = spawn(launch.command, launch.args, { env: launch.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
        this.child.stderr.on('data', data => process.stderr.write(data));
        this.child.on('error', e => this.fail('GPU服务启动失败：' + e.message));
        this.child.on('exit', (code, signal) => { if (!this.closing || this.pending) this.fail(`GPU服务退出：${code}/${signal}`); });
        this.child.stdin.on('error', e => this.fail('GPU管道写入失败：' + e.message));
        this.child.stdout.on('data', (data: Buffer) => this.receive(data));
    }
    get exitCode() { return this.child.exitCode; }
    get pid() { return this.child.pid; }
    get exited() { return !this.child.pid || this.child.exitCode !== null || this.child.signalCode !== null; }
    get diagnostics() { return { ...this.counters, inFlight: this.pending?.id ?? null, failure: this.failure?.message ?? null, lastEvents: this.events.slice() }; }
    setLabel(label: string) { this.label = label; }
    private event(type: string, data: object = {}) { this.events.push({ type, label: this.label, at: new Date().toISOString(), ...data }); if (this.events.length > 64) this.events.shift(); }
    private fail(message: string) {
        this.failure ??= new InferenceTransportError(message);
        const origin = this.pending;
        if (this.pending) { const r = this.pending; this.pending = null; clearTimeout(r.timer); r.reject(this.failure); }
        this.event('transport_error', { label: origin?.label ?? this.label, requestId: origin?.id ?? null, message });
    }
    private receive(data: Buffer) {
        this.buffer = Buffer.concat([this.buffer, data]);
        while (this.buffer.length >= 4) {
            const size = this.buffer.readUInt32LE();
            if (size > 2 ** 28) { this.fail('GPU响应长度无效'); void this.terminate(); return; }
            if (this.buffer.length < size + 4) return;
            const r = this.pending;
            if (!r) { this.fail('GPU响应没有对应的在途请求'); void this.terminate(); return; }
            const raw = this.buffer.subarray(4, size + 4); this.buffer = this.buffer.subarray(size + 4);
            this.pending = null; clearTimeout(r.timer);
            const ms = performance.now() - r.started;
            try {
                const rows = decodeResponse(raw);
                if (!Array.isArray(rows) || rows.length !== r.count) throw Error('响应样本数不符');
                this.counters.completed++; this.counters.wireMs += ms;
                if (r.deadline !== undefined) { this.counters.completedDecisionObservations += r.count; this.counters.decisionWireMs += ms; }
                if (r.deadline !== undefined && performance.now() >= r.deadline) r.detached = true;
                if (r.detached) this.counters.lateResponses++;
                this.event(r.detached ? 'late_drained' : 'response', { label: r.label, id: r.id, count: r.count, ms }); r.resolve(rows);
            } catch (e) { r.reject(new InferenceTransportError('GPU响应解码失败：' + String(e))); this.fail('GPU响应解码失败'); void this.terminate(); }
        }
    }
    async request(payload: Buffer, count: number, deadline?: number): Promise<any[]> {
        while (this.pending) {
            this.counters.drainWaits++; const preceding = this.pending;
            await withinSearchBudget(() => preceding.done, deadline ?? performance.now() + 120000);
        }
        if (this.failure) throw this.failure;
        if (this.closing) throw new InferenceTransportError('GPU连接已关闭');
        if (deadline !== undefined && performance.now() >= deadline) {
            this.counters.softDeadlines++; this.event('search_budget_before_send', { count, bytes: payload.length });
            throw new SearchBudgetExpiredError('打包或等待前一响应已用尽搜索预算');
        }
        const id = ++this.counters.requests, started = performance.now();
        let resolve!: (rows: any[]) => void, reject!: (error: Error) => void;
        const done = new Promise<any[]>((ok, bad) => { resolve = ok; reject = bad; });
        const timer = setTimeout(() => {
            this.counters.hardTimeouts++; this.fail('GPU服务未在独立传输看门狗内返回'); void this.terminate();
        }, deadline === undefined ? 120000 : this.watchdogMs);
        const request: Request = { id, label: this.label, started, count, detached: false, deadline, done, resolve, reject, timer };
        this.pending = request; this.counters.observations += count; this.counters.bytes += payload.length;
        if (deadline !== undefined) {
            this.counters.decisionRequests++; this.counters.decisionObservations += count;
            this.counters.decisionPeakBatchSize = Math.max(this.counters.decisionPeakBatchSize, count);
        }
        this.counters.peakBatchSize = Math.max(this.counters.peakBatchSize, count);
        this.event('request', { id, count, bytes: payload.length, remainingMs: deadline === undefined ? null : deadline - started });
        this.child.stdin.write(payload, error => { if (error) this.fail('GPU请求写入失败：' + error.message); });
        try { return deadline === undefined ? await done : await withinSearchBudget(() => done, deadline); }
        catch (error) {
            if (isSearchBudgetExpired(error)) {
                request.detached = true; this.counters.softDeadlines++;
                this.event('search_budget', { label: request.label, id, count, inFlight: this.pending?.id === id });
            }
            throw error;
        }
    }
    private terminate(): Promise<void> {
        if (this.termination) return this.termination;
        this.termination = (async () => {
            this.child.stdin.destroy();
            if (!this.child.pid || this.exited) return;
            // Windows虚拟环境启动器会再拉起真实Python，仅结束本连接持有的进程树。
            if (process.platform === 'win32') {
                const kill = spawn('taskkill.exe', ['/PID', String(this.child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
                await new Promise<void>(resolve => { kill.once('exit', () => resolve()); kill.once('error', () => { this.child.kill(); resolve(); }); });
            } else this.child.kill();
        })();
        return this.termination;
    }
    async close() {
        this.closing = true;
        if (this.pending) {
            const draining = this.pending.done;
            try { await withinSearchBudget(() => draining, performance.now() + 2000); }
            catch { this.fail('关闭时在途GPU请求未排空'); await this.terminate(); }
        }
        if (this.termination) await this.termination;
        if (this.exited) return;
        const exited = once(this.child, 'exit'); this.child.stdin.end();
        const timer = setTimeout(() => { void this.terminate(); }, 60000);
        try { await exited; } finally { clearTimeout(timer); if (this.termination) await this.termination; }
    }
}
