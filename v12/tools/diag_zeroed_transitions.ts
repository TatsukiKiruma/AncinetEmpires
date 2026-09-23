/**
 * T12-02 diagnostic: why does the zeroed-ranker arm report 0 engine transitions?
 *
 * The answer decides whether `behaviourDistinct.plannerRunsComparison` (which
 * keys off `engineTransitions > 0`) is a valid collapse detector, and whether
 * the zeroed arm's low cost is real or an artifact.
 *
 * Writes NO artifacts; prints per-decision results.
 *
 * Usage:
 *   node v12/tools/run-tool.mjs v12/tools/diag_zeroed_transitions.ts
 */
import { chooseAction, DEFAULT_RESIDUAL_OPTIONS } from '../../tools/v11/residual_policy';
import { zeroedRanker } from '../../tools/v11/ranker';
import { readRanker } from '../../tools/v11/ranker_io';
import { createApkSkirmishGameState } from '../../src/game/apk_skirmish';
import { parseAppApkSkirmishMap } from '../../src/game/apk_skirmish_map_assets';
import { GameEngine } from '../../src/game/engine';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { getLegalActions } from '../../src/game/rules';
import { v10SetupForSeed } from '../../tools/v11/replay';
import type { Action } from '../../src/game/types';

const mapName = '(2) Duel.aem';
const seed = 42;
const setup = v10SetupForSeed(seed);
const state = createApkSkirmishGameState(parseAppApkSkirmishMap(mapName), { mode: 'SD', mapName, setup });
(state as any).mapName = mapName;
const engine = new GameEngine(state);
const seat = 0;

const zeroed = zeroedRanker('pair');
const trained = readRanker(process.env.V11_RANKER_FILE ?? 'v11/out/ranker_weights/fit1_pair_all.json');

const rng = (() => { let s = 99; return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; }; })();
const opponent = new HeuristicAI(rng);

const rows: any[] = [];
for (let i = 0; i < 6 && !engine.isTerminal(); i += 1) {
    const cur = engine.getState();
    const curPlayer = cur.currentPlayer;
    const legal = getLegalActions(cur, curPlayer).filter(a => a.type !== 'surrender');
    if (legal.length === 0) { engine.step({ type: 'end_turn' } as Action); continue; }

    if (curPlayer === seat) {
        for (const [name, w] of [['zeroed', zeroed], ['trained', trained]] as const) {
            const d = chooseAction({
                state: cur, mapName, playerId: curPlayer, step: i,
                labels: { episodeId: 'diag', rootFamilyId: 'root', setupId: 'g700_u70_c7', episodeOutcome: null },
                weights: w, options: DEFAULT_RESIDUAL_OPTIONS,
            });
            rows.push({
                mode: name,
                legal: legal.length,
                reason: d.reason,
                overridden: d.overridden,
                candidatesConsidered: d.candidatesConsidered,
                engineTransitions: d.engineTransitions,
                margin: d.margin,
                action: d.action.type,
            });
        }
    }
    const action = curPlayer === seat
        ? chooseAction({
            state: cur, mapName, playerId: curPlayer, step: i,
            labels: { episodeId: 'diag', rootFamilyId: 'root', setupId: 'g700_u70_c7', episodeOutcome: null },
            weights: zeroed, options: DEFAULT_RESIDUAL_OPTIONS,
        }).action
        : opponent.getAction(engine, curPlayer, legal);
    engine.step(action);
}

console.log(JSON.stringify({
    plannerOptions: DEFAULT_RESIDUAL_OPTIONS,
    rows,
    zeroedTransitions: rows.filter(r => r.mode === 'zeroed').reduce((n, r) => n + r.engineTransitions, 0),
    trainedTransitions: rows.filter(r => r.mode === 'trained').reduce((n, r) => n + r.engineTransitions, 0),
}, null, 2));
