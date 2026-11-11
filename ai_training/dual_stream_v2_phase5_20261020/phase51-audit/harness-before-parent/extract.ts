import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, read, save } from './common';
import { evaluationExclusions } from './exclusions';
import { extractGame, pureReference, POLICY_CONTRACT } from './expert_extraction';

const generation = Number(process.argv[2]), folder = `generations/gen_${String(generation).padStart(2, '0')}`;
for (const name of ['historical-arena', 'champion-pure-arena']) if (fs.existsSync(path.join(DIR, name, 'plan.json'))) {
    const baseline = read(name + '/plan.json');
    while (!baseline.slots.every((s: any) => fs.existsSync(path.join(DIR, name, 'battles', s.id, 'strict-replay.json')))) {
        save('training-input-wait.json', { stage: '等待配对基线冻结后统一排重', baseline: name, generation });
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}
const plan = read(folder + '/league-plan.json'), excluded = await evaluationExclusions(), reference = pureReference(plan);
const stats: Record<string, number> = { games: 0, actualActions: 0, witnessActions: 0, eligible: 0, corrections: 0, winning: 0, excluded: 0, natural: 0, truncated: 0, referencePredictions: 0, unchangedPlanOverrides: 0, correctedQueuedActions: 0, defaultChecks: 0 };
const defaultMismatches: unknown[] = [];
for (const slot of plan.slots) {
    const receipt = await extractGame(slot, folder, excluded, reference);
    for (const name of Object.keys(stats)) stats[name] += receipt[name] ?? 0;
    if (receipt.defaultMismatches.length) defaultMismatches.push({ game: slot.id, actions: receipt.defaultMismatches });
}
assert.equal(stats.games, 60); assert.ok(stats.eligible > 0 && stats.corrections > 0);
save(folder + '/extraction-summary.json', { ...stats, policyLabelContract: POLICY_CONTRACT, defaultMismatches, strictAllAttempts: true, valueTarget: '只用真实终局六槽监督价值；根标量仅保留诊断；实际改写权重1.5，其余获胜轨迹1.0' });
const league = read('league-state.json');
league.replayBufferManifest = [...(league.replayBufferManifest ?? []).filter((e: any) => e.generation !== generation), { generation, manifest: folder + '/league-plan.json', samples: stats.eligible, strictAllAttempts: true, policyLabelContract: POLICY_CONTRACT }].filter((e: any) => e.generation >= generation - 2);
save('league-state.json', league); console.log(JSON.stringify({ ...stats, defaultMismatches: defaultMismatches.length }));
