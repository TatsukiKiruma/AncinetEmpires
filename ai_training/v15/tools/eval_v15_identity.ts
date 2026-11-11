/**
 * V15/T15-09A：对局缓存身份的**实际计算**（owner A）。
 *
 * 任务书 §10.1 第一条要求：不能只复用「声称的版本字符串」，必须把
 * **初始状态 / 引擎 / 地图 / 随机流**变成可复算的摘要。本文件只做三件事：
 *
 * 1. `sourceDigestsV15()`：把引擎/规则源码与策略实现源码逐文件取 SHA-256，再合成
 *    一个清单摘要。摘要格式写死为 `sha256-filelist-v1`，第三方按同一文件清单可复算。
 * 2. `mapArtifactsV15()`：地图资源原始字节摘要（与引擎读的是同一份文件）+
 *    规范化布局摘要（从初始状态的 `map.tiles`/尺寸重算，不含 metadata）。
 * 3. `initialStateHashOfV15()`：初始状态摘要。**复用 T15-01 的 `canonicalStateJson`**，
 *    保证「同一逻辑状态得到同一摘要」的规范化口径与状态/标签合同完全一致，
 *    而不是在本文件另起一套序列化。
 *
 * 本文件不跑对局、不改状态、不读环境变量以外的隐式配置；所有输入都是显式路径。
 * 缓存身份键本身（字段表 → key/gameId）在 `v14/tools/eval_v14_protocol.ts` 的
 * `buildCacheIdentityV15`，本文件只负责提供字段值。
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getApkSkirmishTrainingScenarios } from '../../src/game/apk_skirmish';
import { canonicalStateJson } from './labeler_l1_v15';
import type { GameState } from '../../src/game/types';

/** 源码清单摘要格式 id。清单或拼接方式变化时必须升版本。 */
export const SOURCE_DIGEST_FORMAT_V15 = 'sha256-filelist-v1';

/**
 * 引擎/规则源码清单（相对仓库根）。
 *
 * 中文：protocol.json#cacheKey 要求「含 src/game/engine.ts、rules.ts、env.ts」，
 * 这里把规则配置与公共类型一起纳入——它们会改变终局/淘汰/合法性语义。清单是闭合的：
 * 增删文件会改变摘要，等于换缓存键。
 */
export const ENGINE_SOURCE_FILES_V15: readonly string[] = [
    'src/game/engine.ts',
    'src/game/rules.ts',
    'src/game/env.ts',
    'src/game/rule_config.ts',
    'src/game/types.ts',
    'src/game/apk_skirmish.ts',
    'src/game/apk_map.ts',
];

/** 策略实现源码清单（启发式 + 共享空间策略 + 权重加载 + 编码器）。 */
export const POLICY_SOURCE_FILES_V15: readonly string[] = [
    'src/game/ai/heuristic_ai.ts',
    'src/game/ai/shared_spatial_policy.ts',
    'src/game/ai/spatial_conv_net.ts',
    'src/game/ai/spatial_tensor_encoder.ts',
];

/** 单个文件的字节身份。 */
export interface FileDigestV15 {
    path: string;
    sha256: string;
    bytes: number;
}

/** 文件清单摘要结果。 */
export interface SourceDigestV15 {
    format: string;
    digest: string;
    files: FileDigestV15[];
}

/** 计算文件字节 SHA-256；文件不存在直接抛错（身份缺失不得静默降级）。 */
export function sha256FileBytesV15(absPath: string): FileDigestV15 {
    if (!fs.existsSync(absPath)) {
        throw new Error(`[T15-09A] 身份摘要失败：文件不存在 ${absPath}`);
    }
    const bytes = fs.readFileSync(absPath);
    return {
        path: absPath.replace(/\\/g, '/'),
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
    };
}

/**
 * 把一组文件合成一个清单摘要。
 *
 * 中文：拼接方式是 `<相对路径>:<sha256>\n` 按路径字典序排序后整体再取 SHA-256，
 * 因此摘要只依赖「清单内每个文件的字节」，与读取顺序、绝对路径无关，可离线复算。
 */
export function fileListDigestV15(repoRoot: string, relPaths: readonly string[]): SourceDigestV15 {
    const files = [...relPaths]
        .sort()
        .map((rel) => {
            const entry = sha256FileBytesV15(path.join(repoRoot, ...rel.split('/')));
            return { ...entry, path: rel };
        });
    const manifest = files.map((f) => `${f.path}:${f.sha256}`).join('\n');
    return {
        format: SOURCE_DIGEST_FORMAT_V15,
        digest: crypto.createHash('sha256').update(manifest, 'utf8').digest('hex'),
        files,
    };
}

/** 引擎与策略两组源码摘要（一次算好，供整个 runner 复用）。 */
export interface SourceDigestsV15 {
    repoRoot: string;
    engine: SourceDigestV15;
    policy: SourceDigestV15;
}

export function sourceDigestsV15(repoRoot: string): SourceDigestsV15 {
    return {
        repoRoot: repoRoot.replace(/\\/g, '/'),
        engine: fileListDigestV15(repoRoot, ENGINE_SOURCE_FILES_V15),
        policy: fileListDigestV15(repoRoot, POLICY_SOURCE_FILES_V15),
    };
}

/** 地图资源字节身份。 */
export interface MapArtifactsV15 {
    scenarioId: string;
    mapName: string;
    resourcePath: string;
    /** 地图资源**原始（加密）字节**摘要：与引擎实际读取的文件一致。 */
    mapHash: string;
    bytes: number;
}

/**
 * 解析 SD 场景对应的地图资源文件并取字节摘要。
 *
 * 中文：直接复用 `src/game/apk_skirmish.ts` 的场景表与
 * `tools/skirmish_training_runner.ts` 的同一拼接方式（unpackDir + resourcePath 分段），
 * 保证摘要对应的是引擎真正读入的那份字节。找不到场景或文件时抛错。
 */
export function mapArtifactsV15(unpackDir: string, scenarioId: string): MapArtifactsV15 {
    const mapName = scenarioId.split(':').pop() as string;
    const wanted = `SD:${mapName}`;
    const scenario = getApkSkirmishTrainingScenarios().find((s) => s.id === wanted);
    if (!scenario) {
        throw new Error(`[T15-09A] 地图身份失败：场景表里找不到 ${wanted}（来自 ${scenarioId}）。`);
    }
    const abs = path.join(unpackDir, ...scenario.resourcePath.split('/'));
    const entry = sha256FileBytesV15(abs);
    return {
        scenarioId,
        mapName,
        resourcePath: scenario.resourcePath,
        mapHash: entry.sha256,
        bytes: entry.bytes,
    };
}

/** 初始状态摘要：与 T15-01 的 `stateHashOf` 同一规范化口径。 */
export function initialStateHashOfV15(state: GameState): string {
    return crypto.createHash('sha256').update(Buffer.from(canonicalStateJson(state), 'utf8')).digest('hex');
}

/**
 * 规范化布局摘要：只含尺寸与地块二维数组。
 *
 * 中文：`metadata`（来源/路径）与 `apkScriptState`（脚本变量）不进布局摘要——它们不决定
 * 地形规则；但**初始状态摘要**（initialStateHash）是全状态的，因此二者互补：
 * 布局摘要回答「是不是同一张图」，初始状态摘要回答「是不是同一局面」。
 */
export function mapLayoutHashOfV15(state: GameState): string {
    const layout = {
        width: state.map.width,
        height: state.map.height,
        tiles: state.map.tiles,
    };
    return crypto.createHash('sha256').update(Buffer.from(canonicalStateJson(layout), 'utf8')).digest('hex');
}

/** 权重文件字节摘要；`checkpointSha256` 的来源。 */
export function checkpointSha256V15(absPath: string): string {
    return sha256FileBytesV15(absPath).sha256;
}

/**
 * 模型 ID：`<policyId>:<tag>:<sha256 前 12 位>`（protocol.json#gameIds.modelIdFormat）。
 *
 * 中文：文件名与模型 seed 都不能替代权重字节；tag 只用于人读，唯一性由摘要保证。
 */
export function modelIdV15(policyId: string, tag: string, checkpointSha256: string | null): string {
    if (checkpointSha256 === null) {
        // 启发式臂：无权重文件，用固定 ID（protocol.json#gameIds.examples 的口径）。
        return `${policyId}:${tag}:heuristic`;
    }
    if (!/^[0-9a-f]{64}$/.test(checkpointSha256)) {
        throw new Error(`[T15-09A] modelIdV15: checkpointSha256 必须是 64 位小写十六进制，实际 '${checkpointSha256}'。`);
    }
    return `${policyId}:${tag}:${checkpointSha256.slice(0, 12)}`;
}
