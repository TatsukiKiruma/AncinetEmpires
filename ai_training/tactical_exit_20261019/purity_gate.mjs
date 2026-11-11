import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url));
const built=await build({entryPoints:[path.join(here,'model_battle_search_ai.ts')],bundle:true,write:false,metafile:true,platform:'node',format:'esm'});
const dependencies=Object.keys(built.metafile.inputs).map(v=>v.replaceAll('\\','/')),forbidden=dependencies.filter(p=>/heuristic_ai|apk_like_ai|train\.py|\/python\//.test(p));
const result={passed:forbidden.length===0,forbidden,dependencies,branchPolicyInference:'根前向之外没有infer调用'};fs.writeFileSync(path.join(here,'purity-gate.json'),JSON.stringify(result));console.log({passed:result.passed,dependencies:dependencies.length});if(!result.passed)process.exitCode=1;
