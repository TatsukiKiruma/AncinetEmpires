/** 工作线程同步接口；缓存按字节限额，范围只保留有效整数项。 */
import {parentPort,workerData} from 'node:worker_threads';
import type {HardMovementBatch,HardMovementResult,ApkHardComputeOptions} from '../../../src/game/ai/runtime/apk_hard_compute';
import {ByteCache} from './byte_cache';
export class BatchClient {
    constructor(private nativePacking=false,private packFields?:(view:Float64Array,cols:number,team:number,alliance:number)=>Float64Array){}
    memory=workerData.memory as SharedArrayBuffer;
    flag=new Int32Array(this.memory,0,4);
    cache=new ByteCache<HardMovementResult>(2*1024**2);
    ranges=new ByteCache<Float64Array|Int16Array>(8*1024**2);
    fields=new ByteCache<Float64Array>(2*1024**2);
    requests=0;hits=0;failure:string|null=null;rangeRequests=0;rangeHits=0;fieldRequests=0;fieldHits=0;
    transfer(data:Float64Array){Atomics.store(this.flag,0,0);parentPort!.postMessage({type:'score',data:data.buffer},[data.buffer]);if(Atomics.wait(this.flag,0,0,120000)==='timed-out'||Atomics.load(this.flag,0)!==1){this.failure='批量GPU服务失败或超时';throw Error(this.failure);}}
    private packRange(input:Parameters<NonNullable<ApkHardComputeOptions['movementRange']>>[0]){
        const cells=input.rows*input.cols,capacity=Math.min(cells,1+2*input.move*(input.move+1));
        if(input.costs.length!==cells||input.blocked.length!==cells)throw Error('移动范围输入长度不符');
        // 直接写入连续数组，避免展开两份网格再转换浮点数组。
        const data=new Float64Array(8+cells*2);
        data.set([capacity,-1,input.rows,input.cols,input.move,input.row*input.cols+input.col,0,0]);
        data.set(input.costs,8);data.set(input.blocked,8+cells);return data;
    }
    movementRange:NonNullable<ApkHardComputeOptions['movementRange']>=(input)=>{
        const map=input,cells=map.rows*map.cols,capacity=Math.min(cells,1+2*map.move*(map.move+1));
        const packed=this.nativePacking?this.packRange(input):null;
        const key=packed?Buffer.from(packed.buffer).toString('base64'):JSON.stringify(input);let values=this.ranges.get(key);
        if(!values){const data=packed??this.packRange(input);this.transfer(data);const raw=new Float64Array(this.memory,16,capacity*3);
            if(this.nativePacking){let length=0;for(let i=0;i<capacity;i++)if(raw[i*3]>=0)length++;const compact=new Int16Array(length*2);let at=0;for(let i=0;i<capacity;i++)if(raw[i*3]>=0){compact[at++]=raw[i*3];compact[at++]=raw[i*3+1];}values=compact;}else values=raw.slice();
            this.ranges.set(key,values,values.byteLength);this.rangeRequests++;
        }else this.rangeHits++;
        const result:{row:number;col:number;remaining:number}[]=[];
        if(values instanceof Int16Array){for(let i=0;i<values.length;i+=2)result.push({row:Math.floor(values[i]/map.cols),col:values[i]%map.cols,remaining:values[i+1]});}
        else for(let i=0;i<capacity;i++){const cell=values[i*3];if(cell>=0)result.push({row:Math.floor(cell/map.cols),col:cell%map.cols,remaining:values[i*3+1]});}
        return result;
    };
    private packScore(input:HardMovementBatch){const groups=[input.positions,input.enemyPositions,input.allyPositions,input.landingPositions],n=input.positions.length;if(input.defenses.length!==n)throw Error('评分防御向量长度不符');const length=8+groups.reduce((s,v)=>s+v.length*2,0)+n,data=new Float64Array(length);data.set([n,groups[1].length,groups[2].length,groups[3].length,input.landingCount,input.unitValue,input.maxRange,input.situation??1]);let at=8;for(const group of groups)for(const point of group){if(point.length!==2)throw Error('评分坐标必须为二维');data[at++]=point[0];data[at++]=point[1];}for(const defense of input.defenses)data[at++]=defense;return data;}
    compute=(input:HardMovementBatch):HardMovementResult=>{
        const packed=this.nativePacking?this.packScore(input):null,key=packed?Buffer.from(packed.buffer).toString('base64'):JSON.stringify(input),cached=this.cache.get(key);if(cached){this.hits++;return cached;}
        const data=packed??this.packScore(input);this.transfer(data);const result:HardMovementResult={enemy:[],ally:[],landing:[]},values=new Float64Array(this.memory,16,input.positions.length*3);
        for(let i=0;i<input.positions.length;i++){result.enemy.push(values[i*3]);result.ally.push(values[i*3+1]);result.landing.push(values[i*3+2]);}this.requests++;this.cache.set(key,result,input.positions.length*24+96);return result;
    };
    distanceField:NonNullable<ApkHardComputeOptions['distanceField']>=(input)=>{
        if(!this.packFields)throw Error('距离场打包器未初始化');const data=this.packFields(input.view,input.cols,input.team,input.alliance),key=Buffer.from(data.buffer).toString('base64');let values=this.fields.get(key);
        if(!values){this.transfer(data);values=new Float64Array(this.memory,16,input.rows*input.cols*3).slice();this.fields.set(key,values,values.byteLength);this.fieldRequests++;}else this.fieldHits++;
        return values;
    };
    stats(){return {scores:this.cache.summary(),ranges:this.ranges.summary(),fields:this.fields.summary(),fieldRequests:this.fieldRequests,fieldHits:this.fieldHits};}
    assertHealthy(){if(this.failure)throw Error(this.failure);}
}
