import { promotionThresholds, passesPromotion } from './promotion_gate';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { devPanel, runPanel } from './arena_panel';
import { collectLeague, trainingDirectory } from './league_collect';
import { exportDataset } from './dataset_export';
import { exportParity, runPython } from './export_parity';
import { checkH1, checkSourceLock, fileSha, h1, h1Sha, here, positiveProgressStop, readJson, readLocal, saveJson, saveLocal } from './phase7_io';
import type { ModelIdentity } from './client_v2';

const b = readLocal('PHASE_B_DECISION.json'), baseline = readLocal('STAGE7_BASELINE_DEV54.json');
assert(b.passed && baseline.passed && baseline.natural === 54 && baseline.sealedAccess === 0, 'C 未通过，禁止开始 D');
const frozen = checkSourceLock(); checkH1();
assert.equal(baseline.engineSha256, frozen.sha256);
const clockName = 'PHASE_D_CLOCK.json';
if (!fs.existsSync(path.join(here, clockName))) saveLocal(clockName, { baselineSha256: fileSha(path.join(here, 'STAGE7_BASELINE_DEV54.json')),
    deadlineMs: Date.now() + 4 * 24 * 3600000 });
const clock = readLocal(clockName);
assert.equal(clock.baselineSha256, fileSha(path.join(here, 'STAGE7_BASELINE_DEV54.json')));
const { jobs, subsetIds, panelSha, limits } = devPanel();
assert.equal(panelSha, baseline.panelSha);
const screens = jobs.filter((j: any) => subsetIds.has(j.match.id));
const launch = { workers: baseline.workers, services: b.chosen.services, window: b.chosen.window, mode: b.inferenceMode };
const minWins = promotionThresholds(baseline);
const summaries: any[] = [];
let best: any = null, current: ModelIdentity = { prefix: h1, sha256: h1Sha }, wallLimit = false;

for (const generation of [1, 2]) {
    positiveProgressStop();
    if (Date.now() >= clock.deadlineMs) { wallLimit = true; break; }
    const resultFile = `PHASE_D_GEN${generation}.json`;
    let results: any[] = [];
    const old = fs.existsSync(path.join(here, resultFile)) ? readLocal(resultFile) : null;
    if (old?.complete) {
        assert.equal(old.baselineSha256, clock.baselineSha256); assert.equal(old.inputModelSha256, current.sha256);
        results = old.candidates;
    } else {
        const collected = await collectLeague(generation, current, clock.deadlineMs);
        if (!collected.passed) {
            if (collected.wallLimit && !collected.failure && collected.health.passed) { wallLimit = true; break; }
            throw Error(`联赛采集失败：${collected.failure ?? '结果或推理健康不合格'}`);
        }
        let dataset;
        try { dataset = exportDataset(generation, clock.deadlineMs); }
        catch (e) { if (Date.now() >= clock.deadlineMs && String(e).includes('墙钟上限')) { wallLimit = true; break; } throw e; }
        assert(dataset.sealedAccess === 0);
        for (const kind of ['K1', 'K2']) {
            positiveProgressStop();
            if (Date.now() >= clock.deadlineMs) { wallLimit = true; break; }
            const dir = path.join(trainingDirectory(generation), kind);
            fs.mkdirSync(dir, { recursive: true });
            saveLocal('PHASE_D_PROGRESS.json', { generation, phase: 'training', kind, sealedAccess: 0 });
            // 已完成权重直接复用，恢复评测时不再启动训练进程。
            if (!fs.existsSync(path.join(dir, 'TRAIN.json'))) {
                await runPython('train_candidate.py', [String(generation), kind, String(clock.deadlineMs)], path.join(dir, 'train.log'));
            }
            if (Date.now() >= clock.deadlineMs) { wallLimit = true; break; }
            const training = readJson(path.join(dir, 'TRAIN.json'));
            assert(training.complete && training.sealedAccess === 0 && training.generation === generation && training.kind === kind);
            assert.equal(fileSha(training.prefix + '.bin'), training.sha256);
            const model = { prefix: training.prefix, sha256: training.sha256 };
            const parity = await exportParity(model);
            const result: any = { generation, kind, model, training, parity, screen: null, full: null, passed: false, minWins };
            if (!parity.passed || !training.offlinePassed) { result.stop = !parity.passed ? 'export_parity' : 'offline_dev'; results.push(result); continue; }
            const config = { ...baseline.config, modelPrefix: model.prefix, modelVersion: model.sha256 };
            const args = { label: `gen${generation}-${kind}-dev`, config, launch: { ...launch, model }, panelSha, limits,
                strictFallbacks: false, sealedAccess: 0, deadlineMs: clock.deadlineMs };
            saveLocal('PHASE_D_PROGRESS.json', { generation, phase: 'screen18', kind, sealedAccess: 0 });
            const screenFile = path.join(dir, 'DEV18.json');
            result.screen = fs.existsSync(screenFile) ? readJson(screenFile) : await runPanel({ ...args, jobs: screens });
            if (!fs.existsSync(screenFile)) {
                // 单独锁定快筛；全量补局后也不能覆盖快筛结果。
                saveJson(screenFile, result.screen);
            }
            if (Date.now() >= clock.deadlineMs) wallLimit = true;
            if (!result.screen.passed || result.screen.wins < minWins.screen) { result.stop = 'dev18'; results.push(result); continue; }
            saveLocal('PHASE_D_PROGRESS.json', { generation, phase: 'full54', kind, sealedAccess: 0 });
            result.full = await runPanel({ ...args, jobs });
            if (Date.now() >= clock.deadlineMs) wallLimit = true;
            const f = result.full;
            result.passed = passesPromotion(f, baseline);
            result.stop = result.passed ? null : 'dev54'; results.push(result);
        }
        saveLocal(resultFile, { complete: !wallLimit && results.length === 2, generation, candidates: results,
            baselineSha256: clock.baselineSha256, inputModelSha256: current.sha256, sealedAccess: 0 });
    }
    summaries.push({ generation, candidates: results });
    const passing = results.filter(r => r.passed).sort((a, b) => b.full.wins - a.full.wins || b.full.equalWin - a.full.equalWin || a.kind.localeCompare(b.kind))[0];
    if (passing) {
        current = passing.model;
        if (!best || passing.full.wins > best.full.wins || passing.full.wins === best.full.wins && passing.full.equalWin > best.full.equalWin) best = passing;
    }
    // Gen1已晋级时直接交付E，避免用新模型续接先前H1的Gen2采集身份。
    if (wallLimit || generation === 1 && best) break;
}
saveLocal('PHASE_D_DECISION.json', { passed: !!best, stage: 'Dev54', chosen: best, generations: summaries, wallLimit,
    baselineSha256: clock.baselineSha256, engineSha256: frozen.sha256, inferenceMode: b.inferenceMode, minWins, sealedAccess: 0 });
saveLocal('PHASE_D_PROGRESS.json', { phase: 'complete', passed: !!best, wallLimit, generations: summaries.length, sealedAccess: 0 });
