// Frida只在手机内引导原生线程，完成后队列不依赖主机连接。
console.log('native_bootstrap_loaded');
rpc.exports = { init: function () {
 setImmediate(function () { Java.perform(function(){
 console.log('native_bootstrap_java_ready');
 const app=Java.use('android.app.ActivityThread').currentApplication();
 Java.classFactory.loader=app.getClassLoader();
 const Context=Java.use('org.mozilla.javascript.Context');
 const deadline=Date.now()+60000;
 function start(){
  try{
   if(Java.use('com.badlogic.gdx.Gdx').files.value===null){if(Date.now()>deadline)throw Error('Gdx文件接口60秒内未就绪');setTimeout(function(){Java.perform(start);},500);return;}
   const cx=Context.enter();
   try{
    cx.setOptimizationLevel(-1);cx.setLanguageVersion(200);cx.setApplicationClassLoader(app.getClassLoader());
    const scope=cx.initStandardObjects();
    scope.put('admissionRoot',scope,Context.javaToJS(Java.use('java.lang.String').$new(ADMISSION_ROOT),scope));
    scope.put('admissionApplication',scope,Context.javaToJS(app,scope));
    cx.evaluateString(scope,ADMISSION_QUEUE,'independent-admission-queue',1,null);
    send({kind:'native_queue_started',pid:Process.id,root:ADMISSION_ROOT});
   }finally{Context.exit();}
  }catch(error){send({kind:'native_bootstrap_failed',error:String(error),stack:String(error.stack)});}
 }
 start();
 }); });
 return {accepted:true,pid:Process.id};
} };
