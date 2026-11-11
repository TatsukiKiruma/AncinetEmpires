import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { convertOne } from './replay_converter';
import { OUT, ROOT, sourceIdentity } from './replay_io';
import { digest } from '../data_acceptance_20261016/replay/core';
import { gzipRows, sha } from '../dual_stream_v2_phase1_20261020/io';

const read = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const auditRoot = 'captures/human-replay-audit-20261020-cn/';
const candidates = read(auditRoot + 'candidates.json'), audit = read(auditRoot + 'audit.json');
const quarantine = read(auditRoot + 'quarantine.json');
assert.equal(candidates.length, 41); assert.equal(quarantine.length, 4);
const old = read('ai_training/data_acceptance_20261016/replay/manifest.json');
assert.equal(old.inputs.length, 257);
for (const c of candidates) {
    assert.ok(!old.inputs.some((x: any) => x.sha256 === c.sha256));
    assert.ok(!quarantine.some((x: any) => x.sha256 === c.sha256));
    const item = audit.items.find((x: any) => x.sha256 === c.sha256);
    assert.ok(item?.candidate && item.strict.success && item.strict.evidence.fullyConsumed);
    assert.equal(sha(fs.readFileSync(path.join(ROOT, c.file))), c.sha256);
}
for (const name of ['receipts', 'accepted', 'rejected', 'attempts']) fs.mkdirSync(path.join(OUT, name), { recursive: true });
const source = await sourceIdentity();
const converterHashes = Object.fromEntries(['replay_converter.ts', 'replay_io.ts'].map(n => [n, sha(fs.readFileSync(path.join(OUT, '..', n)))]));
const manifest: any = { source, converterIdentity: digest(converterHashes), converterHashes, limits: { maximumOutputBytes: 50_000_000 }, inputs: candidates };
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
const receipts: any[] = [], entries: any[] = [];
for (const c of candidates) {
    const receipt = await convertOne({ sha256: c.sha256, paths: [c.file], bytes: fs.statSync(path.join(ROOT, c.file)).size, mtime: '' }, manifest);
    assert.ok(receipt.accepted && receipt.fullyConsumed); receipts.push(receipt);
    let header: any;
    for await (const row of gzipRows(fs.readFileSync(path.join(OUT, receipt.packet.path)))) if (row.kind === 'game') { header = row; break; }
    const enabled = header.initialState.players.filter((p: any) => !(header.initialState.rules?.disabledTeams ?? []).includes(p.id));
    entries.push({ responseSha256: c.sha256, packet: receipt.packet, root: OUT, group: header.identity.gameIdHash ?? c.sha256,
        configuredPlayers: enabled.length, map: header.mapIdentity, mode: header.mode, humanPlayers: c.humanPlayers, policyRows: receipt.policyRows });
}
const phase1 = read('ai_training/dual_stream_v2_phase1_20261020/split-manifest-v2.json');
// 旧边界逐字节继承；新来源按实际人数/模式稳定排序，每层保留约20%开发来源。
const strata = new Map<string, any[]>();
for (const e of entries) { const key = `${e.mode}|${e.configuredPlayers}`; if (!strata.has(key)) strata.set(key, []); strata.get(key)!.push(e); }
const parents = [...phase1.parents];
for (const [stratum, es] of strata) {
    es.sort((a, b) => sha('stage3-split:' + a.group).localeCompare(sha('stage3-split:' + b.group)));
    const dev = es.length === 1 ? 0 : Math.max(1, Math.round(es.length * .2));
    es.forEach((e, i) => parents.push({ id: e.responseSha256, source: 'replay', group: e.group, stratum: `${e.configuredPlayers}|${e.map}|replay|${e.mode}`, configuredPlayers: e.configuredPlayers, map: e.map, plan: 'replay', policyEligible: true, split: i < dev ? 'dev' : 'train', addedStage3: true }));
}
assert.equal(parents.length, 3296);
const result = { ...phase1, schema: 'dual-stream-v2-parent-split-stage3-v1', inheritedManifestSha256: sha(fs.readFileSync(path.join(ROOT, 'ai_training/dual_stream_v2_phase1_20261020/split-manifest-v2.json'))), counts: { ...phase1.counts, replayResponses: 296, newResponses: 41 }, parents, newReplayEntries: entries };
fs.writeFileSync(path.join(OUT, '..', 'split-manifest-v2-stage3.json'), JSON.stringify(result, null, 2));
fs.writeFileSync(path.join(OUT, 'admission.json'), JSON.stringify({ passed: true, receipts: receipts.length, atomicActions: receipts.reduce((n, r) => n + r.atomicActions, 0), valueMask: false, historicalDuplicate: 0, quarantinedAdmitted: 0, actualModeCounts: Object.fromEntries([...strata].map(([k, v]) => [k, v.length])), newSplit: { train: parents.filter(x => x.addedStage3 && x.split === 'train').length, dev: parents.filter(x => x.addedStage3 && x.split === 'dev').length } }, null, 2));
