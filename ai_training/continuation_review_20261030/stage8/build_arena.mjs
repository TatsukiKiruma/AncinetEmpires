import { build } from 'esbuild';
import path from 'node:path';
await build({ entryPoints: [path.join(import.meta.dirname, 'arena_worker.ts')], bundle: true,
    platform: 'node', format: 'esm', outfile: path.join(import.meta.dirname, 'arena_worker.bundle.mjs') });
