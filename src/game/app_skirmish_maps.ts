import { createAppApkSkirmishGameState, getAppApkSkirmishMapOptions } from './apk_skirmish_map_assets';
import { createCustomSkirmishState, CUSTOM_SKIRMISH_MAPS } from './custom_skirmish/catalog';

export function getAppSkirmishMapOptions() {
    return [
        ...getAppApkSkirmishMapOptions(),
        ...CUSTOM_SKIRMISH_MAPS.map(map => ({
            name: map.id,
            label: `试作 · ${map.label}`,
            resourcePath: '试作地图',
            width: map.rows[0].length,
            height: map.rows.length,
            playerCount: map.commanders.length,
            recommendedGold: map.startingGold
        }))
    ];
}

export function createAppSkirmishGameState(name: string) {
    const custom = CUSTOM_SKIRMISH_MAPS.find(map => map.id === name);
    return custom ? createCustomSkirmishState(custom) : createAppApkSkirmishGameState(name);
}
