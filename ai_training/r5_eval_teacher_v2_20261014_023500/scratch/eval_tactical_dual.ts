import path from 'path';
import { fileURLToPath } from 'url';
import { CorrectedSearchTeacherV1 } from '../research/search_teacher_v1';
import { evaluateTacticalSuite } from '../research/evaluate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testDual() {
    const teacher = new CorrectedSearchTeacherV1('frozen_v1_teacher', { targetK: 4 });

    const pOld = path.resolve(__dirname, '../eval/tactical_suite_original.json');
    const pNew = path.resolve(__dirname, '../eval/tactical_suite_v2.json');

    console.log('>>> 正在评测旧 44 题套件 (32 验收题口径)...');
    const resOld = await evaluateTacticalSuite(teacher, pOld);
    console.log(`[旧题库] 验收题解决率: ${(resOld.acceptanceRate * 100).toFixed(1)}% (${resOld.acceptanceSolved}/${resOld.acceptanceCases})`);
    console.log(`[旧题库] 诊断题解决率: ${(resOld.diagnosticRate * 100).toFixed(1)}% (${resOld.diagnosticSolved}/${resOld.diagnosticCases})`);

    console.log('\n>>> 正在评测新 54 题套件 (42 验收题 + 12 诊断题，含 10 题独立 OOD 回归)...');
    const resNew = await evaluateTacticalSuite(teacher, pNew);
    console.log(`[新题库] 验收题解决率: ${(resNew.acceptanceRate * 100).toFixed(1)}% (${resNew.acceptanceSolved}/${resNew.acceptanceCases})`);
    console.log(`[新题库] 诊断题解决率: ${(resNew.diagnosticRate * 100).toFixed(1)}% (${resNew.diagnosticSolved}/${resNew.diagnosticCases})`);
}

testDual();
