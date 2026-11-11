import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { BatchedNeuralBeamSearchAI } from '../../../src/ai_runtime/dual_v3/batched_beam_search';
import { searchTeacher } from '../../../src/ai_runtime/dual_v3/search_teacher';
import { packTensorBatch } from '../../dual_stream_v2_phase1_20261020/tensor_bridge';
import { Stage4InferenceClient } from './arena_client';
import { DATA, HERE, read, fileSha, sha, save } from './arena_io';
import { writeNew } from './storage';

// 固定分层抽样先冻结，教师失败或不可用也保留，不按标签质量更换样本。
const selectionFiles = ['OOD_TRAIN_SELECTION.json', 'OOD_DEV_SELECTION.json'];
const partitionFile = path.join(HERE, '../stage1/PARTITIONS.json');
const partitions = new Map(read(partitionFile).parents.filter((p: any) => p.admitted && p.corpus === 'new').map((p: any) => [p.parentId, p]));
const tasks: any[] = [], identities = new Set<string>(), parentSplits = new Map<string, string>();
const sourceReports: any[] = [];
for (const [kind, name] of selectionFiles.entries()) {
    const source = path.join(HERE, '../stage5', name), selection = read(source);
    const split = kind === 0 ? 'train' : 'dev', perLayer = kind === 0 ? 300 : 60;
    if (!selection.ready || selection.split !== split || selection.rows.length !== (kind === 0 ? 900 : 180)) throw Error('冻结选集合同不符');
    const pools: any[][] = Array.from({length: 9}, () => []);
    for (const entry of selection.rows) {
        if (fileSha(entry.path) !== entry.sha256) throw Error('冻结样本来源发生变化');
        const row = JSON.parse(gunzipSync(fs.readFileSync(entry.path)).toString());
        const p: any = partitions.get(row.parentId);
        if (!p || p.split !== split || row.split !== split || !row.natural || row.samples.length !== 12 || row.winner === null || row.winner === -1) throw Error('分区或自然完赛合同失败');
        if (parentSplits.has(row.parentId) && parentSplits.get(row.parentId) !== split) throw Error('训练与验证父局泄漏');
        parentSplits.set(row.parentId, split);
        for (const [index, sample] of row.samples.entries()) {
            const key = `${row.parentId}/${row.seed}/${sample.step}`;
            if (identities.has(key)) continue; identities.add(key);
            pools[(row.players - 2) * 3 + sample.phase].push({key, index, source: entry.path, sourceSha256: entry.sha256, parentId: row.parentId, groupId: row.groupId, split, players: row.players, phase: sample.phase, step: sample.step});
        }
    }
    for (const pool of pools) {
        pool.sort((a,b) => sha('20261106/' + a.key).localeCompare(sha('20261106/' + b.key)));
        let count = 0;
        for (const item of pool) {
            const row = JSON.parse(gunzipSync(fs.readFileSync(item.source)).toString()), state = row.samples[item.index].state;
            const engine = new GameEngine(state, {applyInitialTurnStart: false});
            const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
            if (legal.length < 3) continue;
            tasks.push({...item, legalActions: legal.length, id: tasks.length});
            if (++count === perLayer) break;
        }
        if (count !== perLayer) throw Error('人数与阶段分层的合法决策状态不足');
    }
    sourceReports.push({source, sha256: fileSha(source), split});
}
if (tasks.length !== 3240) throw Error('蒸馏根节点总量不符');
const selection = {seed: 20261106, partitionSha256: fileSha(partitionFile), sourceReports, tasks, sealedAccess: 0};
const selectionPath = path.join(HERE, 'DISTILL_SELECTION.json');
if (fs.existsSync(selectionPath)) {
    if (JSON.stringify(read(selectionPath)) !== JSON.stringify(selection)) throw Error('恢复采集的冻结选集发生变化');
} else writeNew(selectionPath, selection);
const attempt = process.argv[2] ?? 'attempt2';
const limit = Number(process.argv[3] ?? tasks.length);
const selectedTasks = tasks.slice(0, limit);
const config = {...read(path.join(HERE, 'config-C1.json')), budgetMs: 1500, maxNodes: 2500, ownFraction: .5};
const client = new Stage4InferenceClient(config.modelPrefix);
const receipts: any[] = []; let next = 0;
async function worker(workerId: number) {
    while (next < selectedTasks.length) {
        if (fs.existsSync(path.join(HERE, 'STOP_COLLECT'))) throw Error('采集停止标志');
        const task = selectedTasks[next++];
        const row = JSON.parse(gunzipSync(fs.readFileSync(task.source)).toString()), state = row.samples[task.index].state;
        const engine = new GameEngine(state, {applyInitialTurnStart: false});
        const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
        const observation = encodeDualObservation(state, legal);
        const ai = new BatchedNeuralBeamSearchAI(client, config);
        await ai.getAction(engine, state.currentPlayer);
        const teacher = searchTeacher(legal.map(encodeAction), ai.telemetry.candidates, config.teacherTemperature);
        const validCount = teacher.evaluatedMask.filter((v,i) => v && !teacher.vetoMask[i]).length;
        const valid = teacher.available && validCount >= 2;
        const packed = packTensorBatch([observation], [{target: 0, policyMask: false, valueTarget: new Float32Array(6), valueMask: false, weight: 1}]);
        const source = {...task, workerId, valid, validCount};
        const file = path.join(DATA, `distill-${task.split}`, attempt, `${task.id}.json.gz`);
        writeNew(file, {metadata: {...packed.metadata, sources: [source]}, bytes: packed.bytes.toString('base64'), teacher, telemetry: ai.telemetry}, true);
        receipts.push({...source, file, sha256: fileSha(file)});
        if (receipts.length % 25 === 0) {
            await save(path.join(HERE, 'DISTILL_PROGRESS.json'), {completed: receipts.length, total: tasks.length, valid: receipts.filter(r => r.valid).length, sealedAccess: 0});
            console.log(JSON.stringify({completed: receipts.length, valid: receipts.filter(r => r.valid).length}));
        }
    }
}
try {
    // 两个异步采集工作槽共享同一常驻GPU服务；给己方展开保留一半根预算。
    await Promise.all(Array.from({length: 2}, (_, i) => worker(i)));
} finally {await client.close();}
writeNew(path.join(HERE, limit === tasks.length ? 'DISTILL_DATA_MANIFEST.json' : `DISTILL_PILOT_${attempt}.json`), {complete: receipts.length === 3240, config, workers: 2, scheduling: '单Node进程两个异步工作槽共享单GPU服务', sourceReports, selectionSha256: fileSha(selectionPath), receipts, sealedAccess: 0, gpuExited: client.exited});
