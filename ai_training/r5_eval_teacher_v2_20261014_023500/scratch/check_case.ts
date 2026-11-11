import fs from 'fs';
import { GameEngine } from '../env/src/game/engine';
import { encodeAction } from '../env/src/game/env';
import { CorrectedSearchTeacherV1 } from '../research/search_teacher_v1';
import { computeStateHash } from '../research/state_hash';

const cases = JSON.parse(fs.readFileSync('eval/tactical_suite_original.json', 'utf8'));
const c = cases.find((x: any) => x.id === 'tactical_summon_1');
const engine = new GameEngine(c.state);
const legal = engine.getLegalActions(c.state.currentPlayer);

const teacher = new CorrectedSearchTeacherV1('test', { targetK: 4 });
const trace = teacher.search({
    engineClone: engine.clone(),
    observerPlayerId: c.state.currentPlayer,
    legalActions: legal,
    candidateCodes: legal.map(encodeAction),
    stateHash: computeStateHash(c.state),
    stepIndex: 0
});

for (const [code, t] of Object.entries(trace.candidateTraces)) {
    console.log(`Candidate ${code}: finalQ=${t.finalQ}, completed=${t.isCompleted}, leafPhase=${t.leafPhase}`);
}
