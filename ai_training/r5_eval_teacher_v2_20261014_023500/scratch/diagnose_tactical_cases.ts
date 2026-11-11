import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameEngine } from '../env/src/game/engine';
import { encodeAction } from '../env/src/game/env';
import { CorrectedSearchTeacherV1 } from '../research/search_teacher_v1';
import { selectRootCandidates } from '../research/candidate_selector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function diagnose() {
    const suitePath = path.resolve(__dirname, '../eval/tactical_suite_original.json');
    const cases = JSON.parse(fs.readFileSync(suitePath, 'utf-8'));

    const teacher = new CorrectedSearchTeacherV1('diag_teacher', { targetK: 4 });

    console.log(`=== 开始诊断全部 44 道战术题 (32 验收题 + 12 诊断题) ===`);
    let solvedCount = 0;
    let failedAcceptanceCount = 0;
    const failures: any[] = [];

    for (const c of cases) {
        const engine = new GameEngine(JSON.parse(JSON.stringify(c.state)));
        const legal = engine.getLegalActions(c.state.currentPlayer);
        const legalCodes = legal.map(encodeAction);

        // 1. 检查候选选择
        const sel = selectRootCandidates(engine, c.state.currentPlayer, legal, {
            targetK: 4,
            nonTopPriorFraction: 0.20,
            seed: 42
        });

        const trace = teacher.search({
            engineClone: engine.clone(),
            observerPlayerId: c.state.currentPlayer,
            legalActions: legal,
            candidateCodes: legalCodes,
            stateHash: c.stateHash,
            stepIndex: 0
        });

        const chosen = trace.chosenActionCode;
        const isSolved = c.expectedActionCodes.includes(chosen);

        const expectedInLegal = c.expectedActionCodes.every((exp: string) => legalCodes.includes(exp));
        const expectedSelected = c.expectedActionCodes.some((exp: string) => sel.selectedCodes.includes(exp));

        if (isSolved) {
            solvedCount++;
        } else {
            if (!c.isDiagnostic) failedAcceptanceCount++;

            // 失败归因分析
            let failureType = 'unknown';
            if (!expectedInLegal) {
                failureType = 'expected_not_legal';
            } else if (!expectedSelected) {
                failureType = 'expected_not_selected_in_k';
            } else {
                failureType = 'selected_but_ranked_lower';
            }

            failures.push({
                id: c.id,
                category: c.category,
                isDiagnostic: c.isDiagnostic,
                expected: c.expectedActionCodes,
                chosen,
                failureType,
                selectedCodes: sel.selectedCodes,
                chosenQ: trace.bestQ,
                candidateQMap: Object.fromEntries(
                    Object.entries(trace.candidateTraces).map(([k, v]) => [k, v.finalQ])
                )
            });
        }
    }

    console.log(`总通过: ${solvedCount}/${cases.length}`);
    console.log(`验收题失败数: ${failedAcceptanceCount}/32`);
    console.log(`\n失败题目详情归因汇总:`);
    for (const f of failures) {
        console.log(`[${f.id}] (${f.category}) Type=${f.failureType}`);
        console.log(`  期望: ${f.expected.join(', ')}`);
        console.log(`  实际选择: ${f.chosen} (Q=${f.chosenQ})`);
        console.log(`  已选候选: ${f.selectedCodes.join(', ')}`);
        console.log(`  候选 Q 值:`, f.candidateQMap);
    }

    const outPath = path.resolve(__dirname, '../artifacts/tactical_diagnosis.json');
    fs.writeFileSync(outPath, JSON.stringify({ solvedCount, failures }, null, 2), 'utf-8');
    console.log(`\n诊断结果已保存至: ${outPath}`);
}

diagnose();
