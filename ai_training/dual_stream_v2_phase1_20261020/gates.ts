import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { encodeAction } from '../../src/game/env';
import { getLegalActions } from '../../src/game/rules';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { ACTION_HEADS, PLAYER_SLOTS, SCHEMA_ID } from '../../src/ai_runtime/dual_v2/contract';
import { encodeOutcomeTarget, aggregateAllianceValue } from '../../src/ai_runtime/dual_v2/player_order';
import { DIR, read, save, sha, stateHash, directoryBytes } from './io';
import { multiplayerFixture, specialFixtures, standardFixture } from './fixtures';
import { createLoaderStats, encodeSample, loadExclusions, nativeEntries, replayEntries, streamNativeSegment, streamReplay, type SourceSample } from './streaming_loader';
import { validateObservation, validateSymmetry } from './validation';
import { writeBridgeFixture } from './tensor_bridge';

export function multiplayerGate() {
    const fixtures = [{ name: '1v1', state: standardFixture() }, { name: '3ffa', state: multiplayerFixture(3) }, { name: '4ffa', state: multiplayerFixture(4) }, { name: '2v2', state: multiplayerFixture(4, 16, 8, true) }, { name: '100units', state: multiplayerFixture(4, 32, 25) }, { name: '160units-64x64', state: multiplayerFixture(4, 64, 40) }, { name: '6ffa', state: multiplayerFixture(6, 32, 8) }];
    const rectangle = multiplayerFixture(2, 20, 8); rectangle.map.height = 12; rectangle.map.tiles = rectangle.map.tiles.slice(0, 12);
    fixtures.push({ name: 'rectangle-20x12', state: rectangle });
    // 6人压力探针使用三个纵向区域，避免与第3、4玩家堆叠。
    for (const u of fixtures[6].state.units) if (u.ownerId >= 4) u.pos.y = 12 + Math.floor(Number(u.id.split('u')[1]) / 3) * 2;
    const receipts = fixtures.map(({ name, state }) => {
        const legal = getLegalActions(state, state.currentPlayer), before = stateHash(state), x = validateObservation(state, legal);
        assert.equal(stateHash(state), before);
        if (name === '100units') { assert.equal(state.units.length, 100); assert.ok(legal.length >= 500); }
        const draw = encodeOutcomeTarget(state, x.playerOrder, true, -1);
        assert.ok(Math.abs([...draw.target].reduce((a, b) => a + b, 0) - 1) < 1e-6);
        assert.equal(encodeOutcomeTarget(state, x.playerOrder, false, 0).valueMask, false);
        if (name === '2v2') { const outcome = encodeOutcomeTarget(state, x.playerOrder, true, 10); assert.equal(aggregateAllianceValue(state, x.playerOrder, outcome.target), 1); assert.equal(outcome.target[0], .5); }
        return { name, players: state.players.length, width: state.map.width, height: state.map.height, units: state.units.length, legalActions: legal.length, entities: x.entityIndexMap.entities.length, finite: true, valueTargets: true };
    });
    const disabled = multiplayerFixture(); disabled.rules!.disabledTeams = [1]; disabled.players[2].isAlive = false; disabled.currentPlayer = 3;
    const d = validateObservation(disabled, getLegalActions(disabled, 3)); assert.equal(d.playerOrder.playerIds[0], 3); assert.equal(d.playerOrder.playerIds[1], 0);
    save('multiplayer-100units-gate.json', { passed: true, schema: SCHEMA_ID, fixtures: receipts, disabledAndEliminated: true, candidateEngineSteps: 0, generatedAt: new Date().toISOString() });
}

export function speedGate() {
    const results = [standardFixture(), multiplayerFixture(4, 32, 25)].map((state, idx) => {
        const legal = getLegalActions(state, state.currentPlayer), times: number[] = [];
        for (let i = 0; i < 60; i++) encodeDualObservation(state, legal);
        for (let i = 0; i < 200; i++) { const t = performance.now(); encodeDualObservation(state, legal); times.push(performance.now() - t); }
        const sorted = [...times].sort((a, b) => a - b), p95 = sorted[189], limit = idx ? 15 : 3;
        return { name: idx ? '4p-100units-32x32' : 'standard-1v1', units: state.units.length, legalActions: legal.length, iterations: 200, warmup: 60, milliseconds: times, p50: sorted[99], p95, max: sorted[199], limit, passed: p95 <= limit };
    });
    const result = { passed: results.every(r => r.passed), node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model, scope: '单进程完整双流编码；包含全新静态场、最短路表、关系及动作索引；输入完整合法集合的生成不计时；不缓存整个观测', results };
    save('encoding-speed-gate.json', result); console.log(JSON.stringify(result.results.map(({ name, p95, passed }) => ({ name, p95, passed }))));
}

export async function dataGate() {
    const manifest = read(path.join(DIR, 'split-manifest-v2.json')), excluded = loadExclusions(manifest), stats = createLoaderStats();
    const types = new Set<string>(), rows: any[] = [], bridgeSamples: SourceSample[] = [], sourceCounts: Record<string, number> = {};
    const required = ACTION_HEADS.filter(t => t !== 'surrender' && t !== 'destroy_town_target');
    const sourceCoverage = read(path.join(DIR, 'source-action-coverage.json'));
    const realRequired = required.filter(t => t !== 'recruit_and_deploy');
    const check = (sample: SourceSample) => {
        const x = validateObservation(sample.state, sample.legalActions);
        assert.equal(encodeAction(sample.legalActions[sample.targetIndex]), sample.targetCode);
        validateSymmetry(sample.state, sample.legalActions, x, sample.legalActions[sample.targetIndex]);
        for (const a of sample.legalActions) if (a.type !== 'surrender') types.add(a.type);
        rows.push({ source: sample.source, parentId: sample.parentId, currentPlayer: sample.state.currentPlayer, playerCount: sample.state.players.filter(p => p.isAlive).length, macro: sample.macro, subAction: sample.subAction, sourceBeforeHash: sample.sourceBeforeHash, currentBeforeHash: sample.currentBeforeHash, legalCount: sample.legalActions.length, target: sample.targetCode });
        if (bridgeSamples.length < 8) bridgeSamples.push(sample);
        sourceCounts[sample.source] = (sourceCounts[sample.source] ?? 0) + 1;
    };
    const native = nativeEntries();
    for (const count of [2, 3, 4]) {
        let taken = 0;
        for (const entry of native.filter(e => e.actualBucket.configuredPlayerCount === count && e.admittedAtoms > 0)) {
            for await (const sample of streamNativeSegment(entry, excluded, stats)) { check(sample); taken++; if (taken >= 85) break; }
            if (taken >= 85) break;
        }
        assert.equal(taken, 85); console.log(JSON.stringify({ nativePlayers: count, checked: taken, types: [...types] }));
    }
    const replays = replayEntries(), replayGroups = manifest.parents.filter((p: any) => p.source === 'replay');
    for (const count of [2, 3, 4, 5, 6]) {
        let taken = 0;
        for (const entry of replays.filter(e => !e.zeroPolicy && replayGroups.find((p: any) => p.id === e.responseSha256)?.configuredPlayers === count)) {
            for await (const sample of streamReplay(entry, excluded, stats)) { check(sample); taken++; if (taken >= 12) break; }
            if (taken >= 12) break;
        }
        assert.equal(taken, 12); console.log(JSON.stringify({ replayPlayers: count, checked: taken, types: [...types] }));
    }
    // 在真实轨迹中寻找尚未覆盖的稀有菜单，记录完整来源，不用合成局冒充实录。
    if (realRequired.some(t => !types.has(t))) {
        const witnesses = Object.values(sourceCoverage.earliest).flat() as any[];
        const ids = [...new Set(witnesses.map(w => w.segmentId))];
        outer: for (const entry of ids.map(id => native.find(e => e.segmentId === id)!)) {
            const lastMacro = Math.max(...witnesses.filter(w => w.segmentId === entry.segmentId).map(w => w.macro));
            for await (const sample of streamNativeSegment(entry, excluded, stats)) {
                if (sample.legalActions.some(a => a.type !== 'surrender' && !types.has(a.type))) check(sample);
                if (realRequired.every(t => types.has(t))) break outer;
                if (sample.macro > lastMacro + 1) break;
            }
        }
    }
    const missing = required.filter(t => !types.has(t));
    const supplemental = specialFixtures().map(state => { const legal = getLegalActions(state, state.currentPlayer), x = validateObservation(state, legal); validateSymmetry(state, legal, x); return { units: state.units.length, legal: legal.length, types: [...new Set(legal.map(a => a.type))] }; });
    const fixtureBridge = [standardFixture(), multiplayerFixture(4, 32, 25)].map(state => encodeDualObservation(state, getLegalActions(state, state.currentPlayer)));
    const encodedSamples = bridgeSamples.map(s => encodeSample(s));
    writeBridgeFixture([...fixtureBridge, ...encodedSamples.map(s => s.observation)], [...fixtureBridge.map(() => ({ target: 0, policyMask: false, valueTarget: new Float32Array(PLAYER_SLOTS), valueMask: false, weight: 0 })), ...encodedSamples.map(s => ({ target: s.target, policyMask: true, valueTarget: s.outcome.target, valueMask: s.outcome.valueMask, weight: s.weight }))]);
    const supplementalTypes = new Set(supplemental.flatMap(s => s.types));
    const literalRealCoveragePassed = !missing.length;
    const uniqueRealStates = new Set(rows.map(r => r.currentBeforeHash)).size;
    const result = { passed: uniqueRealStates >= 300 && realRequired.every(t => types.has(t)) && required.every(t => types.has(t) || supplementalTypes.has(t)), literalRealCoveragePassed, realStates: rows.length, uniqueRealStates, symmetriesPerState: 4, authorityActionTypes: 14, nonSurrenderTypes: 13, semanticHeads: 15, observedLegalTypes: [...types].sort(), missingRealTypes: missing, sourceConstraint: '全量5012原生分片与255真人初态均为commanderCastleRecruitUsesPending=true，权威规则不会生成recruit_and_deploy；该类型只能由独立合法规则夹具覆盖，不冒充真实来源覆盖', sourceCounts, stats, supplemental, states: rows };
    save('bijection-symmetry-gate.json', result); console.log(JSON.stringify({ passed: result.passed, realStates: rows.length, types: [...types], missing, bytes: directoryBytes(DIR) }));
}

const mode = process.argv[2];
if (mode === 'multiplayer') multiplayerGate();
if (mode === 'speed') speedGate();
if (mode === 'data') await dataGate();
