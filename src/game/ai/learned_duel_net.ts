/**
 * learned_duel MLP 推理（纯 TS，无依赖）：与 python/learn_duel_train.py 导出的
 * docs/training/battle_ai/models/learned_duel_*.json 配套。
 * policy: concat(state356, action45) -> score；value: state356 -> P(行动方阵营获胜)。
 */
import type { GameState, Action } from '../types';
import { encodeGameState, encodeGameActionV2 } from '../../../tools/skirmish_network_features';
import { extraActionFeatures } from '../../../tools/learn_duel_extra_features';
import defaultModelData from './models/learned_duel_v1.json';
import p0ModelData from './models/learned_duel_p0.json';
import p1ModelData from './models/learned_duel_p1.json';

export interface MlpLayer {
  w: number[][];
  b: number[];
}

export interface MlpHead {
  layers: MlpLayer[];
  scaler: { mean: number[]; std: number[] };
}

export interface LearnedDuelModelJson {
  stateDim: number;
  actDim: number;
  hidden: number;
  tag?: string;
  policy: MlpHead;
  value: MlpHead;
}

export function learnedModelTag(): string {
  return (defaultModelData as unknown as LearnedDuelModelJson).tag ?? 'untagged';
}

export interface LearnedDuelNet {
  policyScores(state: GameState, playerId: number, actions: readonly Action[]): number[];
  valueOf(state: GameState, playerId: number): number;
  info(): { stateDim: number; actDim: number; hidden: number };
}

function forward(head: MlpHead, input: number[]): number {
  const { mean, std } = head.scaler;
  let x = input.map((v, i) => (v - mean[i]) / std[i]);
  for (let li = 0; li < head.layers.length; li++) {
    const layer = head.layers[li];
    const last = li === head.layers.length - 1;
    const y = new Array(layer.b.length);
    for (let j = 0; j < layer.b.length; j++) {
      let s = layer.b[j];
      const wj = layer.w[j];
      for (let i = 0; i < x.length; i++) s += wj[i] * x[i];
      y[j] = last ? s : (s > 0 ? s : 0);
    }
    x = y;
  }
  return x[0] ?? 0;
}

export function createLearnedDuelNet(model: LearnedDuelModelJson): LearnedDuelNet {
  return {
    policyScores(state, playerId, actions) {
      const stateVec = Array.from(encodeGameState(state, playerId));
      return actions.map(action => {
        const actVec = [
          ...Array.from(encodeGameActionV2(state, playerId, action)),
          ...extraActionFeatures(state, playerId, action)
        ];
        return forward(model.policy, [...stateVec, ...actVec]);
      });
    },
    valueOf(state, playerId) {
      const stateVec = Array.from(encodeGameState(state, playerId));
      const logit = forward(model.value, stateVec);
      return 1 / (1 + Math.exp(-logit));
    },
    info() {
      return { stateDim: model.stateDim, actDim: model.actDim, hidden: model.hidden };
    }
  };
}

let defaultNet: LearnedDuelNet | null = null;
const seatNets: Array<LearnedDuelNet | null> = [null, null];

/** 默认 v1 模型（随模型版本迭代更新）。 */
export function getDefaultLearnedDuelNet(): LearnedDuelNet {
  if (!defaultNet) {
    defaultNet = createLearnedDuelNet(defaultModelData as unknown as LearnedDuelModelJson);
  }
  return defaultNet;
}

/** 分色模型：座位 0 用 P0-net，先手开局与逆风专精；座位 1 用 P1-net。 */
export function getSeatLearnedDuelNet(seat: number): LearnedDuelNet {
  const idx = seat === 0 ? 0 : 1;
  if (!seatNets[idx]) {
    const data = (idx === 0 ? p0ModelData : p1ModelData) as unknown as LearnedDuelModelJson;
    seatNets[idx] = createLearnedDuelNet(data);
  }
  return seatNets[idx]!;
}

export function learnedSeatModelTag(seat: number): string {
  const data = ((seat === 0 ? p0ModelData : p1ModelData) as unknown as LearnedDuelModelJson);
  return data.tag ?? 'untagged';
}
