import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AncientEmpiresEnv, encodeAction, decodeAction } from '../src/game/env';
import { GameEngine } from '../src/game/engine';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { buildLiveBcSample } from './skirmish_training_runner';
import { buildCandidateFeatures, sparseFeaturesToEntries, type SkirmishFeatureSample } from './skirmish_bc_train';
import { selectStratifiedHardNegativeCandidates } from './skirmish_candidate_sampling';
import { digest, type CloudAudit } from './cloud_replay_audit';

export async function exportCloudFeatures(entry: CloudAudit & { split: string }) {
    const snapshots = (await readFile(entry.statesFile!, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    const lines: string[] = [];
    const actionTypes: Record<string, number> = {};
    let belowTeacher = 0;
    for (const snapshot of snapshots) {
        if (!entry.humanWinners.includes(snapshot.state.currentPlayer)) continue;
        const env = new AncientEmpiresEnv({ initialState: snapshot.state });
        const result = env.reset();
        const label = encodeAction(snapshot.action);
        const legal = result.legalActionEntries.find(e => e.code === label);
        if (!legal || legal.fixedActionIndex === null) throw new Error('真人标签不在合法候选中');
        const seed = parseInt(entry.group.slice(0, 7), 16);
        const sample = buildLiveBcSample({ result, playerId: result.state.currentPlayer, stepNumber: snapshot.actionIndex,
            episodeSeed: seed, scenario: { id: `PVP:${entry.group}`, mode: 'SD', mapName: entry.id, resourcePath: entry.file } });
        sample.source = { inputFile: entry.file, episodeIndex: seed, stepIndex: snapshot.actionIndex };
        sample.policy = 'human-winner';
        sample.label = { actionCode: label, fixedActionIndex: legal.fixedActionIndex, action: snapshot.action };
        const key = `${entry.group}:${snapshot.actionIndex}`;
        const shortlist = selectStratifiedHardNegativeCandidates(result.legalActionCodes.filter(code => code !== 'surrender').map(actionCode => ({ actionCode, teacherScore: 0 })), label,
            { maxCandidates: 96, hardNegativeRatio: 0, deterministicKey: key });
        const scores = new HeuristicAI(() => 0.5).scoreCandidateActions(new GameEngine(result.state), result.state.currentPlayer, shortlist.map(c => decodeAction(c.actionCode)!));
        const selected = selectStratifiedHardNegativeCandidates(shortlist.map((c, i) => ({ ...c, teacherScore: scores[i].score })), label,
            { maxCandidates: 64, hardNegativeRatio: 0.5, deterministicKey: key });
        // 打乱顺序时不使用标签或教师分数，避免候选位置泄漏。
        selected.sort((a, b) => digest(`${key}:${a.actionCode}`).localeCompare(digest(`${key}:${b.actionCode}`)));
        const labelScore = selected.find(c => c.actionCode === label)!.teacherScore;
        if (labelScore < Math.max(...selected.map(c => c.teacherScore))) belowTeacher++;
        const row: SkirmishFeatureSample = { kind: 'skirmish_feature_sample', version: 1, featureDim: 4096, featureExtractor: 'hashed-action-v3',
            source: sample.source, scenario: sample.scenario, seed, step: sample.step, turn: sample.turn, playerId: sample.playerId,
            policy: sample.policy, label: { actionCode: label, fixedActionIndex: legal.fixedActionIndex },
            candidates: selected.map(c => ({ ...c, features: sparseFeaturesToEntries(buildCandidateFeatures(sample, c.actionCode, 4096, 'hashed-action-v3')!) })) };
        lines.push(JSON.stringify(row));
        actionTypes[snapshot.action.type] = (actionTypes[snapshot.action.type] ?? 0) + 1;
    }
    const file = path.join(entry.output, 'features', `${entry.id}.jsonl`);
    await writeFile(file, lines.join('\n') + (lines.length ? '\n' : ''));
    return { id: entry.id, group: entry.group, split: entry.split, samples: lines.length, belowTeacher, actionTypes, file };
}
