/** 从已消费的当前规则轨迹中抽取固定回归集；不宣称新的独立泛化测试。 */
import { createReadStream, existsSync } from 'node:fs';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { encodeRecoveredState } from '../data/encode_recovered_state';
import { sourceDigestsV16 } from '../../v16/tools/eval_v16_identity';
import type { GameState } from '../../src/game/types';

const hash = (x: string) => createHash('sha256').update(x).digest('hex');
async function main() {
    const args = process.argv.slice(2);
    const option = (key: string, fallback: string) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
    const root = option('--root', 'v17/out/v17_20260926_r2/data/new_train/rollouts');
    const out = option('--out-dir', 'v19/out/data_scale_20261003/current_relabel');
    if (existsSync(out)) throw new Error('输出已存在，拒绝覆盖');
    await mkdir(out, { recursive: true });
    const pools = new Map<string, { rank: string; raw: any; file: string; lineIndex: number }[]>();
    const sources: Record<string, string> = {};
    let scanned = 0;
    for (const file of (await readdir(root)).filter(f => f.endsWith('.jsonl')).sort()) {
        const digest = createHash('sha256');
        for await (const chunk of createReadStream(path.join(root, file))) digest.update(chunk);
        sources[file] = digest.digest('hex');
        let lineIndex = -1;
        for await (const line of createInterface({ input: createReadStream(path.join(root, file)), crlfDelay: Infinity })) {
            lineIndex++;
            if (!line.trim()) continue;
            const raw = JSON.parse(line);
            if (!raw.stateJson || !raw.trueFamilyId) throw new Error(`${file}:${lineIndex} 缺少状态或真实家族`);
            scanned++;
            const pool = pools.get(raw.trueFamilyId) ?? [];
            const rank = hash(`current-regression-20261003:${raw.stateHash}`);
            if (pool.some(p => p.rank === rank)) continue;
            pool.push({ rank, raw, file, lineIndex });
            pool.sort((a, b) => a.rank.localeCompare(b.rank));
            pools.set(raw.trueFamilyId, pool.slice(0, 12));
        }
    }
    const rows: any[] = [];
    const errors: any[] = [];
    for (const [family, pool] of [...pools.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        for (const item of pool) {
            try {
                const state: GameState = typeof item.raw.stateJson === 'string' ? JSON.parse(item.raw.stateJson) : item.raw.stateJson;
                rows.push({ ...encodeRecoveredState(state), stateJson: state,
                    sampleId: `current:${item.file}:${item.lineIndex}`,
                    rootFamilyId: `current:${family}`, episodeId: item.raw.gameId,
                    provenance: {
                        familyId: `current:${family}`, sourceFile: path.join(root, item.file),
                        sourceFileSha256: sources[item.file], sourceLineIndex: item.lineIndex,
                        initializationPolicyId: item.raw.initializationPolicyId,
                        dataRole: 'previously_consumed_current_rules_regression_only',
                        independentGeneralizationEvidence: false,
                    },
                });
            } catch (error) { errors.push({ file: item.file, lineIndex: item.lineIndex, error: String(error) }); }
        }
    }
    const output = rows.map(r => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(out, 'rows.jsonl'), output);
    await writeFile(path.join(out, 'manifest.json'), JSON.stringify({
        kind: 'v19-current-regression-relabel', scanned, selectedFamilies: pools.size,
        selectedPerFamily: 12, rowCount: rows.length, errors,
        independentGeneralizationEvidence: false, sourceDigests: sourceDigestsV16(process.cwd()),
        sources, rowsSha256: hash(output), sourceSha256: hash(await readFile('v19/tools/build_current_regression_rows.ts', 'utf8')),
        encoderSha256: hash(await readFile('v19/data/encode_recovered_state.ts', 'utf8')),
    }, null, 2) + '\n');
    console.log(JSON.stringify({ scanned, families: pools.size, rows: rows.length, errors }));
    if (errors.length) process.exitCode = 2;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
