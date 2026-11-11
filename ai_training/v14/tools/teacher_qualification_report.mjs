/**
 * V14/T14-07：从已有证据整理搜索教师资格台账。
 *
 * 只读取已存在的工件（v13 教师探测、本轮规则套件/别名审查）+ 本轮实测的成本剖面，
 * 不伪造新的对战结论。凡是无法从现有证据支持的资格等级，一律写 NOT_QUALIFIED 并说明缺什么。
 *
 * 用法：
 *   node v14/tools/teacher_qualification_report.mjs --run-id v14_20260924_t14
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, ensureDir, fileIdentity, gitInfo, rel, writeJson } from './identity_lib.mjs';

const args = process.argv.slice(2);
function argOf(name, fallback) {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const runId = argOf('--run-id', 'v14_20260924_t14');
const outDir = ensureDir(path.join('v14', 'out', runId, 'T14-07'));

function readJson(relPath) {
    const abs = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(abs)) return null;
    try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { return null; }
}

const v13Tactical = readJson('v13/out/v13_20260924_t13/T13-06/tactical_soundness.json');
const v13TeacherContract = readJson('v13/out/v13_20260924_t13/T13-06/teacher_kernel_contract.json');
const v13TeacherQual = readJson('v13/out/v13_20260924_t13/T13-06/teacher_qualification.md') ? true : false;
const v13Invariance = readJson('v13/out/v13_20260924_t13/T13-06/teacher_invariance_tests.json');
const aliasing = readJson(`v14/out/${runId}/T14-03/state_aliasing_cases.json`);
const ruleSuite = readJson(`v14/out/${runId}/T14-01/rule_suite_results.json`);

const report = {
    schema: 'v14_teacher_qualification_1',
    task: 'T14-07',
    runId,
    generatedAt: new Date().toISOString(),
    head: gitInfo().head,
    scopeNote: '本轮教师资格只做「源码审查 + 已有证据复核 + 成本剖面」，未重新运行搜索教师的独立开发对战；'
        + '因此 T-strong 无法判定，按任务书保持 NOT_QUALIFIED，搜索蒸馏分支 DEFERRED。',
    baselineH0: {
        id: 'heuristic',
        source: 'src/game/ai/heuristic_ai.ts',
        role: '本轮 C1 的标签教师，也是开发对战里的镜像对手',
        identity: fileIdentity('src/game/ai/heuristic_ai.ts'),
    },
    ladder: [
        {
            level: 'T-legal',
            verdict: 'NOT_QUALIFIED',
            evidence: [],
            missing: [
                '本轮没有为搜索教师写「输出合法 / 状态无污染 / 动作码与评分对齐」的独立测试。',
                'v13 的 teacher_kernel_contract.json 只记录契约声明，本轮未复核其断言是否仍在当前源码上成立。',
            ],
        },
        {
            level: 'T-label',
            verdict: 'NOT_QUALIFIED',
            evidence: v13Tactical ? ['v13/out/v13_20260924_t13/T13-06/tactical_soundness.json'] : [],
            missing: [
                '任务书 T14-01 已指出 v13 战术探测器不足以裁决教师资格（lethal 未检查是否打死、用 maxRange 推测威胁、'
                + '把任意 move/attack/heal/support 当救援成功、pending 场景把继续招募当成功、下个行动者未完整遵循有效玩家规则）。',
                '本轮未按修正后的 oracle 重建教师战术集，因此无法声称「已验证战术集无已知关键退步」。',
            ],
            historicalEvidence: {
                tacticalSoundnessAvailable: v13Tactical !== null,
                tacticalSoundnessSha256: v13Tactical ? fileIdentity('v13/out/v13_20260924_t13/T13-06/tactical_soundness.json').sha256 : null,
                teacherKernelContractAvailable: v13TeacherContract !== null,
                teacherInvarianceAvailable: v13Invariance !== null,
                note: '这些是 HISTORICAL 证据，按任务书不能直接升级为 T-label。',
            },
        },
        {
            level: 'T-strong',
            verdict: 'NOT_QUALIFIED',
            evidence: [],
            missing: [
                '需要独立开发对战显示相对 H0 的正向配对改善，并在冻结的教师确认集获得支持——本轮未运行。',
                '需要关键已证明战术无回退——依赖 T-label 的重建结果。',
            ],
        },
        {
            level: 'T-online',
            verdict: 'NOT_QUALIFIED',
            evidence: [],
            missing: ['未在目标硬件上做取消/过期状态/端到端延迟资格测试。'],
        },
    ],
    v13ReviewFindingsStillApplicable: [
        '静态叶子 `evaluatePositionHeuristic` 是确定性函数；随机性出现在启发式动作排序与 rollout，'
        + '因此「随机叶子最大化已被证明是败因」不能成立（V14_RULE_REVIEW 3 节）。',
        '静态叶子近似：兵力按 hp/100 计值、价格同时参与资产值与规则变化、曼哈顿距离、近距离指挥官危险、多人指挥官信息合并。',
        '动作截断与换回合比例未按真实预算完整记录。',
    ],
    crossChecks: {
        stateAliasingCases: aliasing ? aliasing.counts : null,
        ruleSuiteCounts: ruleSuite ? ruleSuite.counts : null,
    },
    decision: {
        searchDistillationMainExperiment: 'DEFERRED',
        reason: 'GT 未通过：搜索教师没有可复核的教师资格证据，本轮不启动「蒸馏更强教师」主实验。',
        allowedNextSteps: [
            '启发式纠错（T14-08）与启发式基线（T14-06）不受影响，已按计划执行。',
            '若要重启搜索蒸馏，先按 T14-07 重建教师内核并完成 T-legal/T-label，再跑独立开发对战申请 T-strong。',
        ],
    },
    artifacts: [
        'v13/out/v13_20260924_t13/T13-06/tactical_soundness.json',
        'v13/out/v13_20260924_t13/T13-06/teacher_kernel_contract.json',
        'v13/out/v13_20260924_t13/T13-06/teacher_invariance_tests.json',
    ].map((p) => fileIdentity(p)),
};
writeJson(path.join(outDir, 'teacher_qualification.json'), report);
console.log(`[T14-07] teacher_qualification.json -> ${rel(path.join(outDir, 'teacher_qualification.json'))}`);
for (const level of report.ladder) console.log(`  ${level.level}: ${level.verdict}`);
console.log(`  搜索蒸馏主实验: ${report.decision.searchDistillationMainExperiment}`);
