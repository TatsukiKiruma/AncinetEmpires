// Frida 只启动原生线程；页面初始化、UI 回调和逐步决策均由 Rhino 负责。
'use strict';
(function () {
 const assetUrl = 'file:///android_asset/hard-ai/runtime.html';
 const state = { phase: 'idle', started: false, htmlReplaced: false, error: null };
 let config, app, activity, directory, bootstrap, wakeLock, workerThread;
 let readyDeadline = 0;
 function note(key, value) {
  if (!bootstrap) return;
  const boxed = typeof value === 'boolean' ? Java.use('java.lang.Boolean').valueOf(value)
   : Java.use('java.lang.String').$new(String(value));
  bootstrap.put(Java.use('java.lang.String').$new(key), boxed);
 }
 function writeJson(name, value) {
  if (!directory) return;
  const JFile = Java.use('java.io.File'), JString = Java.use('java.lang.String');
  const temporary = JFile.$new(directory, '.' + name + '.bootstrap.tmp');
  const output = Java.use('java.io.FileOutputStream').$new(temporary);
  try { output.write(JString.$new(JSON.stringify(value)).getBytes('UTF-8')); } finally { output.close(); }
  if (!temporary.renameTo(JFile.$new(directory, name))) throw new Error('启动状态原子写入失败');
 }
 function fail(error) {
  state.phase = 'bootstrap_failed'; state.error = String(error);
  try {
   writeJson('STATE.json', { ...state, standalonePhase: 'failed', attemptId: config.job.attemptId, parentId: config.job.parentId,
    outputDirectory: String(config.outputDirectory), bootstrapDump: bootstrap ? String(bootstrap.toString()) : null,
    updatedAtMillis: Date.now() });
  } catch (writeError) { send({ kind: 'bootstrap_state_error', error: String(writeError) }); }
  send({ kind: 'production_bootstrap_failed', error: state.error });
 }
 function sha256Text(value) {
  const digest = Java.use('java.security.MessageDigest').getInstance('SHA-256');
  const bytes = digest.digest(Java.use('java.lang.String').$new(value).getBytes('UTF-8'));
  return Array.from(bytes, byte => (Number(byte) & 255).toString(16).padStart(2, '0')).join('');
 }
 function checkApk() {
  if (typeof HARD_EXPECTED === 'undefined' || !HARD_EXPECTED.sha256) throw new Error('缺少冻结APK身份');
  const input = Java.use('java.io.FileInputStream').$new(String(app.getApplicationInfo().sourceDir.value));
  const digest = Java.use('java.security.MessageDigest').getInstance('SHA-256');
  const bytes = Java.array('byte', new Array(65536).fill(0));
  try { let size; while ((size = input.read(bytes)) !== -1) digest.update(bytes, 0, size); } finally { input.close(); }
  const actual = Array.from(digest.digest(), byte => (Number(byte) & 255).toString(16).padStart(2, '0')).join('');
  if (actual !== String(HARD_EXPECTED.sha256).toLowerCase()) throw new Error('APK身份与冻结来源不符');
  note('apkSha256', actual);
 }
 function prepareDirectory() {
  const JFile = Java.use('java.io.File');
  const parent = JFile.$new(app.getFilesDir(), '.aeii-hard-production');
  if (!parent.exists() && !parent.mkdirs()) throw new Error('无法创建生产采集目录');
  const expected = JFile.$new(parent, String(config.job.attemptId));
  const requested = JFile.$new(String(config.outputDirectory));
  if (String(expected.getCanonicalPath()) !== String(requested.getCanonicalPath())) throw new Error('产物路径与本次尝试不符');
  if (!requested.mkdir()) throw new Error('尝试目录已存在或无法创建');
  directory = Java.retain(requested);
  bootstrap = Java.retain(Java.use('java.util.concurrent.ConcurrentHashMap').$new());
  note('appPid', Process.id); note('populationLimit', config.populationLimit);
  note('outputDirectory', config.outputDirectory); note('htmlReplaced', false); note('populationPatchReady', false);
  writeJson('STATE.json', { phase: 'waiting_ready', standalonePhase: 'waiting_ready', attemptId: config.job.attemptId, parentId: config.job.parentId,
   appPid: Process.id, outputDirectory: config.outputDirectory, updatedAtMillis: Date.now() });
 }
 function checkedHtml() {
  const html = String(HARD_HTML_BY_CAP[String(config.populationLimit)]);
  const limits = Array.from(html.matchAll(/const\s+TEAM_POPULATION_LIMIT\s*=\s*(\d+)\s*;/g));
  if (limits.length !== 1 || Number(limits[0][1]) !== config.populationLimit) throw new Error('修正页面的人口上限不符');
  const digest = sha256Text(html), expectedDigest = config.patchHTMLSha || config.patchHTMLSha256;
  if (expectedDigest && digest !== String(expectedDigest).toLowerCase()) throw new Error('修正页面摘要不符');
  note('patchHTMLSha256', digest);
  return html;
 }
 function observeThreadExit() {
  setTimeout(function () {
   Java.perform(function () {
    try {
     if (workerThread.isAlive()) { observeThreadExit(); return; }
     note('workerThreadExited', true);
     writeJson('THREAD_EXITED.json', { standalonePhase: 'thread_exited', appPid: Process.id,
      attemptId: config.job.attemptId, parentId: config.job.parentId,
      threadId: String(workerThread.getId()), updatedAtMillis: Date.now() });
     state.phase = 'worker_exited';
    } catch (error) { send({ kind: 'production_thread_observation_failed', error: String(error) }); }
   });
  }, 1000);
 }
 function launchWorker() {
  Java.perform(function () {
   try {
    const Context = Java.use('org.mozilla.javascript.Context');
    const context = Context.enter();
    try {
     context.setOptimizationLevel(-1); context.setLanguageVersion(200);
     context.setApplicationClassLoader(app.getClassLoader());
     const scope = context.initStandardObjects();
     const values = { jobJson: JSON.stringify(config.job), productionConfigJson: JSON.stringify(config),
      outputDirectory: String(config.outputDirectory), baseConfigZip: String(config.baseConfigZip), baseConfigName: String(config.baseConfigName) };
     for (const [key, value] of Object.entries(values)) scope.put(key, scope, Context.javaToJS(Java.use('java.lang.String').$new(value), scope));
     scope.put('productionBootstrapState', scope, Context.javaToJS(bootstrap, scope));
     scope.put('bootstrapState', scope, Context.javaToJS(bootstrap, scope));
     let result = context.evaluateString(scope, String(HARD_NATIVE_SOURCE) + '\n' + String(HARD_WORKER_SOURCE), 'hard-production-worker', 1, null);
     const NativeJavaObject = Java.use('org.mozilla.javascript.NativeJavaObject'), Thread = Java.use('java.lang.Thread');
     if (result !== null) {
      const className = String(result.getClass().getName());
      if (className === 'org.mozilla.javascript.NativeJavaObject' || NativeJavaObject.class.isInstance(result)) result = Java.cast(result, NativeJavaObject).unwrap();
     }
     if (result === null || !Thread.class.isInstance(result)) throw new Error('生产worker没有返回原生线程');
     workerThread = Java.retain(Java.cast(result, Thread));
     note('workerThreadId', workerThread.getId()); note('workerThreadAliveAtLaunch', Boolean(workerThread.isAlive()));
    } finally { Context.exit(); }
    state.phase = 'worker_launched'; note('workerLaunched', true);
    observeThreadExit();
    send({ kind: 'production_worker_launched', appPid: Process.id, outputDirectory: config.outputDirectory });
   } catch (error) { fail(error); }
  });
 }
 function warmPage() {
  Java.perform(function () {
   try {
    const html = checkedHtml(), Context = Java.use('org.mozilla.javascript.Context'), context = Context.enter();
    try {
     context.setOptimizationLevel(-1); context.setLanguageVersion(200); context.setApplicationClassLoader(app.getClassLoader());
     const scope = context.initStandardObjects();
     for (const [name, value] of Object.entries({ bootActivity: activity, bootState: bootstrap,
      bootHtml: Java.use('java.lang.String').$new(html), bootLimit: Java.use('java.lang.String').$new(String(config.populationLimit)),
      bootAssetUrl: Java.use('java.lang.String').$new(assetUrl) })) scope.put(name, scope, Context.javaToJS(value, scope));
     context.evaluateString(scope, String.raw`
      (function () {
       function note(key, value) { bootState.put(new java.lang.String(String(key)), new java.lang.String(String(value))); }
       function phase(name) { note('bootstrapPhase', name); note(name + 'AtMillis', java.lang.System.currentTimeMillis()); }
       function failed(error) { note('bootstrapError', error); note('bootstrapPhase', 'failed'); }
       phase('script_entered');
       var thread = new java.lang.Thread(new java.lang.Runnable({run: function () {
        var context = null;
        try {
         phase('thread_entered'); note('bootThreadName', java.lang.Thread.currentThread().getName());
         context = Packages.org.mozilla.javascript.Context.enter();
         context.setOptimizationLevel(-1); context.setApplicationClassLoader(bootActivity.getClassLoader());
         var type = java.lang.Class.forName('aer.extension.ResourcePackHardAi', true, bootActivity.getClassLoader());
         var viewField = type.getDeclaredField('view'), latchField = type.getDeclaredField('loaded');
         viewField.setAccessible(true); latchField.setAccessible(true);
         var loaded = latchField.get(null);
         phase('ui_queued');
         bootActivity.runOnUiThread(new java.lang.Runnable({run: function () {
          try {
           phase('ui_entered'); note('uiThreadName', java.lang.Thread.currentThread().getName());
           bootActivity.getWindow().addFlags(128); note('keepScreenOn', true);
           if (viewField.get(null) !== null) throw new Error('困难页面已存在，拒绝覆盖');
           var view = new Packages.android.webkit.WebView(bootActivity);
           phase('webview_created');
           // 复用目标 APK 既有客户端；具体类不经过 Rhino 动态字节码生成。
           phase('javascript_setting_entered'); view.getSettings().setJavaScriptEnabled(true); phase('javascript_enabled');
           phase('file_access_setting_entered'); view.getSettings().setAllowFileAccess(true); phase('file_access_enabled');
           var ownerType = java.lang.Class.forName('aer.extension.ResourcePackHardAi$1', true, bootActivity.getClassLoader());
           var ownerCtor = ownerType.getDeclaredConstructors()[0]; ownerCtor.setAccessible(true);
           var args = java.lang.reflect.Array.newInstance(java.lang.Object, 1); args[0] = bootActivity;
           phase('native_client_owner_entered'); var owner = ownerCtor.newInstance(args); phase('native_client_owner_created');
           var clientType = java.lang.Class.forName('aer.extension.ResourcePackHardAi$1$1', true, bootActivity.getClassLoader());
           var clientCtor = clientType.getDeclaredConstructors()[0]; clientCtor.setAccessible(true); args[0] = owner;
           phase('native_client_entered'); var client = clientCtor.newInstance(args); phase('native_client_created');
           view.setWebViewClient(client); phase('native_client_installed');
           viewField.set(null, view); phase('native_view_bound');
           phase('load_data_entered');
           view.loadDataWithBaseURL(String(bootAssetUrl), String(bootHtml), 'text/html', 'UTF-8', String(bootAssetUrl));
           note('htmlReplaced', true); note('loadDataReturnedAtMillis', java.lang.System.currentTimeMillis());
          } catch (error) { failed(error); }
         }}));
         phase('native_page_waiting');
         if (!loaded.await(20, java.util.concurrent.TimeUnit.SECONDS)) throw new Error('原生困难页面加载超过20秒');
         phase('native_page_finished'); note('pageLoaded', true);
         bootActivity.runOnUiThread(new java.lang.Runnable({run: function () {
          try {
           phase('value_callback_queued');
           var page = viewField.get(null);
           page.evaluateJavascript('window.__AEII_NATIVE_POP_LIMIT__', new Packages.android.webkit.ValueCallback({
            onReceiveValue: function (value) {
             try {
              phase('value_callback_entered'); note('valueCallbackValue', value);
              if (Number(String(value)) !== Number(String(bootLimit))) throw new Error('困难页面人口标记不符：' + value);
              note('pageLoadedAtMillis', java.lang.System.currentTimeMillis());
              note('populationPatchReady', true); phase('population_ready');
             } catch (error) { failed(error); }
            }
           }));
          } catch (error) { failed(error); }
         }}));
        } catch (error) { failed(error); }
        finally { if (context !== null) Packages.org.mozilla.javascript.Context.exit(); }
       }}), 'aeii-hard-page-bootstrap');
       thread.start(); note('bootThreadStarted', true); return thread;
      })();`, 'hard-production-page-bootstrap', 1, null);
    } finally { Context.exit(); }
    const deadline = Date.now() + 20000;
    function waitLoaded() {
     Java.perform(function () {
      try {
       const error = bootstrap.get(Java.use('java.lang.String').$new('bootstrapError'));
       if (error !== null) throw new Error(String(error));
       if (String(bootstrap.get(Java.use('java.lang.String').$new('populationPatchReady'))) === 'true') {
        state.htmlReplaced = true;
        send({ kind: 'production_html_replaced', populationLimit: config.populationLimit }); launchWorker(); return;
       }
       if (Date.now() >= deadline) throw new Error('修正的困难页面加载超过20秒');
       setTimeout(waitLoaded, 100);
      } catch (error) { fail(error); }
     });
    }
    setImmediate(waitLoaded);
   } catch (error) { fail(error); }
  });
 }
 function waitReady() {
  Java.perform(function () {
   try {
    const current = Java.use('android.app.ActivityThread').currentApplication();
    if (current !== null) {
     if (!app) {
      app = Java.retain(current); Java.classFactory.loader = app.getClassLoader();
      if (String(app.getPackageName()) !== String(config.package || 'net.toyknight.aeii.android')) throw new Error('应用包名不符');
      prepareDirectory();
      checkApk();
     }
     const Ui = Java.use('aer.extension.ResourcePackUi'), Gdx = Java.use('com.badlogic.gdx.Gdx');
     const currentActivity = Ui.currentActivity();
     if (currentActivity !== null && Gdx.files.value !== null && Gdx.app.value !== null) {
      activity = Java.retain(currentActivity);
      const power = Java.cast(app.getSystemService('power'), Java.use('android.os.PowerManager'));
      wakeLock = Java.retain(power.newWakeLock(1, 'AEII:困难独立采集')); wakeLock.setReferenceCounted(false); wakeLock.acquire();
      note('wakeLockAcquired', true);
      state.phase = 'warming_page'; note('readyAtMillis', Date.now());
      setImmediate(warmPage);
      return;
     }
    }
    if (Date.now() >= readyDeadline) throw new Error('等待应用后台就绪超时');
    setTimeout(waitReady, 200);
   } catch (error) { fail(error); }
  });
 }
 rpc.exports = {
  init: function (stage, parameters) {
   if (state.started) throw new Error('本进程已经启动过生产采集');
   config = parameters; state.started = true; state.phase = 'waiting_ready';
   if (!config || !config.job || !/^[A-Za-z0-9_-]+$/.test(String(config.job.attemptId || '')) ||
    !Number.isInteger(config.populationLimit) || config.populationLimit < 1 || !config.outputDirectory ||
    !config.baseConfigZip || !config.baseConfigName) throw new Error('生产采集参数不完整');
   readyDeadline = Date.now() + Number(config.readyTimeoutMillis || 60000);
   // inject 会等待 init 返回再继续，启动动作必须另行排队。
   setImmediate(waitReady);
   return { accepted: true, stage: String(stage), appPid: Process.id };
  },
  status: function () { return new Promise(resolve => Java.perform(function () {
   let deviceState = null;
   try {
    if (directory) {
     const file = Java.use('java.io.File').$new(directory, 'STATE.json');
     const bytes = Java.use('java.nio.file.Files').readAllBytes(file.toPath());
     deviceState = JSON.parse(String(Java.use('java.lang.String').$new(bytes, 'UTF-8')));
    }
   } catch (error) { deviceState = { readError: String(error) }; }
   resolve({ ...state, appPid: Process.id, outputDirectory: config ? config.outputDirectory : null,
    workerAlive: workerThread ? Boolean(workerThread.isAlive()) : null,
    bootstrapDump: bootstrap ? String(bootstrap.toString()) : null, deviceState: deviceState });
  })); }
 };
})();
