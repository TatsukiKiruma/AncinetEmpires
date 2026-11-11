import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DIR, SOURCE, RELEASE, ROOT, read, save, sha, gzipRows } from './io';
import { nativeEntries, replayEntries } from './streaming_loader';

export async function buildManifest() {
    const hashFile = path.resolve(DIR, '../tactical_exit_20261019/search-scale/evaluation-hashes-r24-pc-stop-20261020.txt.gz');
    const indexFile = hashFile.replace('evaluation-hashes-', 'evaluation-index-').replace('.txt.gz', '.json');
    const prior = read(indexFile), bytes = fs.readFileSync(hashFile);
    if (!prior.passed || sha(bytes) !== prior.hashFileSha256) throw Error('阶段5评测前态索引身份不符');
    const excluded = new Set<string>(gunzipSync(bytes).toString().trim().split('\n'));
    const exclusionSources: any[] = [{ path: path.relative(ROOT, hashFile).replaceAll('\\', '/'), sha256: sha(bytes), states: prior.uniqueStates }];
    // 阶段3、4逐份实战原始日志补入并保存来源SHA，不读取评测动作作为监督。
    const walk = async (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.isSymbolicLink()) continue;
            const file = path.join(dir, e.name);
            if (e.isDirectory()) await walk(file);
            else if (/^actions(?:\.strict-prefix)?\.jsonl(?:\.gz)?$/.test(e.name)) {
                const content = fs.readFileSync(file); let count = 0;
                if (e.name.endsWith('.gz')) for await (const row of gzipRows(content)) { if (row.beforeHash) excluded.add(row.beforeHash); count++; }
                else for (const line of content.toString().trim().split('\n').filter(Boolean)) { const row = JSON.parse(line); if (row.beforeHash) excluded.add(row.beforeHash); count++; }
                exclusionSources.push({ path: path.relative(ROOT, file).replaceAll('\\', '/'), sha256: sha(content), actions: count });
            }
        }
    };
    for (const phase of ['tactical_scale_20261018', 'tactical_value_search_20261018', 'tactical_conditional_20261018']) {
        const dir = path.resolve(DIR, '..', phase);
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && !e.isSymbolicLink() && e.name.includes('battle')) await walk(path.join(dir, e.name));
    }
    const text = [...excluded].sort().join('\n') + '\n', compressed = gzipSync(text, { level: 9 });
    fs.writeFileSync(path.join(DIR, 'excluded-evaluation-hashes.txt.gz'), compressed);
    save('exclusion-sources.json', { rule: '永久排除来源beforeHash、当前完整stateHash及当前ruleStateHash；仅身份，不使用动作和结果', uniqueStates: excluded.size, sources: exclusionSources });
    const parents: any[] = [], native = nativeEntries(), replay = replayEntries();
    const seen = new Set<string>();
    for (const e of native) if (!seen.has(e.parentId)) {
        seen.add(e.parentId);
        parents.push({ id: e.parentId, source: 'native', group: e.parentId, stratum: `${e.actualBucket.configuredPlayerCount}|${e.map}|${e.planId}|${e.actualBucket.configMode}`, configuredPlayers: e.actualBucket.configuredPlayerCount, map: e.map, plan: e.planId, policyEligible: native.some(s => s.parentId === e.parentId && s.policyLabelEligible && s.admittedAtoms > 0) });
    }
    for (const e of replay) {
        const packet = fs.readFileSync(path.join(SOURCE, 'replay', e.packet.path));
        if (sha(packet) !== e.packet.sha256) throw Error('真人索引引用SHA不一致');
        let header: any;
        for await (const row of gzipRows(packet)) if (row.kind === 'game') { header = row; break; }
        if (!header) throw Error('真人回放缺少初态');
        const state = header.initialState;
        const enabled = state.players.filter((p: any) => !(state.rules?.disabledTeams ?? []).includes(p.id)).length;
        if (enabled > 6) throw Error('真人回放有超过6个启用玩家，不能静默截断');
        parents.push({ id: e.responseSha256, source: 'replay', group: e.apiGameIdHash ?? e.opaqueEmbeddedObjectIdHash ?? e.responseSha256, stratum: `${enabled}|${header.mapIdentity}|replay|${header.mode}`, configuredPlayers: enabled, map: header.mapIdentity, plan: 'replay', policyEligible: !e.zeroPolicy });
    }
    const groups = new Map<string, any[]>();
    for (const parent of parents) { const key = `${parent.source}:${parent.group}`; if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(parent); }
    const strata = new Map<string, string[]>();
    for (const [group, entries] of groups) {
        const stratum = [...new Set(entries.map(e => e.stratum))].sort().join(';');
        if (!strata.has(stratum)) strata.set(stratum, []); strata.get(stratum)!.push(group);
    }
    const strataSummary: any[] = [];
    for (const [stratum, groupIds] of strata) {
        groupIds.sort((a, b) => sha('dual-v2-split-20261020:' + a).localeCompare(sha('dual-v2-split-20261020:' + b)));
        const dev = groupIds.length < 2 ? 0 : Math.max(1, Math.round(groupIds.length * .2));
        groupIds.forEach((id, i) => groups.get(id)!.forEach(p => p.split = i < dev ? 'dev' : 'train'));
        strataSummary.push({ stratum, groups: groupIds.length, train: groupIds.length - dev, dev });
    }
    const manifest = { schema: 'dual-stream-v2-parent-split-v1', seed: 'dual-v2-split-20261020', devFraction: .2, qualification: '已消费来源的开发划分，不是独立最终评测；续段不拆父局，已证API家族不跨分区，未知真人家族不宣称独立', sourceContractsSha256: sha(fs.readFileSync(path.join(SOURCE, 'SOURCE_SCHEMA_CONTRACTS.json'))), nativeReleaseIndexSha256: sha(fs.readFileSync(path.join(SOURCE, 'phone', RELEASE, 'release-index.jsonl'))), replayReleaseIndexSha256: sha(fs.readFileSync(path.join(SOURCE, 'replay/policy-release-index.json'))), counts: { nativeParents: seen.size, nativeSegments: native.length, replayResponses: replay.length, configuredPlayers: Object.fromEntries([2, 3, 4].map(n => [n, parents.filter(p => p.source === 'native' && p.configuredPlayers === n).length])) }, exclusion: { paths: [{ path: 'excluded-evaluation-hashes.txt.gz', sha256: sha(compressed) }], uniqueStates: excluded.size, sha256: sha(text) }, strata: strataSummary, parents };
    save('split-manifest-v2.json', manifest);
    console.log(JSON.stringify({ counts: manifest.counts, excludedStates: excluded.size, exclusionSources: exclusionSources.length, singletonStrata: strataSummary.filter(s => !s.dev).length }));
    return manifest;
}
if (process.argv[1]?.endsWith('build_manifest.ts')) await buildManifest();
