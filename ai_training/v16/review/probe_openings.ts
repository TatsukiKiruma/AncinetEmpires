/** 审核五图新旧开局的金币、合法动作与招募集合，不推进正式对局。 */
import * as fs from 'node:fs';
import { parseAppApkSkirmishMap } from '../../src/game/apk_skirmish_map_assets';
import { createApkSkirmishGameState } from '../../src/game/apk_skirmish';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';

const names = ['(2) Duel.aem', '(2) Icy Paths.aem', '(2) Liberty Port.aem', '(2) Mourningstar.aem', '(2) Crossed swords.aem'];
const result = names.map(mapName => {
    const map = parseAppApkSkirmishMap(mapName);
    const variants = [false, true].map(applyInitialTurnStart => {
        const state = createApkSkirmishGameState(map, { mode: 'SD', mapName, applyInitialTurnStart });
        const engine = new GameEngine(state);
        const actions = engine.getLegalActions(state.currentPlayer);
        return { applyInitialTurnStart, gold: state.players.map(p => p.gold),
            legalCount: actions.length, recruitCodes: actions.filter(a => a.type.startsWith('recruit')).map(encodeAction).sort() };
    });
    return { mapName, variants };
});
fs.writeFileSync('v16/review/openings.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
