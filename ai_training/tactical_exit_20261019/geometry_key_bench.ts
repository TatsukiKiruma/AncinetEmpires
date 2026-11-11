import assert from 'node:assert/strict';
import { read,save } from './io';
const source=read('revisions/r17/slow-root-state.json').state,reference=structuredClone([source.map,source.rules]),inputs=Array.from({length:64},()=>structuredClone(reference));
const keyCache=new WeakMap<object,string[]>();
function equal(a:any,b:any):boolean{
    if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
    if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
    if(Object.getPrototypeOf(a)!==Object.prototype||Object.getPrototypeOf(b)!==Object.prototype)return false;
    const keys=Object.keys(a);let other=keyCache.get(b);if(!other){other=Object.keys(b);keyCache.set(b,other);}return keys.length===other.length&&keys.every((k,i)=>k===other![i]&&equal(a[k],b[k]));
}
const baseline=JSON.stringify(reference),results=[];
for(let round=0;round<4;round++)for(const method of ['json','equal']){
    const start=performance.now();for(let i=0;i<2000;i++)assert.ok(method==='json'?JSON.stringify(inputs[i%64])===baseline:equal(inputs[i%64],reference));results.push({round,method,ms:performance.now()-start});
}
const changed=structuredClone(reference);changed[0].tiles[0][0].ownerId=987;assert.ok(!equal(changed,reference));
save('revisions/r18/geometry-key-bench.json',{referenceBytes:baseline.length,results,scope:'仅比较精确几何相等判定成本，不改变键值或算法结果'});console.log({referenceBytes:baseline.length,results});
