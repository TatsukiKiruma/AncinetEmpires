import fs from 'node:fs';
import path from 'node:path';
import { gzipRows } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
const dir = import.meta.dirname;
const plan = JSON.parse(fs.readFileSync(path.join(dir, 'battle-plan.json'), 'utf8'));
const quantiles = (samples: number[]) => {
    const s = [...samples].sort((a, b) => a - b);
    return { count: s.length, p50: s[Math.max(0, Math.ceil(s.length * .5) - 1)] ?? null, p95: s[Math.max(0, Math.ceil(s.length * .95) - 1)] ?? null, p99: s[Math.max(0, Math.ceil(s.length * .99) - 1)] ?? null, max: s.at(-1) ?? null };
};
let roots = 0, queued = 0, fast = 0;
for (const entry of fs.readdirSync(path.join(dir, 'battles'), { withFileTypes: true }).filter(x => x.isDirectory())) {
    const prefix = path.join(dir, 'battles', entry.name), file = path.join(prefix, 'result.json');
    if (!fs.existsSync(file)) continue;
    const result = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (result.slot.model !== 'dual_v2_stage4_turn_search') continue;
    const root: number[] = [], queue: number[] = [], unique: number[] = [];
    const initial = JSON.parse(fs.readFileSync(path.join(dir, plan.maps[result.slot.mapIndex].path), 'utf8')), engine = new GameEngine(initial);
    for await (const row of gzipRows(fs.readFileSync(path.join(prefix, 'actions.jsonl.gz')))) {
        const legal = engine.getLegalActions(engine.getState().currentPlayer).filter(a => a.type !== 'surrender');
        if (row.side === 'model') {
            if (row.telemetry.queued) queue.push(row.ms);
            else if (legal.length > 1) root.push(row.ms);
            else unique.push(row.ms);
        }
        const action = legal.find(a => encodeAction(a) === row.code); if (!action) throw Error('时延重建遇到非法动作'); engine.step(action);
    }
    result.nonQueueTimes ??= result.rootTimes;
    result.rootTimes = root; result.rootLatency = quantiles(root); result.queueTimes = queue; result.queueLatency = quantiles(queue);
    result.uniqueFastTimes = unique; result.uniqueFastLatency = quantiles(unique);
    result.latencyDefinitions = '整体含所有模型决策；根搜索排除队列与唯一动作快返；队列为零网络复用步骤';
    fs.writeFileSync(file, JSON.stringify(result, null, 2)); roots += root.length; queued += queue.length; fast += unique.length;
}
fs.writeFileSync(path.join(dir, 'latency-breakdown-receipt.json'), JSON.stringify({ roots, queued, uniqueFast: fast, fromActualActionLogs: true }, null, 2));
console.log(JSON.stringify({ roots, queued, uniqueFast: fast }));
