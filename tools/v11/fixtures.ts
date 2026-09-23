/**
 * V11 test fixtures.
 *
 * Fixtures drive the *real* repository modules (GameEngine, HeuristicAI, rules,
 * encoders). They never re-implement engine formulas, so a fixture that passes
 * proves the shipped code behaves that way.
 */
import { GameEngine } from '../../src/game/engine';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { createAppApkSkirmishGameState, parseAppApkSkirmishMap } from '../../src/game/apk_skirmish_map_assets';
import { createApkSkirmishGameState, type ApkSkirmishSetupSelection } from '../../src/game/apk_skirmish';
import { getLegalActions } from '../../src/game/rules';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import type { Action, GameState, Position } from '../../src/game/types';
import { setupId, type RecordedActionStep } from './replay';

export const V11_FIXTURE_MAP = '(2) Duel.aem';

function mkEngine(mapName: string, setup?: ApkSkirmishSetupSelection): GameEngine {
    const state = setup
        ? createApkSkirmishGameState(parseAppApkSkirmishMap(mapName), { mode: 'SD', mapName, setup })
        : createAppApkSkirmishGameState(mapName, 'SD');
    (state as any).mapName = mapName;
    return new GameEngine(state);
}

export function makeEngine(mapName: string = V11_FIXTURE_MAP, setup?: ApkSkirmishSetupSelection): GameEngine {
    return mkEngine(mapName, setup);
}

export interface DeterministicEpisode {
    actions: RecordedActionStep[];
    mapName: string;
    setup: ApkSkirmishSetupSelection;
    initialState: GameState;
    initialEngine: GameEngine;
    terminal: boolean;
    winner: number | null;
    turns: number;
    steps: number;
    stateBefore: (stepIndex: number) => GameState;
    hasLethalRootAction: boolean;
}

const episodeCache = new Map<string, DeterministicEpisode>();

/**
 * Play a deterministic Heuristic-vs-Heuristic episode and record every action.
 * Memoised per parameter set: a full episode costs seconds of real simulation.
 */
export function playDeterministicEpisode(options: {
    mapName?: string;
    setup?: ApkSkirmishSetupSelection;
    seed?: number;
    maxSteps?: number;
} = {}): DeterministicEpisode {
    const mapName = options.mapName ?? V11_FIXTURE_MAP;
    const setup = options.setup ?? { initialGold: 300, unitLimit: 30, levelCap: 3 };
    const maxSteps = options.maxSteps ?? 400;
    const seed = options.seed ?? 42;
    const cacheKey = `${mapName}|${setupId(setup)}|${seed}|${maxSteps}`;
    const cached = episodeCache.get(cacheKey);
    if (cached) return cached;

    const engine = mkEngine(mapName, setup);
    const initialState = JSON.parse(JSON.stringify(engine.getState())) as GameState;
    const ais = [new HeuristicAI(), new HeuristicAI()];
    const actions: RecordedActionStep[] = [];
    let steps = 0;

    while (!engine.isTerminal() && steps < maxSteps) {
        const state = engine.getState();
        const curPlayer = state.currentPlayer;
        const legals = getLegalActions(state, curPlayer).filter(a => a.type !== 'surrender');
        if (legals.length === 0) {
            const forced: Action = { type: 'end_turn' } as Action;
            engine.step(forced);
            actions.push({ step: steps, player: curPlayer, action: forced, ms: 0 });
            steps += 1;
            continue;
        }
        const action = ais[curPlayer === 1 ? 1 : 0].getAction(engine, curPlayer, legals);
        if (!action) break;
        engine.step(action);
        actions.push({ step: steps, player: curPlayer, action, ms: 0 });
        steps += 1;
    }

    const finalState = engine.getState();
    const built: DeterministicEpisode = {
        actions,
        mapName,
        setup,
        initialState,
        initialEngine: mkEngine(mapName, setup),
        terminal: engine.isTerminal(),
        winner: finalState.winner ?? null,
        turns: finalState.turn,
        steps,
        stateBefore: (stepIndex: number) => {
            const e = new GameEngine(JSON.parse(JSON.stringify(initialState)) as GameState);
            (e.getState() as any).mapName = mapName;
            for (let i = 0; i < stepIndex; i += 1) e.step(actions[i].action);
            return e.getState();
        },
        hasLethalRootAction: detectLethalRootAction(initialState, mapName),
    };
    episodeCache.set(cacheKey, built);
    return built;
}

/** True when the given state has a legal attack that ends the game in that side's favour. */
export function detectLethalRootAction(state: GameState, mapName: string): boolean {
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    (engine.getState() as any).mapName = mapName;
    const curPlayer = engine.getState().currentPlayer;
    for (const a of getLegalActions(engine.getState(), curPlayer)) {
        if (a.type !== 'attack') continue;
        const probe = new GameEngine(JSON.parse(JSON.stringify(engine.getState())) as GameState);
        (probe.getState() as any).mapName = mapName;
        probe.step(a);
        if (probe.isTerminal()) {
            const winner = probe.getState().winner;
            if (winner !== null && winner >= 0) return true;
        }
    }
    return false;
}

/**
 * A deterministic position in which the side to move has a genuine immediate
 * winning attack.
 *
 * Construction: take a real map's opening state, put the enemy commander on a
 * tile adjacent to our own with 1 HP, strip the victim's settlements (SD mode
 * ends a player on "no units AND no castles"), and give the turn to us. The
 * engine is asked to confirm the attack is legal *and* ends the game before the
 * fixture is returned.
 */
export interface GuaranteedLethalFixture {
    mapName: string;
    setup: ApkSkirmishSetupSelection;
    state: GameState;
    attackerId: string;
    victimId: string;
    lethalAction: Action;
    currentPlayer: number;
}

/** Why the last `buildGuaranteedLethalPosition` attempt returned null. */
export let lastRejectReason: string | null = null;

export function buildGuaranteedLethalPosition(options: {
    mapName?: string;
    setup?: ApkSkirmishSetupSelection;
} = {}): GuaranteedLethalFixture | null {
    const mapName = options.mapName ?? V11_FIXTURE_MAP;
    const setup = options.setup ?? { initialGold: 300, unitLimit: 30, levelCap: 3 };
    const base = createApkSkirmishGameState(parseAppApkSkirmishMap(mapName), { mode: 'SD', mapName, setup });
    (base as any).mapName = mapName;

    // Every fixture map starts with exactly one unit per side: the commander.
    const attacker = base.units.find(u => u.ownerId === 0 && u.hp > 0);
    const victim = base.units.find(u => u.ownerId === 1 && u.hp > 0);
    if (!attacker || !victim) {
        lastRejectReason = `missing units: attacker=${!!attacker} victim=${!!victim}`;
        return null;
    }
    let lastReject = 'no adjacent free tile';

    const neighbours = [
        { x: attacker.pos.x + 1, y: attacker.pos.y },
        { x: attacker.pos.x - 1, y: attacker.pos.y },
        { x: attacker.pos.x, y: attacker.pos.y + 1 },
        { x: attacker.pos.x, y: attacker.pos.y - 1 },
    ].filter(p => p.x >= 0 && p.y >= 0 && p.x < base.map.width && p.y < base.map.height);

    for (const spot of neighbours) {
        const occupant = base.units.find(u => u.hp > 0 && u.id !== victim.id && u.pos.x === spot.x && u.pos.y === spot.y);
        if (occupant) continue;

        const candidate = JSON.parse(JSON.stringify(base)) as GameState;
        (candidate as any).mapName = mapName;
        const cVictim = candidate.units.find(u => u.id === victim.id)!;
        cVictim.pos = { ...spot };
        cVictim.hp = 1;
        cVictim.maxHp = Math.max(1, cVictim.maxHp);
        for (let y = 0; y < candidate.map.height; y += 1) {
            for (let x = 0; x < candidate.map.width; x += 1) {
                const tile: any = candidate.map.tiles[y][x];
                if (!tile || tile.ownerId !== victim.ownerId) continue;
                const key = getTileTerrainKey(tile);
                if (key === 'castle' || key === 'town' || key === 'damaged_town') {
                    tile.terrainId = 2; // plain
                    delete tile.ownerId;
                }
            }
        }
        candidate.currentPlayer = attacker.ownerId;
        for (const u of candidate.units) {
            if (u.ownerId === attacker.ownerId) {
                u.hasMoved = false;
                u.hasActed = false;
                u.hp = Math.max(u.hp, 1);
            }
        }

        const probe = new GameEngine(JSON.parse(JSON.stringify(candidate)) as GameState);
        (probe.getState() as any).mapName = mapName;
        if (probe.isTerminal()) {
            lastReject = `engine terminal immediately after construction (winner=${probe.getState().winner})`;
            continue;
        }
        if (probe.getState().currentPlayer !== attacker.ownerId) {
            lastReject = `currentPlayer ${probe.getState().currentPlayer} != attacker owner ${attacker.ownerId}`;
            continue;
        }
        const action = getLegalActions(probe.getState(), attacker.ownerId).find(
            a => a.type === 'attack' && (a as any).attackerId === attacker.id && (a as any).targetId === victim.id
        );
        if (!action) {
            lastReject = `no legal attack ${attacker.id} -> ${victim.id} at (${spot.x},${spot.y}); ` +
                `${getLegalActions(probe.getState(), attacker.ownerId).length} legal actions`;
            continue;
        }
        probe.step(action);
        const winner = probe.getState().winner;
        if (!probe.isTerminal() || winner === null || winner < 0) {
            lastReject = `attack did not end the game (terminal=${probe.isTerminal()} winner=${winner})`;
            continue;
        }

        return {
            mapName,
            setup,
            state: candidate,
            attackerId: attacker.id,
            victimId: victim.id,
            lethalAction: action,
            currentPlayer: attacker.ownerId,
        };
    }
    lastRejectReason = lastReject;
    return null;
}

/** Minimal GameState for the replay/snapshot contract without a map asset. */
export function tinyStateFixture(): GameState {
    const state = createAppApkSkirmishGameState(V11_FIXTURE_MAP, 'SD');
    (state as any).mapName = V11_FIXTURE_MAP;
    return state;
}

export function unitAt(state: GameState, pos: Position): string | null {
    const unit = state.units.find(u => u.hp > 0 && u.pos.x === pos.x && u.pos.y === pos.y);
    return unit ? unit.id : null;
}
