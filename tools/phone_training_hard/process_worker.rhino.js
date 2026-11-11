// 独立包线程原样调用APK困难类；仅扩展多worker暂停和身份，不改AI或原生结算。
(function () {
 var job = JSON.parse(String(jobJson)), cfg = JSON.parse(String(productionConfigJson)), Native = HardNative;
 var boot = typeof bootstrapState !== 'undefined' ? bootstrapState : productionBootstrapState;
 var thread = new java.lang.Thread(new java.lang.Runnable({ run: function () {
  var directory = new java.io.File(String(outputDirectory)), game = null, creatingEngine = null, actions = null, states = null;
  var actionOutput = null, stateOutput = null, count = 0, errorText = null, result = null, pendingAction = null;
  var started = java.lang.System.nanoTime(), lastPublish = 0, lastPublishCount = -1, resourceAt = 0, resource = null, paused = false;
  var snapshotNs = 0, aiNs = 0, settleNs = 0, ioNs = 0, pauseNs = 0, initializeNs = 0;
  var paths = {hard_js_primary:0,hard_java_fallback:0}, saved = null, activity = null, application = null;
  var selection = null, bindingField = null, slotsField = null, pendingField = null, lastAccepted = null;
  var expectedSlots = [], boundPlayers = null, stopReason = null, phase = 'running', stage = 'initializing';
  var resourceKeySHA256 = null, packageName = null, cpuPauseNs = 0;
  function now() { return Number(java.lang.System.nanoTime()); }
  function put(name, value) { boot.put(String(name), new java.lang.String(String(value))); }
  function member(type, name) { var value = type.getDeclaredField(name); value.setAccessible(true); return value; }
  function stopped() { return new java.io.File(String(cfg.taskRoot),'STOP').exists() || new java.io.File(String(cfg.globalRoot),'STOP').exists(); }
  function cpuPaused() { return new java.io.File(String(cfg.globalRoot),'PAUSE-'+String(cfg.workerId)).exists(); }
  function publish(next, terminal) {
   phase = next; var elapsed = (now() - Number(started)) / 1e9;
   var value = {schema:'hard-phone-production-state-v1',standalonePhase:phase,phase:phase,stage:stage,
    parentId:job.parentId,attemptId:job.attemptId,package:packageName,workerId:cfg.workerId,globalRoot:cfg.globalRoot,
    sourceApkSha256:cfg.sourceApkSha256,installedApkSha256:cfg.installedApkSha256,committedActions:count,naturalEnd:result ? result.naturalEnd : false,
    durationSeconds:elapsed,updatedMs:Number(java.lang.System.currentTimeMillis()),resource:resource,
    pathCounts:paths,error:errorText,stopReason:stopReason,independentReplayDeferred:true,
    populationLimit:Number(cfg.populationLimit),planSha256:cfg.planSha256,patchHTMLSha256:cfg.patchHTMLSha,resourceKeySHA256:resourceKeySHA256,
    workerCleanupComplete:Boolean(terminal),safeToStop:Boolean(terminal)};
   var temporary = new java.io.File(directory, 'STATE.json.tmp'), target = new java.io.File(directory, 'STATE.json');
   var output = new java.io.FileOutputStream(temporary);
   try { output.write(new java.lang.String(JSON.stringify(value)+'\n').getBytes('UTF-8')); if (terminal) output.getFD().sync(); }
   finally { output.close(); }
   if (!temporary.renameTo(target)) throw new Error('原子更新STATE失败，保留原件和临时文件');
   put('phase',phase); put('committedActions',count); put('naturalEnd',value.naturalEnd); put('error',errorText || '');
   lastPublish = now(); lastPublishCount = count;
  }
  function progress(next, force) { if (force || now()-lastPublish >= 2000000000 || count-lastPublishCount >= 100) publish(next,false); }
  function resources() {
   var time = now(); if (resource && time-resourceAt < 10000000000) return resource;
   var intent = application.registerReceiver(null,new Packages.android.content.IntentFilter('android.intent.action.BATTERY_CHANGED'));
   if (intent === null) throw new Error('无法取得手机电池资源读数');
   var level = Number(intent.getIntExtra('level',-1)), scale = Number(intent.getIntExtra('scale',-1));
   var temperature = Number(intent.getIntExtra('temperature',-1))/10;
   var free = Number(new Packages.android.os.StatFs(directory.getAbsolutePath()).getAvailableBytes());
   if (scale <= 0 || level < 0 || level > scale || temperature <= 0 || temperature >= 100 || free < 0) throw new Error('手机资源读数无效');
   var battery = level*100/scale;
   if (paused) paused = !(temperature <= 42 && battery >= 25 && free >= 2.25*1073741824);
   else paused = temperature >= 45 || battery < 20 || free < 2*1073741824;
   resource = {observedMs:Number(java.lang.System.currentTimeMillis()),batteryPercent:battery,temperatureC:temperature,freeBytes:free,shouldPause:paused};
   resourceAt = time; return resource;
  }
  function waitResources() {
   resources(); var cpu = cpuPaused(); if (!paused && !cpu) return true;
   var segment = now(), previous = null;
   function account() { if (previous === 'cpu_pause') cpuPauseNs += now()-segment; else if (previous === 'resource_pause') pauseNs += now()-segment; segment=now(); }
   // CPU让行和资源守护都在动作边界等待，等待期间持续响应全局或本worker停止。
   try {
    while (paused || cpu) {
     if (stopped()) return false;
     var next = cpu ? 'cpu_pause' : 'resource_pause', changed = next !== previous;
     if (changed) { account(); previous=next; stage=next; }
     progress('waiting_resources',changed); java.lang.Thread.sleep(1000); resources(); cpu=cpuPaused();
    }
   } finally { account(); }
   if (stopped()) return false;
   stage = 'collecting'; progress('running',true); return true;
  }
  function verifyBinding() {
   var current = Packages.aer.extension.ResourcePackUi.currentActivity();
   if (current === null || !activity.equals(current) || current.isFinishing() || current.isDestroyed()) throw new Error('困难调用期间Activity身份或生命周期变化');
   var bound = bindingField.get(null), slots = slotsField.get(null);
   if (bound === null || !boundPlayers.equals(bound) || pendingField.getBoolean(null) || slots.length !== expectedSlots.length) throw new Error('困难静态状态绑定变化');
   var limits = Native.get(Native.get(game.state,'f'),'m');
   for (var i=0;i<slots.length;i++) {
    if (Boolean(slots[i]) !== expectedSlots[i]) throw new Error('困难玩家槽位变化');
    if (expectedSlots[i] && Number(limits[i]) !== Number(cfg.populationLimit)) throw new Error('原生人口上限变化，HTML人口补丁已过期');
   }
   if (!Packages.aer.extension.AiSelection.isHard(game.engine)) throw new Error('当前玩家未通过困难槽位核验');
  }
  function closeStream(writer, output) {
   if (writer === null || output === null) return;
   // gzip尾部和缓冲区先完成，再在FD仍开放时同步；每个数据流局末只同步一次。
   try { writer.flush(); output.stream.finish(); output.stream.flush(); output.file.getFD().sync(); }
   finally { try { writer.close(); } finally { output.file.close(); } }
  }
  function fileDigest(file) {
   var digest = java.security.MessageDigest.getInstance('SHA-256'), input = new java.io.FileInputStream(file);
   var bytes = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE,65536), size;
   try { while ((size=input.read(bytes)) !== -1) digest.update(bytes,0,size); } finally { input.close(); }
   var raw = digest.digest(), out = ''; for (var i=0;i<raw.length;i++) out += ('0'+((raw[i]&255).toString(16))).slice(-2); return out;
  }
  function initializeResourceKey(loader) {
   // 原生i.o()先读data.bin首个byte[]再设置资源密钥；锁屏时GL尚未走到该阶段，不能使用默认密钥加载地图。
   // 这里只复用原APK的资源初始化，规则、定义和SD引擎仍由Native.create按原始config构建。
   var input = com.badlogic.gdx.Gdx.files.internal('data.bin').read(), key;
   try { key = Packages.c.a.b.a.r.b['a(java.io.InputStream,java.lang.Class)'](input,java.lang.Class.forName('[B',true,loader)); }
   finally { input.close(); }
   if (key === null || java.lang.reflect.Array.getLength(key) !== 8) throw new Error('原APK资源密钥数组长度不符');
   function digest(bytes) {
    var hash = java.security.MessageDigest.getInstance('SHA-256'); hash.update(bytes);
    var raw = hash.digest(), out = ''; for (var i=0;i<raw.length;i++) out += ('0'+((raw[i]&255).toString(16))).slice(-2); return out;
   }
   var expected = '9d136de4def318227937e61ad331940f07a20466115cd7cc21409b899bbbbaaa';
   if (digest(key) !== expected) throw new Error('原APK data.bin资源密钥SHA不符');
   Packages.c.a.b.c.a['a(byte[])'](key);
   resourceKeySHA256 = digest(Packages.c.a.b.c.a['a()']());
   if (resourceKeySHA256 !== expected) throw new Error('原生资源密钥设置后的SHA不符');
   put('resourceKeySHA256',resourceKeySHA256); put('resourceKeyInitialized',true);
  }
  put('workerStarted',true); put('workerFinished',false); put('workerThreadId',thread.getId());
  try {
   if (String(boot.get('populationPatchReady')) !== 'true') throw new Error('人口上限补丁尚未预热完成');
   if (Number(cfg.populationLimit) !== 30 || !/^[0-9a-f]{64}$/.test(String(cfg.patchHTMLSha))) throw new Error('人口补丁配置身份不完整');
   if (!cfg.job || cfg.job.parentId !== job.parentId || cfg.job.attemptId !== job.attemptId || cfg.job.map !== job.map || Number(cfg.job.seed) !== Number(job.seed)) throw new Error('完整配置与任务身份不符');
   if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(String(job.attemptId)) || Number(job.maxActions) !== 20000) throw new Error('生产任务身份或20000动作上限不符');
   if (!/^\/data\/local\/tmp\/aeii-[A-Za-z0-9_-]+$/.test(String(cfg.taskRoot))) throw new Error('STOP目录不属于本次明确任务');
   if (!/^\/data\/local\/tmp\/aeii-[A-Za-z0-9_-]+$/.test(String(cfg.globalRoot)) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(String(cfg.workerId))) throw new Error('全局暂停目录或worker身份不完整');
   if (!/^[0-9a-f]{64}$/.test(String(cfg.sourceApkSha256)) || !/^[0-9a-f]{64}$/.test(String(cfg.installedApkSha256))) throw new Error('源APK或副本APK摘要身份不完整');
   activity = Packages.aer.extension.ResourcePackUi.currentActivity();
   if (activity === null || activity.isFinishing() || activity.isDestroyed()) throw new Error('生产线程缺少有效Activity');
   application = activity.getApplicationContext(); packageName = String(application.getPackageName());
   var canonical = String(directory.getCanonicalPath()), filesRoot = String(application.getFilesDir().getCanonicalPath());
   if (canonical.indexOf(filesRoot+'/') !== 0 || String(directory.getName()) !== String(job.attemptId) || canonical !== String(new java.io.File(String(cfg.outputDirectory)).getCanonicalPath())) throw new Error('输出目录不属于应用内当前尝试');
   if (!directory.exists() && !directory.mkdirs()) throw new Error('无法新建当前生产尝试目录');
   if (!directory.isDirectory()) throw new Error('生产尝试路径不是目录');
   var loader = activity.getClass().getClassLoader();
   selection = java.lang.Class.forName('aer.extension.AiSelection',true,loader);
   bindingField = member(selection,'boundState'); slotsField = member(selection,'hardSlots'); pendingField = member(selection,'pending');
   lastAccepted = member(java.lang.Class.forName('aer.extension.ResourcePackHardAi',true,loader),'lastAccepted');
   var bind = {bindEngine:function(engine,active) {
    creatingEngine = engine;
    var players = Native.get(Native.get(engine,'e'),'f'), limits = Native.get(players,'m');
    var slots = java.lang.reflect.Array.newInstance(java.lang.Boolean.TYPE,6);
    expectedSlots = [false,false,false,false,false,false];
    for (var i=0;i<active.length;i++) { var team = Number(active[i]); if (team<0 || team>=6 || Number(limits[team]) !== 30) throw new Error('原生配置人口上限不是30'); expectedSlots[team]=true; slots[team]=true; }
    saved = {bound:bindingField.get(null),slots:slotsField.get(null),pending:pendingField.getBoolean(null)};
    boundPlayers = players; bindingField.set(null,players); slotsField.set(null,slots); pendingField.setBoolean(null,false);
   }};
   initializeResourceKey(loader);
   game = Native.create(job,String(baseConfigZip),String(baseConfigName),directory,bind);
   verifyBinding(); Native.writeBytes(directory,'initial.bin',game.snapshot());
   actionOutput = Native.output(directory,'actions.jsonl.gz');
   actions = new java.io.BufferedWriter(new java.io.OutputStreamWriter(actionOutput.stream,'UTF-8'),65536);
   stateOutput = Native.output(directory,'states.bin.gz'); states = new java.io.DataOutputStream(stateOutput.stream);
   initializeNs = now()-Number(started); stage = 'collecting'; progress('running',true);
   while (Number(Native.get(Native.get(game.state,'f'),'h')) < 0 && count < 20000) {
    if (stopped() || !waitResources()) { stopReason='user_stop'; break; }
    verifyBinding(); var tick = now(), before = game.snapshot(), snapTime = now()-tick; snapshotNs += snapTime;
    tick = now(); var ai = new Packages.c.a.b.c.j.b(game.engine), aiSeed = Number(job.seed)+count*104729;
    Native.get(ai,'e').setSeed(aiSeed);
    // 只调用原始b.call一次；lastAccepted只读，不改变previousActionAccepted和原生回退流程。
    var action = ai.call(), accepted = Boolean(lastAccepted.getBoolean(null)), aiTime = now()-tick; aiNs += aiTime;
    verifyBinding(); if (action === null) throw new Error('原始困难b.call返回空动作');
    var path = accepted ? 'hard_js_primary' : 'hard_java_fallback', raw = {};
    for (var j=0;j<9;j++) { var name=String.fromCharCode(97+j); raw[name]=Number(Native.get(action,name)); }
    raw.j = String(Native.get(action,'j'));
    pendingAction = {index:count,fields:raw,path:path};
    tick = now(); Native.get(game.engine,'d')['a(c.a.b.a.b)'](action); game.engine['a()'](); var settleTime=now()-tick; settleNs += settleTime;
    tick = now(); states.writeInt(before.length); states.write(before);
    actions.write(JSON.stringify({parentId:job.parentId,attemptId:job.attemptId,index:count,ai_seed:aiSeed,fields:raw,
     path:path,aiClass:'c.a.b.c.j.b',settlement:'native_dispatch_returned',snapshotNs:snapTime,aiNs:aiTime,settlementNs:settleTime})+'\n');
    ioNs += now()-tick; paths[path]++; count++; pendingAction=null; progress('running',false);
   }
   stage='finalizing'; Native.writeBytes(directory,'final.bin',game.snapshot());
   var players=Native.get(game.state,'f'), winner=Number(Native.get(players,'h')), natural=winner>=0;
   result={parentId:job.parentId,attemptId:job.attemptId,package:packageName,workerId:cfg.workerId,globalRoot:cfg.globalRoot,
    sourceApkSha256:cfg.sourceApkSha256,installedApkSha256:cfg.installedApkSha256,map:job.map,seed:job.seed,actions:count,
    turn:Number(Native.get(players,'f')),winnerAlliance:winner>=0?winner:null,winnerMask:winner,naturalEnd:natural,
    truncationReason:natural?null:(stopReason||'max_actions'),requestedPlayerType:3,nativeConfigPlayerType:2,
    strategyFamily:'apk_hard_original_mixed',originalBCall:true,pathCounts:paths,pathCountsMeasured:true,
    pathMeasurement:'lastAccepted_after_original_b_call_with_unchanged_activity_and_binding',populationLimit:30,
    runtimeVariant:'native-population-limit-html-fix-v1',patchHTMLSha256:cfg.patchHTMLSha,planSha256:cfg.planSha256,resourceKeySHA256:resourceKeySHA256,
    jsRngMode:'original_webview_rng',jsSeedControlled:false,rngModified:false,
    timingsSeconds:{initialization:initializeNs/1e9,snapshot:snapshotNs/1e9,ai:aiNs/1e9,settlement:settleNs/1e9,io:ioNs/1e9,resourcePause:pauseNs/1e9,cpuPause:cpuPauseNs/1e9},
    statesFormat:'int32be-length/native-snapshot',compression:'gzip-level-1',independentReplayDeferred:true,
    nativeReplayVerified:false,projectStrictVerified:false,policyEligible:false,valueEligible:false};
  } catch (error) { errorText=String(error)+'\n'+(error.stack||''); }
  finally {
   try { closeStream(states,stateOutput); states=null; } catch(error) { errorText=(errorText||'')+'\n状态流关闭失败：'+error; }
   try { closeStream(actions,actionOutput); actions=null; } catch(error) { errorText=(errorText||'')+'\n动作流关闭失败：'+error; }
   try { if (game !== null) game.engine.e(); else if (creatingEngine !== null) creatingEngine.e(); } catch(error) { errorText=(errorText||'')+'\n引擎清理失败：'+error; }
   try { if (saved !== null) { bindingField.set(null,saved.bound); slotsField.set(null,saved.slots); pendingField.setBoolean(null,saved.pending); } }
   catch(error) { errorText=(errorText||'')+'\n静态绑定恢复失败：'+error; }
   try { Packages.c.a.b.a.w.a.c(); } catch(error) { errorText=(errorText||'')+'\nRhino清理失败：'+error; }
   try {
    if (errorText !== null || result === null) throw new Error(errorText||'没有完整生产结果');
    result.elapsedSeconds=(now()-Number(started))/1e9;
    result.timingBoundary='worker_start_through_stream_and_engine_cleanup_before_sha_manifest';
    Native.text(directory,'result.json',result);
    var names=['config.bin','initial.bin','final.bin','actions.jsonl.gz','states.bin.gz','result.json'], entries=[];
    for (var k=0;k<names.length;k++) { var file=new java.io.File(directory,names[k]); entries.push({name:names[k],bytes:Number(file.length()),sha256:fileDigest(file)}); }
    Native.text(directory,'artifact-manifest.json',{schema:'phone-hard-production-artifacts-v1',parentId:job.parentId,attemptId:job.attemptId,
     package:packageName,workerId:cfg.workerId,globalRoot:cfg.globalRoot,sourceApkSha256:cfg.sourceApkSha256,installedApkSha256:cfg.installedApkSha256,
     planSha256:cfg.planSha256,patchHTMLSha256:cfg.patchHTMLSha,populationLimit:30,resourceKeySHA256:resourceKeySHA256,files:entries,naturalEnd:result.naturalEnd,
     pathCounts:paths,independentReplayDeferred:true,transferOnly:false,nativeReplayVerified:false,projectStrictVerified:false});
    stage='finished'; publish(result.naturalEnd?'complete':(stopReason?'stopped':'truncated'),true);
   } catch(error) {
    errorText=errorText||String(error); stage='failed'; result=null;
    try { Native.text(directory,'worker-error.json',{parentId:job.parentId,attemptId:job.attemptId,package:packageName,workerId:cfg.workerId,globalRoot:cfg.globalRoot,
     sourceApkSha256:cfg.sourceApkSha256,installedApkSha256:cfg.installedApkSha256,committedActions:count,error:errorText,pendingAction:pendingAction,naturalEnd:false,pathCounts:paths}); } catch(saveError) { errorText+='\n错误记录写入失败：'+saveError; }
    try { publish('failed',true); } catch(stateError) { put('phase','failed'); put('error',errorText+'\nSTATE写入失败：'+stateError); }
   }
   put('workerFinished',true);
  }
 }}), 'aeii-hard-process-'+String(cfg.workerId)+'-'+job.parentId);
 thread.start(); return thread;
})();
