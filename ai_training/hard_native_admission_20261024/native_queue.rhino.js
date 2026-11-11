// 原生线程读取手机持久队列并逐局原子落盘；没有电脑RPC或逐动作Frida调用。
(function(){
 var root=new java.io.File(String(admissionRoot)), app=admissionApplication;
 function readText(file){var input=new java.io.FileInputStream(file),out=new java.io.ByteArrayOutputStream(),b=java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE,65536),n;try{while((n=input.read(b))!==-1)out.write(b,0,n);}finally{input.close();}return String(new java.lang.String(out.toByteArray(),'UTF-8'));}
 function writeJson(file,value){var tmp=new java.io.File(String(file)+'.tmp'),out=new java.io.FileOutputStream(tmp);try{out.write(new java.lang.String(JSON.stringify(value)+'\n').getBytes('UTF-8'));out.getFD().sync();}finally{out.close();}if(!tmp.renameTo(file))throw new Error('原子保存失败：'+file);}
 var thread=new java.lang.Thread(new java.lang.Runnable({run:function(){
  var jobs=JSON.parse(readText(new java.io.File(root,'queue.json'))),source=readText(new java.io.File(root,'native_replay.rhino.js'));
  var done=0,passed=0,current='',paused=false,resource=null,wake=null,started=Number(java.lang.System.currentTimeMillis());
  function stopped(){return new java.io.File(root,'STOP').exists();}
  function state(phase,action){writeJson(new java.io.File(root,'STATE.json'),{schema:'hard-admission-native-queue-v1',phase:phase,done:done,passed:passed,total:jobs.length,currentParent:current,currentAction:action||0,resource:resource,appPid:Number(Packages.android.os.Process.myPid()),threadName:String(java.lang.Thread.currentThread().getName()),updatedMs:Number(java.lang.System.currentTimeMillis()),startedMs:started,computerRequired:false,trainingStarted:false});}
  function admissionGuard(parent,action){
   current=parent;if(stopped())throw new Error('本轮原生验收已请求停止');
   do {
   var intent=app.registerReceiver(null,new Packages.android.content.IntentFilter('android.intent.action.BATTERY_CHANGED'));
   var level=Number(intent.getIntExtra('level',-1)),scale=Number(intent.getIntExtra('scale',-1)),temp=Number(intent.getIntExtra('temperature',-1))/10,free=Number(new Packages.android.os.StatFs(root.getPath()).getAvailableBytes());
   if(level<0||scale<=0||temp<=0||temp>=100)throw new Error('无法取得有效资源读数');
   var battery=level*100/scale;
   if(paused)paused=!(temp<=42&&battery>=25&&free>=2.25*1073741824);else paused=temp>=45||battery<20||free<2*1073741824;
   resource={batteryPercent:battery,temperatureC:temp,freeBytes:free};
   if(paused){state('waiting_resources',action);java.lang.Thread.sleep(5000);}
   if(stopped())throw new Error('本轮原生验收已请求停止');
   } while(paused);
   state('running',action);
  }
  try{
   var power=app.getSystemService('power');wake=power.newWakeLock(1,'aeii:hard-native-admission');wake.acquire();
   // 只初始化原APK资源密钥，不改规则或输入快照。
   var input=com.badlogic.gdx.Gdx.files.internal('data.bin').read(),key;
   try{key=Packages.c.a.b.a.r.b['a(java.io.InputStream,java.lang.Class)'](input,java.lang.Class.forName('[B',true,app.getClassLoader()));}finally{input.close();}
   Packages.c.a.b.c.a['a(byte[])'](key);
   for(var i=0;i<jobs.length;i++){
    var job=jobs[i],receipt=new java.io.File(root,'receipts/'+job.parentId+'.json');current=job.parentId;
    if(receipt.exists()){var prior=JSON.parse(readText(receipt));if(prior.verifierSourceSha256!==job.verifierSourceSha256||JSON.stringify(prior.artifactHashes)!==JSON.stringify(job.artifactHashes))throw new Error('已有回执身份变化');done++;if(prior.nativeReplayVerified)passed++;continue;}
    if(stopped())break;
    admissionGuard(job.parentId,0);
    var replayJobJson=JSON.stringify(job),replayDirectory=new java.io.File(root,'inputs/'+job.parentId).getPath();
    var before=Number(java.lang.System.nanoTime()),report=JSON.parse(String(eval(source)));
    report.durationSeconds=(Number(java.lang.System.nanoTime())-before)/1e9;report.phonePid=Number(Packages.android.os.Process.myPid());
    if(stopped()){writeJson(new java.io.File(root,'interrupted-'+job.parentId+'-'+java.lang.System.currentTimeMillis()+'.json'),report);break;}
    writeJson(receipt,report);done++;if(report.nativeReplayVerified)passed++;
    state('running',0);java.lang.System.gc();
   }
   state(stopped()?'stopped':'complete',0);
  }catch(error){writeJson(new java.io.File(root,'QUEUE_ERROR-'+java.lang.System.currentTimeMillis()+'.json'),{error:String(error),stack:String(error.stack),current:current,done:done});state('queue_failed',0);}
  finally{if(wake!==null&&wake.isHeld())wake.release();writeJson(new java.io.File(root,'THREAD_EXITED.json'),{done:done,passed:passed,updatedMs:Number(java.lang.System.currentTimeMillis())});}
 }),'aeii-admission-native');
 thread.start();return thread;
})();
