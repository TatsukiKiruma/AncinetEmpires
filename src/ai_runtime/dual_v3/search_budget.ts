/** 搜索软截止只停止本轮扩展，不代表GPU服务失联或整局时间判负。 */
export class SearchBudgetExpiredError extends Error {
    readonly code = 'SEARCH_BUDGET_EXPIRED';
    constructor(message = '本轮搜索预算已用尽') { super(message); this.name = 'SearchBudgetExpiredError'; }
}

export function isSearchBudgetExpired(error: unknown): error is SearchBudgetExpiredError {
    return error instanceof Error && (error as SearchBudgetExpiredError).code === 'SEARCH_BUDGET_EXPIRED';
}

/** 迟到的前向仍由模型桥接收并排空；本轮不消费其结果，避免未完成分支混入教师标签。 */
export function withinSearchBudget<T>(work: () => PromiseLike<T>, deadline: number): Promise<T> {
    const remaining = deadline - performance.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return Promise.reject(new SearchBudgetExpiredError());
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new SearchBudgetExpiredError()), remaining);
        Promise.resolve().then(work).then(value => {
            clearTimeout(timer);
            if (performance.now() >= deadline) reject(new SearchBudgetExpiredError()); else resolve(value);
        }, error => { clearTimeout(timer); reject(error); });
    });
}
