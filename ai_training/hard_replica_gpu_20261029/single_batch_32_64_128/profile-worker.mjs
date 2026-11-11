// 在正式计时结束后采样当前GPU路径，不执行历史动作。
import {Session} from 'node:inspector';
import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs';
import {tsImport} from 'tsx/esm/api';
const session=new Session();session.connect();
const post=(name)=>new Promise((resolve,reject)=>session.post(name,(error,result)=>error?reject(error):resolve(result)));
await post('Profiler.enable');await post('Profiler.start');
parentPort.on('message',async message=>{
    if(message.type!=='profile-stop')return;
    const result=await post('Profiler.stop');
    fs.writeFileSync(workerData.profileFile,JSON.stringify(result.profile));
    session.disconnect();parentPort.postMessage({type:'profile-saved'});
});
// 停止采样消息不送入原工作线程的对局处理器。
const originalOn=parentPort.on.bind(parentPort);
parentPort.on=(event,listener)=>originalOn(event,event==='message'?(message)=>{if(message.type!=='profile-stop')listener(message);}:listener);
await tsImport('../../gpu/parallel/worker.ts',import.meta.url);
