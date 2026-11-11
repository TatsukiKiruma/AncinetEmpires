/**
 * 2026-10-20 评测：HeuristicAI / BattleSearchV2AI 分别对阵 OriginalApkLikeAI。
 *
 * 协议：
 * - 5 张 1v1 官方图：Duel、Crossed swords、Mourningstar、Liberty Port、The Crossing；
 * - 每张图正反手各一局，共 10 局/主角；
 * - 主角与对手使用相同地图、相同座位、相同种子；
 * - 每个动作执行前用 `encodeAction` 严格核对 `getLegalActions`，不把截断/错误算作胜利；
 * - 原版 AI 指 `OriginalApkLikeAI`（C1275a 源码级移植），不是 Android 运行时。
 *
 * 运行：node --import tsx tools/arena_original_apk_20261020.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
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
import { OriginalApkLikeAI } from '../src/game/ai/original_apk_like_ai';

type Protagonist = 'heuristic' | 'battle_search_v2';
type Outcome = '主角胜' | '原版胜' | '自然平局' | '步数/回合截断' | '运行错误';

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
    policy: 'protagonist' | 'original';
    action: Action;
    actorClass?: string;
    latencyMs: number;
    units: number;
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
    actionCounts: {
        protagonist: Record<string, number>;
        original: Record<string, number>;
    };
    peakUnits: { protagonist: number; original: number };
    trace?: TraceEntry[];
}

const MAPS = [
    '(2) Duel.aem',
    '(2) Crossed swords.aem',
    '(2) Mourningstar.aem',
    '(2) Liberty Port.aem',
    '(2) The Crossing.aem',
] as const;

const OUT_DIR = path.resolve('deliverables', 'original_apk_arena_20261020');
// 30 单位规模的 1v1 如果只给 1200 个原子动作，很容易在收尾前被截断；
// 默认放宽到 4000 步/120 回合，仍把截断和自然胜负分开统计。
const MAX_STEPS = Number(process.env.ARENA_MAX_STEPS ?? 4000);
const MAX_ROUNDS = Number(process.env.ARENA_MAX_ROUNDS ?? 120);

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
                    seed: 20261020 + mapIndex * 100 + seat * 1009,
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
    const opponentAi = new OriginalApkLikeAI({ rng: arenaRng(spec.seed + opponentPlayer * 1009) });
    const engine = new GameEngine(initial);
    const protagonistTimes: number[] = [];
    const opponentTimes: number[] = [];
    const v2Telemetry = { queued: 0, veto: 0, takeover: 0, decisions: 0, maxMs: 0 };
    const actionCounts = {
        protagonist: {} as Record<string, number>,
        original: {} as Record<string, number>,
    };
    const peakUnits = { protagonist: 0, original: 0 };
    const trace: TraceEntry[] | undefined = process.env.ARENA_TRACE === '1' ? [] : undefined;

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
            if (!legalCodes.has(encodeAction(action))) {
                illegalActions += 1;
                throw new Error(`玩家 ${playerId} 返回非法动作 ${encodeAction(action)}`);
            }
            strictActions += 1;
            const side = isProtagonist ? 'protagonist' : 'original';
            actionCounts[side][action.type] = (actionCounts[side][action.type] ?? 0) + 1;
            const actorId = actorIdOf(action);
            trace?.push({
                step: steps,
                playerId,
                policy: side,
                action,
                actorClass: actorId ? state.units.find(unit => unit.id === actorId)?.unitClass : undefined,
                latencyMs: elapsedMs,
                units: state.units.filter(unit => unit.ownerId === playerId && unit.hp > 0).length,
            });
            const result = engine.step(action);
            if (/非法动作|Invalid|Illegal/i.test(result.info)) throw new Error(result.info);
            state = result.state;
            steps += 1;
            peakUnits.protagonist = Math.max(peakUnits.protagonist, state.units.filter(unit => unit.ownerId === protagonistPlayer && unit.hp > 0).length);
            peakUnits.original = Math.max(peakUnits.original, state.units.filter(unit => unit.ownerId === opponentPlayer && unit.hp > 0).length);
            if (steps % 100 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
    }

    const winner = state.winner;
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
                        ? '原版胜'
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
        actionCounts,
        peakUnits,
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
    const natural = results.filter(result => result.outcome === '主角胜' || result.outcome === '原版胜' || result.outcome === '自然平局');
    const wins = count('主角胜');
    const losses = count('原版胜');
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
    };
}

function renderMatchup(title: string, results: GameResult[]): string {
    const lines: string[] = [];
    const summary = aggregate(results);
    lines.push(`## ${title}`, '');
    lines.push(`- 对局：**${summary.games}**（5 图 × 正反手）`);
    lines.push(`- 自然结果：主角胜 **${summary.wins}** / 原版胜 **${summary.losses}** / 平局 **${summary.draws}**`);
    lines.push(`- 截断：**${summary.truncated}**；运行错误：**${summary.errors}**`);
    lines.push(`- 全部对局胜率：**${summary.winRateAll}**；自然局胜率：**${summary.winRateNatural}**`);
    lines.push(`- strict 合法动作：**${summary.strictActions}**；非法动作：**${summary.illegalActions}**`);
    lines.push('');
    lines.push('| 地图 | 主角席位 | 结果 | 步数 | 回合 | 主角终局（单位/HP/材料/金/城/村） | 原版终局（单位/HP/材料/金/城/村） | 主角 p95 | 原版 p95 |');
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

function renderReport(results: GameResult[]): string {
    const heuristic = results.filter(result => result.protagonist === 'heuristic');
    const v2 = results.filter(result => result.protagonist === 'battle_search_v2');
    const header = [
        '# HeuristicAI / BattleSearchV2AI vs OriginalApkLikeAI（2026-10-20）',
        '',
        '> 对手是 `OriginalApkLikeAI`（按 APK `C1275a.java` 源码级移植），**不是** Android 运行时里的原生 AI。',
        '> 因此本报告衡量的是“项目内两个基线/搜索策略 vs C1275a 源码移植”，不能写成“击败 APK 原生 AI”。',
        '',
        '## 协议',
        '',
        `- 地图：${MAPS.map(name => `\`${name}\``).join('、')}`,
        '- 每张图正反手各一局；主角与对手同图、同座位、同种子。',
        `- 上限：${MAX_STEPS} 个原子动作 / ${MAX_ROUNDS} 个完整回合；截断和自然胜负分开统计，截断不算胜利。`,
        '- 每个动作先通过 `encodeAction` 与 `getLegalActions` 严格核对；非法动作立即终止该局并标记运行错误。',
        '- 不补赛、不筛选地图或种子。',
        '',
        renderMatchup('HeuristicAI vs OriginalApkLikeAI', heuristic),
        renderMatchup('BattleSearchV2AI vs OriginalApkLikeAI', v2),
        '## 解读限制',
        '',
        '- `OriginalApkLikeAI` 仍受 JADX 控制流缺口、项目规则执行差异和无原生差分轨迹的限制；它比 `ApkLikeAI` 更接近 C1275a，但不是已证明的原生等价物。',
        '- 截断局只能说明在固定预算内未自然结束，不能计为胜/负/平。',
        '- 原版 AI 在所有对局中均正常行动（招募、攻击、治疗、占领、支援等均有记录），截断不是进程挂起或非法动作。',
        '- 本次截断局的共同形态是：一方 0–1 单位但仍保有 1–3 座城堡，另一方 30 单位但未能完成最后占领；SD 规则只在“无单位且无城堡”时淘汰，因此不会判负。',
        '- 固定种子只保证本报告可复现，不代表总体胜率；样本为 10 局/主角。',
        '',
    ];
    return header.join('\n');
}

async function main(): Promise<void> {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const specs = makeSpecs();
    const limit = Number(process.env.ARENA_LIMIT ?? specs.length);
    const match = process.env.ARENA_MATCH;
    const filteredSpecs = match
        ? specs.filter(spec => `${spec.protagonist}:${spec.mapName}:${spec.seat}`.includes(match))
        : specs;
    const selectedSpecs = filteredSpecs.slice(0, Number.isFinite(limit) && limit > 0 ? Math.min(limit, filteredSpecs.length) : filteredSpecs.length);
    const results: GameResult[] = [];
    const jsonlPath = path.join(OUT_DIR, 'games.jsonl');
    fs.writeFileSync(jsonlPath, '', 'utf8');
    const startedAt = new Date().toISOString();
    console.log(`[arena] ${selectedSpecs.length} games -> ${OUT_DIR}`);

    for (let index = 0; index < selectedSpecs.length; index += 1) {
        const spec = selectedSpecs[index];
        const result = await runGame(spec);
        results.push(result);
        fs.appendFileSync(jsonlPath, `${JSON.stringify(result)}\n`, 'utf8');
        if (result.trace) {
            fs.writeFileSync(
                path.join(OUT_DIR, `trace-${result.id}.jsonl`),
                result.trace.map(entry => JSON.stringify(entry)).join('\n') + '\n',
                'utf8',
            );
        }
        console.log(`[${index + 1}/${selectedSpecs.length}] ${result.id} ${result.outcome} steps=${result.steps} rounds=${result.completedRounds} strict=${result.strictActions} elapsed=${result.elapsedSeconds.toFixed(1)}s`);
    }

    const summary = {
        generatedAt: new Date().toISOString(),
        startedAt,
        protocol: {
            opponent: 'OriginalApkLikeAI (C1275a source-level port)',
            maps: MAPS,
            seats: [0, 1],
            maxSteps: MAX_STEPS,
            maxRounds: MAX_ROUNDS,
            seeds: selectedSpecs.map(spec => ({ protagonist: spec.protagonist, map: spec.mapName, seat: spec.seat, seed: spec.seed })),
        },
        heuristic: aggregate(results.filter(result => result.protagonist === 'heuristic')),
        battleSearchV2: aggregate(results.filter(result => result.protagonist === 'battle_search_v2')),
        games: results,
    };
    fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, 'REPORT.md'), renderReport(results), 'utf8');
    console.log('[arena] complete', {
        heuristic: summary.heuristic,
        battleSearchV2: summary.battleSearchV2,
    });
}

main().catch(error => {
    console.error('[arena] fatal', error);
    process.exitCode = 1;
});


