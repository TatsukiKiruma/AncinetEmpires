import fs from 'node:fs';
import { Worker } from 'node:worker_threads';

/** 只读固定状态验证用桥接；不计为真机测量，不执行对局。 */
export function nodeWorkerShim(file){
    const code=fs.readFileSync(file,'utf8'),active=new Set();
    class BrowserWorker {
        constructor(){
            this.thread=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.postMessage=value=>parentPort.postMessage(value);parentPort.on('message',data=>globalThis.onmessage({data}));\n${code}`,{eval:true});
            active.add(this.thread);
            this.thread.on('message',data=>this.onmessage?.({data}));
            this.thread.on('error',error=>this.onerror?.({message:String(error)}));
        }
        postMessage(value){this.thread.postMessage(value);}
        terminate(){active.delete(this.thread);this.thread.terminate();}
    }
    return {Worker:BrowserWorker,close:async()=>{await Promise.all([...active].map(thread=>thread.terminate()));active.clear();}};
}
