/** 仅负责进度显示，不参与采样、权重更新或模型选择。 */
export class TrainingProgress {
    private phase = '';
    private total: number | null = null;
    private completed = 0;
    private started = 0;
    private lastPrinted = 0;

    constructor(
        private readonly intervalMs = 2000,
        private readonly write: (message: string) => void = message => process.stderr.write(`${message}\n`),
        private readonly now: () => number = Date.now
    ) {}

    start(phase: string, total: number | null) {
        this.phase = phase;
        this.total = total;
        this.completed = 0;
        this.started = this.now();
        this.print(true);
    }

    advance() {
        this.completed += 1;
        // 限制热循环中的计时调用，避免显示拖慢训练。
        if (this.completed % 256 === 0) this.print(false);
    }

    set(completed: number) {
        this.completed = completed;
        this.print(false);
    }

    finish(note = '') {
        this.print(true, note);
    }

    message(note: string) {
        this.write(note);
    }

    private print(force: boolean, note = '') {
        const current = this.now();
        if (!force && current - this.lastPrinted < this.intervalMs) return;
        this.lastPrinted = current;
        const seconds = Math.max(0, (current - this.started) / 1000);
        const speed = seconds > 0 ? this.completed / seconds : 0;
        const count = this.total === null ? `${this.completed} 条`
            : `${this.completed}/${this.total} 条 (${(this.total > 0 ? this.completed / this.total * 100 : 100).toFixed(1)}%)`;
        const remaining = this.total !== null && speed > 0
            ? `${Math.ceil(Math.max(0, this.total - this.completed) / speed)} 秒` : '估算中';
        this.write(`[${this.phase}] ${count} | ${speed.toFixed(0)} 条/秒 | 已用 ${seconds.toFixed(0)} 秒 | 本阶段剩余 ${remaining}${note ? ` | ${note}` : ''}`);
    }
}
