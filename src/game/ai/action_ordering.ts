/**
 * V16/T16-02 §4.1：规范候选顺序与稳定选择（owner：T16-02）。
 *
 * 问题（V15 审核 §1.4）：搜索/推理侧没有落地的稳定 actionCode tie-break。
 * `SpatialResNetPredictor.predict` 的 argmax 是「严格大于才换」，所以并列时取的是
 * **候选数组里最先出现的那个**；而候选数组来自 `engine.getLegalActions()` 的产生顺序，
 * 不属于任何冻结合同。同一状态、同一权重在不同调用路径（引擎内部顺序变化、数据导出
 * 的候选裁剪、训练时的重排）可能选出不同动作。
 *
 * 修复合同（任务书 §4.1）：
 * - 在正式共享策略入口定义 canonical actionCode 排序，使用显式的 **Unicode 代码点字典序**
 *   比较器；不依赖 `localeCompare`，也不依赖来源数组顺序。
 * - 训练、标签、推理共用同一个 `candidateOrderingId`；重排时重新映射 target / soft labels /
 *   掩码 / 证据（数据侧由 T16-04 的导出工具保证）。
 * - 精确并列 logits 时取 **最小 actionCode**。不引入「大约相等」阈值——那会改变所有
 *   近似并列的结果，属于另一个策略版本。
 *
 * 本文件是**新增**文件；V14/V15 的历史工具与权重不受影响（它们的候选顺序仍是引擎顺序，
 * 记为 `engine-order-legacy`）。
 */

import { encodeAction } from '../env';
import type { Action } from '../types';

/** 规范排序 id。排序语义变化时必须升版本；数据集的 `candidateOrderingId` 必须与此一致。 */
export const CANDIDATE_ORDERING_ID_V16 = 'actionCode-codepoint-asc-v1';

/** 历史（V14/V15）数据与工具的候选顺序：引擎产生顺序，不作为 V16 训练标签的顺序合同。 */
export const CANDIDATE_ORDERING_ID_LEGACY = 'engine-order-legacy';

/**
 * Unicode 代码点字典序比较器。
 *
 * 中文：逐代码点比较；前缀关系时较短的更小（与 `Array.prototype.sort` 的字符串默认比较
 * 在 BMP 内一致，但对补充平面的字符也正确，因此不依赖 UTF-16 码元顺序这个实现细节）。
 */
export function compareActionCodeCanonicalV16(a: string, b: string): number {
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        const ca = a.codePointAt(i) as number;
        const cb = b.codePointAt(j) as number;
        if (ca !== cb) return ca < cb ? -1 : 1;
        i += ca > 0xffff ? 2 : 1;
        j += cb > 0xffff ? 2 : 1;
    }
    if (i < a.length) return 1;
    if (j < b.length) return -1;
    return 0;
}

/** 规范排序后的一个候选。 */
export interface OrderedCandidateV16 {
    /** `encodeAction(action)` 的结果，排序键。 */
    code: string;
    /** 原动作对象（引用保持，不做拷贝）。 */
    action: Action;
    /** 在**规范顺序**中的下标。 */
    index: number;
    /** 在**输入数组**中的下标（用于把标签/掩码映射回来）。 */
    inputIndex: number;
}

/**
 * 把合法动作集排成规范顺序。
 *
 * 中文：并列的 actionCode 视为**同一动作的重复**，直接报错——`encodeAction` 覆盖 Action
 * 联合的全部字段（V14/T14-05 已核实 14 种类型全部包含关键字段），因此重复意味着上游
 * 产生了真正的重复候选，静默保留会让「最小 actionCode」的选择变得不确定。
 */
export function canonicalActionOrderV16(actions: readonly Action[]): OrderedCandidateV16[] {
    const decorated = actions.map((action, inputIndex) => ({ code: encodeAction(action), action, inputIndex }));
    const seen = new Map<string, number>();
    for (const item of decorated) {
        const previous = seen.get(item.code);
        if (previous !== undefined) {
            throw new Error(
                `[T16-02] canonicalActionOrderV16: 候选 ${previous} 与 ${item.inputIndex} 的 actionCode 相同（'${item.code}'），`
                + '重复候选会让稳定 tie-break 失去定义；请在上游去重而不是在这里猜。',
            );
        }
        seen.set(item.code, item.inputIndex);
    }
    decorated.sort((left, right) => compareActionCodeCanonicalV16(left.code, right.code));
    return decorated.map((item, index) => ({ ...item, index }));
}

/**
 * 精确并列时的稳定选择：返回 logits 中最大值对应的**规范顺序最小**下标。
 *
 * 中文：这里只处理「按 `>` 严格比较得到的并列」；浮点近似相等（例如 1e-7 以内）**不算并列**，
 * 必须按真实数值比较，不允许引入容差阈值。
 */
export function stableArgmaxV16(logits: readonly number[]): number {
    if (logits.length === 0) return -1;
    let bestIndex = 0;
    let bestValue = logits[0];
    for (let i = 1; i < logits.length; i += 1) {
        const value = logits[i];
        if (!Number.isFinite(value)) {
            throw new Error(`[T16-02] stableArgmaxV16: logits[${i}] 非有限数（${value}）。`);
        }
        if (value > bestValue) {
            bestValue = value;
            bestIndex = i;
        }
    }
    return bestIndex;
}
