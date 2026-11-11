import { getApkSkirmishTrainingScenarios } from '../src/game/apk_skirmish';
import { AncientEmpiresEnv } from '../src/game/env';
import { readApkSkirmishTrainingMap } from './skirmish_training_runner';
import { createSdTrainingGameState, getSdTrainingPlanEntry, loadSdTrainingPlanConfig } from './sd_training_state_generator';

export interface EvaluationCase { id: number; map: string; plan: string; seed: number; seat: number }

/** 与上一轮固定场景矩阵保持相同的初始状态和行动顺序。 */
export async function createEvaluationState(job: EvaluationCase) {
    const scenario = getApkSkirmishTrainingScenarios().find(s => s.mode === 'SD' && s.mapName === job.map);
    if (!scenario) throw new Error(`找不到评估地图：${job.map}`);
    const config = await loadSdTrainingPlanConfig('training_configs/sd_training_plan_20260705.json');
    const map = await readApkSkirmishTrainingMap('APK/_analysis/unpack', scenario);
    const state = createSdTrainingGameState(map, scenario, config, getSdTrainingPlanEntry(config, job.plan), job.seed);
    const players = state.players.filter(p => p.isAlive).map(p => p.id).sort((a, b) => a - b);
    const endgame = job.plan !== 'sd-normal';
    const subjectId = endgame ? state.currentPlayer : players[job.seat];
    if (endgame && job.seat === 1) state.currentPlayer = players.find(p => p !== subjectId)!;
    return { state, scenario, players, subjectId, env: new AncientEmpiresEnv({ initialState: state, seed: job.seed, maxPlies: 400 }) };
}
