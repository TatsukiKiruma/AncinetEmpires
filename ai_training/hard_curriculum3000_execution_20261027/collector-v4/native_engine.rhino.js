// 仅封装 APK 原生配置、引擎与快照；不重写游戏规则或评分。
var HardNative = (function () {
 function field(object, name) {
  var type = object.getClass();
  while (type !== null) {
   try { var member = type.getDeclaredField(name); member.setAccessible(true); return member; }
   catch (error) { type = type.getSuperclass(); }
  }
  throw new Error('找不到原生字段：' + name);
 }
 function get(object, name) { return field(object, name).get(object); }
 function set(object, name, value) {
  var member = field(object, name), type = member.getType();
  if (type == java.lang.Integer.TYPE) member.setInt(object, value);
  else if (type == java.lang.Long.TYPE) member.setLong(object, value);
  else if (type == java.lang.Boolean.TYPE) member.setBoolean(object, value);
  else member.set(object, value);
 }
 function writeBytes(directory, name, bytes) {
  var target = new java.io.File(directory, name);
  if (!target.createNewFile()) throw new Error('拒绝覆盖产物：' + name);
  var stream = new java.io.FileOutputStream(target);
  try { stream.write(bytes); stream.getFD().sync(); } finally { stream.close(); }
 }
 function text(directory, name, value) {
  writeBytes(directory, name, new java.lang.String(JSON.stringify(value)).getBytes('UTF-8'));
 }
 function output(directory, name) {
  var target = new java.io.File(directory, name);
  if (!target.createNewFile()) throw new Error('拒绝覆盖压缩流：' + name);
  var file = new java.io.FileOutputStream(target);
  var gzip = new java.util.zip.GZIPOutputStream(new java.io.BufferedOutputStream(file));
  get(gzip, 'def').setLevel(1);
  return { stream: gzip, file: file };
 }
 function create(job, zipPath, entry, directory, guard) {
  var serializer = Packages.c.a.b.a.r.b;
  var archive = new java.util.zip.ZipFile(String(zipPath)), input = null, config;
  try {
   var member = archive.getEntry(String(entry));
   if (member === null) throw new Error('配置 ZIP 中没有指定条目');
   input = archive.getInputStream(member);
   config = serializer['a(java.io.InputStream,java.lang.Class)'](input, Packages.c.a.b.a.e);
  } finally { if (input !== null) input.close(); archive.close(); }
  var map = Packages.c.a.b.b.x.d.a(com.badlogic.gdx.Gdx.files.internal('maps/' + job.map));
  set(config, 'c', map); set(config, 'a', true); set(config, 'e', job.seed);
  var types = java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE, 6);
  var alliances = java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE, 6);
  Curriculum.before(config,map,job,directory);
  var active = get(map, 'd');
  if (active.length < 2 || active.length > 6) throw new Error('地图人数不受支持');
  for (var index = 0; index < 6; index++) alliances[index] = index + 1;
  // APK 界面先记 type3 困难槽，再把原生配置类型映射为2。
  for (var index = 0; index < active.length; index++) types[active[index]] = 2;
  set(config, 'i', types); set(config, 'j', alliances);
  writeBytes(directory, 'config.bin', serializer['a(java.lang.Object)'](config));
  var controller = new Packages.c.a.b.b.x.m();
  set(controller, 'a', 'controller.js');
  set(controller, 'b', com.badlogic.gdx.Gdx.files.internal('mods/SD/controller.js').readBytes());
  var renderer = new Packages.c.a.b.b.r.f(null); set(renderer, 'b', false);
  var engine = new Packages.c.a.b.a.a(new Packages.c.a.b.b.f(), renderer, new Packages.c.a.b.a.x.b(), false);
  var context = Packages.c.a.b.a.w.a.a(false);
  engine['a(c.a.b.a.e,c.a.b.a.w.c,org.mozilla.javascript.ScriptableObject)'](
   config, controller.a(), context.initSafeStandardObjects());
  guard.bindEngine(engine, active);
  engine['a()']();
  var state = get(engine, 'e');
  var receipt=Curriculum.after(state,job,directory);
  function snapshot() {
   var snapshot = new Packages.c.a.b.a.u.b();
   set(snapshot, 'a', 100); set(snapshot, 'b', 400);
   set(snapshot, 'c', serializer['a(java.lang.Object)'](get(state, 'b')));
   set(snapshot, 'd', serializer['a(java.lang.Object)'](get(state, 'e')));
   set(snapshot, 'e', serializer['a(java.lang.Object)'](get(state, 'f')));
   set(snapshot, 'f', serializer['a(java.lang.Object)'](get(state, 'g')));
   return serializer['a(java.lang.Object)'](snapshot);
  }
  return { engine: engine, state: state, snapshot: snapshot, receipt: receipt };
 }
 return { get: get, set: set, create: create, output: output, text: text, writeBytes: writeBytes };
})();
