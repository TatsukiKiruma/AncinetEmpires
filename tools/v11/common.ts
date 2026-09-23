/**
 * V11 common utilities.
 *
 * Boundaries (from the V11 taskbook section 0):
 * - Never overwrite historical v10 numbers or artifacts; V11 outputs go to
 *   training_runs/<RUN_ID>/ and v11/out/ (or V11_OUT_DIR).
 * - All new runs use a new runId.
 * - No game-rule changes, no production-AI replacement, no paid compute.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export const V11_ROOT = path.resolve(process.env.V11_ROOT || 'v11');
export const OUT_DIR = path.resolve(process.env.V11_OUT_DIR || path.join(V11_ROOT, 'out'));
export const RUN_ID = process.env.V11_RUN_ID || `agent_upgrade_v11_batch1_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
export const RUN_DIR = path.resolve(process.env.V11_RUN_DIR || `training_runs/${RUN_ID}`);

/** Review commit this taskbook was written against. */
export const REVIEW_COMMIT = '4451947355e9683437a6fc1348cf01657eaf50e3';

/**
 * Source files frozen by T11-00. Paths are repo-relative and must exist at
 * audit time, otherwise the freeze fails loudly instead of silently producing
 * a partial snapshot.
 */
export const FROZEN_SOURCE_FILES = [
    'src/game/engine.ts',
    'src/game/apk_skirmish.ts',
    'src/game/apk_skirmish_map_assets.ts',
    'src/game/state_snapshot.ts',
    'src/game/ai/heuristic_ai.ts',
    'src/game/ai/battle_search_ai.ts',
    'src/game/ai/spatial_tensor_encoder.ts',
    'src/game/ai/spatial_conv_net.ts',
    'tools/v7_unified_evaluation.ts',
    'tools/v7_training_pipeline.ts',
    'tools/v10_common.ts',
    'tools/v10_value_learning.ts',
    'tools/v10_turn_aware_search.ts',
    'tools/v10_dagger_controlled.ts',
    'tools/v10_representation_ablation.ts',
    'tools/v10fix/pipeline.ts',
    'tools/v10fix/collectors.ts',
    'tools/v10fix/loss_ablation.ts',
    'python/train_spatial_resnet.py',
    'python/spatial_resnet_model.py',
] as const;

/** Artifacts whose provenance depends on the F01-misaligned value extraction. */
export const F01_DERIVED_ARTIFACTS = [
    'training_runs/agent_upgrade_20260923_v10_fix_01/value_learning_fix/datasets/d_v10_value_dataset.jsonl',
    'training_runs/agent_upgrade_20260923_v10_fix_01/value_learning_fix/datasets/v10_value_split_manifest.json',
    'training_runs/agent_upgrade_20260923_v10_fix_01/value_learning_fix/checkpoints/spatial_resnet_cv0.json',
    'training_runs/agent_upgrade_20260923_v10_fix_01/value_learning_fix/checkpoints/spatial_resnet_cv01.json',
    'training_runs/agent_upgrade_20260923_v10_fix_01/value_learning_fix/checkpoints/spatial_resnet_cv025.json',
    'v10/fix_01/value_calibration.json',
    'v10/fix_01/representation_ablation.json',
    'v10/fix_01/T10-06_search_value_comparison.json',
    'v10/fix_01/T10-06_prepare.json',
] as const;

export function ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
}

export function sha256(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
}

export function sha256File(file: string): string | null {
    if (!fs.existsSync(file)) return null;
    return sha256(fs.readFileSync(file));
}

export function readJson<T = any>(file: string): T {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function writeJson(file: string, value: unknown): void {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

export function appendJsonl(file: string, records: unknown[]): void {
    ensureDir(path.dirname(file));
    if (records.length === 0) return;
    fs.appendFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

export function writeJsonl(file: string, records: unknown[]): void {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''), 'utf8');
}

export function readJsonl<T = any>(file: string): T[] {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8')
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line) as T);
}

export function relPosix(file: string): string {
    return path.relative(process.cwd(), file).split(path.sep).join('/');
}

export function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

/** True when this module is the process entry point (never true under vitest). */
export function isMain(scriptBasename: string): boolean {
    const argv1 = process.argv[1] ?? '';
    return argv1.endsWith(scriptBasename);
}
