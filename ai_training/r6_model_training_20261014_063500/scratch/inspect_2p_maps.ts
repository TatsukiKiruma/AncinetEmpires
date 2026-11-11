import { APK_SKIRMISH_MAP_MANIFEST, getApkSkirmishTrainingMaps } from '../../src/game/apk_manifest.ts';
import { APK_SKIRMISH_MAP_ASSETS } from '../../src/game/apk_skirmish_map_assets.generated.ts';

console.log('APK_SKIRMISH_MAP_MANIFEST total entries:', APK_SKIRMISH_MAP_MANIFEST.length);
console.log('APK_SKIRMISH_MAP_ASSETS total count:', APK_SKIRMISH_MAP_ASSETS.length);

const availableAssets = new Set(APK_SKIRMISH_MAP_ASSETS.map(a => a.name));

const twoPlayerMaps = APK_SKIRMISH_MAP_MANIFEST.filter(m => m.playerIds.length === 2 && availableAssets.has(m.name));
console.log('Total 2-player maps with assets available:', twoPlayerMaps.length);

console.log('\n--- 2-player maps breakdown ---');
for (const m of twoPlayerMaps) {
    const conf = m.terrainConfidence;
    console.log(`Map: ${m.name}`);
    console.log(`  Size: ${m.width}x${m.height}, Initial units: ${m.initialUnitCount}, Recommended gold: ${m.recommendedGold}`);
    console.log(`  Approximate tiles: ${conf.approximateTileCount}, Unmapped tiles: ${conf.unmappedTileCount}`);
    console.log(`  ByConfidence:`, JSON.stringify(conf.byConfidence));
    if (conf.approximateTerrainIds.length > 0) {
        console.log(`  ApproximateTerrainIds:`, conf.approximateTerrainIds);
    }
}
