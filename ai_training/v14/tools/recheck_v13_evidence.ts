/**
 * V14 复核：用**真实共享解码器**重新核验 V13 v3.1 的证据读数，并记录与审查文档基线的源码差异。
 *
 * 为什么不能直接重跑 `v14/review/audit_v13_evidence.mjs`：
 * 该脚本用「抽取单个函数源码再求值」的方式加载 `src/game/env.ts#decodeAction`，
 * 以便只读复现而不用导入带副作用的模块。但审查 HEAD 之后，
 * 工作区的 `decodeAction` 已经改为在函数体内定义局部 `parsePos` 并引用模块级 `UNIT_CONFIGS`，
 * 于是抽取出来的函数在求值时抛 `ReferenceError: UNIT_CONFIGS is not defined`。
 * 这是**源码差异导致旧复现入口失效**，不是审查结论被推翻。
 *
 * 因此本工具改用 v12/tools/run-tool.mjs 走真实的 TS 模块导入，并在报告中同时给出：
 * 1. 真实 `src/game/env.ts#decodeAction` 与 `v13/tools/reencode_v31.ts#decodeActionCode`
 *    在同一批动作码上的逐项对比（用于确认「标签动作走私有解码器」这一缺陷仍然成立）；
 * 2. `pool_v31_subset.jsonl` 的全部计数复算（行数、候选数、缺失候选、行动者缺失、招募标签数）；
 * 3. 两个迁移前审查输入文件的真实 SHA-256，与 `v14/review/v13_evidence_audit.json` 中记录的值对比。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/recheck_v13_evidence.ts \
 *       --subset <pool_v31_subset.jsonl> --out-dir <dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { decodeAction } from '../../src/game/env';
import { UNIT_CONFIGS } from '../../src/game/units';

// 中文：ESM 下没有裸 require；用 createRequire 取得 CommonJS 加载器来按需加载 typescript 编译器。
const require = createRequire(import.meta.url);

function argOf(name: string, fallback: string | null): string | null {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const subsetPath = argOf('--subset', 'v13/out/v13_20260924_t13/T13-07/data_v3_b0_v31/pool_v31_subset.jsonl')!;
const outDir = argOf('--out-dir', 'v14/out/v14_20260925_t14b/T14-00')!;
const reencodePath = 'v13/tools/reencode_v31.ts';
const envPath = 'src/game/env.ts';
const priorAuditPath = 'v14/review/v13_evidence_audit.json';

function sha256File(file: string): string {
    const hash = crypto.createHash('sha256');
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.allocUnsafe(1 << 20);
    try {
        for (;;) {
            const read = fs.readSync(fd, buf, 0, buf.length, null);
            if (read <= 0) break;
            hash.update(buf.subarray(0, read));
        }
    } finally {
        fs.closeSync(fd);
    }
    return hash.digest('hex');
}

/**
 * 中文：把 `decodeActionCode`（V13 私有解码器）单独求值。
 * 它不依赖模块级常量，因此仍然可以用「抽取 + 转译」的方式隔离执行，
 * 这样对比的是两个真实实现，而不是我们重写的一份。
 */
function loadPrivateDecoder(file: string, name: string): (code: string, state: unknown) => unknown {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ts = require('typescript');
    const source = fs.readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const node = ast.statements.find((stmt: any) => ts.isFunctionDeclaration(stmt) && stmt.name?.text === name);
    if (!node) throw new Error(`未找到函数：${file}#${name}`);
    const code = ts.transpileModule(node.getText(ast), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports: Record<string, unknown> = {};
    // eslint-disable-next-line no-new-func
    new Function('exports', 'require', code)(exports, require);
    return exports[name] as (code: string, state: unknown) => unknown;
}

interface Counts {
    rows: number;
    storedCandidates: number;
    declaredLegalCandidates: number;
    rowsWithMissingCandidates: number;
    missingCandidateOccurrences: number;
    rowsMarkedUntruncatedDespiteMissing: number;
    targetIndexCodeMismatches: number;
    healCandidates: number;
    healCandidatesWithoutActor: number;
    supportCandidates: number;
    supportCandidatesWithoutActor: number;
    rowsWithRecruitCandidates: number;
    recruitCandidateOccurrences: number;
    recruitCandidatesThatAreLabels: number;
}

async function main(): Promise<void> {
    const privateDecode = loadPrivateDecoder(reencodePath, 'decodeActionCode');
    const state = { units: ['u1', 'u2'].map((id) => ({ id, pos: { x: 1, y: 1 } })) };
    const codes = [
        'move:u1:2,1', 'attack:u1:u2', 'capture:u1', 'repair:u1',
        'heal:u1:u2', 'support:u1:u2', 'recruit_to_castle:soldier:1,1',
        'recruit_and_deploy:soldier:1,1:2,1', 'summon:u1:g1:2,1',
        'destroy_town:u1:2,1', 'post_attack_move:u1:2,1', 'wait:u1', 'end_turn', 'surrender',
    ];
    const decoderCases = codes.map((code) => ({
        code,
        privateDecode: privateDecode(code, state) ?? null,
        sharedDecode: decodeAction(code) ?? null,
    }));

    const counts: Counts = {
        rows: 0, storedCandidates: 0, declaredLegalCandidates: 0, rowsWithMissingCandidates: 0,
        missingCandidateOccurrences: 0, rowsMarkedUntruncatedDespiteMissing: 0,
        targetIndexCodeMismatches: 0, healCandidates: 0, healCandidatesWithoutActor: 0,
        supportCandidates: 0, supportCandidatesWithoutActor: 0,
        rowsWithRecruitCandidates: 0, recruitCandidateOccurrences: 0,
        recruitCandidatesThatAreLabels: 0,
    };
    const targetTypes: Record<string, number> = {};
    const roots = new Set<string>();
    const examples: unknown[] = [];

    const reader = readline.createInterface({ input: fs.createReadStream(subsetPath), crlfDelay: Infinity });
    for await (const line of reader) {
        if (!line.trim()) continue;
        const row = JSON.parse(line);
        const candidates = row.candidateActions ?? [];
        counts.rows += 1;
        counts.storedCandidates += candidates.length;
        counts.declaredLegalCandidates += Number(row.candidateCountLegal ?? 0);
        roots.add(String(row.rootFamilyId));
        const missing = Number(row.candidateCountLegal ?? 0) - candidates.length;
        if (missing > 0) {
            counts.rowsWithMissingCandidates += 1;
            counts.missingCandidateOccurrences += missing;
            if (row.truncated === false) counts.rowsMarkedUntruncatedDespiteMissing += 1;
            if (examples.length < 3) {
                examples.push({
                    sampleId: row.sampleId, sourceRowIndex: row.sourceRowIndex,
                    declared: row.candidateCountLegal, stored: candidates.length, truncated: row.truncated,
                });
            }
        }
        const targetCodes: string[] = row.candidateActionCodes ?? [];
        if (targetCodes[row.targetActionIndex] !== row.targetActionCode) counts.targetIndexCodeMismatches += 1;
        const targetType = String(row.targetActionCode).split(':')[0];
        targetTypes[targetType] = (targetTypes[targetType] ?? 0) + 1;
        let hasRecruit = false;
        for (let i = 0; i < candidates.length; i += 1) {
            const type = String(targetCodes[i] ?? '').split(':')[0];
            const entry = candidates[i];
            if (type === 'heal') {
                counts.healCandidates += 1;
                if (!entry.actorCoord) counts.healCandidatesWithoutActor += 1;
            }
            if (type === 'support') {
                counts.supportCandidates += 1;
                if (!entry.actorCoord) counts.supportCandidatesWithoutActor += 1;
            }
            if (type === 'recruit_to_castle' || type === 'recruit_and_deploy') {
                hasRecruit = true;
                counts.recruitCandidateOccurrences += 1;
                if (i === row.targetActionIndex) counts.recruitCandidatesThatAreLabels += 1;
            }
        }
        if (hasRecruit) counts.rowsWithRecruitCandidates += 1;
    }

    const priorAudit = fs.existsSync(priorAuditPath)
        ? JSON.parse(fs.readFileSync(priorAuditPath, 'utf8'))
        : null;
    const subsetSha = sha256File(subsetPath);
    const envSha = sha256File(envPath);
    const reencodeSha = sha256File(reencodePath);

    const report = {
        schema: 'v14_v13_evidence_recheck_1',
        generatedAt: new Date().toISOString(),
        task: 'T14-00',
        purpose: '中文：用真实共享解码器复核 V13 证据读数，并记录旧复现入口因源码变化而失效的具体原因。',
        files: {
            subset: { path: subsetPath.replace(/\\/g, '/'), sha256: subsetSha },
            sharedDecoder: { path: envPath, sha256: envSha },
            privateDecoder: { path: reencodePath, sha256: reencodeSha },
        },
        priorArtifactComparison: priorAudit
            ? {
                path: priorAuditPath,
                subsetShaMatches: priorAudit.files?.subset?.sha256 === subsetSha,
                declaredSubsetSha: priorAudit.files?.subset?.sha256 ?? null,
                sharedDecoderShaMatches: priorAudit.files?.sharedDecoder?.sha256 === envSha,
                declaredSharedDecoderSha: priorAudit.files?.sharedDecoder?.sha256 ?? null,
                privateDecoderShaMatches: priorAudit.files?.reencoder?.sha256 === reencodeSha,
                declaredPrivateDecoderSha: priorAudit.files?.reencoder?.sha256 ?? null,
                countsMatch: JSON.stringify(priorAudit.counts) === JSON.stringify(counts),
                priorCounts: priorAudit.counts ?? null,
            }
            : null,
        counts,
        distinctRoots: roots.size,
        targetTypes,
        missingCandidateExamples: examples,
        decoderCases,
        notes: [
            'subsetsha 与审查记录一致时，数据身份未变，旧读数的可复核性不受源码变化影响。',
            'sharedDecoder sha 变化说明共享解码器在工作区已被修改；这正是旧复现入口失效的原因。',
        ],
    };

    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'recheck_v13_evidence.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({
        outPath,
        subsetShaMatches: report.priorArtifactComparison?.subsetShaMatches,
        countsMatch: report.priorArtifactComparison?.countsMatch,
        counts,
    }, null, 2));
}

void main();
