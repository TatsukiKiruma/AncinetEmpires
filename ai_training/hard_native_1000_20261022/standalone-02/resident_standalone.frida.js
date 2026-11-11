// 仅在已核验 APK 的新进程使用；宿主持续驻留至线程结束和生命周期收尾完成。
(function () {
 'use strict';
 // 手机本地日志已经直接落盘，避免向启动器输出逐动作副本。
 function send(_) {}
 let wakeLock=null;
 const state = {phase:'bootstrap',attached:0,contaminated:false,hasRun:false,owner:null,job:null,
  row:null,workerThread:null,workerFinished:false,workerResult:null,fatal:null,cleanup:'pending',
  inCall:false,pendingCallbacks:0,pageLoadPending:false,restartRequired:false,resetEpoch:0,
  allowReset:false,allowSelection:false,lease:null,auditWriter:null,auditFile:null,artifactDir:null,committedActions:0,bootstrapEntry:null};
 const callbacks = new Map();
 let U, Thread, System, Hard, Selection, Ui, Guard, activity, activityId, saved, engine;
 function tid() { return String(Thread.currentThread().getId()); }
 function identity(value) { return value === null ? null : String(System.identityHashCode(value)); }
 function field(clazz, name) { const f=clazz.getDeclaredField(name);f.setAccessible(true);return f; }
 function instanceField(value,name) {
  let cls=value.getClass();
  while(cls!==null){try{return field(cls,name).get(value);}catch(error){cls=cls.getSuperclass();}}
  throw new Error('缺少字段：'+name);
 }
 function selectionField(name) { return field(Selection.class,name); }
 function hardField(name) { return field(Hard.class,name); }
 function emit(kind, extra) {
  const event={kind:kind,hostAssociated:false,deviceNanos:System?String(System.nanoTime()):null,
   parentId:state.job?state.job.parentId:null,attemptId:state.job?state.job.attemptId:null,
   actionIndex:state.row?state.row.actionIndex:null,resetEpoch:state.resetEpoch,...extra};
  if(state.auditWriter){
   const line=JSON.stringify(event)+'\n';
   state.auditWriter.write(line,0,line.length);state.auditWriter.flush();state.auditFile.getFD().sync();
  }
  send(event);
 }
 function fail(reason, restart) {
  if(restart) state.restartRequired=true;
  if(!state.fatal){
   state.fatal=String(reason);
   try{emit('fatal',{reason:state.fatal,restartRequired:state.restartRequired});}
   catch(error){state.restartRequired=true;send({kind:'audit_write_error',reason:state.fatal,error:String(error)});}
  }
 }
 function reject(reason, restart) { fail(reason,restart);throw U('java.lang.IllegalStateException').$new(String(reason)); }
 function owner() {
  if(state.owner===null || tid()!==state.owner) reject('非采集线程尝试使用独占困难策略',true);
 }
 function decision() { owner();if(!state.row)reject('困难调用缺少父局/动作begin标记',true);return state.row; }
 function values(array) { const out=[],ArrayType=U('java.lang.reflect.Array');for(let i=0;i<ArrayType.getLength(array);i++)out.push(Boolean(ArrayType.getBoolean(array,i)));return out; }
 function currentSlots() { return selectionField('hardSlots').get(null); }
 function verifyBinding(requireHard) {
  owner();
  if(identity(Ui.currentActivity())!==activityId || activity.isFinishing() || activity.isDestroyed())
   reject('Activity身份或生命周期发生变化',true);
  if(!engine || identity(selectionField('boundState').get(null))!==state.boundId ||
   JSON.stringify(values(currentSlots()))!==JSON.stringify(state.expectedSlots) ||
   selectionField('pending').getBoolean(null)) reject('困难槽位或独占绑定发生变化',true);
  if(requireHard!==false&&!Selection.isHard(engine))reject('独立引擎当前玩家没有通过困难槽位核验',true);
 }
 function typedCall(clazz) {
  const choices=clazz.call.overloads.filter(o=>o.argumentTypes.length===0&&o.returnType.className==='c.a.b.a.b');
  if(choices.length!==1)throw new Error('动作call签名不唯一：'+clazz.$className);
  return choices[0];
 }
 function installHooks() {
  U=name=>Java.use(name);Thread=U('java.lang.Thread');System=U('java.lang.System');
  Hard=U('aer.extension.ResourcePackHardAi');Selection=U('aer.extension.AiSelection');Ui=U('aer.extension.ResourcePackUi');
  if(Ui.currentActivity()!==null || hardField('view').get(null)!==null ||
   identity(selectionField('boundState').get(null))!==null || values(currentSlots()).some(Boolean) ||
   selectionField('pending').getBoolean(null))throw new Error('无法证明是首次Activity绑定前的干净进程');

  const reset=Hard.reset.overload();
  reset.implementation=function(){
   if(!state.allowReset){emit('unexpected_lifecycle',{operation:'reset'});reject('未授权的困难桥reset',true);}
   const result=reset.call(this);state.resetEpoch++;emit('bridge_reset',{});return result;
  };
  const attach=Ui.attach.overload('android.app.Activity');
  attach.implementation=function(value){
   if(state.attached!==0){emit('unexpected_lifecycle',{operation:'activity_attach'});reject('Activity重新绑定，当前父局停止',true);}
   state.allowReset=true;
   try { const result=attach.call(this,value);activity=Java.retain(value);activityId=identity(value);
    const pm=activity.getSystemService('power');
    wakeLock=Java.retain(Java.cast(pm,U('android.os.PowerManager')).newWakeLock(1,'aeii:hard-standalone'));
    wakeLock.setReferenceCounted(false);wakeLock.acquire();
    activity.getWindow().addFlags(128);
    state.attached++;state.phase='ready';emit('activity_attached',{activityId:activityId});return result;
   } finally {state.allowReset=false;}
  };
  for(const name of ['setSlot','arm','bindIfArmed']){
   const method=name==='setSlot'?Selection[name].overload('int','int'):
    name==='arm'?Selection[name].overload():Selection[name].overload('c.a.b.a.a');
   method.implementation=function(...args){
    if(!state.allowSelection){emit('unexpected_selection',{operation:name});reject('界面或外部线程修改困难选择状态',true);}
    return method.call(this,...args);
   };
  }
  const B=U('c.a.b.c.j.b'), Ordinary=U('c.a.b.c.j.a'), call=typedCall(B), ordinary=typedCall(Ordinary);
  ordinary.implementation=function(){emit('ordinary_ai',{thread:String(Thread.currentThread().getName())});reject('普通AI调用被困难冒烟门禁阻断',true);};
  call.implementation=function(){
   const row=decision();verifyBinding();row.callCount++;row.aiClass=String(this.getClass().getName());state.inCall=true;
   try {const action=call.call(this);row.returnedId=identity(action);row.path=HardAudit.classify(row);
    emit('decision_return',{...row});
    if(row.path!=='hard_js_primary')reject('困难决策没有闭合为JS主路径：'+row.path,false);
    return action;
   } catch(error){row.error=String(error);emit('decision_error',{...row,error:String(error)});throw error;}
   finally{state.inCall=false;}
  };
  const choose=Hard.choose.overload('java.lang.Object');
  choose.implementation=function(ai){
   const row=decision();row.chooseCalls++;emit('choose_enter',{aiId:identity(ai)});
   const action=choose.call(this,ai);row.chooseId=identity(action);
   if(action===null){row.chooseNull=true;emit('hard_fallback_required',{...row});reject('困难桥返回null，禁止回退动作进入采集',state.restartRequired);}
   emit('choose_return',{actionId:row.chooseId});return action;
  };
  const Log=U('android.util.Log');
  const logException=Log.e.overload('java.lang.String','java.lang.String','java.lang.Throwable');
  logException.implementation=function(tag,message,error){
   if(String(tag)==='AER-HardAI'&&state.row){state.row.apkError=String(message);state.row.error=String(message);
    emit('apk_bridge_error',{message:String(message),stack:String(Log.getStackTraceString(error))});}
   return logException.call(this,tag,message,error);
  };
  const logMessage=Log.e.overload('java.lang.String','java.lang.String');
  logMessage.implementation=function(tag,message){
   if(String(tag)==='AER-HardAI'&&state.row){state.row.error=String(message);emit('apk_bridge_error',{message:String(message)});}
   return logMessage.call(this,tag,message);
  };
  const browser=Hard.decideInBrowser.overload('android.app.Activity','java.lang.String');
  browser.implementation=function(value,snapshot){
   const row=decision();row.browserCalls++;
   try{const snap=JSON.parse(String(snapshot));row.matchKey=snap.matchKey;row.turnNumber=snap.turnNumber;
    row.team=snap.moveMode.currentTeam;row.previousActionAccepted=snap.previousActionAccepted;
    emit('browser_enter',{matchKey:row.matchKey,turnNumber:row.turnNumber,team:row.team,
     previousActionAccepted:row.previousActionAccepted});
    const response=browser.call(this,value,snapshot);
    const parsed=response===null?null:JSON.parse(String(response));row.browserKind=parsed?parsed.kind:null;
    emit('browser_return',{response:parsed});return response;
   }catch(error){row.error=String(error);emit('browser_error',{error:String(error)});
    // 桥的超时、等待中断或未知响应都不允许继续复用这个进程。
    fail('JS桥异常：'+String(error),true);throw error;}
  };
  const create=Hard.createAction.overload('java.lang.Object','org.json.JSONObject');
  create.implementation=function(ai,json){const row=decision();row.createCalls++;
   const action=create.call(this,ai,json);row.createdId=identity(action);
   emit(action===null?'create_action_rejected':'create_action_return',{kindRequested:String(json.optString('kind')),actionId:row.createdId});
   return action;
  };
  const fallback=B.e.overload();
  fallback.implementation=function(){const row=decision();row.fallback=true;emit('hard_java_fallback_started',{...row});reject('Java困难回退主体被阻断',false);};
  const runnable=U('aer.extension.ResourcePackHardAi$2');
  emit('runtime_constructor_signatures',{className:String(runnable.class.getName()),
   constructors:Array.from(runnable.class.getDeclaredConstructors()).map(value=>({signature:String(value),
    parameters:Array.from(value.getParameterTypes()).map(type=>String(type.getName())),
    genericParameters:Array.from(value.getGenericParameterTypes()).map(type=>String(type))})),
   bridgeOverloads:runnable.$init.overloads.map(value=>value.argumentTypes.map(type=>type.className))});
  // 匿名类的泛型构造元数据可能省略捕获参数；直接观察原始任务入队，不改构造和随机源。
  const post=U('android.app.Activity').runOnUiThread.overload('java.lang.Runnable');
  post.implementation=function(task){
   const object=Java.cast(task,U('java.lang.Object')),name=String(object.getClass().getName());
   if(name==='aer.extension.ResourcePackHardAi$2'){
    const row=decision(),invocation=String(instanceField(object,'val$invocation'));
    const latch=instanceField(object,'val$resultReady'),key=identity(latch);
    if(identity(this)!==activityId||!invocation.startsWith('hardAiDecide(')||callbacks.has(key))reject('JS任务入队身份或调用形式不符',true);
    state.pendingCallbacks++;callbacks.set(key,row.actionIndex);
    emit('browser_task_queued',{runnableId:identity(task),latchId:key});
   }else if(name==='aer.extension.ResourcePackHardAi$1'){
    decision();
    if(identity(this)!==activityId||state.pageLoadPending)reject('重复或未知Activity的WebView加载任务',true);
    state.pageLoadPending=true;emit('page_load_task_queued',{runnableId:identity(task)});
   }
   return post.call(this,task);
  };
  const callback=U('aer.extension.ResourcePackHardAi$2$1').onReceiveValue.overload('java.lang.String');
  callback.implementation=function(response){
   const parent=instanceField(this,'this$0'), latch=instanceField(parent,'val$resultReady'), key=identity(latch);
   if(!callbacks.has(key)){emit('unexpected_lifecycle',{operation:'unknown_js_callback'});fail('未知JS回调，进程不再准入',true);}
   // 先登记响应到达，再让原始countDown唤醒工作线程，避免观察器自身的计数竞争。
   if(callbacks.has(key)){emit('browser_callback',{callbackActionIndex:callbacks.get(key)});callbacks.delete(key);state.pendingCallbacks--;}
   return callback.call(this,response);
  };
  const loaded=U('aer.extension.ResourcePackHardAi$1$1').onPageFinished.overload('android.webkit.WebView','java.lang.String');
  loaded.implementation=function(view,url){
   if(!state.pageLoadPending || String(url)!=='file:///android_asset/hard-ai/runtime.html'){
    emit('unexpected_lifecycle',{operation:'page_finished',url:String(url)});fail('未知或重复页面完成回调',true);
   }
   state.pageLoadPending=false;emit('page_finished',{url:String(url)});
   return loaded.call(this,view,url);
  };
  Guard=Java.registerClass({name:'aer.collector.HardStandaloneGuardV1',methods:{
   registerThread:{returnType:'void',argumentTypes:['java.lang.Object'],implementation:function(value){
    if(state.workerThread!==null)reject('拒绝注册第二个采集线程',true);
    state.workerThread=Java.retain(Java.cast(value,Thread));emit('worker_registered',{threadId:String(state.workerThread.getId())});}},
   workerStarted:{returnType:'void',argumentTypes:[],implementation:function(){
    if(state.owner!==null||state.workerThread===null||String(state.workerThread.getId())!==tid())reject('采集线程注册不一致',true);
    state.owner=tid();emit('worker_started',{thread:String(Thread.currentThread().getName())});}},
   bindEngine:{returnType:'void',argumentTypes:['java.lang.Object','[I'],implementation:function(value,active){
    owner();if(engine)reject('一局入口拒绝第二个引擎',true);engine=Java.retain(Java.cast(value,U('c.a.b.a.a')));
    const q=instanceField(engine,'e'),players=instanceField(q,'f');state.boundId=identity(players);
    selectionField('boundState').set(null,players);
    selectionField('hardSlots').set(null,Java.array('boolean',[false,false,false,false,false,false]));
    const slots=[];for(let i=0;i<active.length;i++)slots.push(Number(active[i]));
    state.allowSelection=true;
    try{for(let i=0;i<6;i++)Selection.setSlot(i,slots.includes(i)?3:0);}finally{state.allowSelection=false;}
    state.expectedSlots=values(currentSlots());emit('engine_bound',{boundId:state.boundId,activeSlots:slots,
     requestedPlayerType:3,nativeConfigPlayerType:2});}},
   pauseMillis:{returnType:'int',argumentTypes:[],implementation:function(){owner();return shouldPause(resourceStatus())?1000:0;}},
   shouldStop:{returnType:'boolean',argumentTypes:[],implementation:function(){owner();return state.fatal!==null||standaloneStopRequested();}},
   begin:{returnType:'void',argumentTypes:['int'],implementation:function(index){
    if(state.fatal)reject('采集已停止：'+state.fatal,state.restartRequired);
    verifyBinding();if(state.row)reject('上一个动作尚未提交',true);
    state.row={actionIndex:Number(index),callCount:0,chooseCalls:0,browserCalls:0,createCalls:0,
     createdId:null,chooseId:null,returnedId:null,error:null};emit('decision_begin',{});}},
   accept:{returnType:'void',argumentTypes:['java.lang.Object'],implementation:function(action){
    const row=decision();if(state.fatal || row.path!=='hard_js_primary' || row.returnedId!==identity(action) ||
     state.pendingCallbacks!==0 || state.pageLoadPending)reject('JS动作准入失败，禁止提交引擎',true);
    verifyBinding();emit('decision_accepted',{path:row.path,actionId:row.returnedId});}},
   committed:{returnType:'void',argumentTypes:['int'],implementation:function(index){
    const row=decision();if(row.actionIndex!==Number(index))reject('提交动作索引不一致',true);
    verifyBinding(false);
    emit('action_committed',{path:row.path});state.committedActions=Number(index)+1;state.row=null;}},
   finished:{returnType:'void',argumentTypes:['java.lang.String'],implementation:function(result){owner();state.workerResult=JSON.parse(String(result));emit('worker_result',{result:state.workerResult});}},
   failed:{returnType:'void',argumentTypes:['java.lang.String'],implementation:function(error){owner();fail('原生worker失败：'+String(error),false);}},
   workerFinished:{returnType:'void',argumentTypes:[],implementation:function(){owner();state.workerFinished=true;emit('worker_finished',{});}}
  }});
  emit('hooks_ready',{freshProcessObserved:true,frameworkEntry:state.bootstrapEntry});
 }
 function liveStatus() {
  let alive=state.hasRun?false:null;if(state.workerThread)alive=Boolean(state.workerThread.isAlive());
  let backendReady=false;
  if(U&&state.attached===1){const Gdx=U('com.badlogic.gdx.Gdx');backendReady=Gdx.files.value!==null&&Gdx.app.value!==null;}
  return {phase:state.phase,ready:state.phase==='ready'&&backendReady&&!state.contaminated&&!state.fatal,backendReady:backendReady,
   attached:state.attached,frameworkEntry:state.bootstrapEntry,hasRun:state.hasRun,workerAlive:alive,workerFinished:state.workerFinished,
   workerResult:state.workerResult,committedActions:state.committedActions,fatal:state.fatal,cleanup:state.cleanup,inCall:state.inCall,
   pendingCallbacks:state.pendingCallbacks,pageLoadPending:state.pageLoadPending,restartRequired:state.restartRequired};
 }
 function sha256(file) {
  const digest=U('java.security.MessageDigest').getInstance('SHA-256'),input=U('java.io.FileInputStream').$new(file);
  const bytes=Java.array('byte',new Array(65536).fill(0));
  try{let size;while((size=input.read(bytes))!==-1)digest.update(bytes,0,size);}finally{input.close();}
  const result=digest.digest();let text='';for(let i=0;i<result.length;i++)text+=(Number(result[i])&255).toString(16).padStart(2,'0');return text;
 }
 function assertNoExistingAiFrames() {
  const it=Thread.getAllStackTraces().keySet().iterator();
  while(it.hasNext()){
   const thread=Java.cast(it.next(),Thread),frames=thread.getStackTrace();
   if(String(thread.getName()).startsWith('aeii-'))throw new Error('发现既有原生采集线程');
   for(let i=0;i<frames.length;i++){
    const cls=String(frames[i].getClassName());
    if(cls==='c.a.b.c.j.b'||cls.startsWith('aer.extension.ResourcePackHardAi'))throw new Error('发现已有困难决策栈');
   }
  }
 }
 rpc.exports={
  status:function(){return liveStatus();},
  cancel:function(){fail('宿主要求停止；等待在途原生调用结束',false);return liveStatus();},
  start:function(config,nativeSource,workerSource){return new Promise((resolve,rejectPromise)=>Java.perform(function(){
   try{
    if(!liveStatus().ready||state.hasRun)throw new Error('尚未观察首次Activity绑定，或此进程已尝试过采集');
    if(config.job.requestedPlayerType!==3||config.job.jsRngMode!=='original_webview_rng'||
     config.job.maxActions<1||config.job.maxActions>20000||config.jobs||config.job.batch)throw new Error('不支持的单局契约');
    if(config.package!==HARD_EXPECTED.package||String(activity.getPackageName())!==HARD_EXPECTED.package)throw new Error('应用包名不符');
    assertNoExistingAiFrames();
    if(hardField('view').get(null)!==null||selectionField('boundState').get(null)!==null||
     values(currentSlots()).some(Boolean)||selectionField('pending').getBoolean(null))throw new Error('独占前静态状态不再干净');
    const info=activity.getPackageManager().getApplicationInfo(HARD_EXPECTED.package,0),source=U('java.io.File').$new(info.sourceDir.value);
    if(sha256(source)!==HARD_EXPECTED.sha256)throw new Error('进程内APK摘要核验失败');
    state.job=config.job;state.hasRun=true;
    const files=activity.getFilesDir(),leaseFile=U('java.io.RandomAccessFile').$new(U('java.io.File').$new(files,'.aeii-hard-collect.lock'),'rw');
    const lock=leaseFile.getChannel().tryLock();if(lock===null)throw new Error('独占文件锁已被占用');
    state.lease={file:Java.retain(leaseFile),lock:Java.retain(lock)};
    saved={bound:selectionField('boundState').get(null),slots:Java.retain(selectionField('hardSlots').get(null)),pending:selectionField('pending').getBoolean(null)};
    const parent=U('java.io.File').$new(files,'.aeii-hard-collect');
    if(!parent.exists()&&!parent.mkdir())throw new Error('无法创建独立采集根目录');
    const dir=U('java.io.File').$new(parent,config.job.attemptId);if(!dir.mkdir())throw new Error('设备尝试目录已存在或无法创建');
    state.artifactDir=Java.retain(dir);
    const evidence=U('java.io.File').$new(dir,'decision-evidence.jsonl.gz');
    if(!evidence.createNewFile())throw new Error('证据文件已存在');
    state.auditFile=Java.retain(U('java.io.FileOutputStream').$new(evidence));
    state.auditWriter=Java.retain(U('java.io.BufferedWriter').$new(U('java.io.OutputStreamWriter').$new(U('java.util.zip.GZIPOutputStream').$new(state.auditFile),'UTF-8')));
    emit('lease_acquired',{freshProcessObserved:true,savedBoundId:identity(saved.bound),savedHardSlots:values(saved.slots),savedPending:saved.pending,
     apkSha256:HARD_EXPECTED.sha256,requestedPlayerType:3,nativeConfigPlayerType:2,jsRngMode:'original_webview_rng',jsSeedControlled:false});
    state.allowReset=true;try{Hard.reset();}finally{state.allowReset=false;}
    const Context=U('org.mozilla.javascript.Context'),context=Context.enter();
    try{
     context.setOptimizationLevel(-1);context.setLanguageVersion(200);context.setApplicationClassLoader(U('c.a.b.a.a').class.getClassLoader());
     const scope=context.initStandardObjects(),guard=Guard.$new();
     const args={jobJson:JSON.stringify(config.job),outputDirectory:String(dir.getAbsolutePath()),baseConfigZip:config.baseConfigZip,baseConfigName:config.baseConfigName};
     for(const [name,value] of Object.entries(args))scope.put(name,scope,Context.javaToJS(U('java.lang.String').$new(value),scope));
     scope.put('guard',scope,Context.javaToJS(guard,scope));
     context.evaluateString(scope,String(nativeSource)+'\n'+String(workerSource),'hard-smoke',1,null);
     if(state.workerThread===null)throw new Error('Rhino没有注册采集线程');
     state.phase='running';emit('worker_launched',{threadId:String(state.workerThread.getId())});
    }finally{Context.exit();}
    resolve(liveStatus());
   }catch(error){
    if(state.owner===null&&(!state.workerThread||String(state.workerThread.getState())==='NEW'))state.workerFinished=true;
    fail('启动门禁拒绝：'+String(error),false);rejectPromise(new Error(String(error)));}
  }));},
  finish:function(){return new Promise(resolve=>Java.perform(function(){
   const snapshot=liveStatus();
   if(!HardAudit.canCleanup(snapshot)||!state.workerFinished||!state.lease){state.cleanup='restart_required';state.restartRequired=true;emit('cleanup_refused',snapshot);resolve(liveStatus());return;}
   state.phase='draining';let allowed=true,ended=false;
   const timeout=setTimeout(function(){if(!ended){allowed=false;state.cleanup='restart_required';fail('UI排空或destroy超过10秒',true);resolve(liveStatus());}},10000);
   const Drain=Java.registerClass({name:'aer.collector.HardStandaloneDrainV1',implements:[U('java.lang.Runnable')],methods:{run:function(){
    if(!allowed)return;
    try{
     if(identity(Ui.currentActivity())!==activityId)throw new Error('排空时Activity已变化');
     if(engine&&(identity(selectionField('boundState').get(null))!==state.boundId||
      JSON.stringify(values(currentSlots()))!==JSON.stringify(state.expectedSlots)||selectionField('pending').getBoolean(null)))
      throw new Error('收尾时独占绑定被外部修改，拒绝覆盖恢复');
     const view=hardField('view').get(null);if(view!==null)Java.cast(view,U('android.webkit.WebView')).destroy();
     state.allowReset=true;try{Hard.reset();}finally{state.allowReset=false;}
     selectionField('boundState').set(null,saved.bound);selectionField('hardSlots').set(null,saved.slots);selectionField('pending').setBoolean(null,saved.pending);
     if(identity(selectionField('boundState').get(null))!==identity(saved.bound)||
      identity(selectionField('hardSlots').get(null))!==identity(saved.slots)||selectionField('pending').getBoolean(null)!==saved.pending)throw new Error('全局选择状态恢复核验失败');
     emit('lease_restored',{boundId:identity(saved.bound),hardSlots:values(saved.slots),pending:saved.pending});
     state.lease.lock.release();state.lease.file.close();state.lease=null;
     state.cleanup='safe';state.phase='cleaned';emit('cleanup_completed',{uiThread:true});
     state.auditWriter.close();state.auditWriter=null;state.auditFile=null;
    }catch(error){state.cleanup='restart_required';fail('生命周期收尾失败：'+String(error),true);}
    finally{ended=true;clearTimeout(timeout);resolve(liveStatus());}
   }}});
   activity.runOnUiThread(Drain.$new());
  }));},
  artifacts:function(){return new Promise((resolve,rejectPromise)=>Java.perform(function(){try{
   if(liveStatus().workerAlive!==false||!state.artifactDir)throw new Error('原生线程未停止，不允许导出');
   const allowed=['config.bin','initial.bin','final.bin','actions.jsonl.gz','states.bin.gz','result.json','worker-error.json','decision-evidence.jsonl'];
   const files=state.artifactDir.listFiles(),out=[];
   for(let i=0;i<files.length;i++){const name=String(files[i].getName());if(!allowed.includes(name)||!files[i].isFile())throw new Error('未知产物');
    out.push({name:name,bytes:Number(files[i].length()),sha256:sha256(files[i])});}
   resolve(out);
  }catch(error){rejectPromise(new Error(String(error)));}}));},
  chunk:function(name,offset,size){return new Promise((resolve,rejectPromise)=>Java.perform(function(){try{
   if(liveStatus().workerAlive!==false||!state.artifactDir||!['config.bin','initial.bin','final.bin','actions.jsonl.gz','states.bin.gz','result.json','worker-error.json','decision-evidence.jsonl'].includes(name)||
    !Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(size)||size<1||size>131072)throw new Error('导出参数不合法');
   const file=U('java.io.RandomAccessFile').$new(U('java.io.File').$new(state.artifactDir,name),'r');
   try{if(offset>Number(file.length()))throw new Error('导出偏移越界');file.seek(offset);
    const count=Math.min(size,Number(file.length())-offset),bytes=Java.array('byte',new Array(count).fill(0));file.readFully(bytes);
    resolve(String(U('android.util.Base64').encodeToString(bytes,2)));}finally{file.close();}
  }catch(error){rejectPromise(new Error(String(error)));}}));}
 };
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

 // 在悬挂的新进程安装框架入口；在首个Activity构造前取得类加载器和私有缓存。
 Java.performNow(function(){
  const Application=Java.use('android.app.Application'),attach=Application.attach.overload('android.content.Context');
  const Instrumentation=Java.use('android.app.Instrumentation');
  const newActivity=Instrumentation.newActivity.overload('java.lang.ClassLoader','java.lang.String','android.content.Intent');
  let installed=false,newActivityCount=0;
  function prepare(loader,context,entry){
   emit('framework_entry',{entry:entry});
   Java.classFactory.loader=loader;
   Java.classFactory.cacheDir=String(context.getCacheDir().getCanonicalPath());
   Java.classFactory.codeCacheDir=String(context.getCodeCacheDir().getCanonicalPath());
   installed=true;state.bootstrapEntry=entry;installHooks();
  }
  function bootstrapFailed(error){
   state.contaminated=true;state.fatal=String(error);send({kind:'bootstrap_error',error:String(error)});throw error;
  }
  attach.implementation=function(context){
   try{
    if(installed)throw new Error('重复Application.attach');
    prepare(context.getClassLoader(),context,'Application.attach');return attach.call(this,context);
   }catch(error){bootstrapFailed(error);}
  };
  newActivity.implementation=function(loader,name,intent){
   try{
    if(newActivityCount++!==0||String(name)!=='net.toyknight.aeii.android.AndroidLauncher')throw new Error('首次Activity入口身份或次数不符');
    emit('first_new_activity',{className:String(name),hooksAlreadyInstalled:installed});
    if(!installed){
     const app=Java.use('android.app.ActivityThread').currentApplication();
     if(app===null)throw new Error('首次Activity构造前应用上下文不存在');
     prepare(loader,app,'Instrumentation.newActivity');
    }
    return newActivity.call(this,loader,name,intent);
   }catch(error){bootstrapFailed(error);}
  };
  // 同时防止应用预编译把困难桥及UI绑定调用内联，确保所有声明的观察钩子实际分派。
  Java.deoptimizeEverything();
  send({kind:'all_java_deoptimized',beforeResume:true,scope:'本次应用虚拟机'});
  send({kind:'bootstrap_ready',freshSpawnRequired:true});
 });
})();
