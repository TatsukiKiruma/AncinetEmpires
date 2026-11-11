/** 独立后台交接器，前一轮采集、驱动及宿主退出后开始补足。 */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {prepareAfterBoundary} from './prepare';
import {ROOT,OUT,SOURCE_DIR,PREVIOUS,read,save} from './common.mjs';
const request=read(path.join(OUT,'HANDOFF_REQUEST.json')),lock=path.join(OUT,'HANDOFF.lock'),started=Date.now();
fs.writeFileSync(lock,JSON.stringify({pid:process.pid,created:new Date().toISOString()}),{flag:'wx'});
const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch(e){if((e as any).code==='ESRCH')return false;if((e as any).code==='EPERM')return true;throw e;}};
try{
    let saved=0,deadSince=0;
    while(true){
        if(fs.existsSync(path.join(OUT,'STOP'))||fs.existsSync(path.join(OUT,'DRAIN')))throw Error('交接前收到停止指令，未启动新采集');
        const priorAlive=alive(request.oldDriverPid)||alive(request.oldSupervisorPid);
        if(!priorAlive&&fs.existsSync(path.join(PREVIOUS,'CLOSED.json')))break;
        if(!priorAlive){deadSince||=Date.now();if(Date.now()-deadSince>60000)throw Error('前一轮退出但没有闭合记录，停止交接等待诊断');}
        if(Date.now()-started>12*3600*1000)throw Error('等待前一轮收尾超过12小时，停止交接等待诊断');
        if(Date.now()-saved>15000){save('HANDOFF_STATUS.json',{phase:'waiting_previous_to_close',pid:process.pid,oldDriverPid:request.oldDriverPid,previousProgress:read(path.join(PREVIOUS,'PROGRESS.json')),targetDistinct:3000,maximumWorkers:64,updated:new Date().toISOString()});saved=Date.now();}
        await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(alive(request.currentCollectorPid))throw Error('前一轮采集仍存活，拒绝重叠启动');
    const preparation=prepareAfterBoundary();save('HANDOFF_STATUS.json',{phase:'starting64',pid:process.pid,preparation,updated:new Date().toISOString()});
    const stdout=fs.openSync(path.join(OUT,'driver.stdout.log'),'wx'),stderr=fs.openSync(path.join(OUT,'driver.stderr.log'),'wx');
    const child=spawn(process.execPath,['--openssl-legacy-provider','--import','tsx',path.join(SOURCE_DIR,'drive.ts')],{cwd:ROOT,windowsHide:true,stdio:['ignore',stdout,stderr]});fs.closeSync(stdout);fs.closeSync(stderr);
    save('HANDOFF_STATUS.json',{phase:'running64_to3000',pid:process.pid,driverPid:child.pid,targetDistinct:3000,maximumWorkers:64,baselineDistinct:preparation.baselineDistinct,remainingAtLaunch:preparation.remaining,updated:new Date().toISOString()});
    const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
    save('HANDOFF_CLOSED.json',{closed:new Date().toISOString(),driverExitCode:code,collectorState:read(path.join(OUT,'CLOSED.json')),finalReport:path.join(OUT,'FINAL_REPORT.json')});process.exitCode=code??1;
}catch(e){save('HANDOFF_ERROR.json',{error:String(e),stack:(e as Error).stack,updated:new Date().toISOString()});console.error(e);process.exitCode=1;}
finally{fs.unlinkSync(lock);}
