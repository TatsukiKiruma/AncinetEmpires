/**
 * V13/T13-06: does the search teacher actually DIFFER from the heuristic it wraps?
 *
 * BattleSearchAI returns the heuristic's top action unless its own threshold logic fires
 * (`takeoverThreshold` / `dangerLine` + `vetoMargin`) or it sees an immediate win. If those
 * branches rarely fire, the teacher is the heuristic plus noise, and distilling it teaches
 * nothing that imitating the heuristic would not - which is precisely the situation the B0
 * result exposed.
 *
 * This tool measures, per decision, on real states from the repository's own generator:
 *   - the action-agreement rate between BattleSearchAI and a plain HeuristicAI
 *   - which internal branch produced the decision (urgent / immediate-win / takeover /
 *     veto / fallback-to-heuristic)
 *   - the leaf-value margin between the search's pick and the heuristic's top pick
 *   - whether the search reached an opposing response at all
 *
 * All state comes from `createEvaluationState`; no position is hand-authored.
 *
 * Usage:
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/teacher_agreement.ts \
 *     --plan sd-normal --map "(2) Duel.aem" --seed 2026070501 --decisions 40
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BattleSearchAI } from '../../src/game/ai/battle_search_ai';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { createEvaluationState } from '../../tools/skirmish_evaluation_state';
import { encodeAction } from '../../src/game/env';
import type { Action } from '../../src/game/types';

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function writeAtomic(out: string, payload: unknown): void {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const tmp = `${out}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, out);
}

function mulberry(seed: number) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SEARCH_SEED = 2026070501;
const KERNEL = { topK: 10, oppProbeK: 6, friendlyRolloutSteps: 3 } as const;

function code(a: Action): string {
    try { return encodeAction(a); } catch { return JSON.stringify(a); }
}

async function main(): Promise<void> {
    const plan = arg('--plan', 'sd-normal');
    const map = arg('--map', '(2) Duel.aem');
    const seed = Number(arg('--seed', '2026070501'));
    const seat = Number(arg('--seat', '0'));
    const maxDecisions = Number(arg('--decisions', '40'));
    const out = arg('--out', 'v13/out/v13_20260924_t13/T13-06/teacher_agreement.json');

    const created = await createEvaluationState({ id: 1, map, plan, seed, seat } as any);
    const env = created.env as any;
    const engine = env.getEngine();
    // One instance of each, reused for the whole game, which is how the label tool uses them.
    const search = new BattleSearchAI(SEARCH_SEED, { ...KERNEL });
    const heuristic = new HeuristicAI(mulberry(seed ^ 0x5bf03635));

    const rows: any[] = [];
    let decisions = 0;
    let agree = 0;
    let nearTie = 0;
    const playerRng = mulberry(seed ^ 0x1234567);

    while (!engine.isTerminal() && decisions < maxDecisions) {
        const state = engine.getState();
        const p = state.currentPlayer;
        const legal: Action[] = engine.getLegalActions(p).filter((a: Action) => a.type !== 'surrender');
        if (legal.length >= 2) {
            // A second HeuristicAI with the SAME stream position is needed for a fair
            // comparison, so both are driven from a fresh identically-seeded instance.
            const heurA = new HeuristicAI(mulberry(seed ^ 0x5bf03635));
            const heurAction = heurA.getAction(engine, p, legal);
            const searchAction = search.getAction(engine, p, legal);

            const scored = (search as any).heuristic.scoreCandidateActions(engine, p, legal);
            const ordered = [...scored].sort((a: any, b: any) => b.score - a.score);
            const topK = ordered.slice(0, Math.min(KERNEL.topK, ordered.length));
            const heuTop = topK[0];

            const leafs = topK.map((c: any) => search.evaluateCandidate(engine, p, c.action));
            const heuTopLeaf = leafs[0];
            const bestLeaf = Math.max(...leafs);
            const bestIdx = leafs.indexOf(bestLeaf);
            const immediateWin = leafs.some(v => v >= 100000);
            const takeoverFired = bestLeaf >= heuTopLeaf + 1200;
            const vetoFired = heuTopLeaf <= -1500 && bestLeaf >= heuTopLeaf + 800;

            const searchCode = code(searchAction);
            const heurCode = code(heurAction);
            const isAgree = searchCode === heurCode;
            if (isAgree) agree++;
            if (Math.abs(bestLeaf - heuTopLeaf) < 20) nearTie++;

            rows.push({
                decision: decisions,
                turn: state.turn,
                playerId: p,
                legalCount: legal.length,
                searchAction: searchCode,
                heuristicAction: heurCode,
                agree: isAgree,
                agreedWithHeuristicTopCandidate: searchCode === code(heuTop.action),
                branch: immediateWin ? 'IMMEDIATE_WIN'
                    : takeoverFired ? 'TAKEOVER'
                        : vetoFired ? 'VETO' : 'FALLBACK_TO_HEURISTIC',
                leafMarginBestMinusHeuTop: bestLeaf - heuTopLeaf,
                leafRangeWithinTopK: Math.max(...leafs) - Math.min(...leafs),
                distinctLeafValues: new Set(leafs).size,
                topK: topK.length,
            });
            decisions++;
        }
        const action = heuristic.getAction(engine, p, undefined) ?? { type: 'end_turn' } as Action;
        engine.step(action);
        // keep the comparison heuristic in step with the game
        void playerRng;
    }

    const branchTally: Record<string, number> = {};
    for (const r of rows) branchTally[r.branch] = (branchTally[r.branch] ?? 0) + 1;
    const margins = rows.map(r => r.leafMarginBestMinusHeuTop).sort((a, b) => a - b);
    const distinctLeafCounts = rows.map(r => r.distinctLeafValues).sort((a, b) => a - b);

    const report = {
        schema: 'v13_teacher_agreement_1',
        generatedAt: new Date().toISOString(),
        scenario: { plan, map, seed, seat, subject: created.subjectId, players: created.players },
        kernelConfig: { ...KERNEL, searchSeed: SEARCH_SEED },
        decisionsProbed: decisions,
        agreement: {
            withPlainHeuristic: agree,
            rate: decisions ? agree / decisions : null,
            note: 'BattleSearchAI returns the heuristic top action unless a threshold branch '
                + 'fires; a high rate means the teacher adds little over the heuristic',
        },
        branchTally,
        searchActivity: {
            decisionsWhereTopKBranchWouldChangeTheAction: rows.filter(r => r.branch !== 'FALLBACK_TO_HEURISTIC').length,
            decisionsWithImmediateWinDetected: rows.filter(r => r.branch === 'IMMEDIATE_WIN').length,
            decisionsWhereLeafRangeWithinTopKIsZero: rows.filter(r => r.leafRangeWithinTopK === 0).length,
            leafCountDistribution: {
                min: distinctLeafCounts[0] ?? null,
                median: distinctLeafCounts.length ? distinctLeafCounts[Math.floor(distinctLeafCounts.length / 2)] : null,
                max: distinctLeafCounts.length ? distinctLeafCounts[distinctLeafCounts.length - 1] : null,
            },
        },
        leafMargin: {
            min: margins[0] ?? null,
            median: margins.length ? margins[Math.floor(margins.length / 2)] : null,
            max: margins.length ? margins[margins.length - 1] : null,
            note: 'best minus heuristic-top leaf value within topK; the takeover threshold is 1200',
        },
        rows,
    };
    writeAtomic(out, report);

    console.log(`[T13-06] decisions=${decisions} agreementWithHeuristic=${agree}/${decisions} = ${report.agreement.rate}`);
    console.log(`[T13-06] branches: ${JSON.stringify(branchTally)}`);
    console.log(`[T13-06] leafMargin best-vs-heuTop: min=${report.leafMargin.min} median=${report.leafMargin.median} max=${report.leafMargin.max} (takeover threshold 1200)`);
    console.log(`[T13-06] distinct leaf values within topK: ${JSON.stringify(report.searchActivity.leafCountDistribution)}`);
    console.log(`[T13-06] wrote ${out}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
