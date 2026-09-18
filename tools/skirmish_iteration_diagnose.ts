import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { GameEngine } from '../src/game/engine';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { buildCandidateFeatures, loadBcModel, sparseFeaturesToEntries } from './skirmish_bc_train';
import { replayEpisodeDatasetItems } from './skirmish_dataset_export';
import { buildLiveBcSample, createBcRankerPolicy } from './skirmish_training_runner';
import { createEvaluationState } from './skirmish_evaluation_state';
import { selectStratifiedHardNegativeCandidates } from './skirmish_candidate_sampling';

const root = 'training_runs/iteration_20260918';
const model = await loadBcModel('training_runs/models/sd-bc-v3-20260918-011742.json');
const bc = createBcRankerPolicy(model);
const rows: Record<string, unknown>[] = [];
await mkdir(`${root}/diagnostic-states`, { recursive: true });
for (const id of [0, 39, 96, 108]) {
    const { job, episode } = JSON.parse(await readFile(`training_runs/evaluation_20260918/episodes/${id}.json`, 'utf8'));
    const { env, subjectId } = await createEvaluationState(job);
    const subjectSteps = episode.steps.filter((s: { playerId: number }) => s.playerId === subjectId);
    const selected = new Set<number>();
    for (let i = 0; i < 24; i++) selected.add(subjectSteps[Math.round(i * (subjectSteps.length - 1) / 23)].step);
    let captured = false;
    let checked = 0;
    for (const { sample, result } of replayEpisodeDatasetItems(episode, env)) {
        if (!selected.has(sample.step)) continue;
        const context = { result, playerId: subjectId, stepNumber: sample.step, episodeSeed: job.seed, scenario: episode.scenario };
        const live = buildLiveBcSample(context);
        const entries = result.legalActionEntries.filter(e => e.fixedActionIndex !== null && e.action.type !== 'surrender');
        const teacher = new HeuristicAI(() => 0.5).scoreCandidateActions(new GameEngine(result.state), subjectId, entries.map(e => e.action));
        const ranked = entries.map((entry, index) => {
            const features = buildCandidateFeatures(sample, entry.code, model.featureDim, model.featureExtractor)!;
            const liveFeatures = buildCandidateFeatures(live, entry.code, model.featureDim, model.featureExtractor)!;
            if (JSON.stringify(sparseFeaturesToEntries(features)) !== JSON.stringify(sparseFeaturesToEntries(liveFeatures))) throw new Error(`训练/推理特征不一致：${id}/${sample.step}`);
            const score = [...features].reduce((sum, [index, value]) => sum + model.weights[index] * value, 0);
            return { code: entry.code, fixedIndex: entry.fixedActionIndex, score, teacherScore: teacher[index].score };
        });
        const predicted = ranked.reduce((best, row) => row.score > best.score ? row : best);
        if (bc.selectFixedActionIndex(context) !== predicted.fixedIndex || predicted.fixedIndex !== sample.label.fixedActionIndex) throw new Error(`模型重放决策不一致：${id}/${sample.step}`);
        const teacherBest = ranked.reduce((best, row) => row.teacherScore > best.teacherScore ? row : best);
        // 用教师最优作为假设标签，只衡量候选分布影响，不把它当作线上可获得的真值。
        const sampled = selectStratifiedHardNegativeCandidates(ranked.map(r => ({ actionCode: r.code, teacherScore: r.teacherScore })), teacherBest.code,
            { maxCandidates: 64, hardNegativeRatio: 0.5, deterministicKey: `${sample.scenario.id}\0${sample.seed}\0${sample.step}` });
        const chosenCodes = new Set(sampled.map(c => c.actionCode));
        const limited = ranked.filter(r => chosenCodes.has(r.code)).reduce((best, row) => row.score > best.score ? row : best);
        const direct = ranked.filter(r => /^(attack|capture|destroy_town):/.test(r.code));
        rows.push({ episode: id, step: sample.step, turn: sample.turn, candidates: ranked.length, selected: predicted,
            teacherBest, bestDirect: direct.length ? direct.reduce((best, row) => row.teacherScore > best.teacherScore ? row : best) : null,
            limitedSelected: limited, fullWinnerExcluded: !chosenCodes.has(predicted.code), candidateTruncationChangesChoice: limited.code !== predicted.code,
            tiedBest: ranked.filter(r => Math.abs(r.score - predicted.score) < 1e-9).length,
            topModel: [...ranked].sort((a, b) => b.score - a.score).slice(0, 5) });
        if (!captured && (sample.turn >= 80 || (id === 0 && sample.turn >= 3))) {
            await writeFile(`${root}/diagnostic-states/${id}.json`, JSON.stringify({ sourceEpisode: id, sourceStep: sample.step, job, subjectId, state: result.state }));
            captured = true;
        }
        checked++;
    }
    console.log(`诊断重放 #${id}：${checked} 个决策点，全部特征与原动作一致`);
    await writeFile(`${root}/decision-audit.json`, JSON.stringify(rows, null, 2));
}
