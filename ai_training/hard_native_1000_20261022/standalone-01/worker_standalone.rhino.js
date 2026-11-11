// 只执行一个父局；所有规则和真实结算交给 APK 引擎。
(function () {
 var job = JSON.parse(String(jobJson)), Native = HardNative;
 var thread = new java.lang.Thread(new java.lang.Runnable({ run: function () {
  var directory = new java.io.File(String(outputDirectory));
 var game = null, actions = null, states = null;
  var count = 0, result = null, errorText = null;
  var started = java.lang.System.nanoTime();
  try {
   guard.workerStarted();
   game = Native.create(job, String(baseConfigZip), String(baseConfigName), directory, guard);
   Native.writeBytes(directory, 'initial.bin', game.snapshot());
   var actionOutput = Native.output(directory, 'actions.jsonl.gz');
   actions = new java.io.BufferedWriter(new java.io.OutputStreamWriter(actionOutput.stream, 'UTF-8'));
   var stateOutput = Native.output(directory, 'states.bin.gz');
   states = new java.io.DataOutputStream(stateOutput.stream);
   while (Number(Native.get(Native.get(game.state, 'f'), 'h')) < 0 && count < job.maxActions) {
    if (guard.shouldStop()) throw new Error('困难采集收到停止信号');
    // 暂停发生在Rhino线程，不能在Frida回调中sleep并占住JS执行锁。
    while(guard.pauseMillis()>0){if(guard.shouldStop())throw new Error('手机任务收到停止信号');java.lang.Thread.sleep(1000);}
    guard.begin(count);
    var before = game.snapshot();
    // 每步新建困难对象；Java seed 只控制回退，不控制 HTML Math.random。
    var ai = new Packages.c.a.b.c.j.b(game.engine);
    var aiSeed = job.seed + count * 104729;
    Native.get(ai, 'e').setSeed(aiSeed);
    var action = ai.call();
    guard.accept(action);
    var raw = {};
    for (var index = 0; index < 9; index++) {
     var name = String.fromCharCode(97 + index); raw[name] = Number(Native.get(action, name));
    }
    raw.j = String(Native.get(action, 'j'));
    states.writeInt(before.length); states.write(before); states.flush();
    actions.write(JSON.stringify({parentId:job.parentId,attemptId:job.attemptId,index:count,
     ai_seed:aiSeed,fields:raw,path:'hard_js_primary',settlement:'待对应commit证据核验'}) + '\n');
    actions.flush();
    Native.get(game.engine, 'd')['a(c.a.b.a.b)'](action); game.engine['a()']();
    guard.committed(count); count++;
   }
   Native.writeBytes(directory, 'final.bin', game.snapshot());
   var players = Native.get(game.state, 'f'), winner = Number(Native.get(players, 'h'));
   result = {parentId:job.parentId,attemptId:job.attemptId,map:job.map,seed:job.seed,
    actions:count,turn:Number(Native.get(players,'f')),winnerMask:winner,naturalEnd:winner>=0,
    truncationReason:winner>=0?null:'max_actions',requestedPlayerType:3,nativeConfigPlayerType:2,
    jsRngMode:'original_webview_rng',jsSeedControlled:false,rngModified:false,
    strategyFamily:'apk_hard_js',elapsedSeconds:Number(java.lang.System.nanoTime()-started)/1e9,
    statesFormat:'int32be-length/native-snapshot',compression:'gzip-level-1',strictReplayVerified:false};
  } catch (error) {
   errorText = String(error) + '\n' + (error.stack || '');
   try { Native.text(directory, 'worker-error.json', {parentId:job.parentId,attemptId:job.attemptId,
    actions:count,error:errorText,naturalEnd:false}); } catch (saveError) { errorText += '\n' + saveError; }
   guard.failed(errorText);
  } finally {
   // 关闭流和引擎后才通知驻留控制器；宿主还须等线程真正退出。
   try { if (states !== null) states.close(); } catch (error) { errorText = String(error); }
   try { if (actions !== null) actions.close(); } catch (error) { errorText = String(error); }
   try { if (game !== null) game.engine.e(); } catch (error) { errorText = String(error); }
   try { Packages.c.a.b.a.w.a.c(); } catch (error) { errorText = String(error); }
   if (errorText !== null) { guard.failed(errorText); result = null; }
   if (result !== null) {
    try { Native.text(directory, 'result.json', result); guard.finished(JSON.stringify(result)); }
    catch (error) { guard.failed(String(error)); }
   }
   guard.workerFinished();
  }
 }}), 'aeii-hard-' + job.parentId);
 guard.registerThread(thread);
 thread.start();
 return thread;
})();
