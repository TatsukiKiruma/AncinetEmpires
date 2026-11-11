/** E6 独立数据合同；公共推理接口保持原样。 */
import type { Action, GameState } from '../../../../src/game/types';
export type Source = 'search-expert' | 'project-hard-demonstration' | 'natural-winner-demonstration' | 'value-only';
export interface StateRow {
    id: string; parent: string; ordinal: number; step: number; map: string; phase: string;
    source: Source; canonical: string; beforeHash: string; state: GameState; action: Action;
    targetCode: string; legalCodes: string[]; winner: number | null; valueMask: boolean;
    parentWeight: number; searchTarget?: { code: string; score: number }[];
}
export interface Preference { better: string; worse: string; margin: number }
export interface Witness {
    variant: 'hard' | 'champion'; code: string; seed: number; actions: Action[];
    actors: number[]; hashes: string[]; final: GameState; complete: boolean;
    reason: string; scores?: [number, number]; error?: string;
}
export interface TeacherRow {
    version: string; id: string; parent: string; canonical: string; rootPlayer: number;
    plannedCodes: string[]; witnesses: Witness[]; preferences: Preference[];
    rejected: string[]; seed: number; modelHashes: string[]; configSha256: string;
    elapsedMs: number;
}
