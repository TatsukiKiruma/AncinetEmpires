/**
 * V11 T11-04: ranker persistence, split out so the pure-ML code stays free of
 * filesystem access.
 */
import { readJson, writeJson } from './common';
import type { RankerWeights } from './ranker';

export function saveRanker(file: string, weights: RankerWeights): void {
    writeJson(file, weights);
}

export function readRanker(file: string): RankerWeights {
    const raw = readJson<RankerWeights>(file);
    if (raw?.schema !== 'v11_ranker_weights_1') {
        throw new Error(`not a V11 ranker weight file: ${file} (schema=${raw?.schema})`);
    }
    if (!Array.isArray(raw.weights) || !Array.isArray(raw.featureNames)) {
        throw new Error(`malformed ranker weight file: ${file}`);
    }
    if (raw.weights.length !== raw.featureNames.length) {
        throw new Error(`ranker weight/feature length mismatch in ${file}`);
    }
    return raw;
}