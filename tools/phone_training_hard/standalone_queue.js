// 嵌入驻留器同一IIFE；单局由手机本地定时器驱动，状态和证据不依赖PC连接。
const collector = rpc.exports;
const standalone = {config:null,phase:'unconfigured',started:false,busy:false,done:false,
 error:null,stopRequested:false,cancelled:false,finishAttempted:false,lastCollector:null,
 root:null,taskRoot:null,timer:null,heartbeat:null,result:null,manifest:null,receipt:null};
let standaloneResources = null, standaloneResourcePaused = false;

function standaloneJava(callback) {
 let result, failure;
 Java.performNow(function(){try{result=callback();}catch(error){failure=error;}});
 if(failure)throw failure;
 return result;
}
function standaloneContext() {
 return activity || U('android.app.ActivityThread').currentApplication();
}
function standalonePath(path) {
 const File=U('java.io.File'),context=standaloneContext();
 if(!context)throw new Error('应用私有目录尚未就绪');
 const base=String(File.$new(context.getFilesDir(),'.aeii-hard-standalone').getCanonicalPath());
 const file=File.$new(String(path)),canonical=String(file.getCanonicalPath());
 if(!canonical.startsWith(base+'/')||canonical.slice(base.length+1).split('/').some(x=>!x||x==='.'||x==='..'||!/^[A-Za-z0-9._-]+$/.test(x)))
  throw new Error('独立任务路径必须位于本应用私有standalone目录内');
 return file;
}
function standaloneWrite(file,value,replace) {
 const File=U('java.io.File');
 if(!replace&&file.exists())throw new Error('拒绝覆盖已有回执：'+String(file.getAbsolutePath()));
 const target=replace?File.$new(file.getParentFile(),String(file.getName())+'.tmp-'+String(U('java.lang.System').nanoTime())):file;
 if(!target.createNewFile())throw new Error('无法创建新状态或回执');
 const output=U('java.io.FileOutputStream').$new(target);
 try{output.write(U('java.lang.String').$new(JSON.stringify(value)+'\n').getBytes('UTF-8'));output.getFD().sync();}
 finally{output.close();}
 if(replace&&!target.renameTo(file))throw new Error('原子更新STATE失败，临时文件保留');
}
function standaloneRead(file) {
 const reader=U('java.io.BufferedReader').$new(U('java.io.InputStreamReader').$new(U('java.io.FileInputStream').$new(file),'UTF-8'));
 const lines=[];
 try{let line;while((line=reader.readLine())!==null)lines.push(String(line));}finally{reader.close();}
 return JSON.parse(lines.join('\n'));
}
function standaloneIdle(status) {
 return Boolean(status)&&status.workerAlive!==true&&status.inCall===false&&status.pendingCallbacks===0&&status.pageLoadPending===false;
}
function standaloneStopRequested() {
 if(standalone.stopRequested)return true;
 if(!standalone.root)return false;
 const File=U('java.io.File');
 if(File.$new(standalone.root,'STOP').exists() ||
  (standalone.taskRoot&&File.$new(standalone.taskRoot,'STOP').exists()))standalone.stopRequested=true;
 return standalone.stopRequested;
}
function resourceStatus(force) {
 const now=Date.now(),age=standaloneResources?now-standaloneResources.observedMs:-1;
 if(!force&&age>=0&&age<2000)return standaloneResources;
 let observed;
 try{
  const context=standaloneContext();if(!context)throw new Error('应用上下文尚未就绪');
  const filter=U('android.content.IntentFilter').$new('android.intent.action.BATTERY_CHANGED');
  const intent=context.registerReceiver(null,filter);if(intent===null)throw new Error('电池stickyIntent为空');
  const level=Number(intent.getIntExtra('level',-1)),scale=Number(intent.getIntExtra('scale',-1));
  const temperature=Number(intent.getIntExtra('temperature',-1))/10;
  const free=Number(U('android.os.StatFs').$new(String(context.getFilesDir().getAbsolutePath())).getAvailableBytes());
  if(scale<=0||level<0||level>scale||temperature<0||temperature>100||!Number.isFinite(free)||free<0)
   throw new Error('手机资源读数不合理');
  const battery=100*level/scale;
  if(standaloneResourcePaused){if(battery>=25&&temperature<=42&&free>=2.25*1024**3)standaloneResourcePaused=false;}
  else if(battery<20||temperature>=45||free<2*1024**3)standaloneResourcePaused=true;
  observed={observedMs:now,available:true,batteryPercent:battery,temperatureC:temperature,
   freeBytes:free,shouldPause:standaloneResourcePaused};
 }catch(error){standaloneResourcePaused=true;observed={observedMs:now,available:false,shouldPause:true,error:String(error)};}
 standaloneResources=observed;return observed;
}
function shouldPause() {return resourceStatus(false).shouldPause;}
function standaloneSnapshot() {
 const config=standalone.config||{},status=standalone.lastCollector;
 let phase=standalone.phase;
 if(phase==='running'&&standaloneResources&&standaloneResources.shouldPause)phase='waiting_resources';
 return {standalonePhase:phase,phase:phase,updatedMs:Date.now(),independentReplayDeferred:true,
  parentId:config.job?config.job.parentId:null,attemptId:config.job?config.job.attemptId:null,
  sequenceIndex:config.sequenceIndex,total:config.total,completedBefore:config.completedBefore,
  doneParents:(config.completedBefore||0)+(standalone.phase==='complete'?1:0),planSha256:config.planSha256,
  appPid:U?Number(U('android.os.Process').myPid()):null,safeToStop:standaloneIdle(status),
  stopRequested:standalone.stopRequested,resource:standaloneResources,collectorStatus:status,
  naturalEnd:standalone.result?standalone.result.naturalEnd:null,error:standalone.error,
  artifactManifest:standalone.manifest,cleanupReceipt:standalone.receipt};
}
function standalonePublish() {
 if(!standalone.root)return;
 standaloneWrite(U('java.io.File').$new(standalone.root,'STATE.json'),standaloneSnapshot(),true);
}
function standaloneTerminalFailure(message,status) {
 standalone.error=String(message);standalone.lastCollector=status||standalone.lastCollector;
 if(!standaloneIdle(standalone.lastCollector)){standalone.phase='waiting_safe_stop';standalonePublish();return;}
 standalone.phase='failed';standalone.done=true;standalonePublish();
 if(standalone.timer)clearInterval(standalone.timer);
 if(standalone.heartbeat)clearInterval(standalone.heartbeat);
}
function standaloneFinalize(status) {
 const config=standalone.config,job=config.job,File=U('java.io.File');
 if(status.cleanup!=='safe'||status.fatal!==null||status.workerAlive!==false||!standaloneIdle(status))
  throw new Error('原生线程或生命周期未安全收尾');
 const result=status.workerResult;
 if(!result||result.parentId!==job.parentId||result.attemptId!==job.attemptId||result.map!==job.map||result.seed!==job.seed||
  !Number.isInteger(result.actions)||result.actions<1||result.actions>job.maxActions||state.committedActions!==result.actions)
  throw new Error('单局结果身份或动作数不完整');
 if(result.naturalEnd!==true&&(result.truncationReason!=='max_actions'||result.actions!==job.maxActions))
  throw new Error('结果既非自然终局也非完整动作上限截断');
 if(!state.artifactDir||String(state.artifactDir.getName())!==job.attemptId)throw new Error('产物目录身份不符');
 const names=['config.bin','initial.bin','final.bin','actions.jsonl.gz','states.bin.gz','result.json','decision-evidence.jsonl.gz'];
 const directory=state.artifactDir,listed=directory.listFiles();
 if(listed===null||listed.length!==names.length)throw new Error('单局原始七件集合不完整或含未知条目');
 const expected=new Set(names),files=[];
 for(let i=0;i<listed.length;i++){
  const file=listed[i],name=String(file.getName());
  if(!expected.has(name)||!file.isFile()||Number(file.length())<=0||
   String(file.getCanonicalFile().getParent())!==String(directory.getCanonicalPath()))throw new Error('未知、链接或空产物');
  expected.delete(name);files.push({name:name,bytes:Number(file.length()),sha256:sha256(file)});
 }
 if(JSON.stringify(standaloneRead(File.$new(directory,'result.json')))!==JSON.stringify(result))throw new Error('原生结果文件与线程结果不同');
 const manifestFile=File.$new(directory,'artifact-manifest.json');
 standaloneWrite(manifestFile,{schema:'phone-standalone-raw-seven-v1',parentId:job.parentId,attemptId:job.attemptId,
  planSha256:config.planSha256,independentReplayDeferred:true,files:files},false);
 const receiptFile=File.$new(directory,'safe-cleanup-receipt.json');
 standaloneWrite(receiptFile,{schema:'phone-standalone-safe-cleanup-v1',parentId:job.parentId,attemptId:job.attemptId,
  sequenceIndex:config.sequenceIndex,planSha256:config.planSha256,cleanup:'safe',workerAlive:false,
  pendingCallbacks:0,pageLoadPending:false,inCall:false,fatal:null,artifactManifestSha256:sha256(manifestFile),
  naturalEnd:result.naturalEnd===true,truncated:result.naturalEnd!==true,actions:result.actions,
  independentReplayDeferred:true,completedMs:Date.now()},false);
 standalone.result=result;standalone.manifest=String(manifestFile.getAbsolutePath());
 standalone.receipt=String(receiptFile.getAbsolutePath());standalone.phase='complete';standalone.done=true;
 standalonePublish();clearInterval(standalone.timer);clearInterval(standalone.heartbeat);
}
async function standaloneTick() {
 if(standalone.busy||standalone.done||!standalone.config||!Java.available||typeof U!=='function'||!activity)return;
 standalone.busy=true;
 try{
  let status=standaloneJava(function(){
   if(!standalone.root){
    const root=standalonePath(standalone.config.stateRoot),File=U('java.io.File');
    if(!root.exists()&&!root.mkdirs())throw new Error('无法创建手机STATE目录');
    if(File.$new(root,'STATE.json').exists())throw new Error('拒绝覆盖已有单局STATE');
    if(standalone.config.taskRoot){
     const task=File.$new(String(standalone.config.taskRoot)),canonical=String(task.getCanonicalPath());
     if(!/^\/data\/local\/tmp\/aeii-hard-standalone-[A-Za-z0-9_-]+$/.test(canonical))throw new Error('只读STOP目录身份不符');
     standalone.taskRoot=Java.retain(task);
    }
    standalone.root=Java.retain(root);
   }
   const snapshot=collector.status();standalone.lastCollector=snapshot;resourceStatus(false);standaloneStopRequested();
   return snapshot;
  });
  if(standalone.stopRequested&&!standalone.cancelled){
   standalone.cancelled=true;standalone.error='收到手机STOP，安全收尾后停止队列';
   status=await collector.cancel();standalone.lastCollector=status;
  }
  if(!standalone.started){
   if(standalone.stopRequested||status.fatal){standaloneJava(()=>standaloneTerminalFailure(standalone.error||status.fatal,status));return;}
   if(!status.ready){standalone.phase='waiting_ready';standaloneJava(standalonePublish);return;}
   if(standaloneResources.shouldPause){standalone.phase='waiting_resources';standaloneJava(standalonePublish);return;}
   standalone.started=true;standalone.phase='running';standaloneJava(standalonePublish);
   const config=standalone.config;
   await collector.start({package:config.package,job:config.job,baseConfigZip:config.baseConfigZip,baseConfigName:config.baseConfigName},
    standalone.nativeSource,standalone.workerSource);
   return;
  }
  if(status.workerAlive===true)return;
  if(!standalone.finishAttempted){
   standalone.finishAttempted=true;standalone.phase='finishing';standaloneJava(standalonePublish);
   status=await collector.finish();standalone.lastCollector=status;
  }
  if(standalone.stopRequested||status.fatal||standalone.error){
   standaloneJava(()=>standaloneTerminalFailure(standalone.error||status.fatal||'手机单局停止',status));return;
  }
  standaloneJava(()=>standaloneFinalize(status));
 }catch(error){
  standalone.error=String(error);
  try{
   const status=standaloneJava(()=>collector.status());standalone.lastCollector=status;
   if(status.workerAlive===true){if(!standalone.cancelled){standalone.cancelled=true;await collector.cancel();}}
   else if(standalone.started&&!standalone.finishAttempted){standalone.finishAttempted=true;standalone.lastCollector=await collector.finish();}
   standaloneJava(()=>standaloneTerminalFailure(error,standalone.lastCollector));
  }catch(cleanupError){standalone.error=String(error)+'；等待安全停止：'+String(cleanupError);}
 }finally{standalone.busy=false;}
}
rpc.exports={...collector,
 init:function(stage,parameters){
  if(standalone.config)throw new Error('本进程拒绝重复配置或覆盖已有attempt');
  const config=parameters&&parameters.config?parameters.config:parameters,job=config&&config.job;
  if(!job||!config.stateRoot||!config.package||!config.baseConfigZip||!config.baseConfigName||
   !/^[0-9a-f]{64}$/.test(config.planSha256||'')||config.total!==1000||
   !Number.isInteger(config.sequenceIndex)||config.sequenceIndex<1||config.sequenceIndex>1000||
   config.completedBefore!==config.sequenceIndex-1||job.requestedPlayerType!==3||job.jsRngMode!=='original_webview_rng'||
   !Number.isInteger(job.maxActions)||job.maxActions<1||job.maxActions>20000||
   ['parentId','attemptId'].some(key=>!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(job[key]||'')))throw new Error('手机单局配置不完整或身份不安全');
  const nativeSource=typeof HARD_NATIVE_SOURCE==='string'?HARD_NATIVE_SOURCE:config.nativeSource;
  const workerSource=typeof HARD_WORKER_SOURCE==='string'?HARD_WORKER_SOURCE:config.workerSource;
  if(typeof nativeSource!=='string'||!nativeSource||typeof workerSource!=='string'||!workerSource)throw new Error('缺少冻结的原生worker源码');
  standalone.config=config;standalone.nativeSource=nativeSource;standalone.workerSource=workerSource;standalone.phase='waiting_ready';
  standalone.timer=setInterval(standaloneTick,500);
  standalone.readyTimer=setTimeout(function(){
   if(standalone.started||standalone.done||(standalone.lastCollector&&standalone.lastCollector.ready))return;
   const message='60秒内手机采集入口未就绪';
   standalone.error=message;
   try{standaloneJava(function(){
    if(!standalone.root){
     const root=standalonePath(config.stateRoot),File=U('java.io.File');
     if(!root.exists()&&!root.mkdirs())throw new Error('无法创建超时状态目录');
     if(File.$new(root,'STATE.json').exists())throw new Error('拒绝覆盖已有单局STATE');
     standalone.root=Java.retain(root);
    }
    standaloneTerminalFailure(message,collector.status());
   });}
   catch(error){standalone.phase='failed';standalone.done=true;console.error(message+'：'+String(error));}
   clearInterval(standalone.timer);clearInterval(standalone.heartbeat);
  },60000);
  standalone.heartbeat=setInterval(function(){if(standalone.root&&!standalone.done){try{standaloneJava(function(){
   standalone.lastCollector=collector.status();resourceStatus(true);standaloneStopRequested();standalonePublish();
  });}catch(error){standalone.error=String(error);}}},10000);
  return {scheduled:true,attemptId:job.attemptId,independentReplayDeferred:true};
 },
 status:function(){if(typeof U!=='function'||!activity)return {standalonePhase:standalone.phase,scheduled:Boolean(standalone.config)};
  return standaloneJava(standaloneSnapshot);},
 resources:function(){return standaloneJava(()=>resourceStatus(true));}
};
