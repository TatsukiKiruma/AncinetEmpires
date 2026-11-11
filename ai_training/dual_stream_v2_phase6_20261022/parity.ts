/** 使用训练时同一份冻结张量，独立TS前向核对联合精调后的全部输出。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
const dir = path.dirname(fileURLToPath(import.meta.url)), modelDir = path.join(dir,'gen_05');
const meta = JSON.parse(fs.readFileSync(path.join(modelDir,'model.json'),'utf8')), bytes = fs.readFileSync(path.join(modelDir,'model.bin'));
const model = new DualStreamModel(meta,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const reference = JSON.parse(fs.readFileSync(path.join(modelDir,'python-parity-output.json'),'utf8'));
const frames = gunzipSync(fs.readFileSync(path.join(dir,'corpus/dev.frames.gz')));
let cursor = 0; const errors: Record<string,number> = {}, receipts:any[]=[];
const argmax = (a:ArrayLike<number>)=>Array.from(a).reduce((best,_,i)=>a[i]>a[best]?i:best,0);
for (const expected of reference) {
    const ms=frames.readUInt32LE(cursor), ps=frames.readUInt32LE(cursor+4);cursor+=8;
    const metadata=JSON.parse(frames.subarray(cursor,cursor+ms).toString('utf8'));cursor+=ms;
    const raw=frames.subarray(cursor,cursor+ps);cursor+=ps;
    assert.equal(createHash('sha256').update(raw).digest('hex'),metadata.sha256);
    const arrays:any={};
    for (const e of metadata.arrays) {
        const b=raw.subarray(e.offset,e.offset+e.bytes), copy=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
        arrays[e.name]=e.dtype==='<f4'?new Float32Array(copy):e.dtype==='<i4'?new Int32Array(copy):new Uint8Array(copy);
    }
    const shape=metadata.arrays.find((a:any)=>a.name==='spatial').shape, n=metadata.arrays.find((a:any)=>a.name==='entities').shape[0];
    const observation:any={schema:meta.schema,width:shape[2],height:shape[1],spatialTensor:arrays.spatial,entityTokens:arrays.entities,relationalBias:arrays.relations,
        entityIndexMap:{globalActorIdx:n},playerOrder:{features:arrays.players,active:arrays.active},actions:{sourceIndices:arrays.sourceIndices,pointers:arrays.pointers,actorMask:arrays.actorMask}};
    const out=model.forward(observation); const local:any={};
    for (const key of ['logits','actorPrior','valueLogits','valueProbs'] as const) {
        assert.equal(out[key].length,expected[key].length); let maximum=0;
        for(let i=0;i<out[key].length;i++) maximum=Math.max(maximum,Math.abs(out[key][i]-expected[key][i]));
        errors[key]=Math.max(errors[key]??0,maximum);local[key]=maximum;
        assert.ok(maximum<1e-5,`${key}前向误差${maximum}`);assert.equal(argmax(out[key]),argmax(expected[key]));
    }
    receipts.push({id:metadata.sources[0].id,errors:local});
}
const receipt={passed:true,samples:reference.length,errors,receipts,modelSha256:createHash('sha256').update(bytes).digest('hex')};
fs.writeFileSync(path.join(modelDir,'node-parity.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({passed:true,samples:reference.length,errors}));
