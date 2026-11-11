import fs from 'node:fs';
import path from 'node:path';
const base=path.resolve('src/ai_runtime/dual_v3');
const here=path.resolve('ai_training/continuation_review_20261030/speed_bench_20261107');
let source=fs.readFileSync(path.join(base,'batched_beam_search.ts'),'utf8');
source=source.replace(/from '([^']+)'/g,(_,p)=>`from '${path.relative(here,path.resolve(base,p)).replaceAll('\\','/')}'`);
source=`import { compactKey, localEvaluation } from './search_support';\n`+source;
source=source.replace('    private room(reserve = 0) {', '    private room(reserve = 0) { return true; }\n    private unusedWallRoom(reserve = 0) {');
source=source.replace('budget > 4000','budget > 3600000');
source=source.replace('anchoredCandidates(permittedRanked, this.options.finalists ?? 8,','anchoredCandidates(permittedRanked, this.options.rootCandidates ?? this.options.finalists ?? 8,');
source=source.replace('start + budget; this.activeEnd', 'start + 3600000; this.activeEnd');
source=source.replace('const t = performance.now(), deadline = this.deadline - 75;', 'const t = performance.now(), deadline = this.deadline - 75;');
source=source.replace('    private key(s: GameState) {','    private key(s: GameState) {\n        if ((this.options as any).benchMode !== "S0") return compactKey(this, s);');
source=source.replace('valueOnly = false): Promise<(Evaluation | undefined)[]>', 'valueOnly = false, firstGPU?: boolean[]): Promise<(Evaluation | undefined)[]>');
source=source.replace('            const terminal = searchTerminal(state, this.self), cached', `            if (wave === 'C' && !valueOnly && state.currentPlayer !== this.self && ((this.options as any).benchMode === 'S3' || ((this.options as any).benchMode === 'S4' && !firstGPU?.[i]))) {
                const local = localEvaluation(this, engine, state, actor); results.set(key, local); continue;
            }
            const terminal = searchTerminal(state, this.self), cached`);
source=source.replace("const evaluations = await this.evaluateBatch(ready.map(t => t.branch.engine), 'C');", "const evaluations = await this.evaluateBatch(ready.map(t => t.branch.engine), 'C', undefined, false, ready.map(t => t.enemyUnits === 0));");
source=source.replace('    private async responseLeavesBatch(finalists: Branch[]): Promise<Response[][]> {','    private async responseLeavesBatch(finalists: Branch[]): Promise<Response[][]> {\n        if (["S3","S4"].includes((this.options as any).benchMode)) return this.responseCohortBatch(finalists);');
fs.writeFileSync(path.join(here,'sandbox_search.ts'),source);
