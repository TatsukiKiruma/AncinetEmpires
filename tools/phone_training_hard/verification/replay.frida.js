// 只在原采集线程安全停止后附加，独立重放不经过困难策略与 WebView。
rpc.exports = { replay: function(job, source) { return new Promise((resolve, reject) => Java.perform(function() {
 try {
  const Application = Java.use('android.app.ActivityThread').currentApplication();
  if (Application === null) throw new Error('应用上下文不存在');
  Java.classFactory.loader = Application.getClassLoader();
  const map = Java.use('java.lang.Thread').getAllStackTraces(), iterator = map.keySet().iterator();
  while (iterator.hasNext()) { const thread = Java.cast(iterator.next(), Java.use('java.lang.Thread')); if (String(thread.getName()).startsWith('aeii-hard-') && thread.isAlive()) throw new Error('原采集线程仍存活'); }
  const Context = Java.use('org.mozilla.javascript.Context'), context = Context.enter();
  try {
   context.setOptimizationLevel(-1); context.setLanguageVersion(200); context.setApplicationClassLoader(Application.getClassLoader());
   const scope = context.initStandardObjects(), File = Java.use('java.io.File');
   const root = String(Application.getFilesDir().getCanonicalPath());
   const target = File.$new(job.nativeRoot || root+'/.aeii-hard-collect/'+job.attemptId).getCanonicalPath().toString();
   if (![root+'/.aeii-hard-collect/'+job.attemptId,root+'/.aeii-hard-smoke/'+job.attemptId].includes(target)) throw new Error('原生证据目录不属于当前应用的本次尝试');
   for (const [name,value] of Object.entries({replayJobJson:JSON.stringify(job),replayDirectory:target})) scope.put(name,scope,Context.javaToJS(Java.use('java.lang.String').$new(value),scope));
   resolve(JSON.parse(String(context.evaluateString(scope,source,'independent-hard-replay',1,null))));
  } finally { Context.exit(); }
 } catch(error) { reject(new Error(String(error))); }
})); } };
