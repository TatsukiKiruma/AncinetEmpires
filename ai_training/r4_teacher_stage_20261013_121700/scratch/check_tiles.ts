
import { createAppApkSkirmishGameState } from '../env/src/game/apk_skirmish_map_assets';
import { getTileTerrainConfig } from '../env/src/game/terrain_rules';
const s = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
for (let y = 0; y < s.map.height; y++) {
    for (let x = 0; x < s.map.width; x++) {
        const t = s.map.tiles[y][x];
        const cfg = getTileTerrainConfig(t);
        if (cfg.key === 'castle' || cfg.key === 'town' || cfg.key === 'damaged_town') {
            console.log('pos:', x, y, 'key:', cfg.key, 'terrainId:', t.terrainId, 'ownerId:', t.ownerId);
        }
    }
}
