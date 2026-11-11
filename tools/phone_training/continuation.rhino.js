// 此脚本在手机 Rhino 的独立 Java 线程内执行，不经过 Frida 的逐动作回调。
(function(){
 var job=JSON.parse(String(jobJson));
 var Runnable=java.lang.Runnable, Thread=java.lang.Thread;
 var task=new Runnable({run:function(){
  var batch=job.batch||[job];
  var batchIndex=0;while(!Thread.currentThread().isInterrupted()){
  if(typeof sharedJobQueue!=='undefined'){var next=sharedJobQueue.poll();if(next===null)break;job=JSON.parse(String(next));}
  else{if(batchIndex>=batch.length)break;job=batch[batchIndex++];}
  var start=java.lang.System.nanoTime(),dir=new java.io.File(String(outputRoot)+'/'+job.id);
  dir.mkdirs();var log=null,stream=null;
  function field(o,n){var c=o.getClass();while(c!==null){try{var f=c.getDeclaredField(n);f.setAccessible(true);return f;}catch(e){c=c.getSuperclass();}}throw new Error('未找到原生字段 '+n);}
  function get(o,n){return field(o,n).get(o);}
  function set(o,n,v){var f=field(o,n);if(f.getType()==java.lang.Integer.TYPE)f.setInt(o,v);else if(f.getType()==java.lang.Long.TYPE)f.setLong(o,v);else if(f.getType()==java.lang.Boolean.TYPE)f.setBoolean(o,v);else f.set(o,v);}
  function emit(o){log.write(JSON.stringify(o)+'\n');log.flush();}
  function save(name,bytes){var f=new java.io.FileOutputStream(new java.io.File(dir,name));f.write(bytes);f.close();}
  // 单局停止标记只结束本局当前段，照常关闭压缩流并保存终态。
  function stopRequested(){return new java.io.File(String(outputRoot)+'/controls/'+job.originalId+'.stop.json').exists();}
  try{
   // 压缩直接发生在手机输出流中，保持解压后的动作与状态格式不变。
   function output(name){var out=new java.io.BufferedOutputStream(new java.io.FileOutputStream(new java.io.File(dir,name+(job.compressStreams?'.gz':''))));if(job.compressStreams){out=new java.util.zip.GZIPOutputStream(out);get(out,'def').setLevel(1);}return out;}
   log=new java.io.BufferedWriter(new java.io.OutputStreamWriter(output('actions.jsonl'),'UTF-8'));
   var S=Packages.c.a.b.a.r.b,source=new java.io.File(String(job.sourceRoot)+'/'+job.sourceId);
   function bytes(name){var file=new java.io.File(source,name),data=java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE,Number(file.length()));var input=new java.io.DataInputStream(new java.io.FileInputStream(file));input.readFully(data);input.close();return data;}
   var initialBytes=bytes('final.bin');save('config.bin',bytes('config.bin'));save('initial.bin',initialBytes);
   var initial=S['a(byte[],java.lang.Class)'](initialBytes,Packages.c.a.b.a.u.b);
   var controller=new Packages.c.a.b.b.x.m();set(controller,'a','controller.js');set(controller,'b',com.badlogic.gdx.Gdx.files.internal('mods/SD/controller.js').readBytes());
   var renderer=new Packages.c.a.b.b.r.f(null);set(renderer,'b',false);
   var engine=new Packages.c.a.b.a.a(new Packages.c.a.b.b.f(),renderer,new Packages.c.a.b.a.x.b(),false);
   var ctx=Packages.c.a.b.a.w.a.a(false);
   engine['a(c.a.b.a.u.b,c.a.b.a.w.c,org.mozilla.javascript.ScriptableObject)'](initial,controller.a(),ctx.initSafeStandardObjects());set(engine,'c',true);
   var q=get(engine,'e');
   function digest(bytes){var result=java.security.MessageDigest.getInstance('SHA-256').digest(bytes),hex='';for(var k=0;k<result.length;k++){var b=(Number(result[k])&255).toString(16);hex+=(b.length===1?'0':'')+b;}return hex;}
   var initialBoardSha=digest(S['a(java.lang.Object)'](get(q,'e'))),actionTypes={};
   function snapshot(){var snap=new Packages.c.a.b.a.u.b();set(snap,'a',100);set(snap,'b',400);set(snap,'c',S['a(java.lang.Object)'](get(q,'b')));set(snap,'d',S['a(java.lang.Object)'](get(q,'e')));set(snap,'e',S['a(java.lang.Object)'](get(q,'f')));set(snap,'f',S['a(java.lang.Object)'](get(q,'g')));return S['a(java.lang.Object)'](snap);}
   if(!java.util.Arrays.equals(S['a(java.lang.Object)'](get(q,'e')),get(initial,'d'))||!java.util.Arrays.equals(S['a(java.lang.Object)'](get(q,'f')),get(initial,'e')))throw new Error('续跑恢复状态与前段终态不一致');
   stream=new java.io.DataOutputStream(output('states.bin'));
   var count=0,computeStart=java.lang.System.nanoTime(),cpuStart=android.os.Debug.threadCpuTimeNanos();
   var aiNanos=0,settleNanos=0,snapshotNanos=0,ioNanos=0;
   while(get(get(q,'f'),'h')<0 && count<job.maxActions && !Thread.currentThread().isInterrupted() && !stopRequested()){
    var ai=new Packages.c.a.b.c.j.a(engine),aiSeed=job.seed+(job.globalOffset+count)*104729;
    get(ai,'e').setSeed(aiSeed);
    var tick=java.lang.System.nanoTime(),before=snapshot();snapshotNanos+=java.lang.System.nanoTime()-tick;
    tick=java.lang.System.nanoTime();var action=ai.call();aiNanos+=java.lang.System.nanoTime()-tick;var raw={};
    for(var i=0;i<9;i++){var n=String.fromCharCode(97+i);raw[n]=Number(get(action,n));}raw.j=String(get(action,'j'));actionTypes[raw.j]=(actionTypes[raw.j]||0)+1;
    tick=java.lang.System.nanoTime();stream.writeInt(before.length);stream.write(before);ioNanos+=java.lang.System.nanoTime()-tick;
    tick=java.lang.System.nanoTime();get(engine,'d')['a(c.a.b.a.b)'](action);engine['a()']();settleNanos+=java.lang.System.nanoTime()-tick;
    tick=java.lang.System.nanoTime();emit({index:count,global_index:job.globalOffset+count,ai_seed:aiSeed,fields:raw});ioNanos+=java.lang.System.nanoTime()-tick;count++;
    if(count%100==0){var progress=new java.io.FileWriter(new java.io.File(dir,'progress.json'));progress.write(JSON.stringify({actions:count,turn:Number(get(get(q,'f'),'f')),elapsed_seconds:Number(java.lang.System.nanoTime()-start)/1e9}));progress.close();}
   }
   stream.close();stream=null;log.close();log=null;save('final.bin',snapshot());
   var end=java.lang.System.nanoTime();
   var result={id:job.id,map:job.map,seed:job.seed,actions:count,turn:Number(get(get(q,'f'),'f')),winner_mask:Number(get(get(q,'f'),'h')),natural_end:get(get(q,'f'),'h')>=0,started_nanos:String(start),ended_nanos:String(end),elapsed_seconds:Number(end-start)/1e9,compute_seconds:Number(end-computeStart)/1e9,worker_cpu_seconds:Number(android.os.Debug.threadCpuTimeNanos()-cpuStart)/1e9,ai_seconds:Number(aiNanos)/1e9,settle_seconds:Number(settleNanos)/1e9,snapshot_seconds:Number(snapshotNanos)/1e9,io_seconds:Number(ioNanos)/1e9,heap_used:Number(java.lang.Runtime.getRuntime().totalMemory()-java.lang.Runtime.getRuntime().freeMemory()),thread:String(Thread.currentThread().getName())};
   result.original_id=job.originalId;result.global_offset=job.globalOffset;result.global_end=job.globalOffset+count;result.parent_root=job.sourceRoot;result.parent_id=job.sourceId;result.parent_final_sha256=digest(initialBytes);result.action_types=actionTypes;result.initial_board_sha256=initialBoardSha;result.final_board_sha256=digest(S['a(java.lang.Object)'](get(q,'e')));
   result.planId=job.planId||null;result.planKind=job.planKind||null;
   result.compression=job.compressStreams?'gzip-level-1':null;result.states_format='int32be-length/native-snapshot';result.truncation_reason=result.natural_end?null:(stopRequested()?'confirmed_cyclic_stalemate':(count>=job.maxActions?'continuation_checkpoint':'interrupted'));
   var out=new java.io.FileWriter(new java.io.File(dir,'result.json'));out.write(JSON.stringify(result));out.close();engine.e();
  }catch(e){var out=new java.io.FileWriter(new java.io.File(dir,'error.txt'));out.write(String(e)+'\n'+(e.stack||''));out.close();}
  finally{if(stream)stream.close();if(log)log.close();Packages.c.a.b.a.w.a.c();}
  }
 }});
 var thread=new Thread(task,'aeii-'+job.id);thread.start();return thread;
})();
