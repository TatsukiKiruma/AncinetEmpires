import type { multiplayerLedger } from './multiplayer_leaf';

export interface BranchEvidence {
    score: number;
    ledgerScore: number;
    ledger: ReturnType<typeof multiplayerLedger>;
    health: Map<string, number>;
    lethalActors: number;
    supports: number;
    complete: boolean;
    allyCastlesLost?: number;
}

/** 默认安全连动只可被真实战术事件或达到双重分差的方案接管。 */
export function takeoverDecision(primary: BranchEvidence, candidate: BranchEvidence, margin = .35): 'veto' | 'takeover' | null {
    if (!primary.complete || !candidate.complete) return null;
    const primaryLost = primary.allyCastlesLost ?? 0, candidateLost = candidate.allyCastlesLost ?? 0;
    if (candidateLost > primaryLost) return null;
    // 城堡保全优先于物资分差和普通单位牺牲，但不能用指挥官阵亡换城。
    if (candidateLost < primaryLost && candidate.ledger.allyCommanderLost === 0 && [...candidate.health.values()].every(hp => hp > 0)) return 'veto';
    const noCommanderRegression = [...primary.health].every(([id, hp]) => (candidate.health.get(id) ?? 0) >= hp);
    if (!noCommanderRegression || candidate.lethalActors > primary.lethalActors || candidate.ledger.allyCommanderLost > primary.ledger.allyCommanderLost) return null;
    if ([...primary.health].some(([id, hp]) => (candidate.health.get(id) ?? 0) > hp) || candidate.ledger.allyCommanderLost < primary.ledger.allyCommanderLost) return 'veto';
    const p = primary.ledger, c = candidate.ledger;
    // 普通单位避险不能牺牲总分或已经取得的斩杀、占领收益。
    const safeUnitVeto = candidate.lethalActors < primary.lethalActors
        && candidate.score >= primary.score
        && c.enemyCommanderKills >= p.enemyCommanderKills
        && c.enemyKills >= p.enemyKills
        && c.castles >= p.castles
        && c.towns >= p.towns;
    if (safeUnitVeto) return 'veto';
    const event = c.enemyCommanderKills > p.enemyCommanderKills || c.enemyKills > p.enemyKills || c.castles > p.castles || c.towns > p.towns || c.validRecruits > p.validRecruits || candidate.supports > primary.supports && candidate.ledgerScore > primary.ledgerScore;
    if (event && candidate.score >= primary.score + margin) return 'takeover';
    if (candidate.ledgerScore >= primary.ledgerScore + .20 && candidate.score >= primary.score + margin) return 'takeover';
    return null;
}
