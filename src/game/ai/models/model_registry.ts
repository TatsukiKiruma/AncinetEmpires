/**
 * Model Registry for V9 Path B Spatial AI & Skirmish AI
 *
 * Provides authoritative policy identification, SHA-256 validation,
 * encoder/schema version tracking, and qualification status.
 */

import registryData from './model_registry.json';

export interface CheckpointInfo {
    relativePath: string;
    sha256: string;
    gitBlob?: string;
    architecture: string;
    encoderVersion: 'v1' | 'v2' | 'dense-45';
    featureSchema: string;
    objective: 'policy-only' | 'policy-and-value';
    valueHeadQualified: boolean;
}

export interface TrainingInfo {
    runId: string;
    datasetSha256?: string;
    splitManifestSha256?: string;
    consumedManifestSha256?: string;
    trainUniqueStates?: number;
    valUniqueStates?: number;
    totalUniqueStates?: number;
    trainRootFamilies?: number;
    valRootFamilies?: number;
    newDaggerRows?: number;
}

export type QualificationLevel =
    | 'PRODUCTION_DEFAULT'
    | 'QUALIFIED_DEV_BASELINE'
    | 'QUALIFIED_DEV_DAGGER'
    | 'DEV_SPATIAL_SEARCH'
    | 'DEV_SEARCH_BASELINE'
    | 'DEV_CONTROL_NET_A'
    | 'SMOKE_CONTROL_ONLY'
    | 'LEGACY_V1_BUILTIN'
    | 'FRONTEND_NET_B'
    | 'BASELINE_RANDOM';

export interface PolicyRegistryEntry {
    policyId: string;
    title: string;
    isProductionDefault: boolean;
    isExperimental: boolean;
    architecture?: string;
    checkpoint: CheckpointInfo | null;
    training?: TrainingInfo;
    qualification: QualificationLevel;
    description: string;
}

export interface ModelRegistry {
    registryVersion: string;
    updatedAt: string;
    defaultProductionPolicy: string;
    policies: Record<string, PolicyRegistryEntry>;
}

export const MODEL_REGISTRY: ModelRegistry = (registryData as unknown) as ModelRegistry;

export function getPolicyRegistryEntry(policyId: string): PolicyRegistryEntry | undefined {
    return MODEL_REGISTRY.policies[policyId];
}

export function isPolicyExperimental(policyId: string): boolean {
    return MODEL_REGISTRY.policies[policyId]?.isExperimental ?? false;
}

export function getPolicyCheckpointSha(policyId: string): string | undefined {
    return MODEL_REGISTRY.policies[policyId]?.checkpoint?.sha256;
}

export function getPolicyEncoderVersion(policyId: string): string {
    return MODEL_REGISTRY.policies[policyId]?.checkpoint?.encoderVersion ?? 'heuristic';
}

/**
 * Gate for any UI or search consumer of a network value head.
 * Until a checkpoint has passed the calibration thresholds, V must not be
 * displayed as a win-rate and must not be used as a search value estimate.
 */
export function isValueHeadQualified(policyId: string): boolean {
    return MODEL_REGISTRY.policies[policyId]?.checkpoint?.valueHeadQualified === true;
}