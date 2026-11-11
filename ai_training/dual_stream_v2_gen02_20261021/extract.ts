import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, read, save } from './common';
import { evaluationExclusions } from './exclusions';
import { extractGame, pureReference, POLICY_CONTRACT } from './expert_extraction';
import { auditLeagueQuality } from './league_quality';

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
const qualityAudit = await auditLeagueQuality(folder, plan);
save(folder + '/extraction-summary.json', { ...stats, quality: qualityAudit.quality, policyLabelContract: POLICY_CONTRACT, defaultMismatches, strictAllAttempts: true, valueTarget: '自然终局六槽目标与根节点所选叶联盟标量分开监督；队列帧不复用旧根价值；只对逐状态实际改写纯策略首选的Takeover/Veto动作赋2.5倍权重' });
const league = read('league-state.json');
league.replayBufferManifest = [...(league.replayBufferManifest ?? []).filter((e: any) => e.generation !== generation), { generation, manifest: folder + '/league-plan.json', samples: stats.eligible, strictAllAttempts: true, policyLabelContract: POLICY_CONTRACT }].filter((e: any) => e.generation >= generation - 2);
save('league-state.json', league); console.log(JSON.stringify({ ...stats, defaultMismatches: defaultMismatches.length }));
