/** 验证紧凑威胁缓存、连续打包及扩大记录块；不执行历史回放。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {hardNativeHelpers} from '../../../tools/apk_hard_native_transform.mjs';
import {nativeCompute} from './binding';
import {BatchClient} from '../parallel/client';
import {DecisionRecordWriter} from '../parallel/record_writer';
const output=process.argv[process.argv.indexOf('--out')+1];
if(!process.argv.includes('--out')||!output)throw Error('必须提供新的--out证据目录');
fs.mkdirSync(output,{recursive:false});
const empty=()=>({terrain:'plain',terrainTeam:null,unit:null,unitTeam:null,unitStandby:false});
const data:any={rows:2,cols:3,terrains:[{id:'plain',name:'平原',moveCost:1},{id:'castle',name:'城堡',moveCost:1},{id:'house',name:'房子',moveCost:1}],units:[{id:'infantry',abilities:['占领']}],teams:[{id:'blue',alliance:1},{id:'red',alliance:2}],gridData:[[empty(),empty(),empty()],[empty(),empty(),empty()]]};
data.gridData[0][1].terrain='castle';data.gridData[0][1].terrainTeam='blue';
let calls=0;
const hooks=new Function('appData','environment',hardNativeHelpers+'\nreturn {read:readHardNativeView,pack:packHardNativeRange,unpack:unpackHardNativeRange,threat:consumeHardNativeThreat};')(data,{nativeCompute:{...nativeCompute,threat:(...args:any[])=>{calls++;return (nativeCompute.threat as any)(...args);}}});
const blue=data.teams[0],red=data.teams[1];
const packed=hooks.pack([{row:0,col:0,remaining:1},{row:0,col:1,remaining:0}]);hooks.read();
assert.equal(hooks.threat(packed,blue,false,'城堡'),true);assert.equal(calls,1);
assert.equal(hooks.threat(packed,blue,false,'城堡'),true);assert.equal(calls,1);
assert.equal(hooks.threat(packed,red,false,'城堡'),false);assert.equal(hooks.threat(packed,red,false,'城堡'),false);assert.equal(calls,2);
assert.equal(hooks.threat(packed,blue,true,'房子'),false);
data.gridData[0][1].terrain='house';hooks.read();
assert.equal(hooks.threat(packed,blue,false,'房子'),false);assert.equal(hooks.threat(packed,blue,true,'房子'),true);
data.gridData[0][1].terrain='castle';data.gridData[0][1].unit='infantry';data.gridData[0][1].unitTeam='blue';data.gridData[0][1].unitStandby=true;hooks.read();
assert.equal(hooks.threat(packed,blue,false,'城堡'),false);
data.gridData[0][1].unitStandby=false;hooks.read();assert.equal(hooks.threat(packed,blue,false,'城堡'),true);
data.gridData[0][1].terrainTeam='red';hooks.read();assert.equal(hooks.threat(packed,blue,false,'城堡'),false);assert.equal(hooks.threat(packed,red,false,'城堡'),true);
data.gridData[0][1].terrainTeam='blue';hooks.read();assert.equal(hooks.threat(packed,blue,false,'城堡'),true);
const decoded=hooks.unpack(packed);decoded[1].col=2;assert.equal(hooks.threat(packed,blue,false,'城堡'),true);
const smaller=hooks.pack([{row:0,col:0,remaining:0}]);assert.equal(hooks.threat(smaller,blue,false,'城堡'),false);
data.terrains[1].name='房子';hooks.read();assert.equal(hooks.threat(packed,blue,false,'城堡'),false);
const pack=(input:any)=>(BatchClient.prototype as any).packRange(input);
let packingCases=0;
for(const typed of [false,true])for(const rows of [1,7,24])for(const cols of [1,9,32])for(const move of [0,1,32]){
    const cells=rows*cols,a=Array.from({length:cells},(_,i)=>i%5+1),b=Array.from({length:cells},(_,i)=>i%2);
    const input={rows,cols,row:rows-1,col:cols-1,move,costs:typed?Float64Array.from(a):a,blocked:typed?Float64Array.from(b):b};
    assert.deepEqual(pack(input),new Float64Array([Math.min(cells,1+2*move*(move+1)),-1,rows,cols,move,cells-1,0,0,...a,...b]));packingCases++;
}
assert.throws(()=>pack({rows:2,cols:3,row:0,col:0,move:1,costs:[],blocked:[]}));
const lines=Array.from({length:201},(_,step)=>JSON.stringify({step,text:'中文单位与地形'.repeat(500),values:Array(200).fill({x:1,y:2})})+'\n');
lines.push(JSON.stringify({large:'超大单条'.repeat(100000)})+'\n');
const stats=[];
for(const kib of [128,1024]){
    const file=path.join(output,`${kib}.jsonl.gz`),writer=new DecisionRecordWriter(file,kib*1024);
    for(const line of lines)writer.append(line);writer.close();writer.close();
    assert.equal(gunzipSync(fs.readFileSync(file)).toString(),lines.join(''));assert.equal(writer.fileOpens,1);assert.throws(()=>writer.append('关闭后拒绝'));
    assert(writer.peakPendingBytes<=Math.max(kib*1024,...lines.map(s=>Buffer.byteLength(s))));stats.push(writer.summary());
}
assert(stats[1].members<stats[0].members);
const failed=new DecisionRecordWriter(path.join(output,'missing','failed.gz'));assert.throws(()=>failed.append('写入失败\n'));assert.throws(()=>failed.append('失败后拒绝重试\n'));failed.close();
const result={passed:true,threatNativeCalls:calls,packingCases,records:lines.length,recording:stats,errorWriteRejected:true};
fs.writeFileSync(path.join(output,'RESULT.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
