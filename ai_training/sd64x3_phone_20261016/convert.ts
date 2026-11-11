import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { inspectAndRead } from '../data_acceptance_20261016/phone/compact_reader';
import { tacticalFeatures } from './tactics';
const root = path.resolve('ai_training/sd64x3_phone_20261016');
const source = path.resolve('ai_training/data_acceptance_20261016/phone');
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const selection = JSON.parse(fs.readFileSync(path.join(root, 'selection.json'), 'utf8'));
const lane = Number(process.argv[2]), lanes = Number(process.argv[3]);
fs.mkdirSync(path.join(root, 'tactics'), { recursive: true });
for (const [index, parent] of selection.parents.entries()) {
  if (index % lanes !== lane) continue;
  for (const entry of parent.segments) {
    if (!entry.policyLabelEligible || !entry.admittedAtoms) continue;
    const filename = path.join(root, 'tactics', entry.segmentId + '.tac.gz'), receipt = filename + '.json';
    if (fs.existsSync(receipt)) { const r = JSON.parse(fs.readFileSync(receipt, 'utf8')); if (sha(fs.readFileSync(filename)) !== r.sha256) throw Error('恢复侧车SHA不一致'); continue; }
    // 未完成的分片只隔离为partial，不覆盖历史产物。
    if (fs.existsSync(filename)) fs.renameSync(filename, filename + '.partial-' + Date.now());
    const checked = await inspectAndRead(source, entry), engine = new GameEngine(checked.header.initialState, { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true });
    const gz = createGzip({ level: 6 }), file = fs.createWriteStream(filename, { flags: 'wx' }); gz.pipe(file);
    const put = async (b: Buffer) => { if (!gz.write(b)) await once(gz, 'drain'); };
    const header = Buffer.alloc(8); header.writeInt32BE(0x54414333); header.writeInt32BE(entry.admittedAtoms, 4); await put(header);
    let rows = 0, candidates = 0, weight = 0; const start = Date.now();
    await inspectAndRead(source, entry, async row => {
      const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer), packet = observe(state, legal);
      if (sha(JSON.stringify(state)) !== row.beforeHash || sha(JSON.stringify(packet.codes)) !== row.legalHash || packet.codes[row.index] !== row.code) throw Error('完整候选来源绑定失败');
      const map = new Map(legal.map(a => [JSON.stringify(a), a]));
      const ordered = packet.codes.map(code => { const action = decodeAction(code); if (!action || !map.has(JSON.stringify(action))) throw Error('候选码映射失败'); return action; });
      const features = tacticalFeatures(engine, ordered), buffer = Buffer.alloc(4 + 64 + features.length * 40);
      buffer.writeInt32BE(features.length); Buffer.from(row.beforeHash, 'hex').copy(buffer, 4); Buffer.from(row.legalHash, 'hex').copy(buffer, 36);
      features.forEach((v, i) => v.forEach((z, j) => buffer.writeFloatBE(z, 68 + (i * 10 + j) * 4)));
      await put(buffer);
      const action = decodeAction(row.code); if (!action) throw Error('标签码错误');
      const result = engine.step(action); if (result.info.includes('非法动作') || sha(JSON.stringify(result.state)) !== row.afterHash) throw Error('后态重放失败');
      rows++; candidates += features.length; weight += row.weight;
      if (rows % 128 === 0) fs.writeFileSync(path.join(root, `convert-${lane}.live.json`), JSON.stringify({ pid: process.pid, parent: parent.parentId, segment: entry.segmentId, rows, candidates, seconds: (Date.now() - start) / 1000 }));
    });
    gz.end(); await once(file, 'finish');
    if (rows !== entry.admittedAtoms || Math.abs(weight - entry.admittedMacros) > 1e-7) throw Error('合格前缀消费不完整');
    const r = { parent: parent.parentId, segment: entry.segmentId, split: parent.split, rows, candidates, weight, sourceSha256: checked.sha256, sha256: sha(fs.readFileSync(filename)), bytes: fs.statSync(filename).size, seconds: (Date.now() - start) / 1000 };
    fs.writeFileSync(receipt, JSON.stringify(r)); console.log(JSON.stringify(r));
    const disk = fs.statfsSync(root); if (disk.bavail * disk.bsize < 12 * 1024 ** 3) throw Error('C盘空闲不足12GiB');
  }
}
