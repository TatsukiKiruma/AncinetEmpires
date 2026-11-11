/** 只读核验 V13 数据与动作解码器；仅在 v14/review 下写审查结果。 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const subsetPath = 'v13/out/v13_20260924_t13/T13-07/data_v3_b0_v31/pool_v31_subset.jsonl';
const reportPath = 'v13/out/v13_20260924_t13/T13-07/data_v3_b0_v31/reencode_v31_report.json';
const reencodePath = 'v13/tools/reencode_v31.ts';
const envPath = 'src/game/env.ts';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

// 提取当前源码中的原函数，避免导入带 main 副作用的重编码脚本。
function loadIsolatedFunction(file, name) {
    const source = fs.readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (!fn) throw new Error(`未找到函数：${file}#${name}`);
    const code = ts.transpileModule(fn.getText(ast), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    new Function('exports', code)(exports);
    return exports[name];
}

const privateDecode = loadIsolatedFunction(reencodePath, 'decodeActionCode');
const sharedDecode = loadIsolatedFunction(envPath, 'decodeAction');
const state = { units: ['u1', 'u2'].map(id => ({ id, pos: { x: 1, y: 1 } })) };
const codes = [
    'move:u1:2,1', 'attack:u1:u2', 'capture:u1', 'repair:u1',
    'heal:u1:u2', 'support:u1:u2', 'recruit_to_castle:soldier:1,1',
    'recruit_and_deploy:soldier:1,1:2,1', 'summon:u1:g1:2,1',
    'destroy_town:u1:2,1', 'post_attack_move:u1:2,1', 'wait:u1', 'end_turn', 'surrender',
];
const decoderCases = codes.map(code => ({ code, v31: privateDecode(code, state), shared: sharedDecode(code) }));
const readStream = fs.createReadStream(subsetPath);
const hash = crypto.createHash('sha256');
readStream.on('data', chunk => hash.update(chunk));
const lines = readline.createInterface({ input: readStream, crlfDelay: Infinity });
const counts = {
    rows: 0, storedCandidates: 0, declaredLegalCandidates: 0, rowsWithMissingCandidates: 0,
    missingCandidateOccurrences: 0, rowsMarkedUntruncatedDespiteMissing: 0,
    targetIndexCodeMismatches: 0, healCandidates: 0, healCandidatesWithoutActor: 0,
    supportCandidates: 0, supportCandidatesWithoutActor: 0,
    rowsWithRecruitCandidates: 0, recruitCandidateOccurrences: 0,
    recruitCandidatesThatAreLabels: 0,
};
const examples = [];
const targetTypes = {};
const roots = new Set();
for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const candidates = row.candidateActions;
    counts.rows++;
    counts.storedCandidates += candidates.length;
    counts.declaredLegalCandidates += row.candidateCountLegal;
    roots.add(row.rootFamilyId);
    const missing = row.candidateCountLegal - candidates.length;
    if (missing > 0) {
        counts.rowsWithMissingCandidates++;
        counts.missingCandidateOccurrences += missing;
        if (row.truncated === false) counts.rowsMarkedUntruncatedDespiteMissing++;
        if (examples.length < 3) examples.push({ sampleId: row.sampleId, sourceRowIndex: row.sourceRowIndex,
            declared: row.candidateCountLegal, stored: candidates.length, truncated: row.truncated });
    }
    if (row.candidateActionCodes[row.targetActionIndex] !== row.targetActionCode) counts.targetIndexCodeMismatches++;
    const targetType = row.targetActionCode.split(':')[0];
    targetTypes[targetType] = (targetTypes[targetType] ?? 0) + 1;
    let hasRecruit = false;
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const type = row.candidateActionCodes[i].split(':')[0];
        if (type === 'heal') { counts.healCandidates++; if (!c.actorCoord) counts.healCandidatesWithoutActor++; }
        if (type === 'support') { counts.supportCandidates++; if (!c.actorCoord) counts.supportCandidatesWithoutActor++; }
        if (type === 'recruit_to_castle' || type === 'recruit_and_deploy') {
            hasRecruit = true;
            counts.recruitCandidateOccurrences++;
            if (i === row.targetActionIndex) counts.recruitCandidatesThatAreLabels++;
        }
    }
    if (hasRecruit) counts.rowsWithRecruitCandidates++;
}
const originalReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const result = {
    schema: 'v14_readonly_evidence_review_1',
    generatedAt: new Date().toISOString(),
    sourceCommit: 'c1b9ac038fad98ed97bfd72a801fd564747acd07',
    scope: '数据计数及隔离的动作解码复现；未训练，未重新对战，未验证完整引擎状态重建。',
    files: { subset: { path: subsetPath, sha256: hash.digest('hex') },
        reencoder: { path: reencodePath, sha256: digest(fs.readFileSync(reencodePath)) },
        sharedDecoder: { path: envPath, sha256: digest(fs.readFileSync(envPath)) } },
    counts, distinctRoots: roots.size, targetTypes, missingCandidateExamples: examples,
    v31BuildReportedUndecodable: originalReport.undecodableActionCodes,
    decoderCases,
};
const out = 'v14/review/v13_evidence_audit.json';
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ out, counts, targetTypes, subsetSha256: result.files.subset.sha256 }, null, 2));
