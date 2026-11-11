/** 最新交付训练 AI 对困难 APK：五图换边、冻结身份、严格实际动作与反扑见证重放。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import { build } from 'esbuild';
import { GameEngine } from '../../src/game/engine';
import { createApkSkirmishGameState } from '../../src/game/apk_skirmish';
import { parseAppApkSkirmishMap } from '../../src/game/apk_skirmish_map_assets';
import { getAllianceId, getUnitCost } from '../../src/game/rule_config';
import { getEffectiveStats } from '../../src/game/abilities';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { encodeAction } from '../../src/game/env';
import type { Action, GameState } from '../../src/game/types';
import { OriginalApkLikeHardAI } from '../../src/game/ai/original_apk_like_hard_ai';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamTurnSearchAI, type SearchWitness } from '../../src/ai_runtime/dual_v2/turn_search_ai';
import { DualStreamPureAI } from '../../src/ai_runtime/dual_v2/pure_ai';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TRAINING = path.join(ROOT, 'ai_training/dual_stream_v2_phase5_20261020');
const CANDIDATE = process.env.TRAINED_CANDIDATE ?? 'phase61';
assert.ok(['phase61', 'gen05'].includes(CANDIDATE));
const GENERATION = CANDIDATE === 'gen05' ? 5 : 3;
const POLICY_MODE = process.env.TRAINED_MODE ?? 'search';
assert.ok(['search', 'pure'].includes(POLICY_MODE));
const OUTPUT = path.resolve(ROOT, process.env.PHASE6_OUTPUT ?? `deliverables/trained_vs_apk_hard_20261022/${CANDIDATE}-v6-hard-slayer`);
const readJson = (filename: string) => JSON.parse(fs.readFileSync(filename, 'utf8'));
const hashBytes = (bytes: string | Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');
const hashState = (state: GameState) => hashBytes(JSON.stringify(state));
const STANDARD_MAPS = ['(2) Duel.aem', '(2) Crossed swords.aem', '(2) Mourningstar.aem', '(2) Liberty Port.aem', '(2) The Crossing.aem'];
const MAPS: string[] = process.env.PHASE6_MAPS ? JSON.parse(process.env.PHASE6_MAPS) : STANDARD_MAPS;
const MAX_STEPS = Number(process.env.ARENA_MAX_STEPS ?? 4000);
const MAX_ROUNDS = Number(process.env.ARENA_MAX_ROUNDS ?? 120);
const MAX_WALL_MS = Number(process.env.ARENA_MAX_WALL_MS ?? 600000);
const PLAN_PATH = path.join(ROOT, 'ai_training/dual_stream_v2_phase6_20261022/protocol.json');
const ORIGINAL_PLAN = readJson(PLAN_PATH);
const SEARCH_OPTIONS = ORIGINAL_PLAN.searchOptions;

function rng(seed: number) {
    let value = seed >>> 0;
    return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

/** 只冻结静态本地依赖；训练数据不在遍历范围内，模型文件另外显式留档。 */
function sourceManifest(freeze: boolean) {
    const bundle = path.join(OUTPUT, 'runtime-v4.mjs');
    const pending = [fileURLToPath(import.meta.url), ...(CANDIDATE === 'unused-archived-runtime' && fs.existsSync(bundle) ? [bundle] : [])], visited = new Set<string>();
    const files: Array<{ path: string; sha256: string; bytes: number }> = [];
    while (pending.length) {
        const absolute = pending.pop()!;
        if (visited.has(absolute)) continue;
        visited.add(absolute);
        const relative = path.relative(ROOT, absolute).replaceAll('\\', '/');
        assert.ok(!relative.startsWith('../'), `依赖越界 ${relative}`);
        const bytes = fs.readFileSync(absolute);
        files.push({ path: relative, sha256: hashBytes(bytes), bytes: bytes.length });
        if (freeze) {
            const target = path.join(OUTPUT, 'source-freeze', relative);
            fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
        }
        if (!/\.[cm]?[jt]sx?$/.test(absolute)) continue;
        const ast = ts.createSourceFile(absolute, bytes.toString('utf8'), ts.ScriptTarget.Latest, true);
        for (const statement of ast.statements) {
            if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
            const reference = statement.moduleSpecifier.text;
            if (!reference.startsWith('.')) continue;
            const base = path.resolve(path.dirname(absolute), reference);
            const resolved = [base, base + '.ts', base + '.tsx', base + '.js', base + '.json', path.join(base, 'index.ts')]
                .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
            assert.ok(resolved, `本地依赖不可解析 ${absolute}: ${reference}`); pending.push(resolved);
        }
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { sha256: hashBytes(JSON.stringify(files)), files };
}

async function loadArtifacts() {
    const generationDir = GENERATION === 5 ? path.join(ROOT, 'ai_training/dual_stream_v2_phase6_20261022/gen_05') : path.join(TRAINING, 'generations/gen_03');
    const names = ['model.json', 'model.bin', 'head-calibration.json', 'value-config.json'];
    const assets = names.map(name => {
        const source = path.join(generationDir, name), bytes = fs.readFileSync(source);
        const target = path.join(OUTPUT, 'model-freeze', name);
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
        return { path: path.relative(ROOT, source).replaceAll('\\', '/'), sha256: hashBytes(bytes), bytes: bytes.length };
    });
    const bytes = fs.readFileSync(path.join(generationDir, 'model.bin'));
    const expected = hashBytes(bytes), valueCalibration = readJson(path.join(generationDir, 'value-config.json'));
    assert.ok(!(valueCalibration.parentMixture > 0));
    const headBias = readJson(path.join(generationDir, 'head-calibration.json')).headBias;
    const model = new DualStreamModel(readJson(path.join(generationDir, 'model.json')), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    return { model, headBias, valueCalibration, assets, expected, classes: { DualStreamModel, DualStreamPureAI, DualStreamTurnSearchAI }, archivedRuntime: [] };
}

function army(state: GameState, playerId: number) {
    const units = state.units.filter(unit => unit.ownerId === playerId && unit.hp > 0);
    const tiles = state.map.tiles.flat().filter(tile => tile.ownerId === playerId);
    return { units: units.length, hp: units.reduce((sum, unit) => sum + unit.hp, 0),
        material: Math.round(units.reduce((sum, unit) => sum + (getUnitCost(state, playerId, unit.unitClass) ?? 0) * unit.hp / getEffectiveStats(unit).maxHp, 0)),
        gold: state.players.find(player => player.id === playerId)?.gold ?? 0,
        castles: tiles.filter(tile => getTileTerrainKey(tile) === 'castle').length,
        villages: tiles.filter(tile => getTileTerrainKey(tile) === 'town').length };
}

function latency(samples: number[]) {
    const sorted = [...samples].sort((a, b) => a - b);
    return { count: samples.length, mean: samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length),
        p95: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? 0, max: sorted.at(-1) ?? 0,
        over1000: samples.filter(value => value > 1000).length };
}

async function main() {
    fs.mkdirSync(OUTPUT, { recursive: true });
    assert.ok(!fs.existsSync(path.join(OUTPUT, 'started.json')), '本次目录已有运行记录，请更换输出目录后再运行，不能覆盖历史尝试');
    const artifacts = await loadArtifacts(), before = sourceManifest(true);
    const identity = { candidate: CANDIDATE, generation: GENERATION, policyMode: POLICY_MODE,
        name: `第${GENERATION}代权重＋v6-hard-slayer运行时`,
        runtimeRevision: ORIGINAL_PLAN.runtimeRevision, searchOptions: SEARCH_OPTIONS,
        maxSteps: MAX_STEPS, maxRounds: MAX_ROUNDS, maxWallMs: MAX_WALL_MS, nodeArgs: process.execArgv,
        sequential: true, modelSha256: artifacts.expected, assets: artifacts.assets,
        sourceManifest: before, archivedRuntime: artifacts.archivedRuntime, existingPlanSha256: hashBytes(fs.readFileSync(PLAN_PATH)),
        note: '困难AI专项开发评测；历史模型保全；不接入GUI。' };
    fs.writeFileSync(path.join(OUTPUT, 'identity.json'), JSON.stringify(identity, null, 2));
    fs.writeFileSync(path.join(OUTPUT, 'started.json'), JSON.stringify({ startedAt: new Date().toISOString() }));
    const results: any[] = [];
    let verifiedActions = 0, verifiedWitnessActions = 0;
    console.log(JSON.stringify({ event: 'started', output: OUTPUT, identity: identity.name, modelSha256: artifacts.expected }));
    for (const [mapIndex, mapName] of MAPS.entries()) for (const seat of [0, 1]) {
        const id = `${mapIndex}-${mapName.replace(/[^a-z0-9]+/gi, '_')}-seat${seat}`;
        const directory = path.join(OUTPUT, id); fs.mkdirSync(directory, { recursive: true });
        const initial = createApkSkirmishGameState(parseAppApkSkirmishMap(mapName), { mode: 'SD', mapName });
        if (process.env.PHASE6_GOLD_DELTA) for (const p of initial.players) p.gold += Number(process.env.PHASE6_GOLD_DELTA);
        const playerIds = initial.players.map(player => player.id).sort((a, b) => a - b);
        assert.equal(playerIds.length, 2);
        const modelPlayer = playerIds[seat], hardPlayer = playerIds[1 - seat];
        const seed = 20261021 + mapIndex * 100 + seat * 1009;
        const engine = new GameEngine(initial), pendingWitnesses: SearchWitness[] = [];
        const policyFactory = (warmup: boolean) => POLICY_MODE === 'pure'
            ? new artifacts.classes.DualStreamPureAI(artifacts.model, { tactical: true, headBias: artifacts.headBias })
            : new artifacts.classes.DualStreamTurnSearchAI(artifacts.model, { ...SEARCH_OPTIONS, headBias: artifacts.headBias,
                valueCalibration: artifacts.valueCalibration, onWitness: warmup ? undefined : (witness: SearchWitness) => pendingWitnesses.push(witness) });
        // 与最新交付一致，在克隆和独立策略实例中预热，正式随机流及队列不会提前消费。
        const warmEngine = engine.clone(), warmPolicy = policyFactory(true);
        for (let i = 0; i < 3 && !warmEngine.isTerminal(); i++) {
            const player = warmEngine.getState().currentPlayer;
            warmEngine.step(warmPolicy.getAction(warmEngine, player));
        }
        const policy = policyFactory(false), hard = new OriginalApkLikeHardAI({ rng: rng(seed + hardPlayer * 1009) });
        const tracePath = path.join(directory, 'actions.jsonl'), witnessesPath = path.join(directory, 'witnesses.jsonl.gz');
        const modelTimes: number[] = [], hardTimes: number[] = [], rootTimes: number[] = [], queueTimes: number[] = [];
        const counts = { model: {} as Record<string, number>, hard: {} as Record<string, number> };
        const searchTelemetry = { roots: 0, queues: 0, takeover: 0, veto: 0, retaliationComplete: 0, retaliationAttempts: 0 };
        const start = performance.now(); let steps = 0, error: string | null = null, cutoff: string | null = null, witnessCount = 0;
        fs.writeFileSync(path.join(directory, 'initial.json'), JSON.stringify(initial));
        global.gc?.();
        try {
            while (!engine.isTerminal()) {
                const state = engine.getState();
                if (steps >= MAX_STEPS) { cutoff = 'action_truncation'; break; }
                if (state.turn - initial.turn >= MAX_ROUNDS) { cutoff = 'round_truncation'; break; }
                if (performance.now() - start >= MAX_WALL_MS) { cutoff = 'wall_truncation'; break; }
                const player = state.currentPlayer, isModel = player === modelPlayer;
                const legal = engine.getLegalActions(player), beforeHash = hashState(state);
                await new Promise<void>(resolve => setImmediate(resolve));
                const t0 = performance.now();
                const action = isModel ? policy.getAction(engine, player) : hard.getAction(engine, player);
                const ms = performance.now() - t0;
                const telemetry = isModel && policy instanceof artifacts.classes.DualStreamTurnSearchAI ? { ...policy.telemetry } : null;
                (isModel ? modelTimes : hardTimes).push(ms);
                assert.equal(hashState(engine.getState()), beforeHash, 'AI 修改了真实引擎状态');
                assert.ok(legal.some(candidate => encodeAction(candidate) === encodeAction(action)), `非法动作 ${encodeAction(action)}`);
                assert.notEqual(action.type, 'surrender');
                if (telemetry) {
                    (telemetry.queued ? queueTimes : rootTimes).push(ms);
                    searchTelemetry[telemetry.queued ? 'queues' : 'roots']++;
                    searchTelemetry.takeover += Number(telemetry.takeover); searchTelemetry.veto += Number(telemetry.veto);
                    searchTelemetry.retaliationAttempts += telemetry.retaliationAttempts; searchTelemetry.retaliationComplete += telemetry.retaliationComplete;
                }
                for (const witness of pendingWitnesses.splice(0)) {
                    const witnessEngine = new GameEngine(witness.initial);
                    for (const candidate of witness.actions) {
                        assert.ok(witnessEngine.getLegalActions(witnessEngine.getState().currentPlayer).some(a => encodeAction(a) === encodeAction(candidate)), '反扑见证非法');
                        witnessEngine.step(candidate); verifiedWitnessActions++;
                    }
                    assert.equal(JSON.stringify(witnessEngine.getState()), witness.finalHash, '反扑见证终态不一致');
                    fs.appendFileSync(witnessesPath, gzipSync(JSON.stringify({ initial: witness.initial, actions: witness.actions, finalSha256: hashBytes(witness.finalHash), player: witness.player }) + '\n'));
                    witnessCount++;
                }
                const result = engine.step(action), side = isModel ? 'model' : 'hard';
                assert.ok(!result.info.includes('非法动作'));
                counts[side][action.type] = (counts[side][action.type] ?? 0) + 1;
                fs.appendFileSync(tracePath, JSON.stringify({ step: steps, playerId: player, side, action, ms,
                    beforeHash, afterHash: hashState(result.state), telemetry }) + '\n');
                steps++;
                if (telemetry && !telemetry.queued) global.gc?.();
                if (steps % 100 === 0) console.log(JSON.stringify({ event: 'progress', id, steps, turn: result.state.turn, seconds: (performance.now() - start) / 1000 }));
            }
        } catch (cause) { error = cause instanceof Error ? cause.stack ?? cause.message : String(cause); }
        const final = engine.getState();
        const classification = error ? 'error' : cutoff ?? (final.winner === -1 ? 'natural_draw'
            : final.winner === getAllianceId(final, modelPlayer) ? 'model_win' : 'hard_win');
        const result = { id, mapName, seat, seed, modelPlayer, hardPlayer, classification, steps,
            rounds: final.turn - initial.turn, winner: final.winner, cutoff, error, elapsedSeconds: (performance.now() - start) / 1000,
            modelArmy: army(final, modelPlayer), hardArmy: army(final, hardPlayer),
            modelLatency: latency(modelTimes), hardLatency: latency(hardTimes), rootLatency: latency(rootTimes), queueLatency: latency(queueTimes),
            hardTelemetry: hard.telemetry, searchTelemetry, counts, witnessCount, finalSha256: hashState(final) };
        // 不再次调用 AI，独立重放全部实际动作及前后状态，验证自然胜负。
        const replay = new GameEngine(initial);
        if (fs.existsSync(tracePath)) for (const line of fs.readFileSync(tracePath, 'utf8').trim().split('\n').filter(Boolean)) {
            const entry = JSON.parse(line);
            assert.equal(hashState(replay.getState()), entry.beforeHash);
            assert.ok(replay.getLegalActions(entry.playerId).some(action => encodeAction(action) === encodeAction(entry.action)));
            replay.step(entry.action); assert.equal(hashState(replay.getState()), entry.afterHash); verifiedActions++;
        }
        assert.equal(hashState(replay.getState()), hashState(final));
        fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
        results.push(result);
        fs.appendFileSync(path.join(OUTPUT, 'games.jsonl'), JSON.stringify(result) + '\n');
        fs.writeFileSync(path.join(OUTPUT, 'live.json'), JSON.stringify({ completed: results.length, results }, null, 2));
        console.log(JSON.stringify({ event: 'result', ...result }));
    }
    const after = sourceManifest(false);
    const changedAssets = artifacts.assets.filter(asset => hashBytes(fs.readFileSync(path.join(ROOT, asset.path))) !== asset.sha256);
    const summary = { identity, completedAt: new Date().toISOString(), sourceUnchanged: before.sha256 === after.sha256,
        modelArtifactsUnchanged: changedAssets.length === 0, changedAssets, verifiedActions, verifiedWitnessActions,
        wins: results.filter(result => result.classification === 'model_win').length,
        losses: results.filter(result => result.classification === 'hard_win').length,
        draws: results.filter(result => result.classification === 'natural_draw').length,
        truncated: results.filter(result => result.cutoff !== null).length, errors: results.filter(result => result.error !== null).length, games: results };
    fs.writeFileSync(path.join(OUTPUT, 'summary.json'), JSON.stringify(summary, null, 2));
    const outcomeNames: Record<string, string> = { model_win: '训练版胜', hard_win: '困难版胜', natural_draw: '自然平局',
        action_truncation: '步数截断', round_truncation: '回合截断', wall_truncation: '墙钟截断', error: '运行错误' };
    const report = `# 最新训练 AI 对 Original-APKlikeAI-Hard\n\n模型：${identity.name}；模式：${POLICY_MODE}。\n\n`
        + `训练版 **${summary.wins} 胜 / ${summary.losses} 负 / ${summary.draws} 平**；截断 ${summary.truncated}；错误 ${summary.errors}。\n\n`
        + `五图各换边一次，共十局；SD 默认开局；${MAX_STEPS} 原子动作 / ${MAX_ROUNDS} 回合 / ${MAX_WALL_MS / 1000} 秒上限。单进程顺序执行。\n\n`
        + `| 地图 | 训练版座位 | 结果 | 原子步 | 回合 | 根搜索 p95 | 困难版 p95 |\n|---|---:|---|---:|---:|---:|---:|\n`
        + results.map(result => `| ${result.mapName} | P${result.seat} | ${outcomeNames[result.classification]} | ${result.steps} | ${result.rounds} | ${result.rootLatency.p95.toFixed(1)}ms | ${result.hardLatency.p95.toFixed(1)}ms |`).join('\n')
        + `\n\n权重 SHA-256：\`${artifacts.expected}\`。\n\n`
        + `沿用配套搜索运行时 ${ORIGINAL_PLAN.runtimeRevision}，预算 ${SEARCH_OPTIONS.budgetMs}ms、${SEARCH_OPTIONS.maxNodes} 节点及原有外置动作/价值校准；本轮仅使用困难AI专项协议，模型与源码身份独立冻结。`
        + `决策超过 1000ms 如实计入时延统计，不冒充自然失败；墙钟、回合和步数截断另记。搜索受机器负载影响。\n\n`
        + `严格独立重放实际动作 ${verifiedActions}、反扑见证动作 ${verifiedWitnessActions}；源码前后相同=${summary.sourceUnchanged}，模型及校准文件前后相同=${summary.modelArtifactsUnchanged}。\n\n`
        + `困难版 Java 回退合计 ${results.reduce((sum, result) => sum + result.hardTelemetry.nativeFallbacks, 0)}，运行时错误 ${results.reduce((sum, result) => sum + result.hardTelemetry.runtimeErrors, 0)}。`
        + `历史训练文件只读，模型副本和源码冻结位于本目录。最新交付的开发门禁未全部通过，不把本批对局等同晋升或独立盲测。\n\n`
        + `完整身份、种子、时延、反扑完成率和动作计数见 summary.json；逐局动作与反扑见证存于各地图目录。\n`;
    fs.writeFileSync(path.join(OUTPUT, 'REPORT.md'), report);
    console.log(JSON.stringify({ event: 'complete', output: OUTPUT, wins: summary.wins, losses: summary.losses, draws: summary.draws,
        truncated: summary.truncated, errors: summary.errors, verifiedActions, verifiedWitnessActions, sourceUnchanged: summary.sourceUnchanged }));
    if (summary.errors > 0 || !summary.sourceUnchanged || !summary.modelArtifactsUnchanged) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
