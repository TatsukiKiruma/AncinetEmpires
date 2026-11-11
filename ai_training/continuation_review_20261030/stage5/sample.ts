import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../../src/game/engine';
import { mulberry32, encodeAction } from '../../../src/game/env';
import { OriginalApkLikeHardAI } from '../../../src/game/ai/original_apk_like_hard_ai';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { tacticalPriorBundle } from '../../../src/ai_runtime/dual_v3/search_policy';
import { anchoredCandidates, filterRolloutActions } from '../../../src/ai_runtime/dual_v3/anchored_policy';
import { read, fileSha, initialState, sha } from '../stage1/io';
import { Client } from './client';
import { Storage } from './storage';

const here = path.dirname(fileURLToPath(import.meta.url));
const [output, split = 'train', countText = '300', widthText = '12', offsetText = '0'] = process.argv.slice(2);
const count = Number(countText), width = Number(widthText);
const offset = Number(offsetText);
if (!Number.isSafeInteger(offset) || offset < 0) throw Error('补采偏移必须是非负整数');
if (!output || !['train', 'dev'].includes(split) || !Number.isInteger(count) || count < 1 || !Number.isInteger(width) || width < 1 || width > 32) throw Error('需要新输出目录、train/dev、每人数目标与1至32并发数');
const partition = path.join(here, '../stage1/PARTITIONS.json');
const parents = read(partition).parents.filter((p: any) => p.corpus === 'new' && p.admitted && p.split === split);
// 开发实战来源只能用于门禁，不进入偏离轨采集。
const excluded = new Set(read(path.join(here, '../stage3/OMNI_ARENA_DEV_PANEL.json')).slots.map((s: any) => s.parentId).filter(Boolean));
const pools = [2, 3, 4].map(n => parents.filter((p: any) => p.players === n && !excluded.has(p.parentId)).sort((a: any, b: any) => sha('stage5/' + a.parentId).localeCompare(sha('stage5/' + b.parentId))));
if (pools.some(p => !p.length)) throw Error('分区缺少人数层');
const storage = new Storage(path.resolve(output));
storage.write('RUN.json', {split, count, width, offset, partitionSha256: fileSha(partition), seed: 20261104, sealedAccess: 0, maxSteps: 4000, maxRounds: 200});
const client = new Client(storage.root), completed = [0, 0, 0], attempts = [0, 0, 0];
const modeCompleted = [[0, 0], [0, 0], [0, 0]];
const active: any[] = []; let total = 0;
function start(k: number) {
    const attempt = offset + attempts[k]++, p = pools[k][attempt % pools[k].length], seed = 20261104 + k * 100000 + attempt;
    const initial = initialState(p), ids = initial.players.filter(p => p.isAlive).map(p => p.id);
    if (ids.length !== k + 2) throw Error('初态人数不符');
    const rng = mulberry32(seed), model = ids[attempt % ids.length];
    const aCount = modeCompleted[k][0] + active.filter(g => g.k === k && g.mode === 'A').length;
    const mode = aCount < Math.ceil(count / 2) ? 'A' : 'B';
    const hard = new Map(ids.map(id => [id, new OriginalApkLikeHardAI({rng: mulberry32(seed + id * 10007)})]));
    const neural = new Map(ids.filter(id => id === model || mode === 'B' && rng() < .75).map((id, i) => [id, {scale: [1, .35, 0][i % 3], tau: [.25, .70, .50][i % 3]}]));
    return {k, attempt, p, seed, mode, rng, neural, hard, initial, engine: new GameEngine(initial, {applyInitialTurnStart: false}), initialTurn: initial.turn, steps: 0, boundary: true, buckets: [[], []], seen: [0, 0], actions: []};
}
function retain(g: any, state: any) {
    const kind = g.boundary ? 0 : state.pendingUnitId ? -1 : 1;
    if (kind < 0) return;
    const seen = ++g.seen[kind], bucket = g.buckets[kind];
    // 有界水库保留跨全局时间的候选，再按时间分位抽取，避免缓存整局状态。
    const index = bucket.length < 48 ? bucket.length : Math.floor(g.rng() * seen);
    if (index < 48) bucket[index] = {step: g.steps, boundary: kind === 0, state};
}
function finish(g: any, reason: string) {
    const state = g.engine.getState(), natural = reason === 'terminal' && state.winner !== null && state.winner !== -1;
    const eligible = natural && g.buckets.every((b: any[]) => b.length >= 6);
    const samples = eligible ? g.buckets.flatMap((bucket: any[]) => {
        bucket.sort((a, b) => a.step - b.step); return Array.from({length: 6}, (_, j) => bucket[Math.floor((j + .5) * bucket.length / 6)]);
    }) : [];
    const result = {parentId: g.p.parentId, groupId: g.p.isolationGroupId, split, players: g.k + 2, seed: g.seed, mode: g.mode, initial: g.initial, natural, eligible, reason, winner: state.winner, steps: g.steps, samples, actions: g.actions};
    storage.write(`${g.k + 2}p-${g.attempt}.json.gz`, result, true); total++;
    if (eligible) {completed[g.k]++; modeCompleted[g.k][g.mode === 'A' ? 0 : 1]++;}
    console.log(JSON.stringify({total, completed, attempts, natural, eligible, reason}));
}
try {
    while (completed.some(n => n < count)) {
        storage.check(); if (fs.existsSync(path.join(here, 'STOP'))) throw Error('用户停止');
        for (let k = 0; k < 3; k++) while (active.length < width && completed[k] + active.filter(g => g.k === k).length < count) active.push(start(k));
        const requests: any[] = [];
        for (const g of [...active]) {
            const s = g.engine.getState();
            if (g.engine.isTerminal() || g.steps >= 4000 || s.turn - g.initialTurn >= 200) {
                finish(g, g.engine.isTerminal() ? 'terminal' : 'truncated'); active.splice(active.indexOf(g), 1); continue;
            }
            retain(g, s);
            const legal = g.engine.getLegalActions(s.currentPlayer).filter((a: any) => a.type !== 'surrender');
            if (!legal.length) throw Error('无合法动作');
            if (g.neural.has(s.currentPlayer)) {
                const context = new ReachabilityContext(s), obs = encodeDualObservation(s, legal, context);
                requests.push({g, s, legal, context, obs});
            } else step(g, g.hard.get(s.currentPlayer).getAction(g.engine, s.currentPlayer));
        }
        if (requests.length) {
            const results = await client.forward(requests.map(r => r.obs));
            requests.forEach((r, i) => {
                const {g, s, obs, legal, context} = r, spec = g.neural.get(s.currentPlayer);
                const indices = Array.from(obs.actions.sourceIndices) as number[], menu = indices.map(j => legal[j]);
                const {priors, forbidden} = tacticalPriorBundle(s, menu, context, true);
                const ranked = filterRolloutActions(indices.map((j, n) => ({action: legal[j], code: encodeAction(legal[j]), score: results[i].logits[n] + spec.scale * priors[n], prior: priors[n], forbidden: Boolean(forbidden?.[n])})).sort((a, b) => b.score - a.score));
                const explore = g.mode === 'B' || g.rng() < .20;
                const pool = anchoredCandidates(ranked, 8, 20).filter(r => r.score >= ranked[0].score - 20);
                const tau = g.mode === 'A' ? [.35, .8, 1.2][Math.floor(g.rng() * 3)] : spec.tau;
                let selected = pool[0];
                if (explore) { const weights = pool.map(r => Math.exp((r.score - pool[0].score) / tau)); let v = g.rng() * weights.reduce((a, b) => a + b, 0); selected = pool[pool.length - 1]; for (let j = 0; j < pool.length; j++) if ((v -= weights[j]) <= 0) {selected = pool[j]; break;} }
                step(g, selected.action);
            });
        }
    }
    storage.write('COLLECTION_COMPLETE.json', {completed, modeCompleted, attempts, total, sealedAccess: 0});
} finally { await client.close(); }
function step(g: any, action: any) {
    const before = g.engine.getState();
    if (!g.engine.hasLegalAction(before.currentPlayer, action)) throw Error('策略动作非法');
    const next = g.engine.step(action).state;
    g.actions.push(encodeAction(action)); g.steps++;
    g.boundary = next.currentPlayer !== before.currentPlayer || next.turn !== before.turn;
}
