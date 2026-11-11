import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { getAllianceId } from '../../../src/game/rule_config';
import { actionActor } from '../../../src/ai_runtime/dual_v2/tactical_prior';
import { read, fileSha } from '../stage1/io';
import { Storage } from './storage';

/** 独立重放并重新分层；原始水库样本不直接准入训练。 */
const [source, destination, previousReport] = process.argv.slice(2);
if (!source || !destination) throw Error('需要输入收据目录和新的输出目录');
const run = read(path.join(source, 'RUN.json'));
const partitions = path.resolve('continuation_review_20261030/stage1/PARTITIONS.json');
if (fileSha(partitions) !== run.partitionSha256) throw Error('冻结分区身份变化');
const parents = new Map(read(partitions).parents.filter((p: any) => p.admitted && p.corpus === 'new' && p.split === run.split).map((p: any) => [p.parentId, p]));
const storage = new Storage(path.resolve(destination));
const report: any = {split: run.split, accepted: 0, rejected: 0, samples: 0, sealedAccess: 0, rows: []};
const previous = previousReport ? read(previousReport) : null;
if (previous && previous.split !== run.split) throw Error('增量审计不能跨分区');
const processed = new Set<string>();
let ancestor = previous;
const visited = new Set<string>();
while (ancestor) {
    if (ancestor.split !== run.split) throw Error('历史审计分区不一致');
    ancestor.rows.forEach((r: any) => processed.add(r.file));
    const link = ancestor.previousReport;
    if (!link) break;
    if (visited.has(link.path) || fileSha(link.path) !== link.sha256) throw Error('历史审计链循环或摘要变化');
    visited.add(link.path); ancestor = read(link.path);
}
const files = fs.readdirSync(source).filter(n => n.endsWith('.json.gz') && !processed.has(n)).sort();
report.previousReport = previousReport ? {path: path.resolve(previousReport), sha256: fileSha(previousReport)} : null;
for (const file of files) {
    storage.check();
    const input = path.join(source, file), row = JSON.parse(gunzipSync(fs.readFileSync(input)).toString());
    if (!parents.has(row.parentId) || row.split !== run.split) throw Error('父局不属于许可分区');
    if (!row.natural || row.winner === null || row.winner === -1) { report.rows.push({file, accepted: false, reason: '非自然胜负'}); report.rejected++; continue; }
    const engine = new GameEngine(row.initial, {applyInitialTurnStart: false});
    const buckets: any[][] = Array.from({length: 6}, () => []);
    const counts = Array(6).fill(0);
    let boundary = true, firstChainClosed = false, branch = false, firstActor: string | undefined;
    for (let step = 0; step < row.actions.length; step++) {
        const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer);
        const phase = Math.min(2, Math.floor(step * 3 / row.actions.length));
        // 每个时间三等分各保留2个边界态与2个首单位链刚闭合的分叉态。
        const kind = boundary ? 0 : branch && !state.pendingUnitId && legal.filter(a => a.type !== 'surrender').length > 1 ? 1 : -1;
        if (kind >= 0) {
            const key = kind * 3 + phase, count = ++counts[key];
            const sample = {step, boundary, phase, firstChainClosed: kind === 1, state};
            if (buckets[key].length < 2) buckets[key].push(sample);
            else if (count % 2 === 0) buckets[key][1] = sample;
        }
        const action = legal.find(a => encodeAction(a) === row.actions[step]);
        if (!action) throw Error(`非法回放动作：${file}:${step}`);
        const next = engine.step(action).state;
        if (!firstActor && !firstChainClosed) {
            firstActor = actionActor(action) ?? undefined;
            if (action.type.startsWith('recruit_')) firstActor = next.units.find(u => u.ownerId === state.currentPlayer && !state.units.some(v => v.id === u.id))?.id;
        }
        boundary = next.currentPlayer !== state.currentPlayer || next.turn !== state.turn;
        branch = false;
        if (boundary) {firstChainClosed = false; firstActor = undefined;}
        else if (!firstChainClosed && firstActor && !engine.getLegalActions(next.currentPlayer).some(a => actionActor(a) === firstActor)) {
            firstChainClosed = true; branch = true;
        }
    }
    if (!engine.isTerminal() || engine.getState().winner !== row.winner) throw Error('自然终局重放不一致');
    const accepted = buckets.every(b => b.length === 2);
    if (accepted) {
        const samples = buckets.flat().map(sample => ({...sample, winningPlayerIds: sample.state.players.filter((p: any) => getAllianceId(sample.state, p.id) === row.winner).map((p: any) => p.id)}));
        storage.write(file, {...row, samples, sourceSha256: fileSha(input), extraction: '时间三等分，每段2边界+2首链闭合分叉'}, true);
        report.accepted++; report.samples += samples.length;
    } else report.rejected++;
    report.rows.push({file, accepted, available: counts, players: row.players, mode: row.mode});
    if (report.rows.length % 25 === 0) console.log(JSON.stringify({processed: report.rows.length, accepted: report.accepted, rejected: report.rejected}));
}
storage.write('EXTRACTION_REPORT.json', report);
console.log(JSON.stringify({processed: report.rows.length, accepted: report.accepted, rejected: report.rejected, samples: report.samples}));
