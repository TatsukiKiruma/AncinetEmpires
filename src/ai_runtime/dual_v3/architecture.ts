/** 权重结构独立版本；动作指针及六玩家输入合同沿用经过核验的v2。 */
export const ARCHITECTURE = {
    spatialChannels: [64, 96, 128], residualRanks: [24, 24, 32], spatialOutput: 96,
    transformerLayers: 4, entityWidth: 192, attentionHeads: 8, feedForward: 576,
    valueHidden: 256, pointerWidth: 64, playerSlots: 6,
} as const;
