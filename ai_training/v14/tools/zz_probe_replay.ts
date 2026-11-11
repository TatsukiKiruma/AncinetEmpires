/** 临时诊断：为什么重放第 1 步就与采集时记录的 stateHash 不同。 */
import * as fs from 'node:fs';
import * as readline from 'node:readline';
import * as crypto from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';

function sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}
function stableStringify(value: unknown): string {
    const canonical = (v: any): any => {
        if (Array.isArray(v)) return v.map(canonical);
        if (v && typeof v === 'object') {
            const out: Record<string, unknown> = {};
            for (const key of Object.keys(v).sort()) out[key] = canonical(v[key]);
            return out;
        }
        return v;
    };
    return JSON.stringify(canonical(value));
}
function stateHashOf(state: unknown): string {
    return sha256(stableStringify(state));
}

async function* readJsonl<T>(file: string): AsyncGenerator<T> {
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) { if (line.trim()) yield JSON.parse(line) as T; }
}

const rawDir = 'v14/out/v14_20260924_t14/T14-02/raw';
const root: any = await (async () => {
    for await (const r of readJsonl<any>(`${rawDir}/roots.jsonl`)) return r;
    return null;
})();
console.log('root', root.rootFamilyId, 'prefix', root.actionPrefix.length, 'recordedHash', root.initialStateHash);
const decisions = new Map<number, any>();
for await (const d of readJsonl<any>(`${rawDir}/decisions.jsonl`)) {
    if (d.rootFamilyId !== root.rootFamilyId) continue;
    decisions.set(d.stepIndex, d);
}
console.log('decisions', decisions.size);

const engine = new GameEngine(root.initialState);
console.log('step0 recomputed', stateHashOf(engine.getState()));
console.log('step0 recorded  ', decisions.get(0)?.stateHash);
for (let step = 0; step < 4; step += 1) {
    const state = engine.getState();
    const action = decodeAction(root.actionPrefix[step]);
    const before = stateHashOf(state);
    engine.step(action as never);
    const after = engine.getState();
    const recorded = decisions.get(step + 1)?.stateHash;
    const recomputed = stateHashOf(after);
    console.log(`step ${step}: prefix=${root.actionPrefix[step]}`);
    console.log(`  recorded(next)=${recorded}`);
    console.log(`  recomputed(nxt)=${recomputed}  match=${recorded === recomputed}`);
    if (recorded !== recomputed && decisions.get(step + 1)) {
        const rec = decisions.get(step + 1).state as any;
        const keys = new Set([...Object.keys(rec), ...Object.keys(after)]);
        for (const key of keys) {
            const a = stableStringify((rec as any)[key]);
            const b = stableStringify((after as any)[key]);
            if (a !== b) {
                console.log(`  DIFF field=${key}`);
                console.log(`    recorded  =${String(a).slice(0, 260)}`);
                console.log(`    recomputed=${String(b).slice(0, 260)}`);
            }
        }
    }
}
