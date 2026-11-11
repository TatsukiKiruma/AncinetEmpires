/**
 * V17/T17-03：生成 `teacher/configs/resolved_config.json` —— **resolved config 由真实代码常量导出**，
 * 不是手抄，避免「JSON 整包传进构造器然后以为全部生效」这类错误（细则 B1）。
 *
 * 同时：
 *   - 复制只读来源文件到 run 目录并核对 SHA（来源副本 + 迁入 diff 必须留档）；
 *   - 写入 R/Q 的 RNG 派生公式与字节序口径；
 *   - 写入**实际执行过**的命令行（来自 `--commands-file`，一行 `label :: command`）。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/b100_config_report.ts --commands-file v17/out/v17_20260926_r2/teacher/configs/commands.txt
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
    B100_SOURCE_HEAD,
    B100_SOURCE_REL_PATH,
    B100_SOURCE_SHA256,
} from '../teachers/battle_search_b100';
import {
    B100_CONSTRUCTOR_FIELDS,
    B100_FROZEN_SOURCE_FIELDS,
    B100_TEACHER_VERSION,
    B100_V11_CONFIG,
    resolveB100Config,
} from '../teachers/b100_policy';
import {
    B100_INPUT_CHANNELS,
    B100_INPUT_IDENTITY_ID,
    B100_INPUT_SCHEMA_ID,
    B100_INPUT_SEMANTICS_VARIANT,
} from '../teachers/b100_input_key';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROOT = process.cwd();
const RUN_ROOT = path.resolve(arg('--run-root', 'v17/out/v17_20260926_r2') as string);
const CONFIG_DIR = path.join(RUN_ROOT, 'teacher', 'configs');
const EXTERNAL_ROOT = arg('--external-root', 'C:\\code\\AncinetEmpires-100pct') as string;

function sha256File(p: string): string {
    return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function fileInfo(rel: string, base: string = ROOT): Record<string, unknown> {
    const abs = path.resolve(base, rel);
    if (!fs.existsSync(abs)) return { path: rel, exists: false };
    const buf = fs.readFileSync(abs);
    return { path: rel.replace(/\\/g, '/'), exists: true, sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
}

fs.mkdirSync(CONFIG_DIR, { recursive: true });

/* ---- 1. 复制只读来源文件（不修改外部工作区） ---- */
const sourceAbs = path.resolve(EXTERNAL_ROOT, B100_SOURCE_REL_PATH);
const sourceCopyName = 'battle_search_ai.source.ts';
const sourceCopyAbs = path.join(CONFIG_DIR, sourceCopyName);
let sourceCopySha: string | null = null;
let sourceBytes: number | null = null;
let sourceShaRecomputed: string | null = null;
if (fs.existsSync(sourceAbs)) {
    const buf = fs.readFileSync(sourceAbs);
    fs.writeFileSync(sourceCopyAbs, buf);
    sourceCopySha = createHash('sha256').update(buf).digest('hex');
    sourceShaRecomputed = sourceCopySha;
    sourceBytes = buf.length;
} else {
    console.warn(`[B100-config] ⚠ 只读来源不存在，跳过副本：${sourceAbs}`);
}

/* ---- 2. 迁入 diff（来源 → 迁入副本），只作为文档留档 ---- */
const portAbs = path.resolve(ROOT, 'v17/teachers/battle_search_b100.ts');
const diffPath = path.join(CONFIG_DIR, 'migration_diff_summary.json');
const portText = fs.readFileSync(portAbs, 'utf8');
const sourceText = fs.existsSync(sourceAbs) ? fs.readFileSync(sourceAbs, 'utf8') : '';
const normalize = (s: string): string => s.replace(/\r\n/g, '\n');
const sourceLines = sourceText ? normalize(sourceText).split('\n') : [];
const portLines = normalize(portText).split('\n');
const sourceBodyLines = new Set(sourceLines.map((l) => l.trim()).filter((l) => l.length > 0));
let portLineNotInSource = 0;
for (const line of portLines) {
    const t = line.trim();
    if (t.length > 0 && !sourceBodyLines.has(t)) portLineNotInSource += 1;
}
const migration = {
    schema: 'v17_b100_migration_diff_summary_1',
    sourceFile: `${EXTERNAL_ROOT.replace(/\\/g, '/')}/${B100_SOURCE_REL_PATH}`,
    sourceSha256: sourceShaRecomputed,
    portedFile: 'v17/teachers/battle_search_b100.ts',
    portedSha256: sha256File(portAbs),
    sourceLines: sourceLines.length,
    portedLines: portLines.length,
    /** ported 里「行内容（去空白）在来源中找不到」的行数：import 重写 + 观测 + 新接口。 */
    portedLinesNotVerbatimInSource: portLineNotInSource,
    allowedDifferences: [
        '相对 import 路径重写（../x → ../../src/game/x；tools/v7_heuristic_bounded_search → ../../tools/...）',
        'B100Instrumentation 计数器与 clone/heuristic/evaluate 计时（instrument=false 时全部跳过）',
        'engine.clone() → this.cloneEngine(engine)（内部只加计数/计时）',
        'sim.step(x) → this.stepEngine(sim, x)（内部只加计数，异常照原样抛出）',
        '新增只读接口 getLastDecisionDiagnostics / getInstrumentation / resetInstrumentation',
        '新增 mulberryStateful（与 mulberryDefault 同一条数值流，额外暴露 uint32 状态）与 rngStateHex / parseRngStateHex',
        '每处吞异常的 catch 增加一个 this.bump(...) 计数（返回行为一字未改）',
    ],
    notChanged: [
        '8 个构造器参数的默认值（仍由调用方显式传入 v11 值）',
        '源码硬编码规则：pending 优先、urgent(>=50000)、earlyAttackTakeoverGate=1500、两阶段评估、战术候选、phaseBonus、攻击安全检查（含有利交换放行）',
        'topK 裁剪、候选顺序、同分处理、-99999 失败叶子值',
    ],
};
fs.writeFileSync(diffPath, `${JSON.stringify(migration, null, 2)}\n`, 'utf8');

/* ---- 3. 命令行（真实执行过的，来自 --commands-file） ---- */
const commandsFile = arg('--commands-file', path.join(CONFIG_DIR, 'commands.txt')) as string;
const commands: Array<{ label: string; command: string }> = [];
if (fs.existsSync(commandsFile)) {
    for (const line of fs.readFileSync(commandsFile, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const idx = t.indexOf('::');
        if (idx < 0) commands.push({ label: '', command: t });
        else commands.push({ label: t.slice(0, idx).trim(), command: t.slice(idx + 2).trim() });
    }
}

/* ---- 4. resolved config ---- */
const resolved = resolveB100Config();
const resolvedWithOverrides = resolveB100Config({ topK: 6, friendlyRolloutSteps: 1 });

const report = {
    schema: 'v17_b100_resolved_config_1',
    generatedAt: new Date().toISOString(),
    task: 'T17-03',
    teacherVersion: B100_TEACHER_VERSION,
    source: {
        originRepo: EXTERNAL_ROOT,
        head: B100_SOURCE_HEAD,
        path: B100_SOURCE_REL_PATH,
        sha256Expected: B100_SOURCE_SHA256,
        sha256Recomputed: sourceShaRecomputed,
        shaMatchesFrozenFact: sourceShaRecomputed === B100_SOURCE_SHA256,
        bytes: sourceBytes,
        copyInRun: path.relative(ROOT, sourceCopyAbs).replace(/\\/g, '/'),
        copySha256: sourceCopySha,
        copyMatchesSource: sourceCopySha === sourceShaRecomputed,
    },
    variants: {
        'B100-R': {
            description: '逐局持久教师实例；RNG 逐局只播种一次并跨决策推进；每次决策记录 rngBeforeHex/rngAfterHex/rngCalls。',
            config: resolved,
            use: '轨迹示范 / 具备随机恢复证据的 hard 标签（细则 C1）。',
        },
        'B100-Q': {
            description: '每个状态全新实例；seed 由 queryKey + querySeed 派生；无跨决策记忆。',
            config: resolved,
            use: '学生访问状态的任意查询（三次相同查询必须一致，另测 querySeed=1,2 敏感性）。',
        },
    },
    resolvedConfigIdenticalForBothVariants: JSON.stringify(resolved) === JSON.stringify(resolvedWithOverrides),
    explicitConstructorArguments: Object.fromEntries(B100_CONSTRUCTOR_FIELDS.map((f) => [f as string, resolved[f]])),
    frozenSourceRulesNotConstructorOptions: Object.fromEntries(B100_FROZEN_SOURCE_FIELDS.map((f) => [f as string, resolved[f]])),
    v11SnapshotSource: 'C:\\code\\AncinetEmpires-100pct\\docs\\training\\battle_ai\\models\\battle_search_v11.json',
    rngContract: {
        implementation: '源文件 mulberry 算术（mulberryDefault 逐字搬运）；可序列化孪生体 mulberryStateful 暴露 uint32 内部累加器。',
        stateEncoding: 'uint32 无符号视图，格式化为 "0x" + 8 位小写十六进制（例如 0x35e3fad4）。',
        ranges: '输出 [0,1)；种子与状态都按 >>> 0 归一到 uint32。',
        streamIndependence: '教师随机流与 H0 的 heuristic-seatstream-v1 完全独立（不同派生域）。',
        statisticsDoNotAffectChoice: 'BattleSearchStats 只被写入，never 参与比较/分支；HeuristicAI 除 rng 外无可变字段。',
        'R': {
            formula: "uint32(BE-first-4-bytes of SHA256(utf8('B100-R' + teacherVersion + ':' + rootSeed + ':' + seat)))",
            literalExample: "B100-Rb100-v11-34bf5829:2609260100:0",
            byteOrder: 'createHash("sha256").update(material, "utf8").digest().readUInt32BE(0)',
            derivationFunction: 'deriveRngSeedR(teacherVersion, rootSeed, seat)',
            rngInitialStateOverride: 'rngInitialState（uint32）可显式覆盖派生值，用于从 rngBeforeHex 恢复重放。',
            recordedPerDecision: ['rngBeforeHex', 'rngAfterHex', 'rngCalls'],
        },
        'Q': {
            formula: "uint32(BE-first-4-bytes of SHA256(utf8('B100-Q' + teacherVersion + ':' + queryKey + ':' + querySeed)))",
            literalExample: "B100-Qb100-v11-34bf5829:<queryKey>:0",
            byteOrder: 'createHash("sha256").update(material, "utf8").digest().readUInt32BE(0)',
            derivationFunction: 'deriveRngSeedQ(teacherVersion, queryKey, querySeed)',
            defaultQuerySeed: 0,
            queryKeyKindPolicyInputKey: 'inputKeyProvider 提供的 T17-01 网络输入身份（v17-netinput-v1）。',
            queryKeyKindStateFallback: "state:<sha256( canonicalStateJson(JSON round-trip of state) + '|' + allowed actionCodes 默认字典序升序、'\\n' 连接 )>",
            recordedPerDecision: ['queryKey', 'queryKeyKind', 'querySeed'],
            rngFieldsAreNull: true,
        },
    },
    inputIdentity: {
        id: B100_INPUT_IDENTITY_ID,
        schemaId: B100_INPUT_SCHEMA_ID,
        channels: B100_INPUT_CHANNELS,
        semanticsVariant: B100_INPUT_SEMANTICS_VARIANT,
        candidateSet: '引擎原生 getLegalActions(seat) 去掉 surrender（与 V16 数据集同一口径，不放大不缩小）。',
        helper: 'v17/teachers/b100_input_key.ts#b100PolicyInputKey',
    },
    candidateContract: {
        studentAllowedSet: '引擎原生 allowed 原样传入 getAction(engine, playerId, allowed)；topK / pending 筛选只在教师内部发生。',
        illegalResult: '返回动作不在 allowed 内 → 记 chosenInAllowed=false 并抛错，绝不回退 H0、绝不填假标签。',
        engineReconstruction: 'new GameEngine(JSON.parse(stateJson))；构造器深拷贝，且不传 applyInitialTurnStart（已结算状态不再发钱）。',
    },
    sourceFileShaList: [
        fileInfo(B100_SOURCE_REL_PATH, EXTERNAL_ROOT),
        fileInfo('src/game/ai/heuristic_ai.ts', EXTERNAL_ROOT),
        fileInfo('src/game/ai/heuristic_ai.ts', ROOT),
        fileInfo('tools/v7_heuristic_bounded_search.ts', ROOT),
        fileInfo('src/game/engine.ts', ROOT),
        fileInfo('src/game/env.ts', ROOT),
        fileInfo('src/game/rules.ts', ROOT),
        fileInfo('src/game/rule_config.ts', ROOT),
        fileInfo('src/game/abilities.ts', ROOT),
        fileInfo('src/game/map.ts', ROOT),
        fileInfo('src/game/constants.ts', ROOT),
        fileInfo('src/game/terrain_rules.ts', ROOT),
        fileInfo('v17/teachers/battle_search_b100.ts'),
        fileInfo('v17/teachers/b100_policy.ts'),
        fileInfo('v17/teachers/b100_input_key.ts'),
        fileInfo('v17/tools/v17_input_identity.ts'),
        fileInfo('v14/tools/eval_v14_match.ts'),
        fileInfo('v16/tools/eval_v16_protocol.ts'),
        { ...fileInfo('docs/training/battle_ai/models/battle_search_v11.json', EXTERNAL_ROOT), path: 'docs/training/battle_ai/models/battle_search_v11.json (external)' },
    ],
    migrationDiffSummary: path.relative(ROOT, diffPath).replace(/\\/g, '/'),
    environment: {
        node: process.version,
        cwd: ROOT.replace(/\\/g, '/'),
        python: 'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe (本任务未使用)',
        concurrentNodeProcesses: 6,
    },
    commands,
};

fs.writeFileSync(path.join(CONFIG_DIR, 'resolved_config.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[B100-config] teacherVersion=${B100_TEACHER_VERSION} sourceShaMatch=${report.source.shaMatchesFrozenFact}`);
console.log(`[B100-config] resolved=${JSON.stringify(resolved)}`);
console.log(`[B100-config] commands=${commands.length} -> ${path.join(CONFIG_DIR, 'resolved_config.json')}`);
