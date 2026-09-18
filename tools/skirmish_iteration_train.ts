import { readFile, writeFile } from 'node:fs/promises';
import { parseBcTrainArgs, trainSkirmishBcModel, evaluateBcModel, loadBcModel } from './skirmish_bc_train';

const root = 'training_runs/iteration_20260918';
const experiments = [
    { name: 'label-lr01', lr: 0.1, objective: 'label', average: false },
    { name: 'label-lr003', lr: 0.03, objective: 'label', average: false },
    { name: 'label-lr001', lr: 0.01, objective: 'label', average: false },
    { name: 'label-average', lr: 0.1, objective: 'label', average: true },
    { name: 'mixed', lr: 0.1, objective: 'mixed', average: false },
    { name: 'mixed-average', lr: 0.1, objective: 'mixed', average: true },
];
const summaries = [];
await readFile(`${root}/sample-manifest.json`);
for (const experiment of experiments) {
    console.log(`开始训练对照：${experiment.name}`);
    const args = ['--train', `${root}/train.jsonl`, '--val', `${root}/validation.jsonl`, '--out', `${root}/${experiment.name}.json`,
        '--epochs', '3', '--learning-rate', String(experiment.lr), '--objective', experiment.objective,
        '--feature-dim', '4096', '--feature-extractor', 'hashed-action-v3', '--max-candidates', '64', '--save-epochs', '--select-best'];
    if (experiment.average) args.push('--average-weights');
    const summary = await trainSkirmishBcModel(parseBcTrainArgs(args));
    summaries.push({ experiment, summary });
    await writeFile(`${root}/training-results.json`, JSON.stringify(summaries, null, 2));
    console.log(`${experiment.name}：验证命中率 ${summary.epochs.map(e => e.val?.accuracy.toFixed(4)).join(' / ')}，保留第 ${summary.model.epochs} 轮`);
}
const baseline = await evaluateBcModel(`${root}/validation.jsonl`, await loadBcModel('training_runs/models/sd-bc-v3-20260918-011742.json'));
await writeFile(`${root}/baseline-validation.json`, JSON.stringify(baseline, null, 2));
console.log(`原全量模型在相同抽样验证集的命中率：${baseline.accuracy}`);
