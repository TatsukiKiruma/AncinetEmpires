import type { GameState } from './types';
import { createAppApkSkirmishGameState } from './apk_skirmish_map_assets';

export function createDefaultAppGameState(): GameState {
    // 应用默认对局直接使用 APK 官方 Duel 遭遇战地图，便于和手机实机同步对照。
    return createAppApkSkirmishGameState();
}
