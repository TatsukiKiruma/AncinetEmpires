import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { isCommanderUnit } from '../../src/game/rule_config';
import { nextOpponent, movingThreat, movingThreatExhaustive } from './threat';
import { DIR, save } from './io';

let cases = 0;
const records = [];
// 固定原16个状态；后增的组合光环反例由v3完整入口的独立探针验证。
for (const file of fs.readdirSync(path.join(DIR, 'parity-states')).filter(name=>parseInt(name)<=16).sort((a,b)=>parseInt(a)-parseInt(b))) {
    const { state } = JSON.parse(fs.readFileSync(path.join(DIR, 'parity-states', file), 'utf8'));
    const engine = new GameEngine(state);
    const moves = engine.getLegalActions(state.currentPlayer).filter(a => a.type === 'move');
    for (const index of [...new Set([0, Math.floor(moves.length / 2), moves.length - 1])]) {
        const move = moves[index]; if (!move || move.type !== 'move') continue;
        const branch = engine.clone(); branch.step(move);
        const reply = nextOpponent(branch, state.currentPlayer);
        if (!reply.known) continue;
        const s = reply.branch.getState();
        const targets = s.units.filter(u => u.id === move.unitId || u.ownerId === state.currentPlayer && isCommanderUnit(s, u, u.ownerId));
        const fast = movingThreat(reply.branch, targets), slow = movingThreatExhaustive(reply.branch, targets);
        for (const target of targets) {
            const a = fast.get(target.id)!, b = slow.get(target.id)!;
            assert.deepEqual([a.damage, a.lethal, a.immediate], [b.damage, b.lethal, b.immediate]);
            cases++;
        }
        records.push({ file, move, targets: targets.length });
    }
}
save('threat-exhaustive-parity.json', { passed: true, cases, branches: records.length, records });
console.log(JSON.stringify({ passed: true, cases, branches: records.length }));
