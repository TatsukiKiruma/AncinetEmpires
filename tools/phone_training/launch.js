// 启动独立原生线程；界面中的引擎和原有存档保持独立。
Java.perform(()=>{try{
 const U=n=>Java.use(n),ctx=U('org.mozilla.javascript.Context').enter();ctx.setOptimizationLevel(-1);ctx.setLanguageVersion(200);ctx.setApplicationClassLoader(U('c.a.b.a.a').class.getClassLoader());
 const input=U('java.io.BufferedReader').$new(U('java.io.FileReader').$new('/data/local/tmp/aeii-worker.js'));
 let code='',line;while((line=input.readLine())!==null)code+=line+'\n';input.close();
 const configReader=U('java.io.BufferedReader').$new(U('java.io.FileReader').$new('/data/local/tmp/aeii-jobs.json'));
 let jobText='';while((line=configReader.readLine())!==null)jobText+=line;configReader.close();
 const config=JSON.parse(jobText);
 const queue=config.dynamicQueue?U('java.util.concurrent.ConcurrentLinkedQueue').$new():null;
 if(queue){const pending=config.jobs.flatMap(w=>w.batch).sort((a,b)=>a.id.localeCompare(b.id));for(const job of pending)queue.add(U('java.lang.String').$new(JSON.stringify(job)));}
 for(const job of config.jobs){
  const scope=ctx.initStandardObjects();
  for(const [name,value] of Object.entries({jobJson:JSON.stringify(job),outputRoot:config.outputRoot,baseConfigName:config.baseConfigName})){
   scope.put(name,scope,U('org.mozilla.javascript.Context').javaToJS(U('java.lang.String').$new(value),scope));
  }
  // 通过Java并发队列共享任务，每个Rhino线程只取走自己将执行的一局。
  if(queue)scope.put('sharedJobQueue',scope,U('org.mozilla.javascript.Context').javaToJS(queue,scope));
  const t=ctx.evaluateString(scope,code,'aeii-worker',1,null);send({kind:'launched',job:job.id,thread:String(t)});
 }
 U('org.mozilla.javascript.Context').exit();send({kind:'done'});
}catch(e){send({kind:'error',error:String(e),stack:e.stack});}});
