import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { promotionThresholds, passesPromotion } from './promotion_gate';
import { devPanel, runPanel } from './arena_panel';
import { data, here, readLocal, readJson } from './phase7_io';

const baseline = readLocal('STAGE7_BASELINE_DEV54.json');
assert.equal(promotionThresholds(baseline).screen, 13);
assert.equal(promotionThresholds(baseline).total, 39);
const sample = (wins: number, three: number, timeForfeits = 0) => ({ passed: true, natural: 54, wins,
    timeForfeits, fallbacks: 18, byPlayers: { 2: { wins: 16 }, 3: { wins: three }, 4: { wins: 13 } } });
assert(passesPromotion(sample(39, 11), baseline));
assert(passesPromotion(sample(40, 10), baseline));
assert(!passesPromotion(sample(39, 10), baseline));
assert(!passesPromotion(sample(38, 11), baseline));
assert(!passesPromotion(sample(40, 11, 1), baseline));
assert(!passesPromotion({ ...sample(40, 11), natural: 53 }, baseline));

// 复用真实已赢下且有回退的收据，在独立验证目录检查恢复路径，不启动GPU。
const b = readLocal('PHASE_B_DECISION.json');
const panel = devPanel();
for (const kind of ['K1', 'K2']) {
    const training = readJson(path.join(data, 'league', 'gen1', kind, 'TRAIN.json'));
    const model = { prefix: training.prefix, sha256: training.sha256 };
    const job = panel.jobs.find((j: any) => j.match.id === 'p2-8-s1');
    assert(job);
    const dir = fs.mkdtempSync(path.join(data, 'arena', `fallback-recovery-${kind}-`));
    const receipt = 'p2-8-s1.receipt.json';
    fs.copyFileSync(path.join(data, 'arena', `gen1-${kind}-dev`, receipt), path.join(dir, receipt));
    const result = await runPanel({ label: path.basename(dir),
        config: { ...baseline.config, modelPrefix: model.prefix, modelVersion: model.sha256 },
        launch: { workers: baseline.workers, services: b.chosen.services, window: b.chosen.window, mode: b.inferenceMode, model },
        panelSha: panel.panelSha, limits: panel.limits, jobs: [job], strictFallbacks: false, sealedAccess: 0 });
    assert(result.passed && result.natural === 1 && result.wins === 1 && result.fallbacks > 0);
    assert.equal(result.health, null);
}
fs.writeFileSync(path.join(here, 'FALLBACK_FIX_TESTS.json'), JSON.stringify({ passed: true,
    checks: ['晋级阈值与健康边界', 'K1真实回退胜局收据复用', 'K2真实回退胜局收据复用'], gpuStarted: false, sealedAccess: 0 }, null, 2));
console.log('晋级边界与K1/K2真实回退收据复用通过；未启动GPU或读取封存内容');
