import fs from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { areAlliedPlayers } from '../../src/game/rule_config';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { tacticalActionPriors } from '../../src/ai_runtime/dual_v2/tactical_prior';
import { gzipRows } from '../dual_stream_v2_phase1_20261020/io';
const dir = import.meta.dirname, plan = JSON.parse(fs.readFileSync(path.join(dir, 'battle-plan.json'), 'utf8'));
const results = [];
for (const slot of plan.slots) {
    const prefix = path.join(dir, 'battles', slot.id), engine = new GameEngine(JSON.parse(fs.readFileSync(path.join(dir, plan.maps[slot.mapIndex].path), 'utf8')));
    const result = { id: slot.id, model: slot.model, castleBlockWaits: 0, forbiddenWaits: 0, endWithRecruit: 0, explicitEnds: 0, unmovedWaits: 0 };
    for await (const row of gzipRows(fs.readFileSync(path.join(prefix, 'actions.jsonl.gz')))) {
        const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender'), action = legal.find(a => encodeAction(a) === row.code);
        if (!action) throw Error('行为审计遇到非法动作');
        if (row.side === 'model') {
            if (action.type === 'end_turn') { result.explicitEnds++; result.endWithRecruit += Number(legal.some(a => a.type.startsWith('recruit_'))); }
            if (action.type === 'wait') {
                const unit = state.units.find(u => u.id === action.unitId)!;
                result.unmovedWaits += Number(!unit.hasMoved);
                const tile = state.map.tiles[unit.pos.y][unit.pos.x];
                if (getTileTerrainKey(tile) === 'castle' && tile.ownerId !== null && areAlliedPlayers(state, state.currentPlayer, tile.ownerId) && legal.some(a => a.type === 'move' && a.unitId === unit.id)) result.castleBlockWaits++;
                if (!unit.hasMoved) result.forbiddenWaits += Number(tacticalActionPriors(state, legal)[legal.indexOf(action)].forbidden);
            }
        }
        engine.step(action);
    }
    results.push(result);
}
const passed = results.every(r => r.castleBlockWaits === 0 && r.forbiddenWaits === 0 && r.endWithRecruit === 0);
fs.writeFileSync(path.join(dir, 'fix-behavior-audit.json'), JSON.stringify({ passed, results }, null, 2));
console.log(JSON.stringify({ passed, castleBlockWaits: results.reduce((s, r) => s + r.castleBlockWaits, 0), forbiddenWaits: results.reduce((s, r) => s + r.forbiddenWaits, 0), endWithRecruit: results.reduce((s, r) => s + r.endWithRecruit, 0) }));
process.exitCode = passed ? 0 : 1;
