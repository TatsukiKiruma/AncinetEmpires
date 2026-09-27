import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
const s = createAppApkSkirmishGameState('(2) Peak Island.aem', 'SD');
console.log('Players:', JSON.stringify(s.players));
console.log('Units:', JSON.stringify(s.units));
for (let y = 0; y < s.map.height; y++) {
  for (let x = 0; x < s.map.width; x++) {
    const t = s.map.tiles[y][x];
    if (t.ownerId !== null) {
      console.log(`Tile (${x},${y}): terrain=${t.terrainId} owner=${t.ownerId}`);
    }
  }
}
