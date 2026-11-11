import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decryptApkResourceBytes } from './apk_resource_crypto';
import { parseApkTerrainConfigsFromDecryptedDataBin } from './apk_terrain_parser';

// 仅更新归档表；地图字节及手工维护的贴图映射保持原样。
const source = path.resolve(process.argv[2] ?? 'APK/_analysis/unpack/assets/data.bin');
const data = await readFile(source);
if (data.readUInt32BE(0) !== 365703 || data[8] !== 8) throw new Error('APK 资源头无效');
const keyHex = data.subarray(9, 17).toString('hex');
const configs = parseApkTerrainConfigsFromDecryptedDataBin(decryptApkResourceBytes(data.subarray(17), {
    cipher: 'DES/CBC/PKCS7', keyHex, ivHex: keyHex
}));
if (configs.length !== 84) throw new Error('APK 地形数量异常');
const target = path.resolve('src/game/apk_terrain.ts');
const content = await readFile(target, 'utf8');
const start = content.indexOf('export const APK_TERRAIN_CONFIGS = [');
const end = content.indexOf('const APK_TERRAIN_BY_ID', start);
if (start < 0 || end < 0) throw new Error('地形归档边界未找到');
await writeFile(target, content.slice(0, start)
    + `export const APK_TERRAIN_CONFIGS = ${JSON.stringify(configs, null, 4)} satisfies readonly ApkTerrainConfig[];\n\n`
    + content.slice(end), 'utf8');
console.log(`已生成 ${configs.length} 项 APK 地形：${target}`);
