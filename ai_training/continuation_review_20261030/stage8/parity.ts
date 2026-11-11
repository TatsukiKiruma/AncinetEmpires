import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { DualStreamModel } from '../../../src/ai_runtime/dual_v3/model_runtime';
import { packTensorBatch } from '../../dual_stream_v2_phase1_20261020/tensor_bridge';
import { data, fileSha, here, readJson, root, saveJson } from './parity_io';
import type { ModelIdentity } from '../stage7/client_v2';

export async function runPython(script: string, args: string[], log: string) {
    const fd = fs.openSync(log, 'a');
    try {
        const child = spawn(path.join(root, 'ai_training/.venv-rocm/Scripts/python.exe'), ['-B', '-X', 'utf8', path.join(here, '../stage7', script), ...args],
            { windowsHide: true, stdio: ['ignore', fd, fd], cwd: root });
        await new Promise<void>((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', (code, signal) => code === 0 ? resolve() : reject(Error(`Python 子进程失败：${script}/${code}/${signal}`)));
        });
    } finally { fs.closeSync(fd); }
}

export async function exportParity(candidate: ModelIdentity) {
    const dir = path.dirname(candidate.prefix), resultFile = path.join(dir, 'EXPORT_PARITY.json');
    assert.equal(fileSha(candidate.prefix + '.bin'), candidate.sha256);
    if (fs.existsSync(resultFile)) {
        const r = readJson(resultFile); assert.equal(r.modelSha256, candidate.sha256); return r;
    }
    const rootFile = path.join(data, 'parity-roots-closed-loop-v2.json');
    const obs = readJson(rootFile).slice(0, 64).map((row: any) => {
        const s = row.state, game = new GameEngine(s, { applyInitialTurnStart: false });
        return encodeDualObservation(s, game.getLegalActions(s.currentPlayer).filter(a => a.type !== 'surrender'));
    });
    assert.equal(obs.length, 64);
    const file = path.join(dir, 'parity-input.frames'), pythonFile = path.join(dir, 'parity-python.jsonl');
    const fd = fs.openSync(file, 'w');
    try {
        for (const o of obs) {
            const batch = packTensorBatch([o], [{ target: 0, policyMask: false, valueTarget: new Float32Array(6), valueMask: false, weight: 1 }]);
            const meta = Buffer.from(JSON.stringify({ ...batch.metadata, sources: [{}] }));
            const header = Buffer.alloc(8); header.writeUInt32LE(meta.length); header.writeUInt32LE(batch.bytes.length, 4);
            fs.writeSync(fd, Buffer.concat([header, meta, batch.bytes]));
        }
    } finally { fs.closeSync(fd); }
    await runPython('parity_python.py', [candidate.prefix, file, pythonFile], path.join(dir, 'parity.log'));
    const py = fs.readFileSync(pythonFile, 'utf8').trim().split(/\r?\n/).map(s => JSON.parse(s));
    assert.equal(py.length, obs.length);
    const b = fs.readFileSync(candidate.prefix + '.bin');
    const model = new DualStreamModel(readJson(candidate.prefix + '.json'), b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    const fields = ['logits', 'valueLogits', 'valueProbs'] as const;
    const errors = { logits: 0, valueLogits: 0, valueProbs: 0 };
    const mismatches: { row: number; field: string; margin: number }[] = [];
    for (const [i, o] of obs.entries()) {
        const ts = model.forward(o);
        for (const field of fields) {
            const expected = py[i][field] as number[], actual = Array.from(ts[field]);
            assert.equal(actual.length, expected.length);
            assert(actual.length && actual.every(Number.isFinite) && expected.every(Number.isFinite));
            actual.forEach((v, j) => { errors[field] = Math.max(errors[field], Math.abs(v - expected[j])); });
            const order = (x: number[]) => x.map((v, j) => ({ v, j })).sort((a, b) => b.v - a.v);
            const ref = order(expected), margin = ref.length > 1 ? ref[0].v - ref[1].v : 0;
            if (margin > 4e-5 && ref[0].j !== order(actual)[0].j) mismatches.push({ row: i, field, margin });
        }
    }
    const result = { modelSha256: candidate.sha256, inputsSha256: fileSha(file), rootsSha256: fileSha(rootFile), samples: obs.length,
        errors, mismatches, maxAbsoluteTolerance: 2e-5, nearTieGap: 4e-5, sealedAccess: 0,
        passed: Object.values(errors).every(v => v < 2e-5) && !mismatches.length };
    saveJson(resultFile, result);
    return result;
}
