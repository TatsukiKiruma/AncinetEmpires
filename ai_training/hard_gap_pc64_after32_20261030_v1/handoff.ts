/** 独立后台交接：等待当前32局结算和旧驱动退出，再开始64路后继。 */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {prepareAfterBoundary} from './prepare';
import {ROOT,OUT,SOURCE_DIR,PREVIOUS,read,save} from './common.mjs';
const request=read(path.join(OUT,'HANDOFF_REQUEST.json')),started=Date.now(),lock=path.join(OUT,'HANDOFF.lock');
fs.writeFileSync(lock,JSON.stringify({pid:process.pid,created:new Date().toISOString()}),{flag:'wx'});
const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch(e){if((e as any).code==='ESRCH')return false;if((e as any).code==='EPERM')return true;throw e;}};
try{
    let lastSaved=0,deadSince=0;
    while(true){
        const oldAlive=alive(request.oldDriverPid),closed=fs.existsSync(path.join(PREVIOUS,'CLOSED.json'));
        if(!oldAlive&&closed)break;
        if(!oldAlive){deadSince||=Date.now();if(Date.now()-deadSince>60000)throw Error('旧驱动退出但无闭合记录，停止接续等待核实');}
        if(Date.now()-started>12*3600*1000)throw Error('等待当前批次超过12小时，停止接续等待核实');
        if(Date.now()-lastSaved>15000){save('HANDOFF_STATUS.json',{phase:'waiting_current32_to_finish',pid:process.pid,oldDriverPid:request.oldDriverPid,oldProgress:read(path.join(PREVIOUS,'PROGRESS.json')),remainingParents:224,maximumWorkers:64,updated:new Date().toISOString()});lastSaved=Date.now();}
        await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(alive(request.currentCollectorPid))throw Error('旧采集进程仍存活，拒绝重叠启动');
    const prep=prepareAfterBoundary();save('HANDOFF_STATUS.json',{phase:'starting64',pid:process.pid,preparation:prep,updated:new Date().toISOString()});
    const stdout=fs.openSync(path.join(OUT,'driver.stdout.log'),'wx'),stderr=fs.openSync(path.join(OUT,'driver.stderr.log'),'wx');
    const child=spawn(process.execPath,['--openssl-legacy-provider','--import','tsx',path.join(SOURCE_DIR,'drive.ts')],{cwd:ROOT,windowsHide:true,stdio:['ignore',stdout,stderr]});fs.closeSync(stdout);fs.closeSync(stderr);
    save('HANDOFF_STATUS.json',{phase:'running64',pid:process.pid,driverPid:child.pid,remainingParents:224,maximumWorkers:64,updated:new Date().toISOString()});
    const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    save('HANDOFF_CLOSED.json',{closed:new Date().toISOString(),driverExitCode:code,allCollectorsClosed:read(path.join(OUT,'CLOSED.json')).allStartedCollectorProcessesExited,finalReport:path.join(OUT,'FINAL_REPORT.json')});process.exitCode=code??1;
}catch(e){save('HANDOFF_ERROR.json',{error:String(e),stack:(e as Error).stack,updated:new Date().toISOString()});console.error(e);process.exitCode=1;}
finally{fs.unlinkSync(lock);}
