import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { getLegalActions } from '../../src/game/rules';
import { encodeAction } from '../../src/game/env';
import { expandApkReplayRecordToProjectActions, createRecordExpansionOptions } from '../../src/game/apk_replay';
import { readNativeSnapshot } from '../../ai_training/data_acceptance_20261016/native_reader/reader';
import { projectSnapshot, nativeRecord, comparableState, differences } from '../../ai_training/data_acceptance_20261016/phone/projection';
import { semanticActionCodes } from '../../ai_training/data_acceptance_20261016/phone/semantic_actions';

const root = new URL('../../captures/assault-post-action-20261018-01/', import.meta.url);
const tag = process.argv[2];
assert.ok(['before', 'after'].includes(tag));
const selection = JSON.parse(readFileSync(new URL('native-selection.json', root), 'utf8'));
const results = selection.map((spec: any) => {
    const input = (name: string) => readFileSync(new URL(`native-inputs/${spec.id}/${name}`, root));
    for (const [name, digest] of Object.entries(spec.inputHashes)) {
        assert.equal(createHash('sha256').update(input(name)).digest('hex'), digest);
    }
    const config = input('config.bin');
    const configName = '既有原生失败点';
    const state = projectSnapshot(readNativeSnapshot(input('before.bin')), config, configName);
    const expected = projectSnapshot(readNativeSnapshot(input('after.bin')), config, configName);
    const records = JSON.parse(input('actions.json').toString()).map((a: any) => nativeRecord(a.fields));
    const engine = new GameEngine(state, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
    assert.equal(JSON.stringify(engine.getState()), JSON.stringify(state));
    const actions = expandApkReplayRecordToProjectActions(records[spec.macro], state,
        createRecordExpansionOptions(records, spec.macro, { allowAmbiguousRecruitDeployFirstMatch: false }));
    for (const action of actions) {
        assert.ok(engine.getLegalActions(engine.getState().currentPlayer).some(a => encodeAction(a) === encodeAction(action)), `${spec.id} strict ${encodeAction(action)}`);
        assert.ok(!engine.step(action).info.includes('非法动作'));
    }
    const actual = engine.getState();
    const semanticDifferences = differences(comparableState(actual), comparableState(expected));
    assert.equal(semanticDifferences.length, 0, JSON.stringify(semanticDifferences));
    const actualCodes = semanticActionCodes(actual, getLegalActions(actual, actual.currentPlayer));
    const expectedCodes = semanticActionCodes(expected, getLegalActions(expected, expected.currentPlayer));
    const onlyActual = actualCodes.filter(c => !expectedCodes.includes(c));
    const onlyExpected = expectedCodes.filter(c => !actualCodes.includes(c));
    return { id: spec.id, species: spec.species, macro: spec.macro, event: records[spec.macro].eventType,
        actions: actions.map(encodeAction), strictAccepted: true, semanticDifferences,
        projected_candidate_set_mismatch: JSON.stringify(actualCodes) !== JSON.stringify(expectedCodes), onlyActual, onlyExpected };
});
const report = { tag, engineSha256: createHash('sha256').update(readFileSync(new URL('../../src/game/engine.ts', root))).digest('hex'),
    scope: '九个历史首分歧点的相邻帧局部strict重放，非全段/全库重新准入；候选对比为TS连续后态与原生投影后态，非Java候选oracle',
    cases: results.length, mismatches: results.filter((r: any) => r.projected_candidate_set_mismatch).length,
    redundantPostAttackMoves: results.reduce((n: number, r: any) => n + r.onlyActual.filter((c: string) => c.includes('post_attack_move')).length, 0), results };
writeFileSync(new URL('native-probe-current.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ tag, cases: report.cases, mismatches: report.mismatches, redundantPostAttackMoves: report.redundantPostAttackMoves }));
