import type { Action, GameState } from '../../game/types';
import { SCHEMA_ID, type DualObservation } from './contract';
import { createEntityIndex, encodeEntityStream } from './entity_stream';
import { encodeFactoredActions } from './factored_actions';
import { encodePlayerOrder } from './player_order';
import { ReachabilityContext } from './reachability';
import { encodeSpatialStream } from './spatial_stream';

export function encodeDualObservation(state: GameState, legalActions: readonly Action[], sharedContext?: ReachabilityContext): DualObservation {
    const { width, height, tiles } = state.map;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || tiles.length !== height || tiles.some(row => row.length !== width)) throw Error('地图矩形尺寸无效');
    for (const e of [...state.units.map(u => u.pos), ...(state.graves ?? []).map(g => g.pos)]) if (!Number.isInteger(e.x) || !Number.isInteger(e.y) || e.x < 0 || e.y < 0 || e.x >= width || e.y >= height) throw Error('实体坐标越界');
    const playerOrder = encodePlayerOrder(state), context = sharedContext ?? new ReachabilityContext(state), entityIndexMap = createEntityIndex(state);
    if (context.state !== state) throw Error('寻路上下文必须属于当前快照');
    const spatialTensor = encodeSpatialStream(state, playerOrder, context), entities = encodeEntityStream(state, playerOrder, context, spatialTensor, entityIndexMap);
    return { schema: SCHEMA_ID, width, height, playerOrder, spatialTensor, ...entities, entityIndexMap, actions: encodeFactoredActions(state, legalActions, entityIndexMap) };
}
