/** 独立生成数值与异形批次；不读取任何历史回放。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {native,sdkInclude} from './binding';
import {ROOT,fileSha} from '../hard_jobs';
let seed=20261029;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const integer=(n:number)=>Math.floor(random()*n),round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const kernel=path.join(ROOT,'ai_training/gpu/native/build/kernel.hip');
const device=native.initializeHip(fs.readFileSync(kernel,'utf8'),sdkInclude);
let ranges=0,scores=0,cpuChecks=0,fieldCells=0;
try{
    const baseline=JSON.parse(fs.readFileSync(path.join(ROOT,'ai_training/hard_replica_gpu_20261029/native_hotspots_v3/baseline_full/RUN.json'),'utf8'));
    for(const file of ['ai_training/gpu/hard_score.hip','ai_training/gpu/parallel/range.hip'])assert.equal(fileSha(path.join(ROOT,file)),baseline.identity.sources[file]);
    const inputs:Float64Array[]=[],expected:number[][]=[];
    for(const [rows,cols,move] of [[3,4,0],[3,4,5],[8,9,7],[16,20,9],[24,32,0]]){
        const cells=rows*cols,costs=Array.from({length:cells},()=>[1,1,2,3,1000][integer(5)]),blocked=Array.from({length:cells},()=>Number(random()<.15));
        for(let origin=0;origin<cells;origin++){
            const capacity=Math.min(cells,1+2*move*(move+1)),best=Array(cells).fill(-1),order:number[]=[origin],queue=[[origin,move]];best[origin]=move;
            for(let head=0;head<queue.length;head++){
                const [pos,left]=queue[head],r=Math.floor(pos/cols),c=pos%cols;
                for(const [dr,dc] of [[0,-1],[1,0],[0,1],[-1,0]]){const nr=r+dr,nc=c+dc;if(nr<0||nr>=rows||nc<0||nc>=cols)continue;const k=nr*cols+nc,next=left-costs[k];if(!blocked[k]&&next>=0&&next>(best[k]||-1)){if(best[k]<0)order.push(k);best[k]=next;queue.push([k,next]);}}
            }
            assert(queue.length<4096);const result=Array(capacity*3).fill(0);for(let i=0;i<capacity;i++){result[i*3]=order[i]??-1;result[i*3+1]=i<order.length?best[order[i]]:0;}
            inputs.push(new Float64Array([capacity,-1,rows,cols,move,origin,0,0,...costs,...blocked]));expected.push(result);ranges++;
        }
    }
    for(let i=0;i<128;i++){
        const n=1+integer(90),e=integer(150),a=integer(150),l=integer(150),p=Array.from({length:(n+e+a+l)*2},()=>integer(100)-50),defenses=Array.from({length:n},()=>integer(60)-10),value=integer(4000),range=1+integer(4),situation=random()*5;
        const d=new Float64Array([n,e,a,l,l+1,value,range,situation,...p,...defenses]),out:number[]=[];
        const distance=(r:number,c:number,offset:number,count:number,denom:number)=>{let total=0;for(let j=0;j<count;j++)total+=Math.abs(r-p[offset+j*2])+Math.abs(c-p[offset+j*2+1]);return denom?round(total/denom):0;};
        for(let k=0;k<n;k++){const r=p[k*2],c=p[k*2+1],enemy=distance(r,c,n*2,e,e),ally=distance(r,c,(n+e)*2,a,a),landing=distance(r,c,(n+e+a)*2,l,l+1),gap=round(landing-enemy),defense=defenses[k]-10;let score=0;if(gap>0)score=-(gap-situation+1)*value/10+defense*2;else if(gap>=-1)score=gap*10+defense*2;else if(gap>=-2)score=(gap+range-1)*10+defense;out.push(enemy,ally,score);}
        inputs.splice(i*3,0,d);expected.splice(i*3,0,out);scores+=n;
    }
    for(const batch of [1,7,32,128])for(let first=0;first<inputs.length;first+=batch){const chunk=inputs.slice(first,first+batch),result=await native.calculateBatch(chunk);let offset=0;for(let j=0;j<chunk.length;j++){assert.equal(result.counts[j],chunk[j][0]);for(const n of expected[first+j]){assert(Math.abs(result.output[offset++]-n)<=1e-10);} }assert.equal(offset,result.output.length);}
    for(const bad of [new Float64Array(7),new Float64Array([1,-1,24,33,0,0,0,0]),new Float64Array([1,0,0,0,1,1,1,1,.5,0,0])])await assert.rejects(native.calculateBatch([bad]));
    assert.throws(()=>native.calculateBatch([]));
    // 异形距离场与普通评分、FIFO范围混合，整数和及计数必须完全相等。
    for(const [rows,cols] of [[1,1],[3,4],[9,8],[24,32]]){
        const view=new Float64Array(rows*cols*8);for(let k=0;k<rows*cols;k++)view.set([0,[0,1,6][integer(3)],integer(4),integer(3)+1,integer(4),integer(3)+1,0,0],k*8);
        const field=native.packDistanceField(view,cols,1,1),batch=await native.calculateBatch([inputs[0],field,inputs[1]]),offset=batch.counts[0]*3,e=field[4],a=field[5];
        for(let k=0;k<rows*cols;k++){const r=Math.floor(k/cols),c=k%cols;let es=0,as=0;for(let j=0;j<e+a;j++){const d=Math.abs(r-field[8+j*2])+Math.abs(c-field[9+j*2]);if(j<e)es+=d;else as+=d;}assert.equal(batch.output[offset+k*3],es);assert.equal(batch.output[offset+k*3+1],as);assert.equal(batch.output[offset+k*3+2],e*2048+a);fieldCells++;}
    }
    for(const bad of [new Float64Array([1,-2,24,33,0,0,0,0]),new Float64Array([1,-2,1,1,1,0,0,0,.5,0]),new Float64Array([1,-2,1,1,1537,0,0,0])])await assert.rejects(native.calculateBatch([bad]));
    for(let i=0;i<100;i++){
        const rows=3,cols=4,view=new Float64Array(rows*cols*8);for(let k=0;k<rows*cols;k++)view.set([integer(3),[0,1,6][integer(3)],integer(4),integer(3),integer(4),integer(3),integer(4),integer(2)],k*8);
        const team=1,alliance=1,origin=integer(12),landing=integer(12),r=integer(3),c=integer(4);
        for(const enemy of [0,1]){let sum=0,count=0;for(let k=0;k<12;k++){const p=view.subarray(k*8,k*8+8),d=Math.abs(r-Math.floor(k/4))+Math.abs(c-k%4);if(p[4]&&Number(p[5]!==alliance)===enemy&&!(!enemy&&(k===origin||k===landing))){sum+=d;count++;}if((p[1]&4)&&p[2]&&(enemy?p[3]!==alliance:p[2]===team)){sum+=d;count++;}}if(!enemy){sum+=Math.abs(r-Math.floor(landing/4))+Math.abs(c-landing%4);count++;}assert.equal(native.averageDistance(view,cols,r,c,team,alliance,enemy,origin,landing),count?round(sum/count):999);cpuChecks++;}
        for(const air of [0,1])for(const block of [0,1]){const costs=new Float64Array([1,2,1000]),actual=native.movementInput(view,costs,alliance,air,block,landing,air);for(let k=0;k<12;k++){const p=view.subarray(k*8,k*8+8);assert.equal(actual[k],costs[p[0]]);assert.equal(actual[12+k],Number(!!block&&(k===landing?(!air||!!air):!!p[4]&&!!p[5]&&p[5]!==alliance&&(!air||!!(p[6]&1)))));}cpuChecks++;}
        for(const capture of [0,1])for(const kind of [0,1,2,3]){const positions=Float64Array.from([0,2,4,7,11]),expected=positions.some(k=>{const p=view.subarray(k*8,k*8+8),building=p[1]&3;return p[2]===team&&(!kind||kind===building)&&((building===1&&!!capture)||(building===2&&!(p[6]&2&&p[7])));});assert.equal(native.threat(view,positions,team,capture,kind),expected);cpuChecks++;}
    }
    assert.equal(native.averageDistance(new Float64Array(8),1,0,0,1,1,1,-1,-1),999);
    const result={passed:true,device,kernelSha256:fileSha(kernel),rangeOrigins:ranges,scoreCandidates:scores,batchShapes:[1,7,32,128],cpuChecks,fieldCells,malformedInputs:7};
    const out=path.join(ROOT,'ai_training/hard_replica_gpu_20261029/native_hotspots_v3/NATIVE_TEST.json');fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{native.closeHip();}
