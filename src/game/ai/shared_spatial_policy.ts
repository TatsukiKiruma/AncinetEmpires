/**
 * Shared Spatial Policy Contract for Path B Spatial ResNet
 *
 * Unifies inference across frontend, benchmark evaluation, and DAgger.
 * Guarantees identical action selection and aligned logits from the same state
 * and checkpoint across all entry points.
 */

import type { Action, GameState } from '../types';
import {
    SpatialResNetPredictor
} from './spatial_conv_net';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial,
    type SpatialActionFeatures
} from './spatial_tensor_encoder';

export interface SpatialPredictionResult {
    action: Action;
    bestActionIndex: number;
    actionLogits: number[];
    actionProbs: number[];
    value: number;
}

/**
 * Shared deterministic predictor execution.
 * Ensures the exact same encoding, candidate extraction, and index selection logic.
 */
export function predictSpatialAction(
    predictor: SpatialResNetPredictor,
    state: GameState,
    playerId: number,
    legalActions: readonly Action[],
    version?: 'v1' | 'v2'
): SpatialPredictionResult {
    if (legalActions.length === 0) {
        return {
            action: { type: 'end_turn' },
            bestActionIndex: -1,
            actionLogits: [],
            actionProbs: [],
            value: 0
        };
    }

    // Auto-detect version from predictor if not explicitly specified
    const encVersion = version ?? (predictor.isV2 ? 'v2' : 'v1');

    if (predictor.isV2 && encVersion !== 'v2') {
        throw new Error('Contract mismatch: Predictor is v2 but v1 encoding requested');
    }

    const encSpatial = encodeGameStateSpatial(state, playerId, encVersion);
    const candSpatial: SpatialActionFeatures[] = legalActions.map(a => {
        const feat = encodeCandidateActionSpatial(state, playerId, a, encVersion);
        return {
            actorCoord: feat.actorCoord,
            landingCoord: feat.landingCoord,
            targetCoord: feat.targetCoord,
            semantics: feat.semantics
        };
    });

    const pred = predictor.predict(encSpatial, candSpatial);
    const bestIdx = pred.bestActionIndex;

    if (bestIdx === undefined || bestIdx < 0 || bestIdx >= legalActions.length) {
        throw new Error(
            `Spatial predictor returned invalid bestActionIndex ${bestIdx} for ${legalActions.length} legal actions`
        );
    }

    const chosenAction = legalActions[bestIdx];
    if (!chosenAction) {
        throw new Error(`Chosen action at index ${bestIdx} is undefined`);
    }

    return {
        action: chosenAction,
        bestActionIndex: bestIdx,
        actionLogits: pred.actionLogits,
        actionProbs: pred.actionProbs,
        value: pred.value
    };
}
