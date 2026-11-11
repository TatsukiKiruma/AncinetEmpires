/** 本机原生模块加载边界；公共运行时只依赖计算接口，不依赖研究目录。 */
import {createRequire} from 'node:module';
import path from 'node:path';
import {ROOT} from '../hard_jobs';
export interface NativeBinding {
    packDistanceField(view:Float64Array,cols:number,team:number,alliance:number):Float64Array;
    movementInput(view:Float64Array,costs:Float64Array,alliance:number,air:number,block:number,killed:number,killedAir:number):Float64Array;
    averageDistance(view:Float64Array,cols:number,row:number,col:number,team:number,alliance:number,enemy:number,origin:number,landing:number):number;
    threat(view:Float64Array,positions:Float64Array,team:number,capture:number,kind:number):boolean;
    initializeHip(source:string,include:string):{name:string;architecture:string;initializationCpuSeconds:number};
    calculateBatch(requests:Float64Array[]):Promise<{counts:number[];output:Float64Array;gpuMs:number;serviceSeconds:number;gpuCpuSeconds:number}>;
    closeHip():number;
    sampleGpu():any;
    closeMonitor():void;
}
const sdk=path.join(ROOT,'ai_training/.venv-rocm/Lib/site-packages/_rocm_sdk_core');
process.env.PATH=path.join(sdk,'bin')+path.delimiter+process.env.PATH;
export const native=createRequire(import.meta.url)(path.join(ROOT,'ai_training/gpu/native/build/hard_native.node')) as NativeBinding;
export const sdkInclude=path.join(sdk,'include');
export const nativeQueries={movementInput:0,averageDistance:0,threat:0,packDistanceField:0};
let nativeFailure:unknown=null;
const guarded=<A extends unknown[],R>(key:keyof typeof nativeQueries,fn:(...args:A)=>R)=>(...args:A):R=>{nativeQueries[key]++;try{return fn(...args);}catch(e){nativeFailure=e;throw e;}};
export const nativeCompute={movementInput:guarded('movementInput',native.movementInput),averageDistance:guarded('averageDistance',native.averageDistance),threat:guarded('threat',native.threat)};
export const packDistanceField=guarded('packDistanceField',native.packDistanceField);
export function assertNativeHealthy(){if(nativeFailure)throw Error('原生计算失败，拒绝使用回退结果：'+String(nativeFailure));}
