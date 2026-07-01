import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APK_SKIRMISH_MAP_MANIFEST } from '../src/game/apk_manifest';
import { decryptApkResourceBytes } from './apk_resource_crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const unpackDir = path.join(projectRoot, 'APK', '_analysis', 'unpack');
const outputPath = path.join(projectRoot, 'src', 'game', 'apk_skirmish_map_assets.generated.ts');

function toSourceString(value: string): string {
    return JSON.stringify(value);
}

async function main() {
    const entries = await Promise.all(APK_SKIRMISH_MAP_MANIFEST.map(async entry => {
        const encryptedPath = path.join(unpackDir, ...entry.resourcePath.split('/'));
        const encrypted = await readFile(encryptedPath);
        const decrypted = decryptApkResourceBytes(encrypted);
        return {
            name: entry.name,
            resourcePath: entry.resourcePath,
            decryptedBase64: decrypted.toString('base64')
        };
    }));

    const lines = [
        '// 该文件由 tools/generate_apk_skirmish_map_assets.ts 生成，请不要手动编辑。',
        '',
        'export interface ApkSkirmishMapAsset {',
        '    name: string;',
        '    resourcePath: string;',
        '    decryptedBase64: string;',
        '}',
        '',
        'export const APK_SKIRMISH_MAP_ASSETS = [',
        ...entries.map(entry => (
            `    { name: ${toSourceString(entry.name)}, resourcePath: ${toSourceString(entry.resourcePath)}, decryptedBase64: ${toSourceString(entry.decryptedBase64)} },`
        )),
        '] as const satisfies readonly ApkSkirmishMapAsset[];',
        ''
    ];

    await writeFile(outputPath, lines.join('\n'), 'utf8');
    console.log(`已生成 ${outputPath}`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
