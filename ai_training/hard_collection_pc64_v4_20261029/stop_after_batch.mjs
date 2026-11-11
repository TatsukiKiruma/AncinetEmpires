/** 等指定批次完整结束后关闭后续调度；不向仍有在途对局的采集器发送STOP。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const out=import.meta.dirname;
const read=file=>JSON.parse(fs.readFileSync(path.join(out,file),'utf8'));
const save=(file,value)=>{const f=path.join(out,file);fs.writeFileSync(f+'.pending',JSON.stringify(value,null,2));fs.renameSync(f+'.pending',f);};
const request=read('STOP_AFTER_BATCH_REQUEST.json');
const lock=path.join(out,'STOP_AFTER_BATCH_GUARD.lock');
fs.writeFileSync(lock,JSON.stringify({pid:process.pid,created:new Date().toISOString()}),{flag:'wx'});
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;if(e.code==='EPERM')return true;throw e;}};
let signaled=false;
function status(phase,extra={}){save('STOP_AFTER_BATCH_STATUS.json',{phase,pid:process.pid,request,signaled,updated:new Date().toISOString(),...extra});}
try{
    status('waiting_for_current_batch');
    while(true){
        const file=path.join(out,request.directory,'PROGRESS.json');
        const progress=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
        const batchFinished=progress&&['complete','stopped','error'].includes(progress.phase)&&progress.active.length===0;
        const collectorExited=!alive(request.collectorPid);
        if(!signaled&&(batchFinished||collectorExited)){
            // 只在本批动作全部收尾或采集进程已退出后设置总驱动停止标记，留出静态核验时间。
            const stop=path.join(out,'STOP');
            try{fs.writeFileSync(stop,`用户要求第${request.batchNumber}批结束、静态核验入账后停止后续调度\n`,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
            signaled=true;status('batch_finished_stop_signaled',{batchProgress:progress});
        }
        if(!alive(request.driverPid)){
            const final=read('PROGRESS.json'),state=read('STATE.json');
            status('finished',{driverExited:true,finalProgress:final,batchesStarted:state.batches.map(b=>b.number),noLaterBatchStarted:state.batches.every(b=>b.number<=request.batchNumber),requestedBatchAudited:!!state.batches.find(b=>b.number===request.batchNumber)?.audited});
            break;
        }
        await new Promise(resolve=>setTimeout(resolve,500));
    }
}catch(e){status('attention',{error:String(e),stack:e.stack});process.exitCode=1;}
finally{fs.unlinkSync(lock);}
