/** 打印指定地图的城堡/村庄/双方指挥官位置。用法：... train_battle_mapdump.ts --map liberty */
import { createDefaultAppGameState } from '../src/game/default_state';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import type { GameState } from '../src/game/types';
import { getTileTerrainKey } from '../src/game/terrain_rules';

const MAPS: Record<string, () => GameState> = {
  duel: () => createDefaultAppGameState(),
  liberty: () => createAppApkSkirmishGameState('(2) Liberty Port.aem', 'SD'),
  peak: () => createAppApkSkirmishGameState('(2) Peak Island.aem', 'SD')
};
function arg(name: string, fb: string): string {
  const i = process.argv.indexOf(name);
  return i < 0 ? fb : process.argv[i + 1] ?? fb;
}
const st = MAPS[arg('--map', 'liberty').toLowerCase()]();
console.log(`map ${st.map.width}x${st.map.height} turn=${st.turn}`);
for (let y = 0; y < st.map.height; y++) {
  let row = '';
  for (let x = 0; x < st.map.width; x++) {
    const t = st.map.tiles[y][x] as { terrainId: number; ownerId: number | null };
    const k = getTileTerrainKey(t as never);
    const u = st.units.find(u => u.pos.x === x && u.pos.y === y);
    if (u) row += u.ownerId === 0 ? 'A' : 'B';
    else if (k === 'castle') row += t.ownerId === 0 ? 'a' : t.ownerId === 1 ? 'b' : 'C';
    else if (k === 'town') row += t.ownerId === null ? '+' : t.ownerId === 0 ? 'o' : 'x';
    else if (k === 'damaged_town') row += 'd';
    else row += '.';
  }
  console.log(row);
}
console.log('units', JSON.stringify(st.units.map(u => ({ o: u.ownerId, c: u.unitClass, p: u.pos }))));
console.log('players', JSON.stringify(st.players.map(p => ({ id: p.id, gold: p.gold }))));
