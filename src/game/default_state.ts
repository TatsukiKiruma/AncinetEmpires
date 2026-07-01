import { createDemoState } from './demo_map';
import { getApkSkirmishRuleConfig } from './apk_skirmish';
import type { GameState } from './types';

export function createDefaultAppGameState(): GameState {
    // 应用默认对局沿用现有演示棋盘，但规则使用 APK 正常遭遇战 SD 模式。
    return createDemoState(getApkSkirmishRuleConfig('SD'));
}
