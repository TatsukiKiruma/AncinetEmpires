/**
 * V14/T14-00 身份与基线冻结：source_snapshot.json + artifact_identity.json。
 *
 * 只记录“什么源码/数据/模型被实际加载”，不写结论。
 * 基线差异以文档声明 HEAD c1b9ac038fad98ed97bfd72a801fd564747acd07 为准。
 *
 * 用法：
 *   node v14/tools/freeze_identity.mjs --run-id v14_20260924_t14
 */
import fs from 'node:fs';
import path from 'node:path';
import {
    REPO_ROOT, gitInfo, fileIdentity, fileIdentities, digestJson,
    ensureDir, writeJson, writeText, rel,
} from './identity_lib.mjs';

const args = process.argv.slice(2);
function argOf(name, fallback) {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const runId = argOf('--run-id', 'v14_20260924_t14');
const DOC_BASELINE_HEAD = 'c1b9ac038fad98ed97bfd72a801fd564747acd07';
const outDir = ensureDir(path.join('v14', 'out', runId, 'T14-00'));

// 中文：按“职责模块”分组，便于其他任务直接引用同一源码摘要。
const SOURCE_GROUPS = {
    引擎与规则: [
        'src/game/engine.ts', 'src/game/rules.ts', 'src/game/rule_config.ts',
        'src/game/map.ts', 'src/game/abilities.ts', 'src/game/types.ts',
        'src/game/units.ts', 'src/game/terrain_rules.ts', 'src/game/terrain.ts',
        'src/game/state_snapshot.ts', 'src/game/campaign_events.ts',
    ],
    动作编解码: ['src/game/env.ts', 'tools/skirmish_action_semantics.ts'],
    空间编码器: [
        'src/game/ai/spatial_tensor_encoder.ts', 'src/game/ai/shared_spatial_policy.ts',
        'src/game/ai/spatial_conv_net.ts', 'src/game/ai/spatial_neural_adapter.ts',
        'src/game/ai/neural_ai_adapter.ts',
    ],
    Python训练器: [
        'python/train_spatial_resnet.py', 'python/spatial_resnet_model.py',
        'python/verify_parity.py',
    ],
    Python回归测试: [
        'python/tests/test_v11_gradient_masks.py',
        'python/tests/test_v11_optimizer_consumption.py',
        'python/tests/test_v13_trainer_contract.py',
    ],
    启发式与规划: [
        'src/game/ai/heuristic_ai.ts', 'src/game/ai/planning.ts',
        'src/game/ai/battle_search_ai.ts', 'src/game/ai/tactical_evaluation.ts',
        'src/game/ai/apk_like_ai.ts', 'src/game/ai/cancellable_ai_runner.ts',
        'src/game/ai/tactical_pathfinding.ts',
    ],
    搜索教师: ['tools/v7_heuristic_bounded_search.ts', 'tools/v10_turn_aware_search.ts'],
    V13历史实现: [
        'v13/tools/reencode_v31.ts', 'v13/tools/build_v3_subset.py', 'v13/tools/build_v31_subset.py',
        'v13/tools/candidate_contract.ts', 'v13/tools/eval_paired_v3.ts', 'v13/tools/eval_v3_core.ts',
        'v13/tools/tactical_core.ts', 'v13/tools/tactical_soundness.ts', 'v13/tools/tactical_suite_extended.ts',
    ],
    工具入口: ['v12/tools/run-tool.mjs', 'package.json', 'tsconfig.json'],
    V14审查: [
        'v14/V14_RULE_REVIEW.md', 'v14/V14_AGENT_TASKBOOK.md', 'v14/V14_AGENT_START.md',
        'v14/review/audit_v13_evidence.mjs', 'v14/review/probe_policy_permutation.ts',
        'v14/review/v13_evidence_audit.json', 'v14/review/policy_permutation_probe.json',
    ],
};

// 中文：历史运行工件（V13）身份；只描述，不覆盖。
const V13_ROOT = 'v13/out/v13_20260924_t13';
const HISTORICAL_ARTIFACTS = [
    V13_ROOT + '/T13-07/data_v3_b0/pool_v3.jsonl',
    V13_ROOT + '/T13-07/data_v3_b0/train.jsonl',
    V13_ROOT + '/T13-07/data_v3_b0/val.jsonl',
    V13_ROOT + '/T13-07/data_v3_b0/split_manifest.json',
    V13_ROOT + '/T13-07/data_v3_b0_v31/pool_v31.jsonl',
    V13_ROOT + '/T13-07/data_v3_b0_v31/pool_v31_subset.jsonl',
    V13_ROOT + '/T13-07/data_v3_b0_v31/reencode_v31_report.json',
    V13_ROOT + '/T13-07/data_v3_b0_v31/split_manifest.json',
    V13_ROOT + '/T13-07/optimizer_update_ledger.jsonl',
    V13_ROOT + '/T13-07/pilot_training_report_v31.md',
    V13_ROOT + '/T13-07/b0_heuristic_s42_metrics.json',
    V13_ROOT + '/T13-06/teacher_qualification.md',
    V13_ROOT + '/T13-06/teacher_kernel_contract.json',
    V13_ROOT + '/T13-06/tactical_soundness.json',
    V13_ROOT + '/T13-04/tiny_fit_metrics.json',
    V13_ROOT + '/T13-04/python_ts_parity.json',
    V13_ROOT + '/T13-02/eval_protocol_v3.json',
    V13_ROOT + '/final_summary.md',
    V13_ROOT + '/promotion_decision.json',
];

// 中文：模型工件身份。builtinXxx 是随前端加载的内置权重。
const MODEL_ARTIFACTS = [
    'src/game/ai/models/model_registry.json',
    'src/game/ai/models/spatial_resnet_checkpoint.json',
    'src/game/ai/models/spatial_resnet_v2_checkpoint.json',
    'src/game/ai/models/spatial_resnet_dagger_checkpoint.json',
    'src/game/ai/models/net_b_checkpoint.json',
    'training_runs/agent_upgrade_20260921_v8_final_01/checkpoints/spatial_resnet/spatial_resnet_v2_best.json',
    'training_runs/agent_upgrade_20260921_v8_final_01/checkpoints/spatial_resnet_dagger/spatial_resnet_dagger_best.json',
    'training_runs/agent_upgrade_20260921_v8_final_01/checkpoints/net_a/net_a_checkpoint.json',
];

const git = gitInfo();
const docBaselineMatchesHead = git.head === DOC_BASELINE_HEAD;
const sourceSnapshot = {
    schema: 'v14_source_snapshot_1',
    task: 'T14-00',
    runId,
    generatedAt: new Date().toISOString(),
    docBaseline: {
        declaredHead: DOC_BASELINE_HEAD,
        declaredBranch: 'main',
        declaredIn: ['v14/V14_RULE_REVIEW.md', 'v14/V14_AGENT_TASKBOOK.md'],
    },
    git,
    baselineDelta: {
        headMatchesDocBaseline: docBaselineMatchesHead,
        headMatches: git.head === DOC_BASELINE_HEAD,
        explanation: docBaselineMatchesHead
            ? '真实 HEAD 与文档声明基线一致，无源码差异。'
            : '真实 HEAD 与文档声明基线不同，需逐文件比较后才可引用文档结论。',
        untrackedPaths: git.worktreeChanges
            .filter((c) => c.x === '?' || c.y === '?')
            .map((c) => c.path),
        preExistingUserFiles: ['v13/temp.md'],
        note: 'v13/temp.md 是文档编写前已存在的用户文件，本轮不修改、不删除，也不纳入工件。',
    },
    sourceGroups: Object.fromEntries(Object.entries(SOURCE_GROUPS).map(([group, files]) => [
        group,
        fileIdentities(files, { withLines: true }),
    ])),
    sourceGroupDigest: Object.fromEntries(Object.entries(SOURCE_GROUPS).map(([group, files]) => [
        group,
        digestJson(fileIdentities(files).map((f) => [f.path, f.sha256])),
    ])),
    historicalArtifacts: fileIdentities(HISTORICAL_ARTIFACTS),
};

const artifactIdentity = {
    schema: 'v14_artifact_identity_1',
    task: 'T14-00',
    runId,
    generatedAt: new Date().toISOString(),
    registry: {
        path: 'src/game/ai/models/model_registry.json',
        productionDefaultPolicy: JSON.parse(
            fs.readFileSync(path.join(REPO_ROOT, 'src/game/ai/models/model_registry.json'), 'utf8'),
        ).defaultProductionPolicy,
    },
    models: fileIdentities(MODEL_ARTIFACTS),
    historicalArtifacts: sourceSnapshot.historicalArtifacts,
    note: '摘要均为真实文件字节 SHA-256；历史大文件按流式分块哈希，未复用任何缓存摘要。',
};

// 中文：哈希表形式的纯文本清单，便于人工核对与 diff。
const hashLines = [];
for (const [group, files] of Object.entries(sourceSnapshot.sourceGroups)) {
    hashLines.push('# ' + group);
    for (const f of files) {
        hashLines.push((f.exists ? f.sha256 : '(missing)') + '  ' + f.path);
    }
    hashLines.push('');
}
hashLines.push('# 历史工件与模型');
for (const f of [...HISTORICAL_ARTIFACTS, ...MODEL_ARTIFACTS]) {
    const rec = fileIdentity(f);
    hashLines.push((rec.exists ? rec.sha256 : '(missing)') + '  ' + f);
}

writeJson(path.join(outDir, 'source_snapshot.json'), sourceSnapshot);
writeJson(path.join(outDir, 'artifact_identity.json'), artifactIdentity);
writeText(path.join(outDir, 'source_hashes.txt'), hashLines.join('\n') + '\n');

console.log('[T14-00] runId=' + runId + ' HEAD=' + git.head + ' matchesDocBaseline=' + docBaselineMatchesHead);
console.log('[T14-00] source_snapshot.json / artifact_identity.json / source_hashes.txt -> ' + rel(outDir));
const missing = [...Object.values(sourceSnapshot.sourceGroups).flat(), ...sourceSnapshot.historicalArtifacts, ...artifactIdentity.models]
    .filter((f) => !f.exists).map((f) => f.path);
console.log('[T14-00] 缺失文件数=' + missing.length + (missing.length ? ' -> ' + missing.join(', ') : ''));
