import type { multiplayerLedger } from './multiplayer_leaf';

export interface BranchEvidence {
    score: number;
    ledgerScore: number;
    ledger: ReturnType<typeof multiplayerLedger>;
    health: Map<string, number>;
    lethalActors: number;
    supports: number;
    complete: boolean;
}

/** 默认安全连动只可被真实战术事件或达到双重分差的方案接管。 */
export function takeoverDecision(primary: BranchEvidence, candidate: BranchEvidence, margin = .35): 'veto' | 'takeover' | null {
    if (!primary.complete || !candidate.complete) return null;
    const noCommanderRegression = [...primary.health].every(([id, hp]) => (candidate.health.get(id) ?? 0) >= hp);
    if (!noCommanderRegression || candidate.lethalActors > primary.lethalActors || candidate.ledger.allyCommanderLost > primary.ledger.allyCommanderLost) return null;
    if ([...primary.health].some(([id, hp]) => (candidate.health.get(id) ?? 0) > hp) || candidate.lethalActors < primary.lethalActors || candidate.ledger.allyCommanderLost < primary.ledger.allyCommanderLost) return 'veto';
    const p = primary.ledger, c = candidate.ledger;
    const event = c.enemyCommanderKills > p.enemyCommanderKills || c.enemyKills > p.enemyKills || c.castles > p.castles || c.towns > p.towns || c.validRecruits > p.validRecruits || candidate.supports > primary.supports && candidate.ledgerScore > primary.ledgerScore;
    if (event && candidate.score >= primary.score + margin) return 'takeover';
    if (candidate.ledgerScore >= primary.ledgerScore + .20 && candidate.score >= primary.score + margin) return 'takeover';
    return null;
}
