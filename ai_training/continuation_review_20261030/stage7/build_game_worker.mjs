import { build } from 'esbuild';
import path from 'node:path';
await build({ entryPoints: [path.join(import.meta.dirname, 'game_worker.ts')], bundle: true,
    platform: 'node', format: 'esm', outfile: path.join(import.meta.dirname, 'game_worker.bundle.mjs') });
