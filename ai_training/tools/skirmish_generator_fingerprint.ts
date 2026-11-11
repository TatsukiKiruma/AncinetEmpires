import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 将实际源码纳入新版导出标识，包含尚未提交的引擎、规则和教师改动。 */
export async function resolveFeatureGeneratorFingerprint(): Promise<string> {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const files: string[] = [];
    const collect = async (directory: string) => {
        for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
            const relative = `${directory}/${entry.name}`;
            if (entry.isDirectory() && entry.name !== 'tests') await collect(relative);
            else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(relative);
        }
    };
    await collect('src/game');
    for (const file of [
        'skirmish_bc_train', 'skirmish_navigation_features', 'skirmish_episode_feature_export', 'skirmish_dataset_export',
        'skirmish_candidate_sampling', 'skirmish_heuristic_relabel', 'skirmish_training_sampling',
        'skirmish_checkpoint_quota', 'skirmish_dataset_artifacts', 'sd_training_state_generator',
        'skirmish_training_runner', 'skirmish_generator_fingerprint', 'skirmish_old_dataset_migrate'
    ]) files.push(`tools/${file}.ts`);
    const hash = createHash('sha256');
    for (const file of files.sort()) {
        hash.update(file).update('\0');
        hash.update((await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n')).update('\0');
    }
    return hash.digest('hex');
}
