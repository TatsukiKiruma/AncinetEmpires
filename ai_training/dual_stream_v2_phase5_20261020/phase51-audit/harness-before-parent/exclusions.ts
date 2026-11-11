import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync, constants } from 'node:zlib';
import { DIR, ROOT, STAGE3, STAGE4, read, sha, save } from './common';
import { loadExclusions } from '../dual_stream_v2_phase3_20261020/source_loader';
import { gzipRows } from '../dual_stream_v2_phase1_20261020/io';
import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';
import { ruleStateHash } from '../data_acceptance_20261016/replay/core';
import { fixedDevExclusions } from './dev_exclusions';
import { diskGuard } from './durable_log';
import { persistEvaluationIndex } from './evaluation_index';

export async function evaluationExclusions() {
    const manifest = read(path.join(STAGE3, 'split-manifest-v2-stage3.json')), excluded = loadExclusions(manifest);
    for (const hash of await fixedDevExclusions()) excluded.add(hash);
    const files: string[] = [];
    const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isSymbolicLink()) continue;
            if (e.isDirectory()) walk(p); else if (e.name === 'actions.jsonl.gz') files.push(p);
        }
    };
    walk(path.join(STAGE3, 'battles')); walk(path.join(STAGE4, 'battles')); walk(path.join(STAGE4, 'battle-attempt01'));
    walk(path.join(DIR, 'historical-arena'));
    walk(path.join(DIR, 'champion-pure-arena')); walk(path.join(DIR, 'champion-search-arena'));
    walk(path.join(DIR, 'champion-search-arena-v1-archive'));
    // 今天另一个合同的第2代评测也已消费，必须排除，不能混入本轮训练。
    const otherRun = path.resolve(DIR, '../dual_stream_v2_gen02_20261021');
    for (const name of ['champion-pure-arena', 'champion-search-arena', 'generations/gen_02/arena']) walk(path.join(otherRun, name));
    for (const e of fs.readdirSync(path.join(DIR, 'generations'), { withFileTypes: true })) if (e.isDirectory()) walk(path.join(DIR, 'generations', e.name, 'arena'));
    // 设备专项也是已经消费的评测，后续代必须连同其真实轨迹永久排重。
    for (const e of fs.readdirSync(DIR, { withFileTypes: true })) if (e.isDirectory() && e.name.startsWith('device-comparison-10')) walk(path.join(DIR, e.name));
    const identities: Record<string, string> = {}, replayed: Record<string, number> = {};
    const rules = path.join(ROOT, 'src/game');
    const authoritySha256 = sha(fs.readdirSync(rules).filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts')).sort().map(n => sha(fs.readFileSync(path.join(rules, n)))).join(':'));
    const cacheDirectory = path.join(DIR, 'evaluation-rule-cache'); fs.mkdirSync(cacheDirectory, { recursive: true });
    const previousReceiptPath = path.join(DIR, 'evaluation-exclusion-receipt.json'), previousHashesPath = path.join(DIR, 'evaluation-exclusions.txt.gz');
    const knownFiles = new Map<string, number>();
    if (fs.existsSync(previousReceiptPath) && fs.existsSync(previousHashesPath)) {
        const previous = read(previousReceiptPath), plain = gunzipSync(fs.readFileSync(previousHashesPath)).toString();
        if (previous.authoritySha256 === authoritySha256 && previous.sha256 === sha(plain) && previous.includesCanonicalRuleStates) {
            for (const hash of plain.trim().split('\n')) excluded.add(hash);
            for (const [name, identity] of Object.entries(previous.files)) knownFiles.set(identity as string, previous.replayed[name]);
        }
    }
    for (const file of files.sort()) {
        const bytes = fs.readFileSync(file); identities[path.relative(DIR, file)] = sha(bytes);
        if (knownFiles.has(sha(bytes))) { replayed[path.relative(DIR, file)] = knownFiles.get(sha(bytes))!; continue; }
        const cacheFile = path.join(cacheDirectory, sha(sha(bytes) + authoritySha256) + '.json.gz');
        if (fs.existsSync(cacheFile)) {
            const cache = JSON.parse(gunzipSync(fs.readFileSync(cacheFile)).toString());
            if (cache.sourceSha256 !== sha(bytes) || cache.authoritySha256 !== authoritySha256) throw Error('排重规则态缓存身份失配');
            for (const hash of cache.hashes) excluded.add(hash);
            replayed[path.relative(DIR, file)] = cache.actions; continue;
        }
        const localHashes = new Set<string>();
        let base = path.dirname(file);
        while (base !== path.dirname(base) && !fs.existsSync(path.join(base, 'plan.json')) && !fs.existsSync(path.join(base, 'battle-plan.json'))) base = path.dirname(base);
        const planPath = fs.existsSync(path.join(base, 'plan.json')) ? path.join(base, 'plan.json') : path.join(base, 'battle-plan.json');
        const plan = read(planPath), started = read(path.join(path.dirname(file), 'started.json'));
        const mapBase = base.startsWith(DIR + path.sep) ? DIR : base.startsWith(otherRun + path.sep) ? otherRun : base;
        const initial = plan.states ? plan.states[started.slot.mapIndex] : read(path.resolve(mapBase, plan.maps[started.slot.mapIndex].path)), engine = new GameEngine(initial);
        // 旧阶段失败日志只能读取已落盘的完整行；未知尾部不冒称恢复或完整strict。
        const partial = file.includes('battle-attempt01');
        const text = partial ? gunzipSync(bytes, { finishFlush: constants.Z_SYNC_FLUSH }).toString() : null;
        const rows = partial ? text!.slice(0, text!.lastIndexOf('\n') + 1).trim().split('\n').filter(Boolean).map(s => JSON.parse(s)) : gzipRows(bytes);
        let count = 0;
        for await (const row of rows) {
            if (row.beforeHash) localHashes.add(row.beforeHash); if (row.afterHash) localHashes.add(row.afterHash);
            localHashes.add(ruleStateHash(engine.getState()));
            const action = decodeAction(row.code); if (!action) throw Error('评测排重动作无法解码');
            const result = engine.step(action); if (result.info.includes('非法动作')) throw Error('评测排重权威恢复失败');
            localHashes.add(ruleStateHash(result.state)); count++;
        }
        for (const hash of localHashes) excluded.add(hash);
        fs.writeFileSync(cacheFile, gzipSync(JSON.stringify({ sourceSha256: sha(bytes), authoritySha256, actions: count, hashes: [...localHashes] }), { level: 9 }));
        replayed[path.relative(DIR, file)] = count;
    }
    const lines = [...excluded].sort().join('\n') + '\n';
    const packed = gzipSync(lines, { level: 9 });
    persistEvaluationIndex(DIR, packed, diskGuard());
    save('evaluation-exclusion-receipt.json', { unique: excluded.size, original: manifest.exclusion.uniqueStates, sha256: sha(lines), authoritySha256, files: identities, replayed, includesFixedDevStates: true, includesCanonicalRuleStates: true, oldInterruptedUnknownTailRecoverable: false });
    return excluded;
}
