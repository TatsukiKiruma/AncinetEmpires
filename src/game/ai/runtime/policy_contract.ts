// 策略调用的数据合同，不依赖采样、训练或文件系统。
import type { EnvStepResult } from '../../env';

export interface SkirmishPolicyContext {
    result: EnvStepResult;
    playerId: number;
    stepNumber: number;
    episodeSeed: number;
    scenario: SkirmishEpisodeScenario;
}

export interface SkirmishPolicy {
    name: string;
    selectFixedActionIndex(context: SkirmishPolicyContext): number;
}

export type SkirmishPolicyFactory = (
    playerId: number,
    playerIds: readonly number[],
    episodeSeed: number
) => SkirmishPolicy;

export interface SkirmishEpisodeScenario {
    id: string;
    mode: string;
    mapName: string;
    resourcePath: string;
}

