/**
 * V17/T17-01：**网络输入身份**（network input identity）的唯一实现。
 *
 * 中文：这是 V17 里判断「两条样本是不是同一个网络输入」的唯一口径。V16 的问题是
 * 前置去重用了完整 `stateHash + orderingId + filterId`，而网络真正看到的只是
 * float32 空间张量 + 全局特征 + 候选语义/坐标的无序多重集，于是大量重复输入绕过
 * 去重进入 train/val（审核实测 train 16,000 行只有 6,869 个不同输入）。
 *
 * 本文件把审核脚本 `v17/review/audit_v16.py::input_key` 的定义**逐字节**冻结下来：
 *
 *   h = sha256( f32(spatialTensor) || f32(globalFeatures) )
 *   for c in candidates:  d_c = sha256( json_sortkeys(c.actorCoord) ||
 *                                       json_sortkeys(c.landingCoord) ||
 *                                       json_sortkeys(c.targetCoord) ||
 *                                       f32(c.semantics) )
 *   h.update( uint32le(len(candidates)) )
 *   for d in sorted(d_c): h.update(d)
 *
 * 纪律（任务书 §3.1）：
 * - **不得**把 sampleId / rootId / split / source / 教师标签 / seed / 单位 ID / actionCode
 *   混进这个 key；它们不是网络输入。
 * - 候选保留多重性：两个语义相同的候选仍然是两个候选（长度进 key，逐个 digest 进 key）。
 * - 候选顺序无关：digest 排序后再进 hash（乱序 key 不变）。
 *
 * 同一份定义在 Python 侧由 `v17/tools/build_v17_dataset.py` 复刻；两侧必须给出相同
 * 十六进制串，`v17/tools/v17_identity_parity.ts` + `build_v17_dataset.py --self-check`
 * 负责交叉验证。
 */

import { createHash } from 'node:crypto';

/** 身份口径版本；改字节序 / 加字段必须换 id。 */
export const V17_INPUT_IDENTITY_ID = 'v17-netinput-v1';

/** 与 V16 冠军权重一致的编码 schema（26 通道 / 20 全局 / 53 候选语义）。 */
export const V17_ENCODER_SCHEMA_ID = 'spatial26_global20_actionSemantics53_v15';

/** 候选语义维度（schema 的组成部分；不匹配时身份函数拒绝工作）。 */
export const V17_ACTION_SEMANTIC_DIM = 53;

/** 参与候选 digest 的三个坐标字段（顺序即字节序）。 */
export const V17_CANDIDATE_COORD_KEYS = ['actorCoord', 'landingCoord', 'targetCoord'] as const;

/** 形状最小接口：只要能给出 float32 张量与候选语义即可。 */
export interface V17CandidateInputLike {
    actorCoord?: unknown;
    landingCoord?: unknown;
    targetCoord?: unknown;
    semantics: readonly number[];
}

export interface V17InputIdentityResult {
    /** 最终网络输入身份（十六进制 sha256）。 */
    key: string;
    /** 逐候选 digest（十六进制），按进入顺序，便于冲突诊断。 */
    candidateDigests: string[];
}

/** Python `json.dumps(value, sort_keys=True, separators=(',', ':'))` 的等价实现（坐标/标签用）。 */
export function canonicalJsonCompact(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(`[v17-input] 非有限数字不能进身份：${value}`);
        return JSON.stringify(value);
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJsonCompact).join(',')}]`;
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonCompact(obj[k])}`).join(',')}}`;
}

/** float32 小端字节（**先按 float32 舍入再序列化**，与 Python `struct.pack('<f')` 同口径）。 */
export function f32Bytes(values: readonly number[]): Buffer {
    const buf = Buffer.allocUnsafe(values.length * 4);
    for (let i = 0; i < values.length; i += 1) {
        buf.writeFloatLE(values[i], i * 4);
    }
    return buf;
}

/** 单个候选的网络特征 digest。 */
export function candidateDigestV17(candidate: V17CandidateInputLike): string {
    const h = createHash('sha256');
    for (const key of V17_CANDIDATE_COORD_KEYS) {
        h.update(canonicalJsonCompact((candidate as Record<string, unknown>)[key]));
    }
    if (!Array.isArray(candidate.semantics)) {
        throw new Error('[v17-input] 候选缺少 semantics 数组。');
    }
    h.update(f32Bytes(candidate.semantics));
    return h.digest('hex');
}

/**
 * 网络输入身份。
 *
 * 中文：`spatialTensor` 与 `globalFeatures` 直接按 float32 序列化；候选逐个算 digest，
 * 排序后按 uint32 长度前缀拼进主 hash。
 */
export function policyInputKeyV17(
    spatialTensor: readonly number[],
    globalFeatures: readonly number[],
    candidates: readonly V17CandidateInputLike[],
): V17InputIdentityResult {
    const h = createHash('sha256');
    h.update(f32Bytes(spatialTensor));
    h.update(f32Bytes(globalFeatures));
    const digests = candidates.map((c) => candidateDigestV17(c));
    const len = Buffer.allocUnsafe(4);
    len.writeUInt32LE(candidates.length >>> 0, 0);
    h.update(len);
    for (const d of [...digests].sort()) h.update(Buffer.from(d, 'hex'));
    return { key: h.digest('hex'), candidateDigests: digests };
}

/** 只算 key 的便捷封装。 */
export function policyInputKeyHexV17(
    spatialTensor: readonly number[],
    globalFeatures: readonly number[],
    candidates: readonly V17CandidateInputLike[],
): string {
    return policyInputKeyV17(spatialTensor, globalFeatures, candidates).key;
}

/**
 * 候选**规范顺序**的多重集指纹（诊断用）。
 *
 * 中文：与 `policyInputKeyV17` 不同，这里保留候选顺序，用来回答「同输入不同候选顺序」
 * 这类问题；不能把它当作隔离身份。
 */
export function orderedCandidateMultisetV17(candidates: readonly V17CandidateInputLike[]): string {
    const h = createHash('sha256');
    for (const c of candidates) h.update(Buffer.from(candidateDigestV17(c), 'hex'));
    return h.digest('hex');
}

/** 状态级 hash（**不是**网络输入身份，只用于 family / 重放诊断）。 */
export function stateHashV17(canonicalStateJson: string): string {
    return createHash('sha256').update(canonicalStateJson, 'utf8').digest('hex');
}
