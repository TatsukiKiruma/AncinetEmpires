import crypto from 'crypto';

export interface StratifiedClusterSample {
    pairId: string;
    mapName: string;
    openingFamily: string;
    pairScoreA: number; // 归一化得分 [0, 1]
}

export interface BootstrapCIResult {
    sampleCount: number;
    mean: number;
    ci95Lower: number;
    ci95Upper: number;
    mapBreakdown: Record<string, { count: number; mean: number; lower95: number; upper95: number }>;
}

/**
 * 确定性 Pseudo-Random Generator (LCG)
 */
function createLcgRng(seed: number = 42) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/**
 * 按地图分层的 Bootstrap 95% 置信区间计算
 * 保留配对为最小抽样单元，在每个地图层内部独立进行有放回重抽样，
 * 避免小地图样本量偏差，并正确保持地图权重。
 */
export function computeStratifiedBootstrapCI(
    samples: StratifiedClusterSample[],
    iterations: number = 2000,
    seed: number = 42
): BootstrapCIResult {
    if (samples.length === 0) {
        return {
            sampleCount: 0,
            mean: 0,
            ci95Lower: 0,
            ci95Upper: 0,
            mapBreakdown: {}
        };
    }

    // 1. 按地图分层
    const mapGroups = new Map<string, StratifiedClusterSample[]>();
    for (const item of samples) {
        if (!mapGroups.has(item.mapName)) {
            mapGroups.set(item.mapName, []);
        }
        mapGroups.get(item.mapName)!.push(item);
    }

    const rng = createLcgRng(seed);
    const bootstrapMeans: number[] = [];

    for (let iter = 0; iter < iterations; iter++) {
        let grandSum = 0;
        let totalN = 0;

        for (const [_, itemsInMap] of mapGroups.entries()) {
            const nMap = itemsInMap.length;
            for (let j = 0; j < nMap; j++) {
                const pickIdx = Math.floor(rng() * nMap);
                grandSum += itemsInMap[pickIdx].pairScoreA;
            }
            totalN += nMap;
        }

        bootstrapMeans.push(grandSum / (totalN || 1));
    }

    bootstrapMeans.sort((a, b) => a - b);
    const lowIdx = Math.floor(iterations * 0.025);
    const highIdx = Math.floor(iterations * 0.975);

    const actualGrandMean = samples.reduce((acc, s) => acc + s.pairScoreA, 0) / samples.length;

    // 计算分地图指标
    const mapBreakdown: Record<string, { count: number; mean: number; lower95: number; upper95: number }> = {};
    for (const [mapName, itemsInMap] of mapGroups.entries()) {
        const nMap = itemsInMap.length;
        const mapActualMean = itemsInMap.reduce((acc, s) => acc + s.pairScoreA, 0) / nMap;
        const mapBootMeans: number[] = [];
        for (let iter = 0; iter < iterations; iter++) {
            let sum = 0;
            for (let j = 0; j < nMap; j++) {
                const pickIdx = Math.floor(rng() * nMap);
                sum += itemsInMap[pickIdx].pairScoreA;
            }
            mapBootMeans.push(sum / nMap);
        }
        mapBootMeans.sort((a, b) => a - b);
        mapBreakdown[mapName] = {
            count: nMap,
            mean: mapActualMean,
            lower95: mapBootMeans[lowIdx],
            upper95: mapBootMeans[highIdx]
        };
    }

    return {
        sampleCount: samples.length,
        mean: actualGrandMean,
        ci95Lower: bootstrapMeans[lowIdx],
        ci95Upper: bootstrapMeans[highIdx],
        mapBreakdown
    };
}

/**
 * 计算完整轨迹的确定性 SHA-256 哈希
 * 由初始状态哈希与全部动作代码序列组成，杜绝以单一终态哈希冒充轨迹唯一性！
 */
export function computeTrajectoryHash(initialStateHash: string, actionCodes: string[]): string {
    const content = `${initialStateHash}::${actionCodes.join(';')}`;
    return crypto.createHash('sha256').update(content).digest('hex');
}
