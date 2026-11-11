/** 使用独立PyTorch参考逐项核对新架构，包含合法mask、动作指针及六槽Value。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DualStreamModel } from '../../src/ai_runtime/dual_v3/model_runtime';
import { ARCHITECTURE } from '../../src/ai_runtime/dual_v3/architecture';
const dir = path.dirname(fileURLToPath(import.meta.url));
const prefix=process.argv[2]?path.resolve(process.argv[2]):path.join(dir,'initial');
const bytes = fs.readFileSync(prefix+'.bin'), manifest = JSON.parse(fs.readFileSync(prefix+'.json','utf8'));
const model = new DualStreamModel(manifest,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
assert.deepEqual(manifest.architecture,ARCHITECTURE);
const frames = fs.readFileSync(path.join(dir,'fixtures.frames')), references = JSON.parse(fs.readFileSync(process.argv[2]?prefix+'-reference.json':path.join(dir,'python-reference.json'),'utf8'));
const errors: Record<string,number> = {}, times: number[] = []; let cursor = 0;
const argmax = (a: ArrayLike<number>) => Array.from(a).reduce((best,_,i)=>a[i]>a[best]?i:best,0);
for (const expected of references) {
    const ms = frames.readUInt32LE(cursor), ps = frames.readUInt32LE(cursor+4); cursor+=8;
    const metadata = JSON.parse(frames.subarray(cursor,cursor+ms).toString()); cursor+=ms;
    const raw = frames.subarray(cursor,cursor+ps); cursor+=ps;
    assert.equal(createHash('sha256').update(raw).digest('hex'),metadata.sha256);
    const arrays: any = {};
    for (const e of metadata.arrays) {
        const b = raw.subarray(e.offset,e.offset+e.bytes), copy = b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
        arrays[e.name] = e.dtype==='<f4'?new Float32Array(copy):e.dtype==='<i4'?new Int32Array(copy):new Uint8Array(copy);
    }
    const shape = metadata.arrays.find((a:any)=>a.name==='spatial').shape, n = metadata.arrays.find((a:any)=>a.name==='entities').shape[0];
    const observation: any = {schema:manifest.schema,width:shape[2],height:shape[1],spatialTensor:arrays.spatial,entityTokens:arrays.entities,relationalBias:arrays.relations,
        entityIndexMap:{globalActorIdx:n},playerOrder:{features:arrays.players,active:arrays.active},actions:{sourceIndices:arrays.sourceIndices,pointers:arrays.pointers,actorMask:arrays.actorMask}};
    const start = performance.now(), output = model.forward(observation); times.push(performance.now()-start);
    for (const key of ['logits','actorPrior','conditionalPrior','valueLogits','valueProbs'] as const) {
        assert.equal(output[key].length,expected.outputs[key].length); let max = 0;
        for(let i=0;i<output[key].length;i++) max=Math.max(max,Math.abs(output[key][i]-expected.outputs[key][i]));
        errors[key]=Math.max(errors[key]??0,max); assert.ok(max<2e-5,`${expected.id} ${key}: ${max}`);
        assert.equal(argmax(output[key]),argmax(expected.outputs[key]));
    }
}
times.sort((a,b)=>a-b); const percentile=(p:number)=>times[Math.min(times.length-1,Math.floor(p*(times.length-1)))];
const result={passed:true,samples:references.length,errors,nodeMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:percentile(1)},memory:process.memoryUsage(),modelSha256:createHash('sha256').update(bytes).digest('hex')};
fs.writeFileSync(process.argv[2]?prefix+'-node-parity.json':path.join(dir,'node-parity.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
