// 独立重放只加载保存快照和原生动作，既不实例化也不调用任何 AI。
(function () {
 var job = JSON.parse(String(replayJobJson));
 var directory = new java.io.File(String(replayDirectory));
 var engine = null, stream = null, actionsRead = 0, statesCompared = 0, report;
 function field(value, name) { var c = value.getClass(); while (c !== null) { try { var f = c.getDeclaredField(name); f.setAccessible(true); return f; } catch (e) { c = c.getSuperclass(); } } throw new Error('缺字段：' + name); }
 function get(value, name) { return field(value, name).get(value); }
 function set(value, name, data) { var f = field(value, name); if (f.getType() == java.lang.Integer.TYPE) f.setInt(value, data); else if (f.getType() == java.lang.Boolean.TYPE) f.setBoolean(value, data); else f.set(value, data); }
 function digest(file) { var hash = java.security.MessageDigest.getInstance('SHA-256'), input = new java.io.FileInputStream(file), buffer = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 65536), count; try { while ((count = input.read(buffer)) !== -1) hash.update(buffer, 0, count); } finally { input.close(); } var raw = hash.digest(), out = ''; for (var i = 0; i < raw.length; i++) out += ('0' + ((raw[i] & 255).toString(16))).slice(-2); return out; }
 function hashes() { var out = {}; for (var name in job.artifactHashes) { var actual = digest(new java.io.File(directory, name)); if (actual !== job.artifactHashes[name]) throw new Error('设备输入摘要不一致：' + name); out[name] = actual; } return out; }
 var S = Packages.c.a.b.a.r.b;
 function read(name, type) { var input = new java.io.FileInputStream(new java.io.File(directory, name)); try { return S['a(java.io.InputStream,java.lang.Class)'](input, type); } finally { input.close(); } }
 function packed(name) { return new java.util.zip.GZIPInputStream(new java.io.BufferedInputStream(new java.io.FileInputStream(new java.io.File(directory, name)))); }
 function bytes(value) { return S['a(java.lang.Object)'](value); }
 function compare(snapshot, label) {
  var state = get(engine, 'e'), names = ['c','d','e','f'], members = ['b','e','f','g'];
  if (Number(get(snapshot,'a')) !== 100 || Number(get(snapshot,'b')) !== 400) throw new Error(label + '：快照头不一致');
  // 四个完整序列化组件全部逐字节比较，包含规则、脚本变量、运行选择和寻路缓存。
  for (var k = 0; k < names.length; k++) if (!java.util.Arrays.equals(bytes(get(state,members[k])), get(snapshot,names[k]))) throw new Error(label + '：完整组件 ' + names[k] + ' 不一致');
  statesCompared++;
 }
 try {
  hashes();
  var initial = read('initial.bin', Packages.c.a.b.a.u.b);
  var controller = new Packages.c.a.b.b.x.m(); set(controller,'a','controller.js'); set(controller,'b',com.badlogic.gdx.Gdx.files.internal('mods/SD/controller.js').readBytes());
  var renderer = new Packages.c.a.b.b.r.f(null); set(renderer,'b',false);
  engine = new Packages.c.a.b.a.a(new Packages.c.a.b.b.f(),renderer,new Packages.c.a.b.a.x.b(),false);
  var context = Packages.c.a.b.a.w.a.a(false);
  engine['a(c.a.b.a.u.b,c.a.b.a.w.c,org.mozilla.javascript.ScriptableObject)'](initial,controller.a(),context.initSafeStandardObjects()); set(engine,'c',true);
  compare(initial,'初始快照');
  var lines = new java.io.BufferedReader(new java.io.InputStreamReader(packed('actions.jsonl.gz'),'UTF-8'));
  stream = new java.io.DataInputStream(packed('states.bin.gz'));
  var line, enumClass = java.lang.Class.forName('c.a.b.a.i$a',true,engine.getClass().getClassLoader());
  try { while ((line = lines.readLine()) !== null) {
   var row = JSON.parse(String(line));
   if (row.index !== actionsRead || row.parentId !== job.parentId || row.attemptId !== job.attemptId || row.path !== 'hard_js_primary') throw new Error('动作身份不一致');
   var size = stream.readInt(); if (size <= 0 || size > 67108864) throw new Error('状态帧长度越界');
   var buffer = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE,size); stream.readFully(buffer);
   compare(S['a(byte[],java.lang.Class)'](buffer,Packages.c.a.b.a.u.b),'动作前态 ' + actionsRead);
   var action = new Packages.c.a.b.a.b();
   for (var i = 0; i < 9; i++) { var name = String.fromCharCode(97+i); field(action,name).setInt(action,row.fields[name]); }
   set(action,'j',java.lang.Enum.valueOf(enumClass,String(row.fields.j)));
   get(engine,'d')['a(c.a.b.a.b)'](action); engine['a()'](); actionsRead++;
  }} finally { lines.close(); }
  if (stream.read() !== -1 || actionsRead !== job.expectedActions) throw new Error('状态/动作流未完整一致消费');
  compare(read('final.bin',Packages.c.a.b.a.u.b),'最终快照'); hashes();
  report = {nativeReplayVerified:true,parentId:job.parentId,attemptId:job.attemptId,actions:actionsRead,statesCompared:statesCompared,
   artifactHashes:job.artifactHashes,verifierSourceSha256:job.verifierSourceSha256,aiCalls:0,
   fullSerializedComponents:['definitions','board','players-and-script','runtime-and-path-cache'],ignoredSnapshotFields:[],strictByteEquality:true};
 } catch (error) { report = {nativeReplayVerified:false,error:String(error),stack:String(error.stack),actions:actionsRead,statesCompared:statesCompared,parentId:job.parentId,attemptId:job.attemptId}; }
 finally { try { if (stream !== null) stream.close(); if (engine !== null) engine.e(); Packages.c.a.b.a.w.a.c(); } catch (cleanup) { report.nativeReplayVerified=false; report.cleanupError=String(cleanup); } }
 return JSON.stringify(report);
})();
