import { readFile, writeFile } from 'node:fs/promises';
import { AncientEmpiresEnv } from '../src/game/env';
import { GameEngine } from '../src/game/engine';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { buildLiveBcSample, createBcRankerPolicy } from './skirmish_training_runner';
import { selectStratifiedHardNegativeCandidates } from './skirmish_candidate_sampling';
import { buildCandidateFeatures, sparseFeaturesToEntries, loadBcModel, parseBcTrainArgs, trainSkirmishBcModel } from './skirmish_bc_train';

const root = 'training_runs/iteration_20260918';
const bc = createBcRankerPolicy(await loadBcModel('training_runs/models/sd-bc-v3-20260918-011742.json'));
const lines: string[] = [];
const provenance = [];
for (const id of [39, 96]) {
    const snapshot = JSON.parse(await readFile(`${root}/diagnostic-states/${id}.json`, 'utf8'));
    const episode = JSON.parse(await readFile(`training_runs/evaluation_20260918/episodes/${id}.json`, 'utf8')).episode;
    const env = new AncientEmpiresEnv({ initialState: snapshot.state, seed: snapshot.job.seed, maxPlies: 400 });
    let result = env.reset(snapshot.job.seed);
    let exported = 0;
    // 对双方执行教师选择，收集受测方在失误分布附近的新状态；不宣称每个标签都经终局验证。
    for (let step = 1; step <= 256 && exported < 64 && !result.done; step++) {
        const playerId = result.state.currentPlayer;
        const entries = result.legalActionEntries.filter(e => e.fixedActionIndex !== null && e.action.type !== 'surrender');
        const teacher = new HeuristicAI(() => 0.5).scoreCandidateActions(new GameEngine(result.state), playerId, entries.map(e => e.action));
        const bestIndex = teacher.reduce((best, entry, index) => entry.score > teacher[best].score ? index : best, 0);
        const best = entries[bestIndex];
        if (playerId === snapshot.subjectId) {
            const context = { result, playerId, stepNumber: step, episodeSeed: snapshot.job.seed, scenario: episode.scenario };
            const sample = buildLiveBcSample(context);
            const badIndex = bc.selectFixedActionIndex(context);
            const selected = selectStratifiedHardNegativeCandidates(entries.map((e, i) => ({ actionCode: e.code, teacherScore: teacher[i].score })), best.code,
                { maxCandidates: 64, hardNegativeRatio: 0.5, deterministicKey: `correction-${id}-${step}` });
            const bad = entries.find(e => e.fixedActionIndex === badIndex)!;
            if (!selected.some(c => c.actionCode === bad.code)) {
                if (selected.length >= 64) selected.pop();
                selected.push({ actionCode: bad.code, teacherScore: teacher[entries.indexOf(bad)].score, teacherRank: 0, selectionReason: 'hard_negative' });
            }
            lines.push(JSON.stringify({ kind: 'skirmish_feature_sample', version: 1, featureExtractor: 'hashed-action-v3', featureDim: 4096,
                source: { inputFile: `diagnostic-states/${id}.json`, episodeIndex: id, stepIndex: step - 1 }, scenario: sample.scenario,
                seed: sample.seed, step, turn: sample.turn, playerId, policy: 'heuristic-correction',
                label: { actionCode: best.code, fixedActionIndex: best.fixedActionIndex },
                candidates: selected.map(c => ({ actionCode: c.actionCode, teacherScore: c.teacherScore, features: sparseFeaturesToEntries(buildCandidateFeatures(sample, c.actionCode, 4096, 'hashed-action-v3')!) })) }));
            exported++;
        }
        result = env.stepAction(best.action);
    }
    provenance.push({ episode: id, samples: exported, sourceStep: snapshot.sourceStep, initialTurn: snapshot.state.turn, finalTurn: result.state.turn, terminal: result.done });
    console.log(`纠错局面 #${id} 导出 ${exported} 条样本`);
}
await writeFile(`${root}/corrections.jsonl`, lines.join('\n') + '\n');
await writeFile(`${root}/corrections-manifest.json`, JSON.stringify({ provenance, note: '使用已看过的失败局面，必须在不同地图检验泛化；教师标签未全部经过终局胜利验证。每条保留教师最优和当前模型所选候选。' }, null, 2));
const args = ['--train', `${root}/train.jsonl`, '--val', `${root}/validation.jsonl`, '--out', `${root}/label-average-corrected.json`, '--extra-train', `${root}/corrections.jsonl`, '--extra-train-repeat', '5',
    '--epochs', '3', '--learning-rate', '0.1', '--objective', 'label', '--feature-dim', '4096', '--feature-extractor', 'hashed-action-v3', '--max-candidates', '64', '--average-weights', '--save-epochs', '--select-best'];
const summary = await trainSkirmishBcModel(parseBcTrainArgs(args));
await writeFile(`${root}/correction-training.json`, JSON.stringify(summary, null, 2));
console.log(`纠错模型验证命中率：${summary.epochs.map(e => e.val?.accuracy.toFixed(4)).join(' / ')}`);
