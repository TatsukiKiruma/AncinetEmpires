import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../..');
// 仅用于历史轨迹还原；公共引擎永远不导入训练目录。
await build({ entryPoints: [path.join(root, 'src/game/engine.ts')], bundle: true, platform: 'node', format: 'esm',
    outfile: path.join(import.meta.dirname, 'before/engine.bundle.mjs'),
    plugins: [{ name: '历史快照', setup(build) {
        build.onLoad({ filter: /[\\/]game[\\/](engine|rules)\.ts$/ }, args => ({
            contents: fs.readFileSync(path.join(import.meta.dirname, 'before', path.basename(args.path)), 'utf8'),
            loader: 'ts', resolveDir: path.dirname(args.path),
        }));
    } }],
});
