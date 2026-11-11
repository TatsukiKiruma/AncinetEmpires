import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { encodeFactoredActions } from '../../../src/ai_runtime/dual_v2/factored_actions';
import { createEntityIndex } from '../../../src/ai_runtime/dual_v2/entity_stream';
import { decisions } from '../stage1/io';
import { HERE, read, fileSha } from './arena_io';
import { writeNew } from './storage';

// Stage5锚点原缓存只含价值标签，不能把占位policyTarget=0当成示范；从原始宏动作补齐。
const parents = new Map(read(path.join(HERE, '../stage1/PARTITIONS.json')).parents.map((p: any) => [p.parentId, p]));
const base = 'D:/AncientEmpiresData/continuation_stage5_20261104_v1';
for (const [kind, split] of [['anchor-encoded-01', 'train'], ['stage1-dev-encoded', 'dev']]) {
    const root = path.join(base, kind), manifest = read(path.join(root, 'ENCODING_REPORT.json'));
    const entries = split === 'train' ? manifest.rows : manifest.rows.filter((r: any) => Number(r.file.split('-').at(-1).split('.')[0]) < 8);
    const labels: any[] = [];
    for (const entry of entries) {
        const file = path.join(root, entry.file), data = JSON.parse(gunzipSync(fs.readFileSync(file)).toString());
        const p: any = parents.get(entry.parentId);
        if (!p || p.split !== split || data.metadata.sources.some((s: any) => s.split !== split || s.parentId !== p.parentId)) throw Error('锚点分区身份不符');
        const raw = Buffer.from(data.bytes, 'base64'), targets = new Map<number, any>();
        const chosen = new Set<number>(data.metadata.sources.map((s: any) => s.macro));
        for await (const r of decisions(p, chosen)) {
            if (r.sub !== 0) continue;
            const engine = new GameEngine(r.state, {applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true});
            const legal = engine.getLegalActions(r.state.currentPlayer).filter(a => a.type !== 'surrender');
            const actions = encodeFactoredActions(r.state, legal, createEntityIndex(r.state));
            const index = legal.findIndex(a => encodeAction(a) === encodeAction(r.action));
            const target = actions.sourceIndices.indexOf(index);
            if (target < 0) throw Error('示范动作不在合法候选中');
            const batch = data.metadata.sources.findIndex((s: any) => s.macro === r.macro);
            const field = data.metadata.arrays.find((a: any) => a.batch === batch && a.name === 'pointers');
            if (!raw.subarray(field.offset, field.offset + field.bytes).equals(Buffer.from(actions.pointers.buffer))) throw Error('锚点动作指针顺序变化');
            targets.set(r.macro, {target, code: encodeAction(r.action)});
        }
        if (targets.size !== data.metadata.sources.length) throw Error('锚点示范标签数量不符');
        labels.push({file, sha256: fileSha(file), targets: data.metadata.sources.map((s: any) => targets.get(s.macro)), sources: data.metadata.sources});
        if (labels.length % 50 === 0) console.log(JSON.stringify({split, parents: labels.length}));
    }
    writeNew(path.join(HERE, `ANCHOR_LABELS_${split}.json`), {split, samples: labels.reduce((n,r) => n+r.targets.length,0), sourceManifestSha256: fileSha(path.join(root, 'ENCODING_REPORT.json')), labels, sealedAccess: 0});
}
