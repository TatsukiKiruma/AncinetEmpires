import fs from 'node:fs';
import path from 'node:path';
import { HERE, ROOT, fileSha, sha } from './io';

/** 对实际运行源码作身份绑定；修订快照只作历史证据，不参与当前代码依赖。 */
export function runtimeIdentity() {
    const files: Record<string, string> = {};
    function visit(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) { if (!['revisions', '__pycache__'].includes(entry.name)) visit(file); }
            else if (/\.(ts|tsx|py|mjs|ps1)$/.test(entry.name)) files[path.relative(ROOT, file)] = fileSha(file);
        }
    }
    visit(path.join(ROOT, 'src/ai_runtime')); visit(path.join(ROOT, 'src/game')); visit(HERE);
    for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'ai_training/gpu/common.py', 'ai_training/gpu/data.py', 'ai_training/expert_iteration_2m_20261022/model.py', 'ai_training/dual_stream_v2_phase2_20261020/accurate_ops.py', 'ai_training/dual_stream_v2_phase1_20261020/tensor_bridge.ts', 'ai_training/continuation_review_20261030/stage3/ragged_batch.py', 'ai_training/continuation_review_20261030/stage3/ragged_map.py']) files[file] = fileSha(path.join(ROOT, file));
    return { version: 'anchor-first-cohort-v6', sha256: sha(JSON.stringify(files)), files };
}
