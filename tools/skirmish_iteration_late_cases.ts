import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEvaluationState } from './skirmish_evaluation_state';
import { replayEpisodeDatasetItems } from './skirmish_dataset_export';
import { createBcBlendPolicy } from './skirmish_training_runner';
import { loadBcModel } from './skirmish_bc_train';

const root = 'training_runs/iteration_20260918';
const modelPath = 'training_runs/models/sd-bc-v3-20260918-011742.json';
const model = await loadBcModel(modelPath);
const jobs = [];
const evidence = [];
await mkdir(`${root}/late-states`, { recursive: true });
for (const { stage, id } of [{ stage: 'screen', id: 35 }, { stage: 'confirm', id: 26 }, ...[32, 36, 42, 46, 56, 60, 62].map(id => ({ stage: 'confirm', id }))]) {
    const { job, episode } = JSON.parse(await readFile(`${root}/${stage}/episodes/${id}.json`, 'utf8'));
    const { env, subjectId } = await createEvaluationState(job);
    let found = false;
    for (const { sample, result } of replayEpisodeDatasetItems(episode, env)) {
        if (sample.turn < 130 || sample.playerId !== subjectId || sample.label.action.type !== 'end_turn') continue;
        const context = { result, playerId: subjectId, stepNumber: sample.step, episodeSeed: job.seed, scenario: episode.scenario };
        const legacy = createBcBlendPolicy(model, job.seed).selectFixedActionIndex(context);
        const progress = createBcBlendPolicy(model, job.seed, { preserveProductiveLateMoves: true }).selectFixedActionIndex(context);
        if (legacy !== sample.label.fixedActionIndex) throw new Error(`旧策略动作无法复现：${id}`);
        if (legacy === progress) continue;
        const action = result.legalActionEntries.find(e => e.fixedActionIndex === progress)!;
        if (action.action.type !== 'move' && action.action.type !== 'post_attack_move') throw new Error('改动影响到移动以外的动作');
        const snapshotFile = `${root}/late-states/${stage}-${id}.json`;
        await writeFile(snapshotFile, JSON.stringify({ job, subjectId, state: result.state, sourceStep: sample.step }));
        const caseId = 2000 + job.caseId;
        for (const variant of ['legacy', 'progress']) jobs.push({ ...job, id: jobs.length, caseId, referenceCaseId: null, snapshotFile, variant });
        evidence.push({ stage, sourceJob: id, sourceCase: job.caseId, found: true, turn: sample.turn, step: sample.step, oldAction: sample.label.actionCode, newAction: action.code });
        console.log(`确认后期移动被拦截：原局${job.caseId} 第${sample.turn}回合 ${sample.label.actionCode} -> ${action.code}`);
        found = true;
        break;
    }
    if (!found) evidence.push({ stage, sourceJob: id, sourceCase: job.caseId, found: false });
}
await writeFile(`${root}/late-evidence.json`, JSON.stringify(evidence, null, 2));
await writeFile(`${root}/late-config.json`, JSON.stringify({ variants: { legacy: { model: modelPath, policy: 'blend' }, progress: { model: modelPath, policy: 'blend-progress' } }, jobs }, null, 2));
