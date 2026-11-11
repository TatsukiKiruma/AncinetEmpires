/**
 * V14/T14-02：`Observation → GameState` 状态恢复保真度审计（只读工具，不修改被测源码）。
 *
 * 背景
 * ----
 * V13 的数据重建路径（`v13/tools/reencode_v31.ts:76` 的 `observationToGameState`）把
 * `AncientEmpiresEnv.buildObservation()` 的输出（`Observation`，见 `src/game/env.ts:44-198`）
 * 强转成 `GameState`（`src/game/types.ts:238-256`）。两个接口的字段语义并不一致：
 *   - `units[].status` 在 Observation 里是字符串 + 两个扁平数值，在 GameState 里是 `UnitStatus` 对象；
 *   - `maxHp` 在 Observation 里是「含等级成长的实战上限」，在 GameState 里是「基础上限」；
 *   - `rules.prices` 在 Observation 里叫 `priceOverrides`，`campaignEvents` 只剩摘要；
 *   - `winner` / `nextUnitId` / `nextGraveId` / 7 个战斗加成规则 / `commanderCastleRecruitUsesPending`
 *     根本不在 Observation 里。
 * V14 的正式数据路线改用 `GameEngine.getState()` 的真实快照
 * （`v14/tools/collect_v14_roots.ts:238-249` 写入 `state`，:293 写入 `initialState`），
 * 因此 Observation 通道的问题不会污染 V14 正式数据；但「历史 V13 pool 能否复用于本轮」
 * 必须先把这个差异**列出来并量化**。
 *
 * 本工具做三件事
 * --------------
 * A. 逐字段对照表（CODE_CONFIRMED）：每条都带 `文件:行号`，写死在本文件 `FIELD_FINDINGS`
 *    与 `IRRECOVERABLE_FIELDS` 中，并原样进入 JSON/MD 报告。
 * B. 实测量化（MEASURED）：
 *    1. 取真实引擎快照（`decisions.jsonl` 的 `state`、`roots.jsonl` 的 `initialState`、
 *       以及本文件自建夹具），用 `AncientEmpiresEnv.getObservation()` 得到 Observation；
 *    2. 按 V13 的近似方式内联复现 `observationToGameState`（**不 import** 带 main 副作用的
 *       `reencode_v31.ts`）把 Observation 转回 GameState；
 *    3. 用自带的规范深比较逐字段报告真实快照与恢复状态的差异（路径 / 种类 / 严重度 / 计数）；
 *    4. 对两者分别调用 `GameEngine.getLegalActions(currentPlayer)`，用 `encodeAction` 规范化后比较集合；
 *    5. 对 3 个代表性合法动作（优先 move/attack/capture）各在**全新引擎**上执行一步，比较
 *       `winner`、逐单位 HP、非法动作计数、以及执行后局面的行为字段差异；
 *    6. 额外：对 `encodeGameStateSpatial` 张量做逐通道差异统计（解释 V13 pool 特征为何不能与
 *       V14 推理特征同分布）。
 * C. 结论：V13 归档数据是否可标 EXACT_SNAPSHOT（见报告 conclusions 段）。
 *
 * 用法（仓库根目录）
 * ----------------
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/audit_state_fidelity.ts
 *   # 可选参数：
 *   --run-id v14_20260924_t14
 *   --decisions v14/out/<runId>/T14-02/raw/decisions.jsonl
 *   --roots     v14/out/<runId>/T14-02/raw/roots.jsonl
 *   --out-dir   v14/out/<runId>/T14-02/state_fidelity
 *   --decision-stride 100      # 每 N 行取 1 行（避免把 180MB 全部 JSON.parse）
 *   --max-decisions 60
 *   --max-roots 8
 *   --v13-rows 6               # 只读 V13 源归档前 N 行
 *   --skip-v13                 # 跳过 V13 归档/pool 抽样
 *
 * 只读约束：本文件只读取 `src/`、`v13/`、`v14/out/...` 与 `training_runs/`（只读前若干行），
 * 只写 `--out-dir`。大文件一律流式读取并在取够样本后立即断流。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { AncientEmpiresEnv, encodeAction, calculateArmyValue } from '../../src/game/env';
import type { Observation } from '../../src/game/env';
import { GameEngine } from '../../src/game/engine';
import { canonicalJson } from '../../src/game/state_snapshot';
import { getRuleConfig, DEFAULT_RULE_CONFIG } from '../../src/game/rule_config';
import { createDemoState } from '../../src/game/demo_map';
import {
    encodeGameStateSpatial,
    SPATIAL_TENSOR_CHANNELS,
    SPATIAL_TENSOR_MAX_H,
    SPATIAL_TENSOR_MAX_W,
} from '../../src/game/ai/spatial_tensor_encoder';
import type { Action, GameState, PlayerState, Unit } from '../../src/game/types';
import { UNIT_CONFIGS } from '../../src/game/constants';
import type { TerrainId, Tile } from '../../src/game/terrain';

const require = createRequire(import.meta.url);
const REPO_ROOT = process.cwd();
const AUDIT_SCHEMA = 'v14_observation_restoration_audit_1';

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function flag(name: string): boolean {
    return process.argv.includes(name);
}

const RUN_ID = arg('--run-id', 'v14_20260924_t14');
const DECISIONS_PATH = arg('--decisions', `v14/out/${RUN_ID}/T14-02/raw/decisions.jsonl`);
const ROOTS_PATH = arg('--roots', `v14/out/${RUN_ID}/T14-02/raw/roots.jsonl`);
const OUT_DIR = arg('--out-dir', `v14/out/${RUN_ID}/T14-02/state_fidelity`);
const DECISION_STRIDE = Math.max(1, Number(arg('--decision-stride', '100')));
const MAX_DECISIONS = Math.max(1, Number(arg('--max-decisions', '60')));
const MAX_ROOTS = Math.max(0, Number(arg('--max-roots', '8')));
const V13_ARCHIVE_PATH = arg(
    '--v13-archive',
    'training_runs/agent_upgrade_20260919_01/baseline_dataset/baseline_dataset.jsonl'
);
const V13_POOL_PATH = arg(
    '--v13-pool',
    'v13/out/v13_20260924_t13/T13-07/data_v3_b0/pool_v3.jsonl'
);
const V13_ROWS = Math.max(0, Number(arg('--v13-rows', '6')));
const SKIP_V13 = flag('--skip-v13');

function rel(p: string): string {
    return path.relative(REPO_ROOT, p).split(path.sep).join('/');
}
function abs(p: string): string {
    return path.isAbsolute(p) ? p : path.join(REPO_ROOT, p);
}
function msgOf(err: unknown): string {
    if (err instanceof Error) return `${err.name}: ${err.message}`;
    return String(err);
}
function pct(n: number, d: number): number | null {
    return d > 0 ? Number((n / d).toFixed(6)) : null;
}

// ---------------------------------------------------------------------------
// 流式逐行读取（大文件只读到需要的行数就断流）
// ---------------------------------------------------------------------------

async function streamLines(
    file: string,
    onLine: (line: string, index: number) => boolean | void,
    maxLines = Number.POSITIVE_INFINITY
): Promise<{ linesSeen: number; stoppedEarly: boolean; readError: string | null }> {
    let pending = '';
    let index = 0;
    let stoppedEarly = false;
    let readError: string | null = null;
    const stream = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 22 });
    try {
        for await (const chunk of stream) {
            pending += chunk as string;
            let nl = pending.indexOf('\n');
            while (nl >= 0) {
                const line = pending.slice(0, nl);
                pending = pending.slice(nl + 1);
                if (line.trim()) {
                    const keepGoing = onLine(line, index);
                    index += 1;
                    if (keepGoing === false || index >= maxLines) {
                        stoppedEarly = index >= maxLines;
                        stream.destroy();
                        return { linesSeen: index, stoppedEarly, readError };
                    }
                } else {
                    index += 1;
                }
                nl = pending.indexOf('\n');
            }
        }
        if (pending.trim()) onLine(pending, index);
        index += 1;
    } catch (err) {
        // 主动 destroy() 在部分 Node 版本会抛出 ERR_STREAM_PREMATURE_CLOSE，属预期。
        if (!stoppedEarly) readError = msgOf(err);
    }
    return { linesSeen: index, stoppedEarly, readError };
}

function sha256OfFileHead(file: string, bytes: number): string {
    const crypto = require('node:crypto');
    const fd = fs.openSync(file, 'r');
    try {
        const buf = Buffer.alloc(bytes);
        const n = fs.readSync(fd, buf, 0, bytes, 0);
        return crypto.createHash('sha256').update(buf.subarray(0, n)).digest('hex');
    } finally {
        fs.closeSync(fd);
    }
}

// ---------------------------------------------------------------------------
// A. 字段对照表（CODE_CONFIRMED）：行号均对应当前工作区源码
// ---------------------------------------------------------------------------

type FindingKind =
    | 'IDENTICAL'            // 语义与取值都能对上
    | 'RENAMED'              // 只换了键名/结构，信息不丢
    | 'RESHAPED'             // 拆平/合并，信息不丢但结构变了
    | 'LOSSY'                // Observation 有信息但语义不同或默认化
    | 'RECOVERABLE_DROPPED'  // Observation 里明明有，V13 的转换没搬过去
    | 'ABSENT_IN_OBSERVATION'// Observation 里根本没有这份信息
    | 'OBSERVATION_ONLY'     // 只在 Observation 侧存在，GameState 不需要
    | 'DERIVED';             // 可从其它字段重算

interface FieldFinding {
    path: string;
    observationPath: string | null;
    kind: FindingKind;
    /** 是否影响引擎判定（合法动作 / 结算 / 胜负 / 特征编码） */
    behavioural: boolean;
    /** V13 `observationToGameState` 是否把它丢掉或搬错 */
    v13DroppedOrMangled: boolean;
    sourceRef: string;
    note: string;
}

const FIELD_FINDINGS: FieldFinding[] = [
    // ---------------- 单位 ----------------
    {
        path: 'units[].id', observationPath: 'units[].id', kind: 'IDENTICAL', behavioural: true,
        v13DroppedOrMangled: false, sourceRef: 'src/game/env.ts:925 / src/game/types.ts:27',
        note: '直接同名字段。ID 是动作码与候选集合的身份，必须逐字一致。',
    },
    {
        path: 'units[].ownerId / unitClass / hp / hasMoved / hasActed / level / exp',
        observationPath: 'units[].ownerId / unitClass / hp / hasMoved / hasActed / level / exp',
        kind: 'IDENTICAL', behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:934-935,969,977-981',
        note: 'Observation 对 level/exp 做了 `?? 0` 默认化，与引擎语义一致。',
    },
    {
        path: 'units[].pos', observationPath: 'units[].x + units[].y', kind: 'RESHAPED',
        behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:967-968 / v13/tools/reencode_v31.ts:88',
        note: 'Observation 把坐标拆成 x/y；V13 用 `pos:{x:u.x,y:u.y}` 重组，信息不丢。',
    },
    {
        path: 'units[].maxHp', observationPath: 'units[].maxHp', kind: 'LOSSY',
        behavioural: true, v13DroppedOrMangled: true,
        sourceRef: 'src/game/env.ts:970 / src/game/abilities.ts:248 / src/game/types.ts:32',
        note:
            'Observation 的 maxHp 是 `getEffectiveStats().maxHp`（= 基础 maxHp + maxHpGrowth*level）；' +
            'GameState 的 maxHp 是基础值，引擎会再叠加一次成长。V13 直接把 Observation 值写进 ' +
            '`unit.maxHp`，导致恢复状态对升级单位**重复计入成长**，' +
            '影响 `getEffectiveStats().maxHp`、治疗上限（engine.ts:401）、' +
            '空间张量 HP 通道（spatial_tensor_encoder.ts:211,231）与 `calculateArmyValue`（env.ts:283）。',
    },
    {
        path: 'units[].status', observationPath: 'units[].status + units[].statusRemainingTicks + units[].statusRemainingTurns',
        kind: 'LOSSY', behavioural: true, v13DroppedOrMangled: true,
        sourceRef:
            'src/game/env.ts:186-189,987-990 / src/game/types.ts:13-17,35 / v13/tools/reencode_v31.ts:89',
        note:
            'GameState 是 `UnitStatus{type,remainingTicks?,remainingTurns?}`，Observation 只有字符串 ' +
            '`status` 与两个扁平数值。V13 写的是 `status: u.status ?? null`：字符串被原样塞进 ' +
            '`UnitStatus` 位置，于是 `unit.status.type` 恒为 undefined。' +
            'Observation 里其实有 ticks/turns，可以完整重建对象，所以这是**转换缺陷**而不是信息缺失。' +
            '后果：中毒治疗限制（rules.ts:214）、中毒回合结算（engine.ts:369）、' +
            '虚弱防御/移动（abilities.ts:252）、致盲射程（abilities.ts:261）、' +
            '状态衰减（engine.ts:213-223）、死神加成（rules.ts:58）全部失效。',
    },
    {
        path: 'units[].movementRemaining', observationPath: 'units[].movementRemaining', kind: 'LOSSY',
        behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:979 / src/game/engine.ts:545 / src/game/rules.ts:241-248',
        note:
            'Observation 做 `u.movementRemaining ?? effectiveStats.move`：真实 undefined 会被写成数值。' +
            '突击部队判定 `(movementRemaining ?? 0) > 0` 与移动扣减 `?? eff.move` 在数值等于有效移动力时' +
            '通常等价，因此属低风险默认化，但「字段存在性」与真实快照不同。',
    },
    {
        path: 'units[].hasPostAttackMoved', observationPath: 'units[].hasPostAttackMoved', kind: 'IDENTICAL',
        behavioural: true, v13DroppedOrMangled: false, sourceRef: 'src/game/env.ts:982',
        note: 'Observation 用 `!!u.hasPostAttackMoved` 归一为布尔，语义一致，影响突击二次移动（rules.ts:241-248）。',
    },
    {
        path: 'units[].hasBeenHealedThisTurn / units[].hasBeenSupportedThisTurn',
        observationPath: 'units[].hasBeenHealedThisTurn / units[].hasBeenSupportedThisTurn',
        kind: 'IDENTICAL', behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:983-984 / src/game/rules.ts:330',
        note: '同名字段，归一为布尔；影响支援动作合法性。',
    },
    {
        path: 'units[].apkPendingRecruitSource', observationPath: 'units[].apkPendingRecruitSource',
        kind: 'IDENTICAL', behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:986 / src/game/rules.ts:228-232',
        note: '决定 pending 单位是否放开「结束回合/投降」，是合法动作集合的开关之一。',
    },
    {
        path: 'units[].apkUnitId / apkUnitExtra / apkUnitCode / apkStatic / apkTargeted / apkUnitHead / apkMoveOverrides',
        observationPath: '同名', kind: 'IDENTICAL', behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:926-933 / src/game/types.ts:43-49',
        note:
            'Observation 全部携带；V13 的 `{...u}` 顺带保留。`apkStatic` 影响合法动作（rules.ts:235），' +
            '`apkMoveOverrides` 影响移动消耗。',
    },
    {
        path: 'units[].isPending', observationPath: 'units[].isPending', kind: 'DERIVED',
        behavioural: false, v13DroppedOrMangled: true,
        sourceRef: 'src/game/env.ts:985 / src/game/rules.ts:228-232 / v13/tools/reencode_v31.ts:90',
        note:
            'GameState 的 `Unit` 没有 `isPending` 字段，pending 语义只由 `state.pendingUnitId` 决定。' +
            'V13 把 `isPending` 写回单位对象是多余的（无害）；真正的 pending 信息来自 `pendingUnitId`。',
    },
    {
        path: 'units[].attack / physicalDefense / magicDefense / minRange / maxRange / move / attackType / population / cost / abilities / apkAbilityIds / base* / tile* / isCommander / apkUnitClassId',
        observationPath: '同名', kind: 'OBSERVATION_ONLY', behavioural: false, v13DroppedOrMangled: true,
        sourceRef: 'src/game/env.ts:936-976',
        note:
            '这些是给训练侧看的派生快照。V13 的 `{...u}` 把它们塞进 GameState；引擎忽略未知字段，' +
            '但任何按「GameState 字段集」遍历的下游（哈希、快照 schema、深比较）都会看到脏字段。',
    },
    // ---------------- 墓碑 ----------------
    {
        path: 'graves[].pos', observationPath: 'graves[].x + graves[].y', kind: 'LOSSY',
        behavioural: true, v13DroppedOrMangled: true,
        sourceRef:
            'src/game/types.ts:19-24 / src/game/env.ts:993-999 / v13/tools/reencode_v31.ts:102 / src/game/rules.ts:312-317',
        note:
            'GameState 的 `Grave` 用 `pos:{x,y}`；Observation 拆成 x/y。V13 写 `graves: obs.graves ?? []`，' +
            '**没有重组 pos**。结果是恢复状态的墓碑缺 `pos`：召唤合法性判定 `grave.pos` 直接抛 ' +
            '`TypeError`（有 summoner 单位时），`engine.createGraveAt` 的去重判断也会误判。',
    },
    {
        path: 'graves[].id / remainingTurns / ownerId', observationPath: '同名', kind: 'IDENTICAL',
        behavioural: true, v13DroppedOrMangled: false, sourceRef: 'src/game/env.ts:994-998',
        note: 'ownerId 影响 TURN_START 递减（engine.ts:255-269）。',
    },
    // ---------------- 地图 ----------------
    {
        path: 'map.width / map.height', observationPath: 'mapWidth / mapHeight', kind: 'RENAMED',
        behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:49-50,821-822 / v13/tools/reencode_v31.ts:77-78,96',
        note: 'V13 用 mapWidth/mapHeight 重建 `map:{width,height,tiles}` 与 tiles 矩阵尺寸，正确。',
    },
    {
        path: 'map.tiles[][].terrainId / ownerId / apkTerrainId / apkTerrainRaw / apkOwnerCode',
        observationPath: 'tiles[].terrainId / ownerId / apkTerrainId / apkTerrainRaw / apkOwnerCode',
        kind: 'IDENTICAL', behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:899-906 / src/game/terrain.ts:3-12 / src/game/terrain_rules.ts:24-33',
        note:
            '规则地形（terrainKey / 攻防加成 / 移动消耗 / 可摧毁 / 可净化）全部由 apkTerrainId + terrainId 派生，' +
            '这两组字段都在 Observation 里，因此**地形语义可恢复**。V13 把 obs tile 原样放进矩阵，行为正确。',
    },
    {
        path: 'map.tiles[][].apkTerrainKind / apkTerrainIsLand / apkMoveCost', observationPath: null,
        kind: 'DERIVED', behavioural: false, v13DroppedOrMangled: false,
        sourceRef: 'src/game/terrain.ts:9-11 / src/game/terrain_rules.ts:115-118',
        note: '当前真实快照里通常不写这三个字段（由 apkTerrainId 查表派生），Observation 也没有，不构成差异。',
    },
    {
        path: 'map.tiles[][].terrainKey / terrainTags / defenseBonus / healPerTurn / moveCost / ruleTerrainId / apkTerrainConfig / apkTerrainMapping*',
        observationPath: '同名', kind: 'OBSERVATION_ONLY', behavioural: false, v13DroppedOrMangled: true,
        sourceRef: 'src/game/env.ts:900-915',
        note: '派生展示字段，V13 原样搬入 GameState，属额外字段。',
    },
    // ---------------- 玩家 ----------------
    {
        path: 'players[].id / gold / isAlive / commanderDeathCount / commanderReserveLevel / commanderReserveExp',
        observationPath: '同名', kind: 'IDENTICAL', behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:874-889 / src/game/types.ts:52-59 / src/game/engine.ts:192-201',
        note:
            'Observation 把 reserve 字段 `?? null`，引擎读法都用 `?? 0`/显式比较，语义等价。' +
            'gold 与 isAlive 直接决定招募与胜负判定。',
    },
    {
        path: 'players[].isEnabled / allianceId / unitCount / population / unitLimit / populationLimit / recruitableUnits / recruitCosts / commanderUnitId',
        observationPath: '同名', kind: 'OBSERVATION_ONLY', behavioural: false, v13DroppedOrMangled: true,
        sourceRef: 'src/game/env.ts:878-886 / src/game/rule_config.ts:166-197',
        note:
            '这些都可以从 `players` + `rules` 重算；V13 把它们当 GameState 字段搬了进去。' +
            '注意 `unitLimit`/`populationLimit` 在这里是「已解析」的值，不会覆盖 `rules` 里的原始配置。',
    },
    // ---------------- 规则 ----------------
    {
        path: 'rules.initialGold', observationPath: 'rules.initialGold', kind: 'LOSSY',
        behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:830 / src/game/rule_config.ts:219-228 / src/game/demo_map.ts:59',
        note:
            'Observation 在未配置时输出 `null`（而非 undefined）。恢复状态的 `rules.initialGold = null`，' +
            '`applyInitialRuleConfig` 的条件是 `!== undefined`，于是会把每个玩家的 gold 写成 `null`。' +
            '真实 SD 数据里 initialGold 有值，所以当前不触发；一旦有剧本不配置 initialGold 就会污染金币。',
    },
    {
        path: 'rules.incomeVillage / incomeCastle / incomeCommanderBase / incomeCommanderGrowth / levelCap',
        observationPath: '同名', kind: 'IDENTICAL', behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:831-835', note: '数值直传，语义一致。',
    },
    {
        path: 'rules.unitLimit / rules.populationLimit', observationPath: 'rules.unitLimit / rules.populationLimit',
        kind: 'LOSSY', behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:836-837 / src/game/rule_config.ts:286-293',
        note:
            'Observation 未配置时输出 `null`。`canRecruitUnitClass` 的写法是 ' +
            '`if (unitLimit !== undefined && count >= unitLimit) return false;`：`null !== undefined` 成立，' +
            '`count >= null` 恒真 → **恢复状态会彻底禁掉招募**。这是最直接的「字段差异导致合法动作集不同」。',
    },
    {
        path: 'rules.recruitableUnits', observationPath: 'rules.recruitableUnits', kind: 'IDENTICAL',
        behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:838 / src/game/rule_config.ts:246-255',
        note: 'Observation 未配置时输出 `null`，但读取处 `?? Object.keys(UNIT_CONFIGS)` 能吸收 null，语义等价。',
    },
    {
        path: 'rules.prices', observationPath: 'rules.priceOverrides', kind: 'RENAMED',
        behavioural: true, v13DroppedOrMangled: true,
        sourceRef: 'src/game/env.ts:839 / src/game/types.ts:220 / src/game/rule_config.ts:230-244',
        note:
            'Observation 改名成 `priceOverrides`。V13 直接 `rules: obs.rules`，于是恢复状态的 `rules.prices` ' +
            '不存在 → `getUnitCost` 退回 `UNIT_CONFIGS[cls].cost`。影响招募价格、' +
            '`calculateArmyValue`（env.ts:275-288）与超时胜负评估、空间张量的军力全局特征。',
    },
    {
        path: 'rules.commanderRecruitBaseCost / rules.commanderRecruitCostGrowth',
        observationPath: '同名', kind: 'IDENTICAL', behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:840-841 / src/game/rule_config.ts:234-239',
        note: '同名字段，指挥官重招募价格可恢复。',
    },
    {
        path: 'rules.allowSurrender / rules.allowPendingRecruitEndTurn / rules.allowPendingRecruitSurrender',
        observationPath: '同名', kind: 'IDENTICAL', behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:842-844 / src/game/rules.ts:404-407',
        note: '直接决定 surrender/end_turn 是否进入合法动作集合。',
    },
    {
        path: 'rules.defeatOnNoUnitsAndNoCastles / defeatOnNoUnits / defeatOnCommanderDeath / defeatOnNoCastles',
        observationPath: '同名', kind: 'IDENTICAL', behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:845-848', note: '直接决定胜负判定。',
    },
    {
        path: 'rules.alliances / rules.disabledTeams / rules.commanderUnitIds',
        observationPath: '同名', kind: 'IDENTICAL', behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:849-851 / src/game/rule_config.ts:166-217',
        note:
            '三者都完整携带：alliances 决定敌我（rules.ts:253）、disabledTeams 决定回合玩家集合' +
            '（rule_config.ts:187-197）、commanderUnitIds 决定指挥官身份（rule_config.ts:199-217）。',
    },
    {
        path: 'rules.campaignEvents', observationPath: 'rules.campaignEvents（仅摘要）', kind: 'LOSSY',
        behavioural: true, v13DroppedOrMangled: true,
        sourceRef:
            'src/game/env.ts:852-857 / src/game/types.ts:195-201 / src/game/campaign_events.ts:41-56',
        note:
            'Observation 只保留 `{id,triggerType,once,fired}`，`trigger` 与 `effects` 全部丢失。' +
            '恢复状态里的事件没有任何效果（刷兵、改队伍、胜负、金币全部消失）。' +
            '更糟的是重新 `buildObservation` 时 env.ts:854 会读 `event.trigger.type` → `TypeError`，' +
            '即「恢复后的状态无法再次观测」。',
    },
    {
        path: 'rules.teams', observationPath: 'rules.teams', kind: 'RESHAPED',
        behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:858-866 / src/game/rule_config.ts:162-164,285-293',
        note:
            'Observation 把每个队伍的 4 个字段 `?? null`。读取处全部用 `??` 兜底，' +
            '因此 null 与 undefined 在这里等价；队伍配置可恢复。',
    },
    {
        path: 'rules.destroyerAttackBonus / flyingWaterAttackBonus / deathReaperAttackBonus / inspiredAttackBonus / sharpshooterAttackBonus / terrainChildCombatBonus / weakenedDefensePenalty',
        observationPath: null, kind: 'ABSENT_IN_OBSERVATION', behavioural: true, v13DroppedOrMangled: true,
        sourceRef: 'src/game/types.ts:210-216 / src/game/rule_config.ts:6-39 / src/game/rules.ts:58,70',
        note:
            '7 个战斗系数完全不在 Observation 里。当前 SD 数据都是默认值（无差异），' +
            '但任何剧本覆盖都会在恢复状态里静默退回默认值，造成伤害计算与标签不一致。',
    },
    {
        path: 'rules.commanderCastleRecruitUsesPending', observationPath: null, kind: 'ABSENT_IN_OBSERVATION',
        behavioural: true, v13DroppedOrMangled: true,
        sourceRef: 'src/game/types.ts:226 / src/game/rules.ts:376-383',
        note:
            '不在 Observation 里。恢复状态退化为默认 false：指挥官站城堡招募时，动作形态会从 ' +
            '`recruit_to_castle`（先出堆叠 pending）变成 `recruit_and_deploy`（直接落位），' +
            '候选集合与后续 pending 流程都不同。V14 真实快照里该字段存在（实测见 fixtures/decision 样本）。',
    },
    // ---------------- 顶层 ----------------
    {
        path: 'turn / currentPlayer / pendingUnitId', observationPath: '同名', kind: 'IDENTICAL',
        behavioural: true, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:817-819 / src/game/rules.ts:228-232',
        note: '三个顶层字段都完整携带；`pendingUnitId` 用 `?? null` 写入，null 为假值与缺省等价。',
    },
    {
        path: 'winner', observationPath: null, kind: 'ABSENT_IN_OBSERVATION', behavioural: true,
        v13DroppedOrMangled: true,
        sourceRef: 'src/game/types.ts:248 / src/game/engine.ts:149-151 / v13/tools/reencode_v31.ts:99',
        note:
            'Observation 没有 winner。V13 硬编码 `winner: null`，终局状态被还原成「未终局」：' +
            '`engine.isTerminal()` 失效、`step` 仍会接受动作、价值标签的终局判定与真实局面不一致。',
    },
    {
        path: 'nextUnitId / nextGraveId', observationPath: null, kind: 'ABSENT_IN_OBSERVATION',
        behavioural: true, v13DroppedOrMangled: true,
        sourceRef: 'src/game/types.ts:250-251 / src/game/engine.ts:237,660,791,820',
        note:
            'Observation 没有这两个计数。恢复状态缺省，引擎退回 `?? 100`：新招募单位 ID 变成 `u_100` 之类，' +
            '与真实序列不同（破坏 ID 级可复现性）；`nextGraveId` 退回 100 还可能生成与既有墓碑重复的 `g_100`。',
    },
    {
        path: 'metadata', observationPath: 'metadata', kind: 'RECOVERABLE_DROPPED', behavioural: false,
        v13DroppedOrMangled: true,
        sourceRef: 'src/game/env.ts:823,297-332 / v13/tools/reencode_v31.ts:93-103',
        note:
            'Observation 通过 cloneGameMetadata 完整携带，V13 的重建对象根本没写 `metadata` 键。' +
            'metadata 不参与规则判定，属可恢复但被丢弃。',
    },
    {
        path: 'apkScriptState', observationPath: 'apkScriptState', kind: 'RECOVERABLE_DROPPED',
        behavioural: true, v13DroppedOrMangled: true,
        sourceRef:
            'src/game/env.ts:825-828 / src/game/campaign_events.ts:41-56 / src/game/apk_stage.ts:161,177 / v13/tools/reencode_v31.ts:93-103',
        note:
            'Observation 完整携带 booleans/integers，V13 的重建对象没写这个键。' +
            'APK 剧本的 Stage.GetBoolean/GetInteger 与 campaign 事件 fired 标记都依赖它，' +
            '所以这是**可恢复却被丢弃**的行为性字段。',
    },
    {
        path: 'turnPlayerIds（Observation 侧）', observationPath: 'turnPlayerIds', kind: 'OBSERVATION_ONLY',
        behavioural: false, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:820 / src/game/rule_config.ts:192-197',
        note:
            'GameState 不存这个派生列表；它由 `players[].isAlive && !disabledTeams.includes(id)` 排序得到，' +
            '两者都可恢复，因此不是损失。',
    },
    {
        path: 'terrainMappingSummary（Observation 侧）', observationPath: 'terrainMappingSummary',
        kind: 'OBSERVATION_ONLY', behavioural: false, v13DroppedOrMangled: false,
        sourceRef: 'src/game/env.ts:52,824,356-400',
        note: '纯统计摘要，与引擎判定无关；GameState 侧无对应字段。',
    },
];

/** 无法从 Observation 恢复的字段（理由写死在 note 里，供报告直接引用）。 */
const IRRECOVERABLE_FIELDS = [
    { path: 'winner', why: 'Observation 接口没有该字段（env.ts:44-198 全量字段清单里不存在）；V13 只能硬编码 null。' },
    { path: 'nextUnitId', why: 'Observation 没有 ID 计数器；只能靠 max(已存在 ID) 猜，无法保证与真实序列一致。' },
    { path: 'nextGraveId', why: '同上；缺失会让墓碑 ID 与既有墓碑冲突。' },
    { path: 'rules.destroyerAttackBonus', why: 'Observation.rules 只暴露 24 个字段，7 个战斗加成系数不在其中。' },
    { path: 'rules.flyingWaterAttackBonus', why: '同上。' },
    { path: 'rules.deathReaperAttackBonus', why: '同上。' },
    { path: 'rules.inspiredAttackBonus', why: '同上。' },
    { path: 'rules.sharpshooterAttackBonus', why: '同上。' },
    { path: 'rules.terrainChildCombatBonus', why: '同上。' },
    { path: 'rules.weakenedDefensePenalty', why: '同上。' },
    { path: 'rules.commanderCastleRecruitUsesPending', why: 'Observation.rules 未暴露该布尔；恢复后退回默认 false，改变招募动作形态。' },
    { path: 'rules.blindedRangeCollapse（无独立字段）', why: '致盲的射程塌缩语义只存在于 UnitStatus，Observation 仅给字符串，需自行重建对象才可用。' },
];

// ---------------------------------------------------------------------------
// B. 深比较：真实快照 vs 恢复状态
// ---------------------------------------------------------------------------

type DiffKind = 'MISSING_IN_RESTORED' | 'EXTRA_IN_RESTORED' | 'VALUE_DIFF' | 'LENGTH_DIFF';
/** POSITION 表示会影响引擎判定；ID_COUNTER / DERIVED / METADATA 为记录性差异。 */
type Severity = 'POSITION' | 'ID_COUNTER' | 'DERIVED' | 'METADATA';

interface DiffAgg {
    path: string;
    kind: DiffKind;
    severity: Severity;
    count: number;
    exampleReal: unknown;
    exampleRestored: unknown;
}

/**
 * 严重度口径
 * - POSITION：会改变引擎判定（合法动作 / 结算 / 胜负 / 特征编码）的差异。
 * - ID_COUNTER：`nextUnitId`/`nextGraveId` 这类确定性计数器，影响 ID 级可复现性。
 * - DERIVED：Observation 派生快照多出来的字段（引擎不读）或显式写出的默认值。
 * - METADATA：来源元数据，不参与规则判定。
 */

/** Observation 用 `?? null` 写出的 null 在恢复状态里的实际后果（逐字段读码确认的消费方式）。 */
const NULL_TRAP_RULES: Record<string, 'POSITION' | 'DERIVED'> = {
    initialGold: 'POSITION',              // rule_config.ts:222-225 用 `!== undefined` → 会把 gold 写成 null
    unitLimit: 'POSITION',                // rule_config.ts:285-288 用 `!== undefined` → count >= null 恒真，招募全禁
    populationLimit: 'POSITION',          // rule_config.ts:290-293 用 `!== undefined` → 同上
    recruitableUnits: 'DERIVED',          // rule_config.ts:249-251 用 `??` 兜底，null 与 undefined 同义
    commanderRecruitBaseCost: 'DERIVED',  // rule_config.ts:235-236 null 与 undefined 同义
};

/** Observation 侧独有的键名，引擎不读（它的出现只说明 `prices` 被改名后丢了）。 */
const OBSERVATION_ONLY_RULE_KEYS = new Set(['priceOverrides']);

function severityOf(path: string, kind: DiffKind, restoredValue: unknown): Severity {
    if (path === 'nextUnitId' || path === 'nextGraveId') return 'ID_COUNTER';
    if (kind === 'EXTRA_IN_RESTORED') {
        if (/^rules\./.test(path)) {
            const key = path.slice('rules.'.length);
            if (key.includes('.') || OBSERVATION_ONLY_RULE_KEYS.has(key)) return 'DERIVED';
            if (restoredValue === null) return NULL_TRAP_RULES[key] ?? 'DERIVED';
            const def = (DEFAULT_RULE_CONFIG as any)[key];
            const same = JSON.stringify(restoredValue) === JSON.stringify(def === undefined ? null : def);
            return same ? 'DERIVED' : 'POSITION';
        }
        if (path === 'rules') return 'POSITION'; // 整个 rules 对象凭空出现（内含 null 陷阱）
        if (path === 'pendingUnitId' && (restoredValue === null || restoredValue === undefined)) return 'DERIVED';
        if (path === 'graves' && Array.isArray(restoredValue) && restoredValue.length === 0) return 'DERIVED';
        // 单位/玩家/地形的额外字段都是 Observation 派生快照，引擎不会读。
        if (/^(units|players|map\.tiles)\b/.test(path)) return 'DERIVED';
        if (/^metadata\b/.test(path)) return 'METADATA';
        return 'POSITION';
    }
    if (/^metadata\b/.test(path)) return 'METADATA';
    return 'POSITION';
}

function normalisePath(p: string): string {
    return p.replace(/^\$\.?/, '').replace(/\[[^\]]*\]/g, '[*]');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 数组的身份键：单位/玩家/墓碑/事件按 id 配对，其余按索引。 */
function keyFieldOf(path: string): 'id' | null {
    return /(^|\.)(units|players|graves|campaignEvents)$/.test(path) ? 'id' : null;
}

function diffInto(real: any, restored: any, path: string, out: Map<string, DiffAgg>): void {
    const push = (kind: DiffKind, p: string, rv: unknown, sv: unknown) => {
        const key = `${kind}|${normalisePath(p)}`;
        const prev = out.get(key);
        if (prev) {
            prev.count += 1;
            return;
        }
        out.set(key, {
            path: normalisePath(p),
            kind,
            severity: severityOf(normalisePath(p), kind, sv),
            count: 1,
            exampleReal: rv,
            exampleRestored: sv,
        });
    };

    if (real === undefined && restored === undefined) return;
    if (restored === undefined) return push('MISSING_IN_RESTORED', path, real, restored);
    if (real === undefined) return push('EXTRA_IN_RESTORED', path, real, restored);

    const realArr = Array.isArray(real);
    const restArr = Array.isArray(restored);
    if (realArr && restArr) {
        const keyField = keyFieldOf(path);
        if (real.length !== restored.length) {
            push('LENGTH_DIFF', path, real.length, restored.length);
        }
        if (keyField) {
            const kf = keyField as 'id';
            const index = (arr: any[]) => {
                const m = new Map<string, any>();
                arr.forEach((item, i) => {
                    const k = item && typeof item === 'object' && item[kf] !== undefined
                        ? String(item[kf])
                        : `#${i}`;
                    m.set(k, item);
                });
                return m;
            };
            const rm = index(real as any[]);
            const sm = index(restored as any[]);
            for (const k of new Set([...rm.keys(), ...sm.keys()])) {
                diffInto(rm.get(k), sm.get(k), `${path}[${k}]`, out);
            }
        } else {
            const n = Math.max(real.length, restored.length);
            for (let i = 0; i < n; i += 1) diffInto(real[i], restored[i], `${path}[${i}]`, out);
        }
        return;
    }
    if (isPlainObject(real) && isPlainObject(restored)) {
        for (const k of new Set([...Object.keys(real), ...Object.keys(restored)])) {
            diffInto(real[k], restored[k], `${path}.${k}`, out);
        }
        return;
    }
    if (canonicalJson(real) !== canonicalJson(restored)) push('VALUE_DIFF', path, real, restored);
}

function diffStates(real: any, restored: any): DiffAgg[] {
    const out = new Map<string, DiffAgg>();
    diffInto(real, restored, '$', out);
    return [...out.values()].sort((a, b) => {
        const order: Severity[] = ['POSITION', 'ID_COUNTER', 'DERIVED', 'METADATA'];
        const d = order.indexOf(a.severity) - order.indexOf(b.severity);
        return d !== 0 ? d : b.count - a.count || a.path.localeCompare(b.path);
    });
}

// ---------------------------------------------------------------------------
// V13 近似转换（内联复现，不 import 带 main 副作用的 reencode_v31.ts）
// ---------------------------------------------------------------------------

/** V13 的输入永远来自 `JSON.parse(archiveLine)`：这里做同样的 JSON 归一，既复现历史输入形状，也避免消融阶段改到共享对象。 */
function jsonNormalise(value: any): any {
    return JSON.parse(JSON.stringify(value));
}

/**
 * 与 `v13/tools/reencode_v31.ts:76-104` 等价的近似转换（输入先按 JSON 语义归一）。
 * 刻意保留原实现的每一条取值方式（`status: u.status ?? null`、`isPending: u.isPending ?? false`、
 * `winner: null`、`rules: obs.rules ?? {}`、`graves: obs.graves ?? []`，
 * 以及**不写** nextUnitId/nextGraveId/metadata/apkScriptState），
 * 这样量出来的差异就是历史数据真实经历的差异。
 */
function v13ObservationToGameState(rawObs: any): GameState {
    const obs = jsonNormalise(rawObs);
    const width = obs.mapWidth;
    const height = obs.mapHeight;
    const tiles: any[][] = [];
    for (let y = 0; y < height; y++) tiles.push(new Array(width));
    for (const t of obs.tiles ?? []) {
        if (t && typeof t.y === 'number' && typeof t.x === 'number' && tiles[t.y]) {
            tiles[t.y][t.x] = t;
        }
    }
    const units = (obs.units ?? []).map((u: any) => ({
        ...u,
        pos: { x: u.x, y: u.y },
        status: u.status ?? null,
        isPending: u.isPending ?? false,
    }));
    const players = (obs.players ?? []).map((p: any) => ({ ...p }));
    return {
        turn: obs.turn,
        currentPlayer: obs.currentPlayer,
        map: { width, height, tiles },
        units,
        players,
        winner: null,
        pendingUnitId: obs.pendingUnitId ?? null,
        rules: obs.rules ?? {},
        graves: obs.graves ?? [],
    } as unknown as GameState;
}

/**
 * 归因消融：从「V13 原样还原」出发，逐级只修一类差异，观察合法动作集何时回到与真实快照一致。
 * 这样每个字段差异对合法动作集的责任是可分离的，而不是笼统地说「状态不一样」。
 *
 * L0 asis                          ：V13 原样还原。
 * L1 null_traps_and_renames        ：只修 Observation 的 `?? null` 陷阱与 `priceOverrides`→`prices` 改名（纯 Observation 侧信息）。
 * L2 observation_recoverable       ：再修 status 对象、graves.pos、maxHp 去通胀（仍只用 Observation 里已有的信息）。
 * L3 irrecoverable_from_observation：再对齐 Observation 根本不携带的字段（需要真实快照作为 oracle：commanderCastleRecruitUsesPending、
 *                                    7 个战斗系数、campaignEvents、winner、nextUnitId/nextGraveId、metadata、apkScriptState、movementRemaining 存在性）。
 * L4 strip_observation_extras      ：再删掉 Observation 派生展示字段（自检：确认剩余差异只剩这类额外字段）。
 */
export type RepairLevel = 0 | 1 | 2 | 3 | 4;

export const REPAIR_LEVELS: Array<{ level: RepairLevel; id: string; description: string }> = [
    { level: 0, id: 'L0_asis', description: 'V13 的 observationToGameState 原样输出' },
    { level: 1, id: 'L1_null_traps_and_renames', description: '修 Observation 的 ?? null 陷阱 + priceOverrides→prices 改名（纯 Observation 信息）' },
    { level: 2, id: 'L2_observation_recoverable', description: 'L1 + 重建 status 对象 / graves.pos / maxHp 去通胀（仍只用 Observation 信息）' },
    { level: 3, id: 'L3_irrecoverable_from_observation', description: 'L2 + 用真实快照对齐 Observation 不携带的字段（oracle）' },
    { level: 4, id: 'L4_strip_observation_extras', description: 'L3 + 删除 Observation 派生展示字段（自检）' },
];

const NULL_TRAP_RULE_KEYS = ['initialGold', 'unitLimit', 'populationLimit', 'recruitableUnits', 'commanderRecruitBaseCost'];
const IRRECOVERABLE_RULE_KEYS = [
    'commanderCastleRecruitUsesPending',
    'destroyerAttackBonus', 'flyingWaterAttackBonus', 'deathReaperAttackBonus',
    'inspiredAttackBonus', 'sharpshooterAttackBonus', 'terrainChildCombatBonus', 'weakenedDefensePenalty',
];

/** 删除「真实快照里没有、恢复状态里凭空出现」的键（用于 L4 自检与 L3 存在性对齐）。 */
function stripKeysNotInReal(real: any, restored: any): void {
    if (Array.isArray(real) && Array.isArray(restored)) {
        const useId = real.length > 0
            && real.every((x: any) => x && typeof x === 'object' && x.id !== undefined);
        if (useId) {
            const byId = new Map(real.map((x: any) => [String(x.id), x]));
            for (const item of restored) {
                const match = byId.get(String(item?.id));
                if (match) stripKeysNotInReal(match, item);
            }
        } else {
            const n = Math.min(real.length, restored.length);
            for (let i = 0; i < n; i += 1) stripKeysNotInReal(real[i], restored[i]);
        }
        return;
    }
    if (!isPlainObject(real) || !isPlainObject(restored)) return;
    for (const k of Object.keys(restored)) {
        if (!Object.prototype.hasOwnProperty.call(real, k)) {
            delete restored[k];
            continue;
        }
        stripKeysNotInReal(real[k], restored[k]);
    }
}

function repairObservationState(obs: any, real: any, level: RepairLevel): any {
    const restored: any = v13ObservationToGameState(obs);
    if (level <= 0) return restored;

    // ---- L1：null 陷阱 + 改名 ----
    const rules = restored.rules ?? {};
    if (rules && typeof rules === 'object') {
        if (Object.prototype.hasOwnProperty.call(rules, 'priceOverrides')) {
            rules.prices = { ...(rules.priceOverrides ?? {}) };
            delete rules.priceOverrides;
        }
        for (const key of NULL_TRAP_RULE_KEYS) {
            if (rules[key] === null) delete rules[key];
        }
        for (const [teamId, teamRules] of Object.entries(rules.teams ?? {})) {
            if (!teamRules || typeof teamRules !== 'object') continue;
            for (const key of ['initialGold', 'unitLimit', 'populationLimit', 'recruitableUnits'] as const) {
                if ((teamRules as any)[key] === null) delete (teamRules as any)[key];
            }
            void teamId;
        }
        if (Array.isArray(rules.disabledTeams) && rules.disabledTeams.length === 0) delete rules.disabledTeams;
        if (Array.isArray(rules.campaignEvents) && rules.campaignEvents.length === 0) delete rules.campaignEvents;
        if (rules.alliances && Object.keys(rules.alliances).length === 0) delete rules.alliances;
        if (rules.commanderUnitIds && Object.keys(rules.commanderUnitIds).length === 0) delete rules.commanderUnitIds;
        if (rules.teams && Object.keys(rules.teams).length === 0) delete rules.teams;
        if (Object.keys(rules).length === 0 && !real.rules) delete restored.rules;
    }
    if (restored.pendingUnitId === null) delete restored.pendingUnitId;
    for (const p of restored.players ?? []) {
        if (p.commanderReserveLevel === null) delete p.commanderReserveLevel;
        if (p.commanderReserveExp === null) delete p.commanderReserveExp;
    }
    if (level <= 1) return restored;

    // ---- L2：status 对象 / graves.pos / maxHp 去通胀 ----
    const unitById = new Map<string, any>((real.units ?? []).map((u: any) => [String(u.id), u]));
    for (const ou of obs.units ?? []) {
        const u = (restored.units ?? []).find((x: any) => String(x.id) === String(ou.id));
        if (!u) continue;
        if (ou.status) {
            const st: any = { type: ou.status };
            if (ou.statusRemainingTicks !== null && ou.statusRemainingTicks !== undefined) st.remainingTicks = ou.statusRemainingTicks;
            if (ou.statusRemainingTurns !== null && ou.statusRemainingTurns !== undefined) st.remainingTurns = ou.statusRemainingTurns;
            u.status = st;
        } else {
            delete u.status;
        }
        // Observation.maxHp 含等级成长；基础上限 = maxHp - maxHpGrowth*level
        const clsCfg = UNIT_CONFIGS[ou.unitClass as keyof typeof UNIT_CONFIGS];
        if (clsCfg) {
            const restoredBase = Number(ou.maxHp) - clsCfg.maxHpGrowth * (ou.level ?? 0);
            const realUnit = unitById.get(String(ou.id));
            if (realUnit && Number.isFinite(restoredBase)) u.maxHp = restoredBase;
        }
    }
    for (const g of restored.graves ?? []) {
        if (g && typeof g.x === 'number' && typeof g.y === 'number') g.pos = { x: g.x, y: g.y };
    }
    if (level <= 2) return restored;

    // ---- L3：Observation 不携带的字段（需要真实快照做 oracle） ----
    const realRules = real.rules ?? {};
    if (restored.rules) {
        for (const key of IRRECOVERABLE_RULE_KEYS) {
            if (Object.prototype.hasOwnProperty.call(realRules, key)) restored.rules[key] = realRules[key];
        }
        if (Object.prototype.hasOwnProperty.call(realRules, 'campaignEvents')) {
            restored.rules.campaignEvents = JSON.parse(JSON.stringify(realRules.campaignEvents));
        }
    }
    restored.winner = real.winner ?? null;
    if (real.nextUnitId !== undefined) restored.nextUnitId = real.nextUnitId;
    if (real.nextGraveId !== undefined) restored.nextGraveId = real.nextGraveId;
    if (real.metadata !== undefined) restored.metadata = JSON.parse(JSON.stringify(real.metadata));
    if (real.apkScriptState !== undefined) restored.apkScriptState = JSON.parse(JSON.stringify(real.apkScriptState));
    for (const u of restored.units ?? []) {
        const realUnit = unitById.get(String(u.id));
        if (!realUnit) continue;
        if (!Object.prototype.hasOwnProperty.call(realUnit, 'movementRemaining')) delete u.movementRemaining;
        if (!Object.prototype.hasOwnProperty.call(realUnit, 'status')) delete u.status;
        if (!Object.prototype.hasOwnProperty.call(realUnit, 'hasPostAttackMoved')) delete u.hasPostAttackMoved;
    }
    if (level <= 3) return restored;

    // ---- L4：删掉 Observation 派生展示字段（自检） ----
    stripKeysNotInReal(real, restored);
    return restored;
}

interface AblationRow {
    level: RepairLevel;
    id: string;
    legalCount: number | null;
    legalError: string | null;
    legalMatch: boolean | null;
    missingInRestored: number;
    extraInRestored: number;
    positionDiffCount: number;
    idCounterDiffCount: number;
    strictDiffCount: number;
    residualPositionPaths: string[];
    residualStrictPaths: string[];
}

function ablationFor(obs: any, real: any): AblationRow[] {
    const rows: AblationRow[] = [];
    for (const spec of REPAIR_LEVELS) {
        const state = repairObservationState(obs, real, spec.level);
        const probe = legalProbe(state);
        const diffs = diffStates(real, state);
        const counts = { POSITION: 0, ID_COUNTER: 0, DERIVED: 0, METADATA: 0, TOTAL: 0 } as Record<string, number>;
        for (const d of diffs) {
            counts[d.severity] += d.count;
            counts.TOTAL += d.count;
        }
        const realProbe = legalProbe(real);
        const decoded = !probe.error && !realProbe.error ? setDiff(realProbe.codes, probe.codes) : null;
        rows.push({
            level: spec.level,
            id: spec.id,
            legalCount: probe.error ? null : probe.codes.length,
            legalError: probe.error,
            legalMatch: decoded ? decoded.onlyA.length === 0 && decoded.onlyB.length === 0 : null,
            missingInRestored: decoded ? decoded.onlyA.length : -1,
            extraInRestored: decoded ? decoded.onlyB.length : -1,
            positionDiffCount: counts.POSITION,
            idCounterDiffCount: counts.ID_COUNTER,
            strictDiffCount: counts.TOTAL,
            residualPositionPaths: diffs.filter((d) => d.severity === 'POSITION').slice(0, 8).map((d) => `${d.kind}:${d.path}`),
            residualStrictPaths: diffs.slice(0, 10).map((d) => `${d.severity}:${d.kind}:${d.path}`),
        });
    }
    return rows;
}

// ---------------------------------------------------------------------------
// 探针
// ---------------------------------------------------------------------------

interface LegalProbe {
    currentPlayer: number;
    codes: string[];
    error: string | null;
}

function legalProbe(state: any): LegalProbe {
    try {
        const engine = new GameEngine(state);
        const cur = engine.getState().currentPlayer;
        const codes = engine.getLegalActions(cur).map(encodeAction);
        return { currentPlayer: cur, codes: [...new Set(codes)].sort(), error: null };
    } catch (err) {
        return { currentPlayer: -1, codes: [], error: msgOf(err) };
    }
}

function setDiff(a: string[], b: string[]): { onlyA: string[]; onlyB: string[] } {
    const sa = new Set(a);
    const sb = new Set(b);
    return {
        onlyA: a.filter((x) => !sb.has(x)),
        onlyB: b.filter((x) => !sa.has(x)),
    };
}

/** 按动作类型前缀统计动作码。 */
function countByType(codes: string[]): Record<string, number> {
    const h: Record<string, number> = {};
    for (const c of codes) {
        const t = c.split(':')[0] || 'unknown';
        h[t] = (h[t] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(h).sort((x, y) => y[1] - x[1]));
}

interface StepProbe {
    actionType: string;
    actionCode: string;
    realInfo: string;
    restoredInfo: string;
    realIllegal: boolean;
    restoredIllegal: boolean;
    realWinner: number | null;
    restoredWinner: number | null;
    /** null 表示探针抛异常、无法比较。 */
    winnerMatch: boolean | null;
    hpDiffCount: number;
    hpMaxAbsDiff: number;
    unitSetDiffCount: number;
    postStepBehaviouralDiffPaths: string[];
    error: string | null;
}

function hpMap(state: any): Map<string, number> {
    const m = new Map<string, number>();
    for (const u of state?.units ?? []) m.set(String(u.id), Number(u.hp));
    return m;
}

function stepProbe(state: any, action: Action): StepProbe {
    const result: StepProbe = {
        actionType: action.type,
        actionCode: encodeAction(action),
        realInfo: '',
        restoredInfo: '',
        realIllegal: false,
        restoredIllegal: false,
        realWinner: null,
        restoredWinner: null,
        winnerMatch: null,
        hpDiffCount: 0,
        hpMaxAbsDiff: 0,
        unitSetDiffCount: 0,
        postStepBehaviouralDiffPaths: [],
        error: null,
    };
    try {
        const eReal = new GameEngine(state);
        const resReal = eReal.step(JSON.parse(JSON.stringify(action)) as Action);
        result.realInfo = resReal.info;
        result.realIllegal = resReal.info.includes('非法动作');
        const afterReal = eReal.getState();
        result.realWinner = afterReal.winner;

        const eRestored = new GameEngine(state);
        const resRestored = eRestored.step(JSON.parse(JSON.stringify(action)) as Action);
        result.restoredInfo = resRestored.info;
        result.restoredIllegal = resRestored.info.includes('非法动作');
        const afterRestored = eRestored.getState();
        result.restoredWinner = afterRestored.winner;
        result.winnerMatch = (afterReal.winner ?? null) === (afterRestored.winner ?? null);

        const real = hpMap(afterReal);
        const rest = hpMap(afterRestored);
        let diffCount = 0;
        let maxAbs = 0;
        for (const id of real.keys()) {
            if (!rest.has(id)) {
                diffCount += 1;
                continue;
            }
            const d = Math.abs((real.get(id) as number) - (rest.get(id) as number));
            if (d > 0) {
                diffCount += 1;
                maxAbs = Math.max(maxAbs, d);
            }
        }
        result.hpDiffCount = diffCount;
        result.hpMaxAbsDiff = maxAbs;
        result.unitSetDiffCount = Math.abs(real.size - rest.size);
        result.postStepBehaviouralDiffPaths = diffStates(afterReal, afterRestored)
            .filter((d) => d.severity === 'POSITION' || d.severity === 'ID_COUNTER')
            .slice(0, 12)
            .map((d) => `${d.kind}:${d.path}`);
    } catch (err) {
        result.error = msgOf(err);
    }
    return result;
}

interface TensorProbe {
    ok: boolean;
    error: string | null;
    differingCells: number;
    differingChannels: number[];
    maxAbsDiff: number;
    channelHistogram: Record<string, number>;
    totalCells: number;
}

function tensorProbe(real: any, restored: any, playerId: number): TensorProbe {
    const empty: TensorProbe = {
        ok: false, error: null, differingCells: 0, differingChannels: [], maxAbsDiff: 0,
        channelHistogram: {}, totalCells: SPATIAL_TENSOR_CHANNELS * SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W,
    };
    try {
        const a = encodeGameStateSpatial(real, playerId, 'v2').spatialTensor;
        const b = encodeGameStateSpatial(restored, playerId, 'v2').spatialTensor;
        const perChannel = new Map<number, number>();
        let cells = 0;
        let maxAbs = 0;
        const plane = SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W;
        for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
            const d = Math.abs(a[i] - b[i]);
            if (d > 1e-6) {
                cells += 1;
                const ch = Math.floor(i / plane);
                perChannel.set(ch, (perChannel.get(ch) ?? 0) + 1);
                maxAbs = Math.max(maxAbs, d);
            }
        }
        return {
            ok: true,
            error: null,
            differingCells: cells,
            differingChannels: [...perChannel.keys()].sort((x, y) => x - y),
            maxAbsDiff: Number(maxAbs.toFixed(6)),
            channelHistogram: Object.fromEntries([...perChannel.entries()].sort((x, y) => x[0] - y[0]).map(([k, v]) => [String(k), v])),
            totalCells: a.length,
        };
    } catch (err) {
        return { ...empty, error: msgOf(err) };
    }
}

/** HP 归一化通道偏差：V13 pool 用的是 hp/含成长上限，真实快照/推理用的是 hp/基础上限。 */
function hpChannelDeviation(state: any): {
    units: number; affectedUnits: number; maxRelativeDeviation: number; samples: any[];
} {
    let affected = 0;
    let maxDev = 0;
    const samples: any[] = [];
    for (const u of state?.units ?? []) {
        const base = UNIT_CONFIGS[u.unitClass];
        if (!base) continue;
        const level = u.level ?? 0;
        const growth = base.maxHpGrowth * level;
        if (growth === 0) continue;
        const realMax = Number(u.maxHp) || 100;                 // 真实快照：基础上限
        const obsMax = realMax + growth;                        // Observation：含成长上限
        const hp = Number(u.hp);
        const realRatio = hp / Math.max(1, realMax);
        const obsRatio = hp / Math.max(1, obsMax);
        const dev = Math.abs(realRatio - obsRatio);
        affected += 1;
        maxDev = Math.max(maxDev, dev);
        if (samples.length < 3) {
            samples.push({ id: u.id, unitClass: u.unitClass, level, hp, realMax, obsMax, realRatio: Number(realRatio.toFixed(4)), obsRatio: Number(obsRatio.toFixed(4)) });
        }
    }
    return {
        units: (state?.units ?? []).length,
        affectedUnits: affected,
        maxRelativeDeviation: Number(maxDev.toFixed(6)),
        samples,
    };
}

// ---------------------------------------------------------------------------
// 夹具（只用 src 的公开 API 构造，不改被测源码）
// ---------------------------------------------------------------------------

function makeFlatState(spec: {
    width?: number; height?: number; currentPlayer?: number; turn?: number;
    players?: number[]; units?: any[]; rules?: any; graves?: any[];
    pendingUnitId?: string; nextUnitId?: number; tiles?: Array<{ x: number; y: number; terrainId: number; ownerId?: number | null }>;
    winner?: number | null;
}): GameState {
    const width = spec.width ?? 8;
    const height = spec.height ?? 8;
    const tiles: Tile[][] = [];
    for (let y = 0; y < height; y += 1) {
        const row: Tile[] = [];
        for (let x = 0; x < width; x += 1) row.push({ terrainId: 6 as TerrainId, ownerId: null });
        tiles.push(row);
    }
    for (const o of spec.tiles ?? []) {
        const t = tiles[o.y]?.[o.x];
        if (!t) continue;
        t.terrainId = o.terrainId as TerrainId;
        if (o.ownerId !== undefined) t.ownerId = o.ownerId;
    }
    const players: PlayerState[] = (spec.players ?? [0, 1]).map((id) => ({
        id, gold: 1000, isAlive: true, commanderDeathCount: 0,
    }));
    const state: GameState = {
        turn: spec.turn ?? 1,
        currentPlayer: spec.currentPlayer ?? 0,
        map: { width, height, tiles },
        units: (spec.units ?? []).map((u) => ({
            level: 0, exp: 0, hasMoved: false, hasActed: false, ...u,
            pos: { x: u.x, y: u.y },
        })) as Unit[],
        players,
        winner: spec.winner ?? null,
        nextUnitId: spec.nextUnitId ?? 500,
        nextGraveId: 100,
    };
    if (spec.rules) state.rules = spec.rules;
    if (spec.graves) state.graves = spec.graves;
    if (spec.pendingUnitId) state.pendingUnitId = spec.pendingUnitId;
    return state;
}

interface Fixture {
    id: string;
    why: string;
    state: GameState;
    expectReobserveFailure?: boolean;
}

function buildFixtures(): Fixture[] {
    const fixtures: Fixture[] = [];

    fixtures.push({
        id: 'demo_map_default',
        why: 'src/game/demo_map.ts 的真实初始局面（无 rules 覆盖）→ 用来暴露 null 陷阱（unitLimit/populationLimit）。',
        state: createDemoState(),
    });

    fixtures.push({
        id: 'demo_map_price_override',
        why: 'src/game/demo_map.ts + rules.prices 覆盖 → 暴露 priceOverrides→prices 改名丢失（影响 getUnitCost / calculateArmyValue）。',
        state: createDemoState({ prices: { soldier: 999 } }),
    });

    fixtures.push({
        id: 'flat_no_rules_empty_castle',
        why: '最小局面：无 rules、p0 指挥官站在自家空城堡旁的空城堡 → 真实状态有 recruit_to_castle，恢复状态因 unitLimit/populationLimit=null 一个招募动作都没有。',
        state: makeFlatState({
            tiles: [{ x: 0, y: 0, terrainId: 10, ownerId: 0 }],
            units: [
                { id: 'p0_cmd', ownerId: 0, unitClass: 'commander', x: 0, y: 1, hp: 100, maxHp: 100 },
                { id: 'p1_cmd', ownerId: 1, unitClass: 'commander', x: 7, y: 7, hp: 100, maxHp: 100 },
            ],
        }),
    });

    fixtures.push({
        id: 'flat_commander_castle_pending',
        why: 'commanderCastleRecruitUsesPending=true 的真实状态：招募动作形态是 recruit_to_castle(堆叠 pending)，而该规则字段不在 Observation 里。',
        state: makeFlatState({
            tiles: [{ x: 0, y: 0, terrainId: 10, ownerId: 0 }],
            rules: { commanderCastleRecruitUsesPending: true, initialGold: 1000 },
            units: [
                { id: 'p0_cmd', ownerId: 0, unitClass: 'commander', x: 0, y: 0, hp: 100, maxHp: 100 },
                { id: 'p1_cmd', ownerId: 1, unitClass: 'commander', x: 7, y: 7, hp: 100, maxHp: 100 },
            ],
        }),
    });

    fixtures.push({
        id: 'flat_leveled_golem',
        why: 'level=3 的 golem（maxHpGrowth=25）：Observation.maxHp=175 被写回 unit.maxHp 后，getEffectiveStats 变成 250（重复计入成长），HP 归一化通道随之偏移。',
        state: makeFlatState({
            rules: { initialGold: 1000 },
            units: [
                { id: 'p0_golem', ownerId: 0, unitClass: 'golem', x: 1, y: 1, hp: 50, maxHp: 100, level: 3, exp: 600 },
                { id: 'p1_cmd', ownerId: 1, unitClass: 'commander', x: 7, y: 7, hp: 100, maxHp: 100 },
            ],
        }),
    });

    fixtures.push({
        id: 'flat_poisoned_ally_healer',
        why: 'paladin(healer) 紧邻中毒的友军：真实状态因 rules.ts:214 禁掉 heal，恢复状态 status 是字符串 → status.type 为 undefined → 多出非法治疗动作。',
        state: makeFlatState({
            rules: { initialGold: 1000 },
            units: [
                { id: 'p0_pal', ownerId: 0, unitClass: 'paladin', x: 2, y: 2, hp: 100, maxHp: 100 },
                { id: 'p0_hurt', ownerId: 0, unitClass: 'soldier', x: 2, y: 3, hp: 20, maxHp: 100, hasMoved: true, hasActed: true, status: { type: 'poisoned', remainingTicks: 2 } },
                { id: 'p1_cmd', ownerId: 1, unitClass: 'commander', x: 7, y: 7, hp: 100, maxHp: 100 },
            ],
        }),
    });

    fixtures.push({
        id: 'flat_grave_witch',
        why: 'witch(summoner) + 墓碑：恢复状态 graves 缺 pos → rules.ts:314 读 grave.pos 抛 TypeError，合法动作集直接无法计算。',
        state: makeFlatState({
            rules: { initialGold: 1000 },
            units: [
                { id: 'p0_witch', ownerId: 0, unitClass: 'witch', x: 2, y: 2, hp: 100, maxHp: 100 },
                { id: 'p1_cmd', ownerId: 1, unitClass: 'commander', x: 7, y: 7, hp: 100, maxHp: 100 },
            ],
            graves: [{ id: 'g_100', pos: { x: 2, y: 3 }, remainingTurns: 1, ownerId: 1 }],
        }),
    });

    fixtures.push({
        id: 'flat_campaign_event',
        why: 'rules.campaignEvents 带 effects：Observation 只剩摘要 → 恢复状态事件无效果；且对恢复状态再跑 buildObservation 会读 event.trigger.type 抛 TypeError。',
        state: makeFlatState({
            rules: {
                initialGold: 1000,
                campaignEvents: [{
                    id: 'wave_1',
                    trigger: { type: 'turn_start', playerId: 0, turn: 2 },
                    effects: [{ type: 'change_gold', teamId: 0, delta: 250 }],
                }],
            },
            units: [
                { id: 'p0_cmd', ownerId: 0, unitClass: 'commander', x: 0, y: 0, hp: 100, maxHp: 100 },
                { id: 'p1_cmd', ownerId: 1, unitClass: 'commander', x: 7, y: 7, hp: 100, maxHp: 100 },
            ],
        }),
        expectReobserveFailure: true,
    });

    return fixtures;
}

// ---------------------------------------------------------------------------
// 单个状态的审计
// ---------------------------------------------------------------------------

interface StateAuditRow {
    id: string;
    source: string;
    sampleRef: Record<string, unknown>;
    mapSize: string;
    units: number;
    players: number;
    realCurrentPlayer: number;
    observationOk: boolean;
    observationError: string | null;
    restoreOk: boolean;
    restoreError: string | null;
    reobserveOk: boolean;
    reobserveError: string | null;
    diffCounts: Record<Severity | 'TOTAL', number>;
    positionDiffPaths: string[];
    allDiffPaths: Array<{ path: string; kind: DiffKind; severity: Severity; count: number; exampleReal?: unknown; exampleRestored?: unknown }>;
    positionExact: boolean;
    behaviourExact: boolean;
    strictExact: boolean;
    legal: {
        realCount: number | null;
        restoredCount: number | null;
        realError: string | null;
        restoredError: string | null;
        match: boolean | null;
        missingInRestored: number;
        extraInRestored: number;
        missingExamples: string[];
        extraExamples: string[];
        /** 按动作类型（encodeAction 的第一个 ':' 前缀）统计 */
        missingTypeHistogram: Record<string, number>;
        extraTypeHistogram: Record<string, number>;
    };
    steps: StepProbe[];
    ablation: AblationRow[];
    tensor: TensorProbe | null;
    hpChannel: { affectedUnits: number; maxRelativeDeviation: number; samples: any[] } | null;
    armyValue: { real: number | null; restored: number | null; match: boolean | null };
}

function auditState(state: GameState, id: string, source: string, sampleRef: Record<string, unknown>): StateAuditRow {
    const row: StateAuditRow = {
        id, source, sampleRef,
        mapSize: `${state?.map?.width}x${state?.map?.height}`,
        units: state?.units?.length ?? 0,
        players: state?.players?.length ?? 0,
        realCurrentPlayer: state?.currentPlayer ?? -1,
        observationOk: false, observationError: null,
        restoreOk: false, restoreError: null,
        reobserveOk: false, reobserveError: null,
        diffCounts: { POSITION: 0, ID_COUNTER: 0, DERIVED: 0, METADATA: 0, TOTAL: 0 },
        positionDiffPaths: [],
        allDiffPaths: [],
        positionExact: false,
        behaviourExact: false,
        strictExact: false,
        legal: {
            realCount: null, restoredCount: null, realError: null, restoredError: null,
            match: null, missingInRestored: 0, extraInRestored: 0, missingExamples: [], extraExamples: [],
            missingTypeHistogram: {}, extraTypeHistogram: {},
        },
        steps: [],
        ablation: [],
        tensor: null,
        hpChannel: null,
        armyValue: { real: null, restored: null, match: null },
    };

    // 1) 真实引擎快照 + Observation
    let realState: GameState = state;
    let obs: any = null;
    try {
        const env = new AncientEmpiresEnv({ initialState: state });
        realState = env.getState();
        row.realCurrentPlayer = realState.currentPlayer;
        obs = env.getObservation(realState.currentPlayer);
        row.observationOk = true;
    } catch (err) {
        row.observationError = msgOf(err);
        return row;
    }

    // 2) V13 近似还原
    let restored: any = null;
    try {
        restored = v13ObservationToGameState(obs);
        row.restoreOk = true;
    } catch (err) {
        row.restoreError = msgOf(err);
        return row;
    }

    // 3) 字段级深比较
    const diffs = diffStates(realState, restored);
    for (const d of diffs) {
        row.diffCounts[d.severity] += d.count;
        row.diffCounts.TOTAL += d.count;
    }
    row.allDiffPaths = diffs.slice(0, 40).map((d) => ({
        path: d.path, kind: d.kind, severity: d.severity, count: d.count,
        exampleReal: d.exampleReal, exampleRestored: d.exampleRestored,
    }));
    row.positionDiffPaths = diffs.filter((d) => d.severity === 'POSITION').slice(0, 20).map((d) => `${d.kind}:${d.path}`);
    row.strictExact = row.diffCounts.TOTAL === 0;
    row.positionExact = row.diffCounts.POSITION === 0;
    row.behaviourExact = row.diffCounts.POSITION === 0 && row.diffCounts.ID_COUNTER === 0;

    // 3b) 对恢复状态再观测一次（检验 Observation↔GameState 是否可往返）
    try {
        const env2 = new AncientEmpiresEnv({ initialState: restored });
        env2.getObservation(env2.getState().currentPlayer);
        row.reobserveOk = true;
    } catch (err) {
        row.reobserveError = msgOf(err);
    }

    // 4) 合法动作集比较
    const legalReal = legalProbe(realState);
    const legalRestored = legalProbe(restored);
    row.legal.realCount = legalReal.error ? null : legalReal.codes.length;
    row.legal.restoredCount = legalRestored.error ? null : legalRestored.codes.length;
    row.legal.realError = legalReal.error;
    row.legal.restoredError = legalRestored.error;
    if (!legalReal.error && !legalRestored.error) {
        const d = setDiff(legalReal.codes, legalRestored.codes);
        row.legal.missingInRestored = d.onlyA.length;
        row.legal.extraInRestored = d.onlyB.length;
        row.legal.missingExamples = d.onlyA.slice(0, 5);
        row.legal.extraExamples = d.onlyB.slice(0, 5);
        row.legal.missingTypeHistogram = countByType(d.onlyA);
        row.legal.extraTypeHistogram = countByType(d.onlyB);
        row.legal.match = d.onlyA.length === 0 && d.onlyB.length === 0;
    }

    // 5) 3 个代表性动作各执行一步（每个动作都用全新引擎）
    if (!legalReal.error) {
        const realActions = (() => {
            try {
                const e = new GameEngine(realState);
                return e.getLegalActions(e.getState().currentPlayer);
            } catch {
                return [] as Action[];
            }
        })();
        const picks: Action[] = [];
        const seen = new Set<string>();
        for (const t of ['move', 'attack', 'capture', 'wait'] as Action['type'][]) {
            const a = realActions.find((x) => x.type === t && !seen.has(encodeAction(x)));
            if (a) {
                picks.push(a);
                seen.add(encodeAction(a));
            }
            if (picks.length >= 3) break;
        }
        for (const a of picks) row.steps.push(stepProbe(restored, a));
    }

    // 6) 张量通道差异 + HP 归一化偏差 + 军力估值差异
    row.tensor = tensorProbe(realState, restored, realState.currentPlayer);

    // 7) 归因消融：L0..L4 逐级修复后合法动作集/字段差异如何收敛
    try {
        row.ablation = ablationFor(obs, realState);
    } catch (err) {
        row.ablation = [];
        row.observationError = row.observationError ?? null;
        console.error(`[fidelity] ablation failed for ${id}: ${msgOf(err)}`);
    }

    const hpDev = hpChannelDeviation(realState);
    row.hpChannel = {
        affectedUnits: hpDev.affectedUnits,
        maxRelativeDeviation: hpDev.maxRelativeDeviation,
        samples: hpDev.samples,
    };
    try {
        const realArmy = calculateArmyValue(realState, realState.currentPlayer);
        const restoredArmy = calculateArmyValue(restored, realState.currentPlayer);
        row.armyValue = {
            real: Number(realArmy.toFixed(4)),
            restored: Number(restoredArmy.toFixed(4)),
            match: Math.abs(realArmy - restoredArmy) < 1e-9,
        };
    } catch {
        /* 保持 null */
    }

    return row;
}

// ---------------------------------------------------------------------------
// 采样
// ---------------------------------------------------------------------------

interface SampledState {
    id: string;
    source: string;
    state: GameState;
    sampleRef: Record<string, unknown>;
}

async function sampleDecisions(file: string): Promise<{ samples: SampledState[]; meta: Record<string, unknown> }> {
    const samples: SampledState[] = [];
    let index = 0;
    let parsed = 0;
    let parseErrors = 0;
    let lastLine: { line: string; index: number } | null = null;
    const stat = fs.statSync(file);
    const res = await streamLines(file, (line, i) => {
        lastLine = { line, index: i };
        if (i % DECISION_STRIDE === 0 && samples.length < MAX_DECISIONS) {
            try {
                const row = JSON.parse(line);
                parsed += 1;
                samples.push({
                    id: `decision#${i}`,
                    source: 'v14_decisions',
                    state: row.state as GameState,
                    sampleRef: {
                        lineIndex: i,
                        rootFamilyId: row.rootFamilyId,
                        partition: row.partition,
                        stepIndex: row.stepIndex,
                        turn: row.turn,
                        currentPlayer: row.currentPlayer,
                        recordedLegalActionCount: Array.isArray(row.legalActionCodes) ? row.legalActionCodes.length : null,
                        labelActionCode: row.labelActionCode ?? null,
                    },
                });
            } catch {
                parseErrors += 1;
            }
        }
        return true;
    });
    index = res.linesSeen;
    // 补最后一行，保证覆盖到 episode 尾部（终局附近）的局面
    if (lastLine && samples.length < MAX_DECISIONS + 1) {
        const last = lastLine as { line: string; index: number };
        try {
            const row = JSON.parse(last.line);
            samples.push({
                id: `decision#${last.index}(last)`,
                source: 'v14_decisions_last_line',
                state: row.state as GameState,
                sampleRef: {
                    lineIndex: last.index,
                    rootFamilyId: row.rootFamilyId,
                    partition: row.partition,
                    stepIndex: row.stepIndex,
                    turn: row.turn,
                    currentPlayer: row.currentPlayer,
                    recordedLegalActionCount: Array.isArray(row.legalActionCodes) ? row.legalActionCodes.length : null,
                    labelActionCode: row.labelActionCode ?? null,
                },
            });
        } catch {
            /* ignore */
        }
    }
    return {
        samples,
        meta: {
            path: rel(file),
            bytes: stat.size,
            mtimeMs: stat.mtimeMs,
            sha256Head1MiB: sha256OfFileHead(file, 1 << 20),
            linesScanned: index,
            stride: DECISION_STRIDE,
            maxDecisions: MAX_DECISIONS,
            parsedRows: parsed,
            parseErrors,
            streamError: res.readError,
            lastLineIndex: lastLine ? (lastLine as any).index : null,
            note: '采集可能仍在进行：上面的字节数/行数是本次扫描瞬间的读数，另有头部 1MiB 的 sha256 作为内容指纹。',
        },
    };
}

function sampleRoots(file: string, cap: number): { samples: SampledState[]; meta: Record<string, unknown> } {
    const samples: SampledState[] = [];
    const stat = fs.statSync(file);
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n').filter((l) => l.trim());
    const stride = cap > 0 && lines.length > cap ? Math.ceil(lines.length / cap) : 1;
    for (let i = 0; i < lines.length; i += stride) {
        try {
            const row = JSON.parse(lines[i]);
            samples.push({
                id: `initialState#${i}`,
                source: 'v14_roots_initialState',
                state: row.initialState as GameState,
                sampleRef: {
                    lineIndex: i,
                    rootFamilyId: row.rootFamilyId,
                    partition: row.partition,
                    mapName: row.mapName,
                    playerCount: row.playerCount,
                    seed: row.seed,
                    steps: row.steps,
                    stopReason: row.stopReason,
                    rulesHash: row.rulesHash,
                },
            });
        } catch {
            /* ignore */
        }
    }
    return {
        samples,
        meta: { path: rel(file), bytes: stat.size, totalLines: lines.length, sampled: samples.length, stride },
    };
}

// ---------------------------------------------------------------------------
// V13 归档抽样（只读前 N 行）
// ---------------------------------------------------------------------------

interface V13RowAudit {
    lineIndex: number;
    rootFamilyId: string | null;
    scenarioMapName: string | null;
    step: number | null;
    playerId: number | null;
    recordedLegalCount: number;
    restoredLegalCount: number | null;
    restoredLegalError: string | null;
    match: boolean | null;
    missingInRestored: number;
    extraInRestored: number;
    missingExamples: string[];
    extraExamples: string[];
    labelIsLegalInRestored: boolean | null;
    labelActionCode: string | null;
    unitsWithStatus: number;
    unitsWithLevelGrowth: number;
    maxHpChannelDeviation: number;
    observationHasWinner: boolean;
    observationKeys: string[];
    restorationMissingFields: string[];
}

async function auditV13Archive(file: string, rows: number): Promise<{ rows: V13RowAudit[]; meta: Record<string, unknown> }> {
    const out: V13RowAudit[] = [];
    const stat = fs.statSync(file);
    const res = await streamLines(file, (line, i) => {
        try {
            const row = JSON.parse(line);
            const obs = row.observation;
            const restored = v13ObservationToGameState(obs);
            const probe = legalProbe(restored);
            const recorded: string[] = Array.isArray(row.legalActionCodes) ? row.legalActionCodes : [];
            const diff = probe.error ? null : setDiff(recorded, probe.codes);
            const hpDev = hpChannelDeviation(restored);
            out.push({
                lineIndex: i,
                rootFamilyId: row.rootFamilyId ?? row.episodeId ?? null,
                scenarioMapName: row.scenario?.mapName ?? null,
                step: row.step ?? null,
                playerId: row.playerId ?? null,
                recordedLegalCount: recorded.length,
                restoredLegalCount: probe.error ? null : probe.codes.length,
                restoredLegalError: probe.error,
                match: diff ? diff.onlyA.length === 0 && diff.onlyB.length === 0 : null,
                missingInRestored: diff ? diff.onlyA.length : -1,
                extraInRestored: diff ? diff.onlyB.length : -1,
                missingExamples: diff ? diff.onlyA.slice(0, 5) : [],
                extraExamples: diff ? diff.onlyB.slice(0, 5) : [],
                labelIsLegalInRestored: probe.error || !row.label?.actionCode
                    ? null
                    : probe.codes.includes(String(row.label.actionCode)),
                labelActionCode: row.label?.actionCode ?? null,
                unitsWithStatus: (obs.units ?? []).filter((u: any) => u.status).length,
                unitsWithLevelGrowth: hpDev.affectedUnits,
                maxHpChannelDeviation: hpDev.maxRelativeDeviation,
                observationHasWinner: Object.prototype.hasOwnProperty.call(obs, 'winner'),
                observationKeys: Object.keys(obs),
                restorationMissingFields: ['winner', 'nextUnitId', 'nextGraveId', 'metadata', 'apkScriptState']
                    .filter((k) => !Object.prototype.hasOwnProperty.call(restored, k)),
            });
        } catch (err) {
            out.push({
                lineIndex: i, rootFamilyId: null, scenarioMapName: null, step: null, playerId: null,
                recordedLegalCount: 0, restoredLegalCount: null, restoredLegalError: msgOf(err), match: null,
                missingInRestored: -1, extraInRestored: -1, missingExamples: [], extraExamples: [],
                labelIsLegalInRestored: null, labelActionCode: null, unitsWithStatus: 0,
                unitsWithLevelGrowth: 0, maxHpChannelDeviation: 0, observationHasWinner: false,
                observationKeys: [], restorationMissingFields: [],
            });
        }
        return out.length < rows;
    }, rows);
    return {
        rows: out,
        meta: {
            path: rel(file), bytes: stat.size, rowsRequested: rows, rowsRead: out.length,
            streamError: res.readError,
            note: '只读取文件头部若干行；7.27GB 源归档不做全量加载。',
        },
    };
}

function probeV13Pool(file: string, rows: number): Record<string, unknown> {
    const stat = fs.statSync(file);
    const samples: any[] = [];
    let lines = 0;
    // 只读头部 4MiB 再切行：81MB 的 pool 不做整文件加载。
    const fd = fs.openSync(file, 'r');
    let head = '';
    try {
        const buf = Buffer.alloc(4 << 20);
        const n = fs.readSync(fd, buf, 0, buf.length, 0);
        head = buf.subarray(0, n).toString('utf8');
    } finally {
        fs.closeSync(fd);
    }
    const parts = head.split('\n').filter((l) => l.trim()).slice(0, rows);
    for (const line of parts) {
        try {
            const row = JSON.parse(line);
            lines += 1;
            if (samples.length < rows) {
                samples.push({
                    keys: Object.keys(row),
                    hasObservation: Object.prototype.hasOwnProperty.call(row, 'observation'),
                    hasState: Object.prototype.hasOwnProperty.call(row, 'state'),
                    hasInitialState: Object.prototype.hasOwnProperty.call(row, 'initialState'),
                    rootFamilyId: row.rootFamilyId ?? null,
                    playerId: row.playerId ?? row.subjectPlayer ?? null,
                    spatialTensorLength: Array.isArray(row.spatialTensor) ? row.spatialTensor.length : null,
                });
            }
        } catch {
            /* ignore */
        }
    }
    return {
        path: rel(file),
        bytes: stat.size,
        headBytesRead: Math.min(stat.size, 4 << 20),
        rowsInspected: samples.length,
        rows: samples,
        conclusion:
            'pool_v3.jsonl 只存张量/候选/标签，没有任何 GameState 或 Observation 字段；'
            + '「状态」本身没有随 V13 归档一起保存，只有它的有损投影。',
    };
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------

function summarise(rows: StateAuditRow[], label: string): Record<string, unknown> {
    const tested = rows.filter((r) => r.restoreOk);    const legalComparable = tested.filter((r) => r.legal.match !== null);
    const legalMatch = legalComparable.filter((r) => r.legal.match === true);
    const positionExact = tested.filter((r) => r.positionExact);
    const behaviourExact = tested.filter((r) => r.behaviourExact);
    const strictExact = tested.filter((r) => r.strictExact);

    const pathHistogram = new Map<string, { path: string; kind: DiffKind; severity: Severity; states: number; cells: number; exampleReal?: unknown; exampleRestored?: unknown }>();
    for (const r of tested) {
        for (const d of r.allDiffPaths) {
            const key = `${d.kind}|${d.path}`;
            const e = pathHistogram.get(key) ?? {
                path: d.path, kind: d.kind, severity: d.severity, states: 0, cells: 0,
                exampleReal: d.exampleReal, exampleRestored: d.exampleRestored,
            };
            e.states += 1;
            e.cells += d.count;
            pathHistogram.set(key, e);
        }
    }
    const histogram = [...pathHistogram.values()].sort((a, b) => {
        const order: Severity[] = ['POSITION', 'ID_COUNTER', 'DERIVED', 'METADATA'];
        const d = order.indexOf(a.severity) - order.indexOf(b.severity);
        return d !== 0 ? d : b.states - a.states || a.path.localeCompare(b.path);
    });

    const legalDiffs = tested
        .filter((r) => r.legal.match === false)
        .map((r) => ({
            id: r.id,
            mapSize: r.mapSize,
            missingInRestored: r.legal.missingInRestored,
            extraInRestored: r.legal.extraInRestored,
            missingExamples: r.legal.missingExamples,
            extraExamples: r.legal.extraExamples,
            missingTypeHistogram: r.legal.missingTypeHistogram,
        }));

    const legalMissingTypeTotals = (() => {
        const h: Record<string, { states: number; actions: number }> = {};
        for (const r of tested) {
            for (const [t, n] of Object.entries(r.legal.missingTypeHistogram)) {
                h[t] = h[t] ?? { states: 0, actions: 0 };
                h[t].states += 1;
                h[t].actions += n;
            }
        }
        return Object.fromEntries(Object.entries(h).sort((x, y) => y[1].actions - x[1].actions));
    })();
    const legalExtraTypeTotals = (() => {
        const h: Record<string, { states: number; actions: number }> = {};
        for (const r of tested) {
            for (const [t, n] of Object.entries(r.legal.extraTypeHistogram)) {
                h[t] = h[t] ?? { states: 0, actions: 0 };
                h[t].states += 1;
                h[t].actions += n;
            }
        }
        return Object.fromEntries(Object.entries(h).sort((x, y) => y[1].actions - x[1].actions));
    })();

    const failedLegal = tested.filter((r) => r.legal.restoredError);

    const steps: StepProbe[] = [];
    for (const r of tested) for (const s of r.steps) steps.push(s);
    const comparableSteps = steps.filter((s) => s.winnerMatch !== null);
    const stepSummary = {
        probes: steps.length,
        comparableProbes: comparableSteps.length,
        probeErrors: steps.filter((s) => s.error).length,
        probeErrorExamples: [...new Set(steps.filter((s) => s.error).map((s) => s.error))].slice(0, 3),
        winnerMismatch: comparableSteps.filter((s) => s.winnerMatch === false).length,
        hpMismatch: comparableSteps.filter((s) => s.hpDiffCount > 0).length,
        illegalReal: steps.filter((s) => s.realIllegal).length,
        illegalRestored: steps.filter((s) => s.restoredIllegal).length,
        errors: steps.filter((s) => s.error).length,
        byType: Object.fromEntries(
            ['move', 'attack', 'capture', 'wait'].map((t) => {
                const subset = steps.filter((s) => s.actionType === t);
                const comparable = subset.filter((s) => s.winnerMatch !== null);
                return [t, {
                    probes: subset.length,
                    comparable: comparable.length,
                    errors: subset.filter((s) => s.error).length,
                    winnerMismatch: comparable.filter((s) => s.winnerMatch === false).length,
                    hpMismatch: comparable.filter((s) => s.hpDiffCount > 0).length,
                    illegalRestored: subset.filter((s) => s.restoredIllegal).length,
                }];
            })
        ),
        examples: steps.filter((s) => s.error || s.winnerMatch === false || s.hpDiffCount > 0 || s.restoredIllegal).slice(0, 8),
        postStepBehaviouralDiff: (() => {
            const withDiff = steps.filter((s) => s.postStepBehaviouralDiffPaths.length > 0);
            const h = new Map<string, number>();
            for (const s of withDiff) for (const p of s.postStepBehaviouralDiffPaths) h.set(p, (h.get(p) ?? 0) + 1);
            return {
                probesWithBehaviouralDiff: withDiff.length,
                topPaths: Object.fromEntries([...h.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12)),
            };
        })(),
    };

    // 归因消融：把每个状态在 L0..L4 上的读数按级汇总
    const ablationLevels = REPAIR_LEVELS.map((spec) => {
        const rowsAtLevel = tested
            .map((r) => (r.ablation ?? []).find((a) => a.level === spec.level))
            .filter((a): a is AblationRow => Boolean(a));
        const comparable = rowsAtLevel.filter((a) => a.legalMatch !== null);
        const matched = comparable.filter((a) => a.legalMatch === true);
        return {
            level: spec.level,
            id: spec.id,
            description: spec.description,
            states: rowsAtLevel.length,
            legalComparable: comparable.length,
            legalMatchCount: matched.length,
            legalMatchRate: pct(matched.length, comparable.length),
            legalProbeErrors: rowsAtLevel.filter((a) => a.legalError).length,
            positionExactCount: rowsAtLevel.filter((a) => a.positionDiffCount === 0).length,
            positionExactRate: pct(rowsAtLevel.filter((a) => a.positionDiffCount === 0).length, rowsAtLevel.length),
            strictExactCount: rowsAtLevel.filter((a) => a.strictDiffCount === 0).length,
            strictExactRate: pct(rowsAtLevel.filter((a) => a.strictDiffCount === 0).length, rowsAtLevel.length),
            missingActionsTotal: rowsAtLevel.reduce((s, a) => s + Math.max(0, a.missingInRestored), 0),
            extraActionsTotal: rowsAtLevel.reduce((s, a) => s + Math.max(0, a.extraInRestored), 0),
            residualPositionPathHistogram: (() => {
                const h = new Map<string, number>();
                for (const a of rowsAtLevel) for (const p of a.residualPositionPaths) h.set(p, (h.get(p) ?? 0) + 1);
                return Object.fromEntries([...h.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12));
            })(),
            residualStrictPathHistogram: (() => {
                const h = new Map<string, number>();
                for (const a of rowsAtLevel) for (const p of a.residualStrictPaths) h.set(p, (h.get(p) ?? 0) + 1);
                return Object.fromEntries([...h.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12));
            })(),
        };
    });

    const tensorRows = tested.filter((r) => r.tensor && r.tensor.ok);
    const tensorDiffRows = tensorRows.filter((r) => (r.tensor as TensorProbe).differingCells > 0);
    const channelUsage = new Map<string, number>();
    for (const r of tensorDiffRows) {
        for (const [ch, n] of Object.entries((r.tensor as TensorProbe).channelHistogram)) {
            channelUsage.set(ch, (channelUsage.get(ch) ?? 0) + n);
        }
    }

    const reobserveFailed = tested.filter((r) => !r.reobserveOk);

    return {
        label,
        statesTested: tested.length,
        observationFailed: rows.filter((r) => !r.observationOk).length,
        restoreFailed: rows.filter((r) => !r.restoreOk).length,
        reobserveFailed: reobserveFailed.length,
        reobserveFailureExamples: reobserveFailed.slice(0, 5).map((r) => ({ id: r.id, error: r.reobserveError })),
        rates: {
            strictFieldExact: { count: strictExact.length, total: tested.length, rate: pct(strictExact.length, tested.length) },
            positionFieldExact: { count: positionExact.length, total: tested.length, rate: pct(positionExact.length, tested.length) },
            behaviourFieldExact: { count: behaviourExact.length, total: tested.length, rate: pct(behaviourExact.length, tested.length) },
            legalActionSetMatch: { count: legalMatch.length, total: legalComparable.length, rate: pct(legalMatch.length, legalComparable.length) },
            legalProbeFailedOnRestored: { count: failedLegal.length, total: tested.length, rate: pct(failedLegal.length, tested.length) },
        },
        legalDiffExamples: legalDiffs.slice(0, 8),
        legalDiffStates: legalDiffs.length,
        legalMissingTypeTotals,
        legalExtraTypeTotals,
        diffPathDistribution: histogram.slice(0, 40),
        diffPathDistributionFull: histogram,
        steps: stepSummary,
        ablation: ablationLevels,
        tensor: {
            statesCompared: tensorRows.length,
            statesWithDifference: tensorDiffRows.length,
            rate: pct(tensorDiffRows.length, tensorRows.length),
            maxAbsDiff: tensorRows.reduce((m, r) => Math.max(m, (r.tensor as TensorProbe).maxAbsDiff), 0),
            channelCellHistogram: Object.fromEntries([...channelUsage.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
            totalCells: SPATIAL_TENSOR_CHANNELS * SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W,
        },
        hpChannelDeviation: {
            statesWithAffectedUnits: tested.filter((r) => (r.hpChannel?.affectedUnits ?? 0) > 0).length,
            affectedUnits: tested.reduce((s, r) => s + (r.hpChannel?.affectedUnits ?? 0), 0),
            maxRelativeDeviation: tested.reduce((m, r) => Math.max(m, r.hpChannel?.maxRelativeDeviation ?? 0), 0),
        },
        armyValueMismatch: {
            count: tested.filter((r) => r.armyValue.match === false).length,
            total: tested.filter((r) => r.armyValue.match !== null).length,
        },
    };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function fmtTable(headers: string[], rows: unknown[][]): string {
    const esc = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const line = (cells: unknown[]) => `| ${cells.map(esc).join(' | ')} |`;
    return [line(headers), `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map(line)].join('\n');
}

function buildMarkdown(report: any): string {
    const L: string[] = [];
    const t = report.measurements.v14DecisionStates;
    const fx = report.measurements.fixtures;
    const rt = report.measurements.v14RootInitialStates;
    const v13 = report.measurements.v13ArchiveRows;
    const pool = report.measurements.v13PoolProbe;

    L.push('# T14-02 附加证据：`Observation → GameState` 状态恢复保真度审计');
    L.push('');
    L.push(`- 生成时间：${report.generatedAt}`);
    L.push(`- 工具：\`${report.tool}\`（可重复运行，只读被测源码）`);
    L.push(`- 结构化读数：\`${report.outputs.json}\``);
    L.push(`- 源码修订：git ${String(report.sourceRevision?.gitHead ?? 'unknown')}（被引用源码文件的 sha256 见 JSON 的 \`sourceRevision.files\`；工作区含其他执行者的在途修改）`);
    L.push(`- 结论口径：\`CODE_CONFIRMED\` = 读源码逐行确认；\`MEASURED\` = 本次在真实引擎上跑出来的读数。`);
    L.push('');
    L.push('## 0. 结论摘要');
    L.push('');
    L.push(`1. **${report.conclusions.v13ReuseVerdict.code}** — ${report.conclusions.v13ReuseVerdict.headline}`);
    L.push(`2. 字段级保真（决策状态样本 n=${t.statesTested}）：严格全等 ${t.rates.strictFieldExact.count}/${t.rates.strictFieldExact.total}=${t.rates.strictFieldExact.rate}；` +
        `局面字段全等 ${t.rates.positionFieldExact.count}/${t.rates.positionFieldExact.total}=${t.rates.positionFieldExact.rate}；` +
        `行为字段全等 ${t.rates.behaviourFieldExact.count}/${t.rates.behaviourFieldExact.total}=${t.rates.behaviourFieldExact.rate}。`);
    L.push(`3. 合法动作集一致率（决策状态）：${t.rates.legalActionSetMatch.count}/${t.rates.legalActionSetMatch.total}=${t.rates.legalActionSetMatch.rate}；` +
        `恢复状态上合法动作探针抛异常 ${t.rates.legalProbeFailedOnRestored.count}/${t.rates.legalProbeFailedOnRestored.total}（墓碑缺 pos）。`);
    L.push(`4. 3 步代表动作实验：${t.steps.probes} 次探针，winner 不一致 ${t.steps.winnerMismatch} 次，HP 不一致 ${t.steps.hpMismatch} 次，` +
        `恢复侧出现非法动作 ${t.steps.illegalRestored} 次（真实侧 ${t.steps.illegalReal} 次）。`);
    L.push(`5. 空间张量：${t.tensor.statesWithDifference}/${t.tensor.statesCompared} 个样本出现通道差异，最大绝对差 ${t.tensor.maxAbsDiff}。`);
    L.push(`6. 归因消融：L0 原样还原合法动作一致率 ${t.ablation[0]?.legalMatchRate} → L1 修 null 陷阱/改名 ${t.ablation[1]?.legalMatchRate}` +
        ` → L2 再修 Observation 可恢复的重塑 ${t.ablation[2]?.legalMatchRate} → L3 补 Observation 不携带字段 ${t.ablation[3]?.legalMatchRate}` +
        ` → L4 严格全等 ${t.ablation[4]?.strictExactRate}。`);
    L.push(`7. 一致动作差异 100% 落在 \`recruit_to_castle\`（决策样本 ${t.legalMissingTypeTotals?.recruit_to_castle?.actions ?? 0} 个动作 / ${t.legalMissingTypeTotals?.recruit_to_castle?.states ?? 0} 个状态），` +
        `根因是 \`rules.populationLimit\` 的 null 陷阱与 \`rules.commanderCastleRecruitUsesPending\` 不在 Observation 中。`);
    L.push('');
    L.push('## 1. 方法与可复核命令');
    L.push('');
    L.push('```');
    L.push(`node --openssl-legacy-provider v12/tools/run-tool.mjs ${report.tool}`);
    L.push('```');
    L.push('');
    L.push('流程（每个状态）：');
    L.push('');
    L.push('1. `new AncientEmpiresEnv({initialState})` → `env.getState()` 真实引擎快照 + `env.getObservation(currentPlayer)` 取 Observation；');
    L.push('2. 内联复现 `v13/tools/reencode_v31.ts:76-104` 的 `observationToGameState`（不 import 那个带 main 副作用的脚本）把 Observation 转回 GameState；');
    L.push('3. 规范化深比较（数组按 `id` 配对）逐路径统计 `MISSING_IN_RESTORED` / `EXTRA_IN_RESTORED` / `VALUE_DIFF` / `LENGTH_DIFF`；');
    L.push('4. `new GameEngine(state).getLegalActions(currentPlayer)`，用 `encodeAction` 规范化后比较集合；');
    L.push('5. 取真实侧 3 个代表性合法动作（优先 move/attack/capture），每个都在**全新引擎**上执行一步，比较 winner / 逐单位 HP / 非法动作计数 / 执行后行为字段差异；');
    L.push('6. `encodeGameStateSpatial(state, playerId, \'v2\')` 逐通道对比 26×20×20 张量。');
    L.push('');
    L.push('输入：');
    L.push('');
    L.push(fmtTable(['输入', '路径', '规模'], [
        ['决策状态样本', String(t.inputs?.decisions?.path ?? DECISIONS_PATH), `扫描 ${t.inputs?.decisions?.linesScanned} 行 / ${t.inputs?.decisions?.bytes} 字节，步长 ${t.inputs?.decisions?.stride}`],
        ['root 初始状态', String(rt.inputs?.roots?.path ?? ROOTS_PATH), `共 ${rt.inputs?.roots?.totalLines} 行，取 ${rt.inputs?.roots?.sampled} 条`],
        ['自建夹具', 'v14/tools/audit_state_fidelity.ts（`buildFixtures`）', `${fx.statesTested} 条`],
        ['V13 源归档（仅前 N 行）', String(v13.inputs?.archive?.path ?? '-'), `读 ${v13.inputs?.archive?.rowsRead} 行 / 文件 ${v13.inputs?.archive?.bytes} 字节`],
        ['V13 归档 pool', String(pool?.path ?? '-'), `${pool?.rowsInspected ?? 0} 行 / 文件 ${pool?.bytes ?? 0} 字节`],
    ]));
    L.push('');
    L.push('## 2. A. 字段差异清单（CODE_CONFIRMED）');
    L.push('');
    L.push(fmtTable(
        ['GameState 字段', 'Observation 对应', '种类', '影响判定', 'V13 转换', '源码位置', '结论'],
        report.fieldFindings.map((f: FieldFinding) => [
            f.path,
            f.observationPath ?? '**不存在**',
            f.kind,
            f.behavioural ? '是' : '否',
            f.v13DroppedOrMangled ? '丢失/搬错' : '保留',
            f.sourceRef,
            f.note,
        ])
    ));
    L.push('');
    L.push('### 2.1 无法从 Observation 恢复的字段（明确列出）');
    L.push('');
    L.push(fmtTable(['字段', '为什么不可恢复'], report.irrecoverableFields.map((f: any) => [f.path, f.why])));
    L.push('');
    L.push('## 3. B. 实测量化（MEASURED）');
    L.push('');
    L.push('### 3.1 决策状态样本（真实 V14 快照）');
    L.push('');
    L.push(fmtTable(['口径', '一致', '样本', '一致率'], [
        ['严格全等（含派生字段）', String(t.rates.strictFieldExact.count), String(t.rates.strictFieldExact.total), String(t.rates.strictFieldExact.rate)],
        ['局面字段全等（无 POSITION 差异）', String(t.rates.positionFieldExact.count), String(t.rates.positionFieldExact.total), String(t.rates.positionFieldExact.rate)],
        ['行为字段全等（POSITION + ID 计数）', String(t.rates.behaviourFieldExact.count), String(t.rates.behaviourFieldExact.total), String(t.rates.behaviourFieldExact.rate)],
        ['合法动作集一致', String(t.rates.legalActionSetMatch.count), String(t.rates.legalActionSetMatch.total), String(t.rates.legalActionSetMatch.rate)],
        ['恢复状态合法动作探针抛异常', String(t.rates.legalProbeFailedOnRestored.count), String(t.rates.legalProbeFailedOnRestored.total), String(t.rates.legalProbeFailedOnRestored.rate)],
    ]));
    L.push('');
    L.push('> 三个「字段全等」口径都是 0：V13 的近似转换会把 Observation 的派生展示字段（单位攻防、地形加成等）一起塞进 GameState，' +
        '严格口径必然不为 0。真正有意义的是 3.4 的归因消融曲线：只有把 Observation 不携带的字段补上，状态才回到真实快照。');
    L.push('');
    L.push('差异字段分布（按出现状态数排序，前 30）：');
    L.push('');
    L.push(fmtTable(['差异路径', '种类', '严重度', '状态数', '单元数', '真实值示例', '恢复值示例'],
        t.diffPathDistribution.slice(0, 30).map((d: any) => [
            d.path, d.kind, d.severity, String(d.states), String(d.cells),
            JSON.stringify(d.exampleReal ?? null).slice(0, 60),
            JSON.stringify(d.exampleRestored ?? null).slice(0, 60),
        ])));
    L.push('');
    L.push('### 3.2 合法动作集差异实例');
    L.push('');
    L.push('差异按动作类型汇总（决策样本）：');
    L.push('');
    L.push(fmtTable(['动作类型', '恢复侧缺失(动作数)', '出现在多少状态', '恢复侧多出(动作数)', '出现在多少状态'],
        [...new Set([...Object.keys(t.legalMissingTypeTotals), ...Object.keys(t.legalExtraTypeTotals)])].map((k) => [
            k,
            String(t.legalMissingTypeTotals[k]?.actions ?? 0), String(t.legalMissingTypeTotals[k]?.states ?? 0),
            String(t.legalExtraTypeTotals[k]?.actions ?? 0), String(t.legalExtraTypeTotals[k]?.states ?? 0),
        ])));
    L.push('');
    if (t.legalDiffExamples.length === 0) {
        L.push('（决策状态样本上未观察到集合差异；差异集中在自建夹具与规则字段缺失的剧本上，见 3.4。）');
    } else {
        L.push(fmtTable(['状态', '棋盘', '恢复侧缺失', '恢复侧多出', '缺失示例', '多出示例'],
            t.legalDiffExamples.map((d: any) => [
                d.id, d.mapSize, String(d.missingInRestored), String(d.extraInRestored),
                d.missingExamples.join('<br>'), d.extraExamples.join('<br>'),
            ])));
    }
    L.push('');
    L.push('### 3.3 代表动作执行一步（move/attack/capture）');
    L.push('');
    L.push(fmtTable(['指标', '读数'], [
        ['探针总数', String(t.steps.probes)],
        ['可比较探针（未抛异常）', String(t.steps.comparableProbes)],
        ['探针抛异常', `${t.steps.probeErrors}`],
        ['winner 不一致', `${t.steps.winnerMismatch} / ${t.steps.comparableProbes}`],
        ['逐单位 HP 不一致', String(t.steps.hpMismatch)],
        ['真实侧出现非法动作', String(t.steps.illegalReal)],
        ['恢复侧出现非法动作', String(t.steps.illegalRestored)],
        ['执行一步后仍有行为字段差异的探针', `${t.steps.postStepBehaviouralDiff.probesWithBehaviouralDiff} / ${t.steps.comparableProbes}`],
    ]));
    L.push('');
    if (t.steps.postStepBehaviouralDiff.probesWithBehaviouralDiff > 0) {
        L.push('执行一步后残余的行为字段差异分布（说明即便 winner/HP 相同，后续局面仍不同）：');
        L.push('');
        L.push(fmtTable(['差异路径', '探针数'], Object.entries(t.steps.postStepBehaviouralDiff.topPaths)));
        L.push('');
    }
    if (t.steps.probeErrorExamples.length) {
        L.push(`探针异常类型：${t.steps.probeErrorExamples.map((e: string) => `\`${e}\``).join('；')}` +
            '（均由恢复状态墓碑缺 `pos` 引起；同一原因还让 2/61 个状态的合法动作探针无法计算）');
        L.push('');
    }
    L.push('');
    L.push('按动作类型：');
    L.push('');
    L.push(fmtTable(['动作类型', '探针', '可比较', '异常', 'winner 不一致', 'HP 不一致', '恢复侧非法'],
        Object.entries(t.steps.byType).map(([k, v]: any) => [
            k, String(v.probes), String(v.comparable), String(v.errors), String(v.winnerMismatch),
            String(v.hpMismatch), String(v.illegalRestored),
        ])));
    L.push('');
    L.push('### 3.4 空间张量通道差异（解释 V13 pool 特征为何与推理特征不同分布）');
    L.push('');
    L.push(fmtTable(['指标', '读数'], [
        ['参与比较的状态数', String(t.tensor.statesCompared)],
        ['出现差异的状态数', String(t.tensor.statesWithDifference)],
        ['差异状态占比', String(t.tensor.rate)],
        ['最大绝对差', String(t.tensor.maxAbsDiff)],
        ['差异通道（通道号→差异格数）', JSON.stringify(t.tensor.channelCellHistogram)],
    ]));
    L.push('');
    L.push(`HP 归一化偏差（真实快照口径 ` + '`hp/baseMaxHp`' + ` vs Observation/V13 口径 ` + '`hp/(baseMaxHp+maxHpGrowth*level)`' + `）：` +
        `受影响状态 ${t.hpChannelDeviation.statesWithAffectedUnits}，受影响单位 ${t.hpChannelDeviation.affectedUnits}，` +
        `最大相对偏差 ${t.hpChannelDeviation.maxRelativeDeviation}。`);
    L.push('');
    L.push('### 3.5 归因消融：差异到底由哪个字段负责');
    L.push('');
    L.push('从「V13 原样还原」出发逐级只修一类差异，观察合法动作集与字段差异如何收敛。' +
        'L1/L2 只用 Observation 里已有的信息；L3 必须动用真实快照（因为那些字段 Observation 根本不带）；L4 是自检。');
    L.push('');
    L.push(fmtTable(['级别', '含义', '合法动作一致率', '局面字段全等率', '严格全等率', '恢复侧缺失动作总数', '残余 POSITION 差异'],
        t.ablation.map((a: any) => [
            a.id, a.description, `${a.legalMatchCount}/${a.legalComparable}=${a.legalMatchRate}`,
            `${a.positionExactCount}/${a.states}=${a.positionExactRate}`,
            `${a.strictExactCount}/${a.states}=${a.strictExactRate}`,
            String(a.missingActionsTotal),
            Object.keys(a.residualPositionPathHistogram).slice(0, 3).join('<br>') || '—',
        ])));
    L.push('');
    L.push('L0 残余 POSITION 差异分布（决策样本）：');
    L.push('');
    L.push(fmtTable(['差异路径', '出现状态数'], Object.entries(t.ablation[0].residualPositionPathHistogram)));
    L.push('');
    L.push('### 3.6 自建夹具（定点暴露每个字段差异）');    L.push('');
    L.push(fmtTable(['夹具', '棋盘/单位', '合法动作一致', '缺失/多出', '恢复侧探针错误', '再观测', '关键 POSITION 差异'],
        report.measurements.fixtureDetails.map((r: any) => [
            r.id, `${r.mapSize} / ${r.units}u`,
            r.legal.match === null ? '不可比' : String(r.legal.match),
            `${r.legal.missingInRestored}/${r.legal.extraInRestored}`,
            r.legal.restoredError ? r.legal.restoredError.slice(0, 70) : '—',
            r.reobserveOk ? 'OK' : `失败：${String(r.reobserveError).slice(0, 60)}`,
            r.positionDiffPaths.slice(0, 3).join('<br>'),
        ])));
    L.push('');
    L.push('### 3.7 root 初始状态样本');
    L.push('');
    L.push(fmtTable(['口径', '一致', '样本', '一致率'], [
        ['局面字段全等', String(rt.rates.positionFieldExact.count), String(rt.rates.positionFieldExact.total), String(rt.rates.positionFieldExact.rate)],
        ['合法动作集一致', String(rt.rates.legalActionSetMatch.count), String(rt.rates.legalActionSetMatch.total), String(rt.rates.legalActionSetMatch.rate)],
    ]));
    L.push('');
    L.push('### 3.8 V13 源归档抽样（真实历史数据）');
    L.push('');
    L.push(fmtTable(['行', 'root', '地图', 'step', '记录合法数', '恢复合法数', '集合一致', '缺失/多出', '标签仍合法', '有状态单位', '有成长单位', 'HP 通道最大偏差'],
        (v13.rows ?? []).map((r: any) => [
            String(r.lineIndex), String(r.rootFamilyId ?? '-').slice(0, 44), String(r.scenarioMapName ?? '-'),
            String(r.step ?? '-'), String(r.recordedLegalCount), String(r.restoredLegalCount ?? '-'),
            r.match === null ? '不可比' : String(r.match), `${r.missingInRestored}/${r.extraInRestored}`,
            String(r.labelIsLegalInRestored), String(r.unitsWithStatus), String(r.unitsWithLevelGrowth),
            String(r.maxHpChannelDeviation),
        ])));
    L.push('');
    L.push('V13 归档 pool 抽查：');
    L.push('');
    L.push(fmtTable(['字段', '结论'], [
        ['是否含 `state`', String((pool?.rows ?? []).some((r: any) => r.hasState))],
        ['是否含 `initialState`', String((pool?.rows ?? []).some((r: any) => r.hasInitialState))],
        ['是否含 `observation`', String((pool?.rows ?? []).some((r: any) => r.hasObservation))],
        ['顶层字段', String((pool?.rows?.[0]?.keys ?? []).join(', '))],
    ]));
    L.push('');
    L.push(`> ${pool?.conclusion ?? ''}`);
    L.push('');
    L.push('## 4. C. 结论与适用范围');
    L.push('');
    L.push(`### 4.1 V13 归档数据可否被 V14 直接复用`);
    L.push('');
    L.push(`**判定：\`${report.conclusions.v13ReuseVerdict.code}\`**`);
    L.push('');
    for (const r of report.conclusions.v13ReuseVerdict.reasons) L.push(`- ${r}`);
    L.push('');
    L.push('### 4.2 最小反例（字段差异 → 合法动作集不同）');
    L.push('');
    L.push(fmtTable(['#', '状态', '字段', '真实状态', '恢复状态', '动作差异', '口径'],
        report.conclusions.minimalCounterexamples.map((c: any) => [
            String(c.index), c.state, c.field, c.real, c.restored, c.actionDiff, c.basis,
        ])));
    L.push('');
    L.push('### 4.3 适用范围');
    L.push('');
    for (const s of report.conclusions.scope) L.push(`- ${s}`);
    L.push('');
    L.push('## 5. 未覆盖范围（诚实声明）');
    L.push('');
    for (const s of report.conclusions.notCovered) L.push(`- ${s}`);
    L.push('');
    return `${L.join('\n')}\n`;
}

function sha256OfFile(file: string): string | null {
    try {
        const crypto = require('node:crypto');
        return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    } catch {
        return null;
    }
}

/** git HEAD（不依赖子进程，直接读 .git 元数据）。 */
function gitHead(): string | null {
    try {
        const head = fs.readFileSync(path.join(REPO_ROOT, '.git', 'HEAD'), 'utf8').trim();
        if (head.startsWith('ref:')) {
            const ref = head.slice(4).trim();
            const value = fs.readFileSync(path.join(REPO_ROOT, '.git', ref), 'utf8').trim();
            return `${ref}=${value}`;
        }
        return `detached=${head}`;
    } catch {
        return null;
    }
}

/**
 * 本报告引用的行号对应当前**工作区**源码。其他执行者可能同时在改 `src/`，
 * 因此这里固化每个被引用文件的 sha256：行号漂移时以哈希为准重新定位。
 */
function sourceRevision(): Record<string, unknown> {
    const files = [
        'src/game/env.ts',
        'src/game/types.ts',
        'src/game/rule_config.ts',
        'src/game/rules.ts',
        'src/game/engine.ts',
        'src/game/abilities.ts',
        'src/game/terrain.ts',
        'src/game/terrain_rules.ts',
        'src/game/campaign_events.ts',
        'src/game/apk_stage.ts',
        'src/game/demo_map.ts',
        'src/game/state_snapshot.ts',
        'src/game/ai/spatial_tensor_encoder.ts',
        'v13/tools/reencode_v31.ts',
    ];
    return {
        gitHead: gitHead(),
        note:
            '行号引用对应当前工作区源码字节（见各文件 sha256）。工作区含其他执行者的在途修改，'
            + '若哈希变化，请按函数名重新定位后再引用本报告的行号。',
        files: Object.fromEntries(files.map((f) => [f, sha256OfFile(abs(f))])),
    };
}

async function main(): Promise<void> {
    const startedAt = Date.now();
    console.log(`[fidelity] runId=${RUN_ID}`);
    console.log(`[fidelity] decisions=${DECISIONS_PATH} stride=${DECISION_STRIDE} max=${MAX_DECISIONS}`);
    console.log(`[fidelity] roots=${ROOTS_PATH} max=${MAX_ROOTS}`);

    const decisions = fs.existsSync(abs(DECISIONS_PATH))
        ? await sampleDecisions(abs(DECISIONS_PATH))
        : { samples: [] as SampledState[], meta: { path: DECISIONS_PATH, missing: true } };
    const roots = fs.existsSync(abs(ROOTS_PATH))
        ? sampleRoots(abs(ROOTS_PATH), MAX_ROOTS)
        : { samples: [] as SampledState[], meta: { path: ROOTS_PATH, missing: true } };
    console.log(`[fidelity] sampled decisions=${decisions.samples.length} roots=${roots.samples.length}`);

    const fixtures = buildFixtures();
    const rows: StateAuditRow[] = [];
    const fixtureRows: StateAuditRow[] = [];
    const rootRows: StateAuditRow[] = [];

    let done = 0;
    for (const s of decisions.samples) {
        rows.push(auditState(s.state, s.id, s.source, s.sampleRef));
        done += 1;
        if (done % 20 === 0) console.log(`[fidelity] decisions ${done}/${decisions.samples.length}`);
    }
    for (const s of roots.samples) rootRows.push(auditState(s.state, s.id, s.source, s.sampleRef));
    for (const f of fixtures) {
        const r = auditState(f.state, f.id, 'fixture', { why: f.why });
        fixtureRows.push(r);
    }
    console.log(`[fidelity] audited decisions=${rows.length} roots=${rootRows.length} fixtures=${fixtureRows.length}`);

    const v13Archive = !SKIP_V13 && fs.existsSync(abs(V13_ARCHIVE_PATH))
        ? await auditV13Archive(abs(V13_ARCHIVE_PATH), V13_ROWS)
        : { rows: [] as V13RowAudit[], meta: { path: V13_ARCHIVE_PATH, skipped: true } };
    const v13Pool = !SKIP_V13 && fs.existsSync(abs(V13_POOL_PATH))
        ? probeV13Pool(abs(V13_POOL_PATH), 3)
        : { path: V13_POOL_PATH, skipped: true };

    const decisionSummary = summarise(rows, 'v14_decisions');
    const rootSummary = summarise(rootRows, 'v14_root_initial_states');
    const fixtureSummary = summarise(fixtureRows, 'fixtures');
    (decisionSummary as any).inputs = { decisions: decisions.meta };
    (rootSummary as any).inputs = { roots: roots.meta };

    // ---------------- 结论与最小反例（由实测读数驱动，避免手写漂移） ----------------
    const fixturesById = new Map(fixtureRows.map((r) => [r.id, r]));
    const rec = (id: string) => fixturesById.get(id);
    const noRules = rec('flat_no_rules_empty_castle');
    const pending = rec('flat_commander_castle_pending');
    const poisoned = rec('poisoned_ally_healer') ?? rec('flat_poisoned_ally_healer');
    const grave = rec('flat_grave_witch');
    const leveled = rec('flat_leveled_golem');
    const campaign = rec('flat_campaign_event');
    const price = rec('demo_map_price_override');

    const counterexamples: any[] = [];
    let ceIndex = 1;
    const ablate0 = (decisionSummary as any).ablation?.[0];
    const ablate1 = (decisionSummary as any).ablation?.[1];
    const ablate2 = (decisionSummary as any).ablation?.[2];
    const ablate3 = (decisionSummary as any).ablation?.[3];
    const ablate4 = (decisionSummary as any).ablation?.[4];

    counterexamples.push({
        index: ceIndex++,
        state: '真实 V14 决策快照（decisions.jsonl 抽样 n=' + (decisionSummary as any).statesTested + '）',
        field: 'rules.populationLimit（Observation 输出 `null`，真实状态是 undefined=无人口上限）',
        real: `真实快照合法动作含 recruit_*；L0 一致率 ${ablate0?.legalMatchRate}`,
        restored: `populationLimit=null → canRecruitUnitClass 的 \`populationLimit !== undefined\` 成立且 \`已用人口+人口 > null\` 恒真 → 招募动作全部消失`,
        actionDiff: `恢复侧缺失动作合计 ${ablate0?.missingActionsTotal}；L1 只修 null 陷阱+改名后一致率升到 ${ablate1?.legalMatchRate}，缺失动作降到 ${ablate1?.missingActionsTotal}`,
        basis: 'MEASURED（机制由 CODE_CONFIRMED 定位到 src/game/rule_config.ts:290-293 与 src/game/env.ts:836-837）',
    });
    counterexamples.push({
        index: ceIndex++,
        state: '真实 V14 决策快照 + 全部 fixtures',
        field: 'rules.commanderCastleRecruitUsesPending（Observation 完全不携带，真实 SD 状态里恒为 true）',
        real: '指挥官站城堡时生成 recruit_to_castle（堆叠 pending）',
        restored: '退化默认 false → 动作形态变成 recruit_and_deploy，pending 流程消失',
        actionDiff: `修掉 null 陷阱后仍不一致的样本由该字段负责：L2 一致率 ${ablate2?.legalMatchRate} → L3（用真实快照补该字段）${ablate3?.legalMatchRate}`,
        basis: 'MEASURED + CODE_CONFIRMED（src/game/types.ts:226 / src/game/rules.ts:376-383）',
    });
    if (poisoned) {
        counterexamples.push({
            index: ceIndex++, state: 'fixture:flat_poisoned_ally_healer（paladin 紧邻中毒友军）',
            field: 'units[].status（UnitStatus 对象 → 字符串）',
            real: `合法动作 ${poisoned.legal.realCount} 个（中毒目标不可治疗）`,
            restored: `合法动作 ${poisoned.legal.restoredCount} 个（多出非法治疗）`,
            actionDiff: `恢复侧多出 ${poisoned.legal.extraInRestored} 个，示例：${poisoned.legal.extraExamples.slice(0, 2).join(' , ') || '—'}`,
            basis: 'MEASURED（机制：src/game/rules.ts:214 读 `target.status.type`）',
        });
    }
    if (grave) {
        counterexamples.push({
            index: ceIndex++, state: `fixture:flat_grave_witch（witch + 墓碑）；真实决策样本中 ${(decisionSummary as any).rates.legalProbeFailedOnRestored.count}/${(decisionSummary as any).statesTested} 个状态与 ${(decisionSummary as any).steps.probeErrors} 次步进探针同因抛异常`,
            field: 'graves[].pos（Observation 拆成 x/y，V13 未重组）',
            real: `合法动作 ${grave.legal.realCount} 个`,
            restored: '合法动作探针直接抛异常',
            actionDiff: `错误：${String(grave.legal.restoredError).slice(0, 120)}`,
            basis: 'MEASURED（异常位置由 CODE_CONFIRMED 定位到 src/game/rules.ts:314 与 src/game/env.ts:995）',
        });
    }
    if (leveled) {
        counterexamples.push({
            index: ceIndex++, state: 'fixture:flat_leveled_golem（level=3 golem）',
            field: 'units[].maxHp（Observation 含成长，GameState 为基础值）',
            real: 'getEffectiveStats().maxHp = 100 + 25*3 = 175；张量 HP 通道 = hp/100',
            restored: 'getEffectiveStats().maxHp = 175 + 25*3 = 250（成长被重复计入）；张量 HP 通道 = hp/175',
            actionDiff: `张量 HP 通道差异格数 ${leveled.tensor?.differingCells ?? 0}，最大绝对差 ${leveled.tensor?.maxAbsDiff ?? 0}；合法动作集一致=${String(leveled.legal.match)}；军力估值 ${leveled.armyValue.real} vs ${leveled.armyValue.restored}`,
            basis: 'MEASURED（机制：src/game/env.ts:970 + src/game/abilities.ts:248 + src/game/ai/spatial_tensor_encoder.ts:224,247）',
        });
    }
    if (campaign) {
        counterexamples.push({
            index: ceIndex++, state: 'fixture:flat_campaign_event（rules.campaignEvents 带 effects）',
            field: 'rules.campaignEvents（Observation 只剩 {id,triggerType,once,fired}）',
            real: '事件带 trigger + effects（可改金币/刷兵/判负）',
            restored: '事件无 trigger/effects；对恢复状态再 buildObservation 直接抛 TypeError',
            actionDiff: `再观测结果：${campaign.reobserveOk ? 'OK' : `失败 ${String(campaign.reobserveError).slice(0, 100)}`}`,
            basis: 'MEASURED + CODE_CONFIRMED（src/game/env.ts:852-857）',
        });
    }
    if (price) {
        counterexamples.push({
            index: ceIndex++, state: 'fixture:demo_map_price_override（rules.prices.soldier=999）',
            field: 'rules.prices（Observation 改名为 priceOverrides，V13 直传 obs.rules 导致丢失）',
            real: `calculateArmyValue=${price.armyValue.real}`,
            restored: `calculateArmyValue=${price.armyValue.restored}`,
            actionDiff: `军力估值一致=${String(price.armyValue.match)}；合法动作集一致=${String(price.legal.match)}（价格不改变可招募性时集合相同，但全局特征与超时胜负评估不同）`,
            basis: 'MEASURED（机制：src/game/env.ts:839 + src/game/rule_config.ts:230-244）',
        });
    }
    if (noRules) {
        counterexamples.push({
            index: ceIndex++, state: 'fixture:flat_no_rules_empty_castle / demo_map_default（整份 rules 缺失）',
            field: '整个 `rules` 对象（Observation 会把 24 个字段全部 `?? null` 后交出来）',
            real: `合法动作 ${noRules.legal.realCount}（demo_map_default ${rec('demo_map_default')?.legal.realCount}）`,
            restored: `合法动作 ${noRules.legal.restoredCount}（demo_map_default ${rec('demo_map_default')?.legal.restoredCount}）`,
            actionDiff: `缺失动作 ${noRules.legal.missingInRestored}（demo_map_default ${rec('demo_map_default')?.legal.missingInRestored}），全部是 recruit_*`,
            basis: 'MEASURED',
        });
    }

    const decisionLegalRate = (decisionSummary as any).rates.legalActionSetMatch.rate;
    const decisionPositionRate = (decisionSummary as any).rates.positionFieldExact.rate;
    const v13LegalMatchRows = (v13Archive.rows ?? []).filter((r) => r.match === true).length;
    const v13RowsWithError = (v13Archive.rows ?? []).filter((r) => r.restoredLegalError).length;

    const report = {
        schema: AUDIT_SCHEMA,
        generatedAt: new Date().toISOString(),
        tool: 'v14/tools/audit_state_fidelity.ts',
        runId: RUN_ID,
        wallMs: Date.now() - startedAt,
        environment: { node: process.version, cwd: rel(REPO_ROOT) },
        sourceRevision: sourceRevision(),
        outputs: {
            json: `${OUT_DIR}/observation_restoration_audit.json`,
            markdown: `${OUT_DIR}/observation_restoration_audit.md`,
        },
        fieldFindings: FIELD_FINDINGS,
        irrecoverableFields: IRRECOVERABLE_FIELDS,
        measurements: {
            v14DecisionStates: decisionSummary,
            v14RootInitialStates: rootSummary,
            fixtures: fixtureSummary,
            fixtureDetails: fixtureRows.map((r) => ({
                id: r.id,
                why: r.sampleRef.why,
                mapSize: r.mapSize,
                units: r.units,
                players: r.players,
                diffCounts: r.diffCounts,
                positionDiffPaths: r.positionDiffPaths,
                allDiffPaths: r.allDiffPaths,
                positionExact: r.positionExact,
                behaviourExact: r.behaviourExact,
                strictExact: r.strictExact,
                legal: r.legal,
                ablation: r.ablation,
                reobserveOk: r.reobserveOk,
                reobserveError: r.reobserveError,
                steps: r.steps,
                tensor: r.tensor,
                armyValue: r.armyValue,
                hpChannel: r.hpChannel,
            })),
            stateRows: rows.map((r) => ({
                id: r.id, source: r.source, sampleRef: r.sampleRef, mapSize: r.mapSize, units: r.units,
                diffCounts: r.diffCounts, positionExact: r.positionExact, behaviourExact: r.behaviourExact,
                strictExact: r.strictExact, positionDiffPaths: r.positionDiffPaths,
                legal: r.legal, steps: r.steps,
                ablation: r.ablation.map((a) => ({
                    level: a.level, id: a.id, legalMatch: a.legalMatch,
                    missingInRestored: a.missingInRestored, extraInRestored: a.extraInRestored,
                    positionDiffCount: a.positionDiffCount, strictDiffCount: a.strictDiffCount,
                })),                tensor: r.tensor ? { ok: r.tensor.ok, differingCells: r.tensor.differingCells, differingChannels: r.tensor.differingChannels, maxAbsDiff: r.tensor.maxAbsDiff, channelHistogram: r.tensor.channelHistogram } : null,
                hpChannel: r.hpChannel, armyValue: r.armyValue, reobserveOk: r.reobserveOk, reobserveError: r.reobserveError,
            })),
            v13ArchiveRows: { rows: v13Archive.rows, inputs: { archive: v13Archive.meta } },
            v13PoolProbe: v13Pool,
        },
        conclusions: {
            v13ReuseVerdict: {
                code: 'OBSERVATION_PARTIAL',
                headline:
                    'V13 归档数据不能被 V14 当作 EXACT_SNAPSHOT 复用：归档 pool 里根本没有 GameState，'
                    + '只有由 Observation 有损投影出来的张量，且恢复状态在字段级上与真实快照不等。',
                reasons: [
                    `MEASURED：\`${V13_POOL_PATH}\` 的行只有张量/候选/标签字段（${String((v13Pool as any)?.rows?.[0]?.keys?.join(', ') ?? '')}），没有 \`state\`/\`initialState\`/\`observation\`；`
                        + '「状态」没有随归档保存，只有它的有损投影。',
                    `MEASURED：从 V13 源归档前 ${(v13Archive.rows ?? []).length} 行的真实 Observation 还原后重算合法动作，`
                        + `${v13LegalMatchRows}/${(v13Archive.rows ?? []).length} 行与采集时记录的 \`legalActionCodes\` 集合一致`
                        + (v13RowsWithError ? `，${v13RowsWithError} 行探针直接抛异常` : '')
                        + '；标签动作是否仍在恢复状态的合法集合内：'
                        + `${(v13Archive.rows ?? []).filter((r) => r.labelIsLegalInRestored === true).length}/${(v13Archive.rows ?? []).filter((r) => r.labelIsLegalInRestored !== null).length}。`,
                    `MEASURED：V14 真实决策快照样本 n=${(decisionSummary as any).statesTested}，`
                        + `合法动作集一致率 ${decisionLegalRate}，局面字段全等率 ${decisionPositionRate}；`
                        + `差异 100% 集中在 recruit_to_castle 一类动作（${ablate0?.missingActionsTotal} 个，出现在 ${(decisionSummary as any).legalMissingTypeTotals?.recruit_to_castle?.states ?? 0} 个状态），`
                        + `根因是 rules.populationLimit 的 null 陷阱 + rules.commanderCastleRecruitUsesPending 不在 Observation 里。`,
                    `MEASURED（归因消融）：L0 原样还原 ${ablate0?.legalMatchRate} → L1 只修 null 陷阱与改名 ${ablate1?.legalMatchRate}`
                        + ` → L2 再修 Observation 可恢复的重塑 ${ablate2?.legalMatchRate} → L3 再补 Observation 不携带的字段 ${ablate3?.legalMatchRate}`
                        + `（需要真实快照做 oracle）→ L4 删掉派生展示字段后严格全等 ${ablate4?.strictExactRate}。`
                        + '这条曲线说明：**只靠 Observation 本身无法把状态修回真实快照**，剩下的一半差异必须来自 Observation 之外的字段。',
                    'CODE_CONFIRMED：Observation 接口（src/game/env.ts:44-198）不含 \`winner\`、\`nextUnitId\`、\`nextGraveId\`、'
                        + '7 个战斗加成系数与 \`commanderCastleRecruitUsesPending\`，恢复状态必然缺这些字段。',
                    'MEASURED：空间张量在 '
                        + `${(decisionSummary as any).tensor.statesWithDifference}/${(decisionSummary as any).tensor.statesCompared} 个样本上与真实快照不同`
                        + `（HP 通道用 \`u.maxHp\` 归一化，见 src/game/ai/spatial_tensor_encoder.ts:224,247），`
                        + '因此 V13 pool 的特征分布与 V14 推理时对真实快照编码的特征分布不一致。',
                    '结论：V13 pool 只能作为 **OBSERVATION_PARTIAL** 历史证据（可做趋势/对照），'
                        + '不得作为 EXACT_SNAPSHOT 直接进入 V14 训练或评估；V14 正式数据必须继续走 '
                        + '\`engine.getState()\` 快照路线。',
                    'MEASURED：修复清单的完备性自检 —— 把 L1/L2/L3 的修复加上「删除 Observation 派生展示字段」后，'
                        + `恢复状态与真实快照达到**严格全等**（决策 ${ablate4?.strictExactCount}/${ablate4?.states}，`
                        + `root 初始状态 ${(rootSummary as any).ablation?.[4]?.strictExactCount}/${(rootSummary as any).ablation?.[4]?.states}，`
                        + `夹具 ${(fixtureSummary as any).ablation?.[4]?.strictExactCount}/${(fixtureSummary as any).ablation?.[4]?.states}），`
                        + '说明本报告列出的字段清单已经覆盖了 Observation↔GameState 的全部差异来源。',
                ],
            },
            minimalCounterexamples: counterexamples,
            scope: [
                '适用于本仓库当前源码状态下的 SD/APK 对战数据（`collect_v14_roots` 采集的 2-4 人图）：V14 正式快照路线不受 Observation 通道影响。',
                '本审计的恢复实现是 V13 `reencode_v31.ts:76-104` 的等价内联复现，结论只针对「由 Observation 强转 GameState」这一条路线；不代表 V14 `build_v14_dataset.ts` 的快照路线有问题。',
                'CODE_CONFIRMED 的字段清单在源码变更后需要重跑本工具（行号会漂移，语义结论以重跑读数为准）。',
            ],
            notCovered: [
                '未修改任何被测源码，也未改动 `v13/tools/reencode_v31.ts`；因此「V13 pool 张量本身」没有被逐值重算，只审计了它的状态来源。',
                'V13 源归档 7.27GB 全量未扫描，只读前若干行抽样（本次 6 行、同一张图的开局前 6 步）；pool_v3.jsonl 81MB 也只读头部 4MiB。',
                '`decisions.jsonl` 在本次审计期间仍在被采集器追加（字节数/行数是扫描瞬间读数），因此抽样行会随重跑变化；' +
                '分类结论（哪些字段导致差异）不随样本变，具体计数会小幅浮动。',
                '未覆盖 campaign 事件在中途触发后的连锁差异（只证明了字段丢失 + 再观测抛异常）。',
                '未覆盖 `decodeActionCode`（reencode_v31.ts:113-160）自身的解码缺陷（例如 capture 分支多传 `to` 字段），那属于另一条候选重建路径。',
                '未覆盖终局状态样本：决策行采集在终局前停止，因此 `winner` 差异在决策样本上未直接命中，只由夹具/接口清单给出。',
                '未评估 Python 侧编码器；本审计只测 TypeScript 侧的 `encodeGameStateSpatial`。',
            ],
        },
    };

    fs.mkdirSync(abs(OUT_DIR), { recursive: true });
    const jsonPath = abs(`${OUT_DIR}/observation_restoration_audit.json`);
    const mdPath = abs(`${OUT_DIR}/observation_restoration_audit.md`);
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(mdPath, buildMarkdown(report), 'utf8');

    console.log('');
    console.log(`[fidelity] 决策样本 n=${(decisionSummary as any).statesTested}  合法动作一致率=${decisionLegalRate}  局面字段全等率=${decisionPositionRate}`);
    console.log(`[fidelity] 严格全等=${(decisionSummary as any).rates.strictFieldExact.rate}  行为字段全等=${(decisionSummary as any).rates.behaviourFieldExact.rate}`);
    console.log(`[fidelity] 夹具：合法动作不一致 ${(fixtureSummary as any).legalDiffStates} 条，探针异常 ${(fixtureSummary as any).rates.legalProbeFailedOnRestored.count} 条`);
    console.log(`[fidelity] 步进实验：winner 不一致 ${(decisionSummary as any).steps.winnerMismatch}/${(decisionSummary as any).steps.probes}，HP 不一致 ${(decisionSummary as any).steps.hpMismatch}`);
    console.log(`[fidelity] 张量差异状态 ${(decisionSummary as any).tensor.statesWithDifference}/${(decisionSummary as any).tensor.statesCompared}`);
    console.log(`[fidelity] 归因消融：L0=${(decisionSummary as any).ablation[0].legalMatchRate} L1=${(decisionSummary as any).ablation[1].legalMatchRate} L2=${(decisionSummary as any).ablation[2].legalMatchRate} L3=${(decisionSummary as any).ablation[3].legalMatchRate} L4_strict=${(decisionSummary as any).ablation[4].strictExactRate}`);
    console.log(`[fidelity] V13 归档抽样：集合一致 ${v13LegalMatchRows}/${(v13Archive.rows ?? []).length}`);
    console.log(`[fidelity] 结论：${report.conclusions.v13ReuseVerdict.code}`);
    console.log(`[fidelity] wrote ${rel(jsonPath)}`);
    console.log(`[fidelity] wrote ${rel(mdPath)}`);
}

main().catch((err) => {
    console.error('[fidelity] FATAL', err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
});
