import {createHash} from 'node:crypto';
function hashJson(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function assertReplayState(
    episode: SkirmishEpisodeRecord,
    step: SkirmishEpisodeStep,
    result: EnvStepResult,
    stepIndex: number
) {
    if (result.done) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步前环境已终局`);
    }
    if (step.illegal) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步是非法动作，不能导出为监督标签`);
    }
    if (result.state.currentPlayer !== step.playerId) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步玩家错位：日志 P${step.playerId}，重放 P${result.state.currentPlayer}`);
    }
    if (result.state.turn !== step.turnBefore) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步回合错位：日志 ${step.turnBefore}，重放 ${result.state.turn}`);
    }
    if (result.legalActions.length !== step.legalActionCount) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步合法动作数错位：日志 ${step.legalActionCount}，重放 ${result.legalActions.length}`);
    }
    if (result.fixedLegalActionIndexes.length !== step.fixedLegalActionCount) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步固定合法动作数错位：日志 ${step.fixedLegalActionCount}，重放 ${result.fixedLegalActionIndexes.length}`);
    }
    if (stepIndex + 1 !== step.step) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} step 序号不连续：期望 ${stepIndex + 1}，实际 ${step.step}`);
    }
}

function assertNextResult(
    episode: SkirmishEpisodeRecord,
    step: SkirmishEpisodeStep,
    nextResult: EnvStepResult
) {
    if (nextResult.reward !== step.reward) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步 reward 错位：日志 ${step.reward}，重放 ${nextResult.reward}`);
    }
    if (nextResult.done !== step.done) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步 done 错位：日志 ${step.done}，重放 ${nextResult.done}`);
    }
    if (nextResult.state.winner !== step.winnerAfter) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步 winner 错位：日志 ${step.winnerAfter}，重放 ${nextResult.state.winner}`);
    }
}

export function* replayEpisodeDatasetItems(
    episode: SkirmishEpisodeRecord,
    env: AncientEmpiresEnv,
    options: ReplayDatasetOptions = {}
): Generator<ReplayedDatasetItem> {
    const observationMode = options.observationMode ?? 'full';
    let result = env.reset(episode.seed);
    const initialObservationHash = hashJson(result.observation);

    if (initialObservationHash !== episode.initialObservationHash) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 初始 observation hash 不一致`);
    }
    if (result.legalActions.length !== episode.initialLegalActionCount) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 初始合法动作数不一致`);
    }
    if (result.fixedActionSpaceDescriptor.size !== episode.fixedActionSpaceSize) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 固定动作空间大小不一致`);
    }

    for (let index = 0; index < episode.steps.length; index += 1) {
        const step = episode.steps[index];
        assertReplayState(episode, step, result, index);

        const selectedEntry = result.legalActionEntries.find(entry => entry.fixedActionIndex === step.fixedActionIndex);
        if (!selectedEntry || selectedEntry.fixedActionIndex === null) {
            throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步固定动作索引不合法：${step.fixedActionIndex}`);
        }
        if (selectedEntry.code !== step.actionCode) {
            throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步动作编码错位：日志 ${step.actionCode}，重放 ${selectedEntry.code}`);
        }

        const sample: SkirmishDatasetSample = {
            kind: 'skirmish_dataset_sample',
            version: 1,
            source: {
                inputFile: options.inputFile,
                episodeIndex: options.episodeIndex,
                stepIndex: index
            },
            scenario: episode.scenario,
            seed: episode.seed,
            maxPlies: episode.maxPlies,
            maxSteps: episode.maxSteps,
            initialObservationHash: episode.initialObservationHash,
            fixedActionSpaceSize: episode.fixedActionSpaceSize,
            step: step.step,
            turn: step.turnBefore,
            playerId: step.playerId,
            policy: step.policy,
            legalActionCount: step.legalActionCount,
            fixedLegalActionCount: step.fixedLegalActionCount,
            fixedActionSpaceDescriptor: result.fixedActionSpaceDescriptor,
            fixedLegalActionIndexes: result.fixedLegalActionIndexes,
            legalActionCodes: result.legalActionCodes,
            ...(observationMode === 'full' ? { observation: result.observation } : {}),
            label: {
                fixedActionIndex: selectedEntry.fixedActionIndex,
                actionCode: selectedEntry.code,
                action: selectedEntry.action
            },
            outcome: {
                reward: step.reward,
                done: step.done,
                winnerAfter: step.winnerAfter,
                illegal: step.illegal
            }
        };
        yield { sample, result };

        const nextResult = env.stepAction(selectedEntry.action);
        assertNextResult(episode, step, nextResult);
        result = nextResult;
    }
}

