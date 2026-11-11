import { APK_SKIRMISH_MAP_MANIFEST } from '../../src/game/apk_manifest.ts';

for (const m of APK_SKIRMISH_MAP_MANIFEST) {
    console.log(`${m.name}: ${m.playerIds.length} players, ${m.width}x${m.height}`);
}
