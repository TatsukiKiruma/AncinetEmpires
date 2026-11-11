/** 只读检查 L1 两次评分的随机流是否导致分数与标签不一致。 */
import * as fs from 'node:fs';
import * as readline from 'node:readline';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { queryL1Label, rngForLabelKey } from '../../v15/tools/labeler_l1_v15';

const directory = 'v17/out/v17_20260926_r2/data/new_train/rollouts';
const result = { rows: 0, storedScoresVsChosenMismatch: 0, restoredFirstPassMismatch: 0, examples: [] as unknown[] };
for (let map = 0; map < 5; map += 1) {
    const lines = readline.createInterface({ input: fs.createReadStream(`${directory}/train_h0.m${map}.jsonl`), crlfDelay: Infinity });
    let index = 0;
    let selected = 0;
    for await (const line of lines) {
        if (index++ % 10 !== 0) continue;
        const row = JSON.parse(line);
        const state = JSON.parse(row.stateJson);
        const player = row.subjectPlayerId;
        const label = queryL1Label(state, { labelSeedBase: 2026, actingPlayerId: player, filterSurrender: true });
        const best = label.scores.reduce((a, b) => b.score > a.score ? b : a);
        const engine = new GameEngine(JSON.parse(row.stateJson));
        const actions = engine.getLegalActions(player).filter(a => a.type !== 'surrender');
        // 恢复到首次评分前的随机流，只调用一次选动作。
        const first = new HeuristicAI(rngForLabelKey(label.key).rng).getAction(engine, player, actions);
        result.rows += 1;
        result.storedScoresVsChosenMismatch += Number(best.actionCode !== label.actionCode);
        result.restoredFirstPassMismatch += Number(best.actionCode !== encodeAction(first));
        if (best.actionCode !== label.actionCode && result.examples.length < 5) {
            result.examples.push({ map, step: row.stepIndex, scoredBest: best.actionCode, storedChosen: label.actionCode, restoredChosen: encodeAction(first) });
        }
        selected += 1;
        if (selected >= 20) break;
    }
    lines.close();
}
fs.writeFileSync('v17/review/v17_l1_rng_probe_20260927.json', JSON.stringify({ ...result, note: '五图训练轨迹各抽20状态，固定诊断seed=2026；不改既有L1合同或数据。' }, null, 2));
console.log(JSON.stringify(result));
