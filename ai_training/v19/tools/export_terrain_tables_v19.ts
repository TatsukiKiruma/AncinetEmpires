/**
 * V19/T19-01b：导出 TS 侧的地形/兵种常量表，供 Python 编码器使用同一份数字。
 *
 * 为什么要单独导出：Python 侧 `TerrainTables.from_dict` 需要 TS 的 `TERRAIN_CONFIG` /
 * `UNIT_CONFIGS` / APK 地形映射。两侧各自硬编码一份常量会让「编码器一致」这句话
 * 失去意义——不一致时无法判断是算法不同还是常量表不同。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TERRAIN_CONFIG } from '../../src/game/terrain';
import { UNIT_CONFIGS } from '../../src/game/units';
import { APK_TERRAIN_CONFIGS, SKIRMISH_APK_TERRAIN_TO_PROJECT } from '../../src/game/apk_terrain';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const outPath = path.resolve(arg('--out', 'v19/out/run_20260928_v19_01/parity/terrain_tables_v19.json') as string);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const payload = {
    schema: 'v19_terrain_tables_1',
    terrainConfig: TERRAIN_CONFIG,
    unitConfigs: UNIT_CONFIGS,
    unitClasses: Object.keys(UNIT_CONFIGS),
    apkTerrainConfigs: Object.fromEntries((APK_TERRAIN_CONFIGS as any[]).map((c: any) => [String(c.id), c])),
    skirmishApkToProject: Object.fromEntries(
        Object.entries(SKIRMISH_APK_TERRAIN_TO_PROJECT).map(([k, v]) => [String(k), v]),
    ),
};
fs.writeFileSync(outPath, `${JSON.stringify(payload)}\n`, 'utf8');
console.log(`[T19-01b] 地形/兵种常量表 -> ${outPath} (units=${payload.unitClasses.length})`);
