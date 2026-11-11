/**
 * 2026-10-21 评测：HeuristicAI / BattleSearchV2AI 分别对阵 OriginalApkLikeHardAI。
 *
 * 协议：
 * - 5 张 1v1 官方图：Duel、Crossed swords、Mourningstar、Liberty Port、The Crossing；
 * - 每张图正反手各一局，共 10 局/主角；
 * - 主角与对手使用相同地图、相同座位、相同种子；
 * - 每个动作执行前用 `encodeAction` 严格核对 `getLegalActions`，不把截断/错误算作胜利；
 * - 困难版 AI 指项目中的 APK 规则移植，不代表 Android 运行时逐动作等价。
 * - 默认保存逐步轨迹，并在开局、收尾记录引擎/策略/地图依赖源码 SHA-256。
 *
 * 运行：node --import tsx tools/arena_original_apk_hard_20261021.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { GameEngine } from '../src/game/engine';
import { parseAppApkSkirmishMap } from '../src/game/apk_skirmish_map_assets';
import { createApkSkirmishGameState } from '../src/game/apk_skirmish';
import { encodeAction } from '../src/game/env';
import { getAllianceId, getUnitCost, isCommanderUnit } from '../src/game/rule_config';
import { getEffectiveStats } from '../src/game/abilities';
import { UNIT_CONFIGS } from '../src/game/constants';
import { getTileTerrainKey } from '../src/game/terrain_rules';
import type { Action, GameState } from '../src/game/types';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { BattleSearchV2AI } from '../src/game/ai/battle_search_v2_ai';
import { OriginalApkLikeHardAI } from '../src/game/ai/original_apk_like_hard_ai';

type Protagonist = 'heuristic' | 'battle_search_v2';
type Outcome = '主角胜' | '困难版胜' | '自然平局' | '步数/回合截断' | '运行错误';

interface GameSpec {
    protagonist: Protagonist;
    mapName: string;
    seat: number;
    seed: number;
    maxSteps: number;
    maxRounds: number;
}

interface ArmySnapshot {
    player: number;
    units: number;
    hp: number;
    material: number;
    gold: number;
    castles: number;
    villages: number;
    commanders: Array<{ hp: number; maxHp: number; level: number }>;
}

interface LatencySnapshot {
    decisions: number;
    totalMs: number;
    meanMs: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
}

interface TraceEntry {
    step: number;
    playerId: number;
    policy: 'protagonist' | 'hard';
    turn: number;
    actionCode: string;
    action: Action;
    actorClass?: string;
    latencyMs: number;
    units: number;
    legal: boolean;
    executed: boolean;
    beforeStateSha256: string;
    afterStateSha256?: string;
    engineInfo?: string;
}

interface HardTelemetrySnapshot {
    runtimeDecisions: number;
    nativeFallbacks: number;
    rejectedPlans: number;
    runtimeErrors: number;
    lastFallbackReason: string | null;
}

interface GameResult extends GameSpec {
    id: string;
    protagonistPlayer: number;
    opponentPlayer: number;
    protagonistAlliance: number;
    opponentAlliance: number;
    winner: number | null;
    outcome: Outcome;
    steps: number;
    endTurn: number;
    completedRounds: number;
    elapsedSeconds: number;
    cutoff: string | null;
    error: string | null;
    strictActions: number;
    illegalActions: number;
    protagonistArmy: ArmySnapshot;
    opponentArmy: ArmySnapshot;
    protagonistLatency: LatencySnapshot;
    opponentLatency: LatencySnapshot;
    v2Telemetry: { queued: number; veto: number; takeover: number; decisions: number; maxMs: number } | null;
    hardTelemetry: HardTelemetrySnapshot;
    actionCounts: {
        protagonist: Record<string, number>;
        hard: Record<string, number>;
    };
    peakUnits: { protagonist: number; hard: number };
    initialStateSha256: string;
    finalStateSha256: string;
    traceFile?: string;
    traceEntries?: number;
    trace?: TraceEntry[];
}

const MAPS = [
    '(2) Duel.aem',
    '(2) Crossed swords.aem',
    '(2) Mourningstar.aem',
    '(2) Liberty Port.aem',
    '(2) The Crossing.aem',
] as const;

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO_DIR, 'deliverables', 'original_apk_hard_20261021', 'arena');
// 30 单位规模的 1v1 如果只给 1200 个原子动作，很容易在收尾前被截断；
// 默认放宽到 4000 步/120 回合，仍把截断和自然胜负分开统计。
const MAX_STEPS = Number(process.env.ARENA_MAX_STEPS ?? 4000);
const MAX_ROUNDS = Number(process.env.ARENA_MAX_ROUNDS ?? 120);
const TRACE_ENABLED = process.env.ARENA_TRACE !== '0';

interface SourceEntry {
    path: string;
    sha256: string;
    bytes: number;
}

interface SourceManifest {
    capturedAt: string;
    sha256: string;
    files: SourceEntry[];
    unresolvedRelativeImports: string[];
}

interface SourceIntegrity {
    unchanged: boolean;
    beforeSha256: string;
    afterSha256: string;
    changedFiles: Array<{ path: string; change: '新增' | '删除' | '内容变更' }>;
    unresolvedRelativeImports: string[];
}

function sha256(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
}

/** 只沿本工具的本地依赖建立清单，不扫描训练目录或其他工作区。 */
function captureSourceManifest(snapshotDirectory?: string): SourceManifest {
    const pending = [fileURLToPath(import.meta.url)];
    const visited = new Set<string>();
    const files: SourceEntry[] = [];
    const unresolved = new Set<string>();
    while (pending.length > 0) {
        const absolute = pending.pop()!;
        const relative = path.relative(REPO_DIR, absolute).replace(/\\/g, '/');
        if (visited.has(absolute)) continue;
        visited.add(absolute);
        if (relative.startsWith('../') || relative.startsWith('ai_training/')) {
            unresolved.add(`禁止读取范围：${relative}`);
            continue;
        }
        if (!fs.existsSync(absolute)) {
            unresolved.add(`缺失源码：${relative}`);
            continue;
        }
        const bytes = fs.readFileSync(absolute);
        files.push({ path: relative, sha256: sha256(bytes), bytes: bytes.byteLength });
        if (snapshotDirectory) {
            const frozenPath = path.join(snapshotDirectory, relative);
            fs.mkdirSync(path.dirname(frozenPath), { recursive: true });
            fs.writeFileSync(frozenPath, bytes);
        }
        if (!/\.[cm]?[jt]sx?$/.test(absolute)) continue;
        const imports = ts.preProcessFile(bytes.toString('utf8'), true, true).importedFiles;
        for (const imported of imports) {
            const name = imported.fileName;
            if (!name.startsWith('.')) continue;
            const base = path.resolve(path.dirname(absolute), name);
            const candidates = [base, ...['.ts', '.tsx', '.json', '.js', '.mjs'].map(extension => base + extension),
                ...['index.ts', 'index.tsx', 'index.js'].map(file => path.join(base, file))];
            const resolved = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
            if (resolved) pending.push(resolved);
            else unresolved.add(`${relative} -> ${name}`);
        }
    }
    files.sort((left, right) => left.path.localeCompare(right.path));
    const unresolvedRelativeImports = [...unresolved].sort();
    return {
        capturedAt: new Date().toISOString(),
        sha256: sha256(JSON.stringify({ files, unresolvedRelativeImports })),
        files,
        unresolvedRelativeImports,
    };
}

function compareSources(before: SourceManifest, after: SourceManifest): SourceIntegrity {
    const beforeFiles = new Map(before.files.map(file => [file.path, file.sha256]));
    const afterFiles = new Map(after.files.map(file => [file.path, file.sha256]));
    const changedFiles: SourceIntegrity['changedFiles'] = [];
    for (const file of [...new Set([...beforeFiles.keys(), ...afterFiles.keys()])].sort()) {
        if (!beforeFiles.has(file)) changedFiles.push({ path: file, change: '新增' });
        else if (!afterFiles.has(file)) changedFiles.push({ path: file, change: '删除' });
        else if (beforeFiles.get(file) !== afterFiles.get(file)) changedFiles.push({ path: file, change: '内容变更' });
    }
    const unresolvedRelativeImports = [...new Set([
        ...before.unresolvedRelativeImports, ...after.unresolvedRelativeImports,
    ])].sort();
    return {
        unchanged: before.sha256 === after.sha256 && unresolvedRelativeImports.length === 0,
        beforeSha256: before.sha256,
        afterSha256: after.sha256,
        changedFiles,
        unresolvedRelativeImports,
    };
}

function actorIdOf(action: Action): string | undefined {
    switch (action.type) {
        case 'move':
        case 'post_attack_move':
        case 'capture':
        case 'repair':
        case 'wait':
        case 'destroy_town':
            return action.unitId;
        case 'attack':
            return action.attackerId;
        case 'heal':
            return action.healerId;
        case 'support':
            return action.supporterId;
        case 'summon':
            return action.summonerId;
        default:
            return undefined;
    }
}

function arenaRng(seed: number): () => number {
    let value = seed >>> 0;
    return () => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value / 4294967296;
    };
}

function snapshot(state: GameState, playerId: number): ArmySnapshot {
    const units = state.units.filter(unit => unit.ownerId === playerId && unit.hp > 0);
    let castles = 0;
    let villages = 0;
    for (const row of state.map.tiles) {
        for (const tile of row) {
            if (tile.ownerId !== playerId) continue;
            const key = getTileTerrainKey(tile);
            if (key === 'castle') castles += 1;
            else if (key === 'town') villages += 1;
        }
    }
    return {
        player: playerId,
        units: units.length,
        hp: units.reduce((sum, unit) => sum + unit.hp, 0),
        material: Math.round(units.reduce((sum, unit) => (
            sum + (getUnitCost(state, playerId, unit.unitClass) ?? UNIT_CONFIGS[unit.unitClass].cost ?? 0)
            * unit.hp / Math.max(1, getEffectiveStats(unit).maxHp)
        ), 0) * 10) / 10,
        gold: state.players.find(player => player.id === playerId)?.gold ?? 0,
        castles,
        villages,
        commanders: units.filter(unit => isCommanderUnit(state, unit)).map(unit => ({
            hp: unit.hp,
            maxHp: getEffectiveStats(unit).maxHp,
            level: unit.level ?? 0,
        })),
    };
}

function latency(times: number[]): LatencySnapshot {
    const ordered = [...times].sort((left, right) => left - right);
    const percentile = (p: number) => ordered[Math.max(0, Math.ceil(ordered.length * p) - 1)] ?? 0;
    const totalMs = times.reduce((sum, value) => sum + value, 0);
    return {
        decisions: times.length,
        totalMs,
        meanMs: totalMs / Math.max(1, times.length),
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        maxMs: ordered.at(-1) ?? 0,
    };
}

function makeSpecs(): GameSpec[] {
    const specs: GameSpec[] = [];
    for (const protagonist of ['heuristic', 'battle_search_v2'] as const) {
        for (let mapIndex = 0; mapIndex < MAPS.length; mapIndex += 1) {
            for (const seat of [0, 1]) {
                specs.push({
                    protagonist,
                    mapName: MAPS[mapIndex],
                    seat,
                    seed: 20261021 + mapIndex * 100 + seat * 1009,
                    maxSteps: MAX_STEPS,
                    maxRounds: MAX_ROUNDS,
                });
            }
        }
    }
    return specs;
}

async function runGame(spec: GameSpec): Promise<GameResult> {
    const map = parseAppApkSkirmishMap(spec.mapName);
    const ids = [...map.playerIds].sort((left, right) => left - right);
    if (ids.length !== 2) throw new Error(`${spec.mapName} 不是 1v1 地图：${ids.length} 名玩家`);
    const initial = createApkSkirmishGameState(map, { mode: 'SD', mapName: spec.mapName });
    const protagonistPlayer = ids[spec.seat];
    const opponentPlayer = ids[1 - spec.seat];
    const protagonistAlliance = getAllianceId(initial, protagonistPlayer);
    const opponentAlliance = getAllianceId(initial, opponentPlayer);
    if (protagonistAlliance === opponentAlliance) throw new Error('主角与对手在同一联盟');

    const protagonistAi = spec.protagonist === 'heuristic'
        ? new HeuristicAI(arenaRng(spec.seed + protagonistPlayer * 1009))
        : new BattleSearchV2AI(spec.seed + protagonistPlayer * 1009);
    const opponentAi = new OriginalApkLikeHardAI({ rng: arenaRng(spec.seed + opponentPlayer * 1009) });
    const engine = new GameEngine(initial);
    const protagonistTimes: number[] = [];
    const opponentTimes: number[] = [];
    const v2Telemetry = { queued: 0, veto: 0, takeover: 0, decisions: 0, maxMs: 0 };
    const actionCounts = {
        protagonist: {} as Record<string, number>,
        hard: {} as Record<string, number>,
    };
    const peakUnits = {
        protagonist: initial.units.filter(unit => unit.ownerId === protagonistPlayer && unit.hp > 0).length,
        hard: initial.units.filter(unit => unit.ownerId === opponentPlayer && unit.hp > 0).length,
    };
    const trace: TraceEntry[] | undefined = TRACE_ENABLED ? [] : undefined;
    const initialStateSha256 = sha256(JSON.stringify(initial));

    let state = engine.getState();
    let steps = 0;
    let strictActions = 0;
    let illegalActions = 0;
    let error: string | null = null;
    const start = performance.now();

    try {
        while (state.winner === null && steps < spec.maxSteps && state.turn - initial.turn < spec.maxRounds) {
            const playerId = state.currentPlayer;
            const isProtagonist = playerId === protagonistPlayer;
            const legal = engine.getLegalActions(playerId);
            if (legal.length === 0) throw new Error(`玩家 ${playerId} 无合法动作`);
            const t0 = performance.now();
            const action: Action = isProtagonist
                ? protagonistAi.getAction(engine, playerId, legal)
                : opponentAi.getAction(engine, playerId);
            const elapsedMs = performance.now() - t0;
            if (isProtagonist) {
                protagonistTimes.push(elapsedMs);
                if (protagonistAi instanceof BattleSearchV2AI) {
                    v2Telemetry.decisions += 1;
                    v2Telemetry.queued += Number(protagonistAi.telemetry.queued);
                    v2Telemetry.veto += Number(protagonistAi.telemetry.veto);
                    v2Telemetry.takeover += Number(protagonistAi.telemetry.takeover);
                    v2Telemetry.maxMs = Math.max(v2Telemetry.maxMs, protagonistAi.telemetry.elapsedMs);
                }
            } else {
                opponentTimes.push(elapsedMs);
            }

            const legalCodes = new Set(legal.map(encodeAction));
            const actionCode = encodeAction(action);
            const isLegal = legalCodes.has(actionCode);
            const side = isProtagonist ? 'protagonist' : 'hard';
            const actorId = actorIdOf(action);
            const traceEntry: TraceEntry | undefined = trace ? {
                step: steps,
                playerId,
                policy: side,
                turn: state.turn,
                action: structuredClone(action),
                actionCode,
                actorClass: actorId ? state.units.find(unit => unit.id === actorId)?.unitClass : undefined,
                latencyMs: elapsedMs,
                units: state.units.filter(unit => unit.ownerId === playerId && unit.hp > 0).length,
                legal: isLegal,
                executed: false,
                beforeStateSha256: sha256(JSON.stringify(state)),
            } : undefined;
            if (traceEntry) trace!.push(traceEntry);
            if (!isLegal) {
                illegalActions += 1;
                throw new Error(`玩家 ${playerId} 返回非法动作 ${actionCode}`);
            }
            strictActions += 1;
            actionCounts[side][action.type] = (actionCounts[side][action.type] ?? 0) + 1;
            const result = engine.step(action);
            if (traceEntry) {
                traceEntry.engineInfo = result.info;
                traceEntry.afterStateSha256 = sha256(JSON.stringify(result.state));
            }
            if (/非法动作|Invalid|Illegal/i.test(result.info)) throw new Error(result.info);
            if (traceEntry) traceEntry.executed = true;
            state = result.state;
            steps += 1;
            peakUnits.protagonist = Math.max(peakUnits.protagonist, state.units.filter(unit => unit.ownerId === protagonistPlayer && unit.hp > 0).length);
            peakUnits.hard = Math.max(peakUnits.hard, state.units.filter(unit => unit.ownerId === opponentPlayer && unit.hp > 0).length);
            if (steps % 100 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
    }

    const winner = state.winner;
    if (winner !== null && winner !== -1
        && winner !== protagonistAlliance && winner !== opponentAlliance && error === null) {
        error = `引擎返回非本局联盟的胜者 ${winner}`;
    }
    const truncated = winner === null && error === null;
    const outcome: Outcome = error
        ? '运行错误'
        : truncated
            ? '步数/回合截断'
            : winner === -1
                ? '自然平局'
                : winner === protagonistAlliance
                    ? '主角胜'
                    : winner === opponentAlliance
                        ? '困难版胜'
                        : '自然平局';
    const elapsedSeconds = (performance.now() - start) / 1000;
    return {
        ...spec,
        id: `${spec.protagonist}-${spec.mapName.replace(/^\(2\) |\.aem$/g, '').replace(/\s+/g, '_')}-seat${spec.seat}`,
        protagonistPlayer,
        opponentPlayer,
        protagonistAlliance,
        opponentAlliance,
        winner,
        outcome,
        steps,
        endTurn: state.turn,
        completedRounds: state.turn - initial.turn,
        elapsedSeconds,
        cutoff: truncated ? (steps >= spec.maxSteps ? '原子步上限' : '完整回合上限') : null,
        error,
        strictActions,
        illegalActions,
        protagonistArmy: snapshot(state, protagonistPlayer),
        opponentArmy: snapshot(state, opponentPlayer),
        protagonistLatency: latency(protagonistTimes),
        opponentLatency: latency(opponentTimes),
        v2Telemetry: spec.protagonist === 'battle_search_v2' ? v2Telemetry : null,
        hardTelemetry: { ...opponentAi.telemetry },
        actionCounts,
        peakUnits,
        initialStateSha256,
        finalStateSha256: sha256(JSON.stringify(state)),
        trace,
    };
}

function pct(value: number, total: number): string {
    return total === 0 ? '-' : `${((value / total) * 100).toFixed(1)}%`;
}

function fmt(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function aggregate(results: GameResult[]) {
    const count = (outcome: Outcome) => results.filter(result => result.outcome === outcome).length;
    const natural = results.filter(result => result.outcome === '主角胜' || result.outcome === '困难版胜' || result.outcome === '自然平局');
    const wins = count('主角胜');
    const losses = count('困难版胜');
    const draws = count('自然平局');
    const truncated = count('步数/回合截断');
    const errors = count('运行错误');
    return {
        games: results.length,
        wins,
        losses,
        draws,
        truncated,
        errors,
        naturalGames: natural.length,
        winRateAll: pct(wins, results.length),
        winRateNatural: pct(wins, natural.length),
        strictActions: results.reduce((sum, result) => sum + result.strictActions, 0),
        illegalActions: results.reduce((sum, result) => sum + result.illegalActions, 0),
        totalSeconds: results.reduce((sum, result) => sum + result.elapsedSeconds, 0),
        hardTelemetry: {
            runtimeDecisions: results.reduce((sum, result) => sum + result.hardTelemetry.runtimeDecisions, 0),
            nativeFallbacks: results.reduce((sum, result) => sum + result.hardTelemetry.nativeFallbacks, 0),
            rejectedPlans: results.reduce((sum, result) => sum + result.hardTelemetry.rejectedPlans, 0),
            runtimeErrors: results.reduce((sum, result) => sum + result.hardTelemetry.runtimeErrors, 0),
            gamesWithFallback: results.filter(result => result.hardTelemetry.nativeFallbacks > 0).length,
        },
    };
}

function renderMatchup(title: string, results: GameResult[]): string {
    const lines: string[] = [];
    const summary = aggregate(results);
    lines.push(`## ${title}`, '');
    const mapCount = new Set(results.map(result => result.mapName)).size;
    lines.push(`- 实际对局：**${summary.games}**，覆盖 **${mapCount}** 张地图；完整计划为 5 图 × 正反手。`);
    lines.push(`- 自然结果：主角胜 **${summary.wins}** / 困难版胜 **${summary.losses}** / 平局 **${summary.draws}**`);
    lines.push(`- 截断：**${summary.truncated}**；运行错误：**${summary.errors}**`);
    lines.push(`- 全部对局胜率：**${summary.winRateAll}**；自然局胜率：**${summary.winRateNatural}**`);
    lines.push(`- strict 合法动作：**${summary.strictActions}**；非法动作：**${summary.illegalActions}**`);
    lines.push('');
    lines.push('| 地图 | 主角席位 | 结果 | 步数 | 回合 | 主角终局（单位/HP/材料/金/城/村） | 困难版终局（单位/HP/材料/金/城/村） | 主角 p95 | 困难版 p95 |');
    lines.push('|---|---:|---|---:|---:|---|---|---:|---:|');
    for (const result of results) {
        const p = result.protagonistArmy;
        const o = result.opponentArmy;
        lines.push(`| ${result.mapName.replace(/\.aem$/, '')} | P${result.protagonistPlayer} | ${result.outcome}${result.cutoff ? `（${result.cutoff}）` : ''} | ${result.steps} | ${result.completedRounds} | ${p.units}/${p.hp}/${fmt(p.material)}/${p.gold}/${p.castles}/${p.villages} | ${o.units}/${o.hp}/${fmt(o.material)}/${o.gold}/${o.castles}/${o.villages} | ${result.protagonistLatency.p95Ms.toFixed(1)}ms | ${result.opponentLatency.p95Ms.toFixed(1)}ms |`);
    }
    lines.push('');
    const crossed = results.filter(result => result.mapName === '(2) Crossed swords.aem');
    if (crossed.length > 0) {
        lines.push('**Crossed swords 明细：**');
        for (const result of crossed) {
            lines.push(`- P${result.protagonistPlayer} 主角：${result.outcome}，${result.steps} 步，${result.completedRounds} 回合，winner=${result.winner}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

function renderReport(
    results: GameResult[],
    sourceIntegrity: SourceIntegrity,
    selectedSpecs: GameSpec[],
    fatalError: string | null,
): string {
    const heuristic = results.filter(result => result.protagonist === 'heuristic');
    const v2 = results.filter(result => result.protagonist === 'battle_search_v2');
    const sourceStatus = sourceIntegrity.unchanged
        ? '开局与收尾的全部本地依赖 SHA-256 一致。'
        : '检测到源码变化或依赖清单缺口，本批结果需结合清单复核。';
    const traceCount = results.reduce((sum, result) => sum + (result.traceEntries ?? 0), 0);
    const actionTotals = { protagonist: {} as Record<string, number>, hard: {} as Record<string, number> };
    const hardTelemetryTotals = {
        runtimeDecisions: 0, nativeFallbacks: 0, rejectedPlans: 0, runtimeErrors: 0,
    };
    for (const result of results) {
        for (const key of Object.keys(hardTelemetryTotals) as Array<keyof typeof hardTelemetryTotals>) {
            hardTelemetryTotals[key] += result.hardTelemetry[key];
        }
        for (const side of ['protagonist', 'hard'] as const) {
            for (const [action, count] of Object.entries(result.actionCounts[side])) {
                actionTotals[side][action] = (actionTotals[side][action] ?? 0) + count;
            }
        }
    }
    const lines = [
        '# HeuristicAI / BattleSearchV2AI vs Original-APKlikeAI-Hard（2026-10-21）',
        '',
        '> 对手为项目中的 `OriginalApkLikeHardAI`。本报告记录项目权威引擎内的对局；APK 静态规则移植的证据和适用边界见本次困难 AI 分析报告。',
        '',
        '## 协议',
        '',
        `- 地图：${MAPS.map(name => `\`${name}\``).join('、')}`,
        `- 完整计划：每个主角 5 图 × 双方交换席位，共 10 局/主角、20 局合计；本次选定 ${selectedSpecs.length} 局，已记录 ${results.length} 局。`,
        '- 顺序执行；同图、同主角席位的两个主角使用相同种子，双方随机流由种子和玩家编号独立派生。',
        `- 上限：${MAX_STEPS} 个原子动作 / ${MAX_ROUNDS} 个完整回合；截断和自然胜负分开统计，截断不算胜利。`,
        '- 每个动作先通过 `encodeAction` 与 `getLegalActions` 严格核对；非法动作立即终止该局并标记运行错误。',
        `- 逐步轨迹：${TRACE_ENABLED ? '启用' : '关闭'}；已保存 ${traceCount} 条，包含动作、合法性、执行状态及前后状态摘要。`,
        '- 环境筛选参数和全部种子保存在 summary.json；自然结果以引擎 winner 为准，不根据终局材料估计胜负。',
        '- BattleSearchV2AI 使用默认 180ms 协作式预算；墙钟截止受机器负载影响，固定种子不能保证不同负载下逐动作完全一致。',
        '',
        '## 源码一致性',
        '',
        `- ${sourceStatus}`,
        `- 开局清单：\`${sourceIntegrity.beforeSha256}\`；收尾清单：\`${sourceIntegrity.afterSha256}\`。`,
        '- 清单：source-manifest-before.json / source-manifest-after.json；开局源码副本位于 source-freeze/，只包含本工具的本地导入依赖。',
        '- 清单比较只能发现开局与收尾的差异，无法发现中途修改后又恢复原样的情况。',
        ...sourceIntegrity.changedFiles.map(file => `- ${file.change}：\`${file.path}\``),
        ...sourceIntegrity.unresolvedRelativeImports.map(value => `- 未完整追踪：${value}`),
        ...(fatalError ? [`- 批次异常：${fatalError}`] : []),
        '',
        renderMatchup('HeuristicAI vs Original-APKlikeAI-Hard', heuristic),
        renderMatchup('BattleSearchV2AI vs Original-APKlikeAI-Hard', v2),
        '## 困难 AI 路径与回退',
        '',
        `- JS 主路径决策计数：${hardTelemetryTotals.runtimeDecisions}；Java 困难规则回退：${hardTelemetryTotals.nativeFallbacks}；拒绝计划：${hardTelemetryTotals.rejectedPlans}；运行时错误：${hardTelemetryTotals.runtimeErrors}。`,
        `- 出现回退的对局：${results.filter(result => result.hardTelemetry.nativeFallbacks > 0).length}/${results.length}。${hardTelemetryTotals.nativeFallbacks > 0 ? '结果包含 Java 困难规则回退，不能视为纯 APK JS 主路径胜率。' : '本批已记录的决策未出现 Java 困难规则回退。'}`,
        '',
        '| 对局 | JS 主路径 | Java 回退 | 拒绝计划 | 运行时错误 | 最后回退原因 |',
        '|---|---:|---:|---:|---:|---|',
        ...results.map(result => {
            const telemetry = result.hardTelemetry;
            const reason = (telemetry.lastFallbackReason ?? '-').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
            return `| ${result.id} | ${telemetry.runtimeDecisions} | ${telemetry.nativeFallbacks} | ${telemetry.rejectedPlans} | ${telemetry.runtimeErrors} | ${reason} |`;
        }),
        '',
        '## 实际动作计数',
        '',
        '| 动作 | 两个主角合计 | 困难版合计 |',
        '|---|---:|---:|',
        ...[...new Set([...Object.keys(actionTotals.protagonist), ...Object.keys(actionTotals.hard)])].sort()
            .map(action => `| ${action} | ${actionTotals.protagonist[action] ?? 0} | ${actionTotals.hard[action] ?? 0} |`),
        '',
        '## 解读限制与异常',
        '',
        '- 此处衡量的是项目内困难 AI 移植，尚不能据此宣称与 APK 实机逐动作等价。',
        '- 截断局只能说明在固定预算内未自然结束，不能计为胜/负/平。',
        '- 五张固定地图的结果不代表总体胜率；每局终局摘要、种子和耗时均保存在 summary.json。',
        ...results.filter(result => result.error).map(result => `- ${result.id}：${result.error}`),
        ...results.filter(result => result.cutoff).map(result => `- ${result.id}：${result.cutoff}，${result.steps} 步 / ${result.completedRounds} 回合，winner=${result.winner}。`),
        '',
    ];
    return lines.join('\n');
}

async function main(): Promise<void> {
    if (![MAX_STEPS, MAX_ROUNDS].every(value => Number.isSafeInteger(value) && value > 0)) {
        throw new Error('ARENA_MAX_STEPS 和 ARENA_MAX_ROUNDS 必须是正整数');
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const specs = makeSpecs();
    const limit = Number(process.env.ARENA_LIMIT ?? specs.length);
    const match = process.env.ARENA_MATCH;
    const filteredSpecs = match
        ? specs.filter(spec => `${spec.protagonist}:${spec.mapName}:${spec.seat}`.includes(match))
        : specs;
    const selectedSpecs = filteredSpecs.slice(0, Number.isFinite(limit) && limit > 0 ? Math.min(limit, filteredSpecs.length) : filteredSpecs.length);
    const results: GameResult[] = [];
    const beforeManifest = captureSourceManifest(path.join(OUT_DIR, 'source-freeze'));
    fs.writeFileSync(path.join(OUT_DIR, 'source-manifest-before.json'), JSON.stringify(beforeManifest, null, 2), 'utf8');
    const jsonlPath = path.join(OUT_DIR, 'games.jsonl');
    fs.writeFileSync(jsonlPath, '', 'utf8');
    const startedAt = new Date().toISOString();
    console.log(`[arena-hard] ${selectedSpecs.length} 局 -> ${OUT_DIR}，冻结源码 ${beforeManifest.files.length} 个`);

    let fatalError: string | null = null;
    try {
        for (let index = 0; index < selectedSpecs.length; index += 1) {
            const spec = selectedSpecs[index];
            const { trace, ...compactResult } = await runGame(spec);
            const result: GameResult = compactResult;
            if (trace) {
                result.traceFile = `trace-${result.id}.jsonl`;
                result.traceEntries = trace.length;
                fs.writeFileSync(
                    path.join(OUT_DIR, result.traceFile),
                    trace.map(entry => JSON.stringify(entry)).join('\n') + (trace.length > 0 ? '\n' : ''),
                    'utf8',
                );
            }
            results.push(result);
            fs.appendFileSync(jsonlPath, `${JSON.stringify(result)}\n`, 'utf8');
            console.log(`[${index + 1}/${selectedSpecs.length}] ${result.id} ${result.outcome} steps=${result.steps} rounds=${result.completedRounds} strict=${result.strictActions} elapsed=${result.elapsedSeconds.toFixed(1)}s`);
        }
    } catch (cause) {
        fatalError = cause instanceof Error ? cause.message : String(cause);
        process.exitCode = 1;
    }

    const afterManifest = captureSourceManifest();
    const sourceIntegrity = compareSources(beforeManifest, afterManifest);
    fs.writeFileSync(path.join(OUT_DIR, 'source-manifest-after.json'), JSON.stringify(afterManifest, null, 2), 'utf8');
    const summary = {
        generatedAt: new Date().toISOString(),
        startedAt,
        sourceIntegrity,
        fatalError,
        runtime: { node: process.version, typescript: ts.version },
        protocol: {
            opponent: 'Original-APKlikeAI-Hard (OriginalApkLikeHardAI)',
            maps: MAPS,
            seats: [0, 1],
            maxSteps: MAX_STEPS,
            maxRounds: MAX_ROUNDS,
            sequential: true,
            traceEnabled: TRACE_ENABLED,
            plannedGames: specs.length,
            selectedGames: selectedSpecs.length,
            completedGames: results.length,
            filters: { match: match ?? null, limit: process.env.ARENA_LIMIT ?? null },
            seeds: selectedSpecs.map(spec => ({ protagonist: spec.protagonist, map: spec.mapName, seat: spec.seat, seed: spec.seed })),
        },
        heuristic: aggregate(results.filter(result => result.protagonist === 'heuristic')),
        battleSearchV2: aggregate(results.filter(result => result.protagonist === 'battle_search_v2')),
        games: results,
    };
    fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, 'REPORT.md'), renderReport(results, sourceIntegrity, selectedSpecs, fatalError), 'utf8');
    if (!sourceIntegrity.unchanged) {
        console.warn('[arena-hard] 源码清单存在差异或缺口，请复核 sourceIntegrity');
        process.exitCode = process.exitCode ?? 2;
    }
    if (summary.heuristic.errors + summary.battleSearchV2.errors > 0) process.exitCode = 1;
    console.log('[arena-hard] 完成', {
        heuristic: summary.heuristic,
        battleSearchV2: summary.battleSearchV2,
        sourceUnchanged: sourceIntegrity.unchanged,
        fatalError,
    });
}

main().catch(error => {
    console.error('[arena-hard] 批次失败', error);
    process.exitCode = 1;
});


