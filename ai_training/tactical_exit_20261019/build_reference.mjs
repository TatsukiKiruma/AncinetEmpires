import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url));
await build({entryPoints:[path.join(here,'public_before/engine.ts.snapshot')],bundle:true,platform:'node',format:'esm',outfile:path.join(here,'legacy-engine.reference.mjs'),plugins:[{name:'原始引擎快照',setup(b){b.onLoad({filter:/engine\.ts\.snapshot$/},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'ts',resolveDir:path.resolve(here,'../../src/game')}));}}]});
