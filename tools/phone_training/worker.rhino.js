// 此脚本在手机 Rhino 的独立 Java 线程内执行，不经过 Frida 的逐动作回调。
(function(){
 var job=JSON.parse(String(jobJson));
 var Runnable=java.lang.Runnable, Thread=java.lang.Thread;
 var task=new Runnable({run:function(){
  var batch=job.batch||[job];
  var batchIndex=0;while(true){
  if(typeof sharedJobQueue!=='undefined'){var next=sharedJobQueue.poll();if(next===null)break;job=JSON.parse(String(next));}
  else{if(batchIndex>=batch.length)break;job=batch[batchIndex++];}
  var start=java.lang.System.nanoTime(),dir=new java.io.File(String(outputRoot)+'/'+job.id);
  dir.mkdirs();var log=null,stream=null;
  function field(o,n){var c=o.getClass();while(c!==null){try{var f=c.getDeclaredField(n);f.setAccessible(true);return f;}catch(e){c=c.getSuperclass();}}throw new Error('未找到原生字段 '+n);}
  function get(o,n){return field(o,n).get(o);}
  function set(o,n,v){var f=field(o,n);if(f.getType()==java.lang.Integer.TYPE)f.setInt(o,v);else if(f.getType()==java.lang.Long.TYPE)f.setLong(o,v);else if(f.getType()==java.lang.Boolean.TYPE)f.setBoolean(o,v);else f.set(o,v);}
  function emit(o){log.write(JSON.stringify(o)+'\n');log.flush();}
  function save(name,bytes){var f=new java.io.FileOutputStream(new java.io.File(dir,name));f.write(bytes);f.close();}
  try{
   // 压缩直接发生在手机输出流中，保持解压后的动作与状态格式不变。
   function output(name){var out=new java.io.BufferedOutputStream(new java.io.FileOutputStream(new java.io.File(dir,name+(job.compressStreams?'.gz':''))));if(job.compressStreams){out=new java.util.zip.GZIPOutputStream(out);get(out,'def').setLevel(1);}return out;}
   log=new java.io.BufferedWriter(new java.io.OutputStreamWriter(output('actions.jsonl'),'UTF-8'));
   var S=Packages.c.a.b.a.r.b, cfgInput=new java.util.zip.ZipFile('/data/local/tmp/aeii-verify.zip');
   var input=cfgInput.getInputStream(cfgInput.getEntry(String(baseConfigName)));
   var cfg=S['a(java.io.InputStream,java.lang.Class)'](input,Packages.c.a.b.a.e);input.close();cfgInput.close();
   var map=Packages.c.a.b.b.x.d.a(com.badlogic.gdx.Gdx.files.internal('maps/'+job.map));
   set(cfg,'c',map);set(cfg,'a',true);set(cfg,'e',job.seed);
   var types=java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE,6),alliances=java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE,6);
   for(var i=0;i<6;i++)alliances[i]=i+1;
   var active=get(map,'d');for(var i=0;i<active.length;i++)types[active[i]]=2;
   if(job.setup){var gold=get(cfg,'h'),limits=get(cfg,'k');for(var i=0;i<6;i++){gold[i]=job.setup.initialGold;limits[i]=job.setup.unitLimit;}set(get(cfg,'d'),'h',job.setup.levelCap);}
   if(job.state){
    for(var i=0;i<6;i++)types[i]=0;
    for(var i=0;i<job.state.players.length;i++){var p=job.state.players[i];if(p.isAlive)types[p.id]=2;}
    var units=java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE,job.state.units.length*5);
    for(var i=0;i<job.state.units.length;i++){var u=job.state.units[i];units[i*5]=u.type;units[i*5+1]=u.ownerId;units[i*5+2]=u.level;units[i*5+3]=u.pos.x;units[i*5+4]=u.pos.y;}set(map,'f',units);
   }
   set(cfg,'i',types);set(cfg,'j',alliances);
   save('config.bin',S['a(java.lang.Object)'](cfg));
   var controller=new Packages.c.a.b.b.x.m();set(controller,'a','controller.js');set(controller,'b',com.badlogic.gdx.Gdx.files.internal('mods/SD/controller.js').readBytes());
   var renderer=new Packages.c.a.b.b.r.f(null);set(renderer,'b',false);
   var engine=new Packages.c.a.b.a.a(new Packages.c.a.b.b.f(),renderer,new Packages.c.a.b.a.x.b(),false);
   var ctx=Packages.c.a.b.a.w.a.a(false);
   engine['a(c.a.b.a.e,c.a.b.a.w.c,org.mozilla.javascript.ScriptableObject)'](cfg,controller.a(),ctx.initSafeStandardObjects());engine['a()']();
   var q=get(engine,'e');
   // 只构造独立训练引擎的初始状态，结算和AI继续使用APK原生实现。
   if(job.state){
    var board=get(q,'e'),players=get(q,'f');
    for(var i=0;i<job.state.buildings.length;i++){var b=job.state.buildings[i];board['c(int,int,int)'](b.x,b.y,b.owner);}
    for(var i=0;i<job.state.units.length;i++){var u=job.state.units[i],nativeUnit=board['i(int,int)'](u.pos.x,u.pos.y);if(nativeUnit===null||Number(get(nativeUnit,'a'))!==u.type||Number(get(nativeUnit,'b'))!==u.ownerId)throw new Error('派生单位缺失或身份错误');if(u.hp>q['y(c.a.b.a.t.f)'](nativeUnit))throw new Error('派生HP超出原生上限');set(nativeUnit,'e',u.hp);set(nativeUnit,'i',u.hasActed);if(u.hasMoved)set(nativeUnit,'f',0);}
    for(var i=0;i<(job.state.graves||[]).length;i++){var g=job.state.graves[i];board['a(int,int,int,int)'](g.pos.x,g.pos.y,g.ownerId,g.remainingTurns);}
    set(players,'f',job.state.turn);set(players,'e',job.state.currentPlayer);set(players,'h',-1);
    for(var i=0;i<job.state.players.length;i++){var p=job.state.players[i];get(players,'l')[p.id]=p.gold;}
    var refresh=q.getClass().getDeclaredMethod('h',java.lang.reflect.Array.newInstance(java.lang.Class,0));refresh.setAccessible(true);refresh.invoke(q,java.lang.reflect.Array.newInstance(java.lang.Object,0));
   }
   function snapshot(){var snap=new Packages.c.a.b.a.u.b();set(snap,'a',100);set(snap,'b',400);set(snap,'c',S['a(java.lang.Object)'](get(q,'b')));set(snap,'d',S['a(java.lang.Object)'](get(q,'e')));set(snap,'e',S['a(java.lang.Object)'](get(q,'f')));set(snap,'f',S['a(java.lang.Object)'](get(q,'g')));return S['a(java.lang.Object)'](snap);}
   save('initial.bin',snapshot());
   stream=new java.io.DataOutputStream(output('states.bin'));
   var count=0,computeStart=java.lang.System.nanoTime(),cpuStart=android.os.Debug.threadCpuTimeNanos();
   var aiNanos=0,settleNanos=0,snapshotNanos=0,ioNanos=0;
   while(get(get(q,'f'),'h')<0 && count<job.maxActions && !Thread.currentThread().isInterrupted()){
    var ai=new Packages.c.a.b.c.j.a(engine),aiSeed=job.seed+count*104729;
    get(ai,'e').setSeed(aiSeed);
    var tick=java.lang.System.nanoTime(),before=snapshot();snapshotNanos+=java.lang.System.nanoTime()-tick;
    tick=java.lang.System.nanoTime();var action=ai.call();aiNanos+=java.lang.System.nanoTime()-tick;var raw={};
    for(var i=0;i<9;i++){var n=String.fromCharCode(97+i);raw[n]=Number(get(action,n));}raw.j=String(get(action,'j'));
    tick=java.lang.System.nanoTime();stream.writeInt(before.length);stream.write(before);ioNanos+=java.lang.System.nanoTime()-tick;
    tick=java.lang.System.nanoTime();get(engine,'d')['a(c.a.b.a.b)'](action);engine['a()']();settleNanos+=java.lang.System.nanoTime()-tick;
    tick=java.lang.System.nanoTime();emit({index:count,ai_seed:aiSeed,fields:raw});ioNanos+=java.lang.System.nanoTime()-tick;count++;
    if(count%100==0){var progress=new java.io.FileWriter(new java.io.File(dir,'progress.json'));progress.write(JSON.stringify({actions:count,turn:Number(get(get(q,'f'),'f')),elapsed_seconds:Number(java.lang.System.nanoTime()-start)/1e9}));progress.close();}
   }
   stream.close();stream=null;log.close();log=null;save('final.bin',snapshot());
   var end=java.lang.System.nanoTime();
   var result={id:job.id,map:job.map,seed:job.seed,actions:count,turn:Number(get(get(q,'f'),'f')),winner_mask:Number(get(get(q,'f'),'h')),natural_end:get(get(q,'f'),'h')>=0,started_nanos:String(start),ended_nanos:String(end),elapsed_seconds:Number(end-start)/1e9,compute_seconds:Number(end-computeStart)/1e9,worker_cpu_seconds:Number(android.os.Debug.threadCpuTimeNanos()-cpuStart)/1e9,ai_seconds:Number(aiNanos)/1e9,settle_seconds:Number(settleNanos)/1e9,snapshot_seconds:Number(snapshotNanos)/1e9,io_seconds:Number(ioNanos)/1e9,heap_used:Number(java.lang.Runtime.getRuntime().totalMemory()-java.lang.Runtime.getRuntime().freeMemory()),thread:String(Thread.currentThread().getName())};
   result.planId=job.planId||null;result.planKind=job.planKind||null;
   result.compression=job.compressStreams?'gzip-level-1':null;result.states_format='int32be-length/native-snapshot';result.truncation_reason=result.natural_end?null:(count>=job.maxActions?'max_actions':'interrupted');
   var out=new java.io.FileWriter(new java.io.File(dir,'result.json'));out.write(JSON.stringify(result));out.close();engine.e();
  }catch(e){var out=new java.io.FileWriter(new java.io.File(dir,'error.txt'));out.write(String(e)+'\n'+(e.stack||''));out.close();}
  finally{if(stream)stream.close();if(log)log.close();Packages.c.a.b.a.w.a.c();}
  }
 }});
 var thread=new Thread(task,'aeii-'+job.id);thread.start();return thread;
})();
