// 固定相同动作与状态进行等工作量并发测试，发现状态分歧立即失败。
(function(){var job=JSON.parse(String(jobJson));var task=new java.lang.Runnable({run:function(){
 var batch=job.batch||[job],batchIndex=0;while(true){
 if(typeof sharedJobQueue!=='undefined'){var next=sharedJobQueue.poll();if(next===null)break;job=JSON.parse(String(next));}
 else{if(batchIndex>=batch.length)break;job=batch[batchIndex++];}
 var root=String(outputRoot),source=new java.io.File(String(job.sourceRoot||root)+'/'+String(job.sourceId||'bench-w1-v2')),dir=new java.io.File(root+'/'+job.id);dir.mkdirs();
 var start=java.lang.System.nanoTime(),passed=0;
 function field(o,n){var c=o.getClass();while(c!==null){try{var f=c.getDeclaredField(n);f.setAccessible(true);return f;}catch(e){c=c.getSuperclass();}}throw new Error(n);}
 function get(o,n){return field(o,n).get(o);}
 function set(o,n,v){var f=field(o,n);if(f.getType()==java.lang.Boolean.TYPE)f.setBoolean(o,v);else f.set(o,v);}
 function write(name,obj){var o=new java.io.FileWriter(new java.io.File(dir,name));o.write(JSON.stringify(obj));o.close();}
 try{
  var S=Packages.c.a.b.a.r.b;
  function read(file,cls){var input=new java.io.FileInputStream(file);var x=S['a(java.io.InputStream,java.lang.Class)'](input,cls);input.close();return x;}
  function enc(o){return S['a(java.lang.Object)'](o);}
  // 同时支持既有原始轨迹和直接压缩的新轨迹。
  function input(name){var packed=new java.io.File(source,name+'.gz');return packed.exists()?new java.util.zip.GZIPInputStream(new java.io.BufferedInputStream(new java.io.FileInputStream(packed))):new java.io.BufferedInputStream(new java.io.FileInputStream(new java.io.File(source,name)));}
  var lines=new java.io.BufferedReader(new java.io.InputStreamReader(input('actions.jsonl'),'UTF-8')),actions=[],line;
  while((line=lines.readLine())!==null)actions.push(JSON.parse(String(line)));lines.close();
  for(var rep=0;rep<job.repeats;rep++){
   var cfg=read(new java.io.File(source,'config.bin'),Packages.c.a.b.a.e);
   var controller=new Packages.c.a.b.b.x.m();set(controller,'a','controller.js');set(controller,'b',com.badlogic.gdx.Gdx.files.internal('mods/SD/controller.js').readBytes());
   var renderer=new Packages.c.a.b.b.r.f(null);set(renderer,'b',false);
   var engine=new Packages.c.a.b.a.a(new Packages.c.a.b.b.f(),renderer,new Packages.c.a.b.a.x.b(),false);
   var ctx=Packages.c.a.b.a.w.a.a(false);
   if(job.fromInitial){var initial=read(new java.io.File(source,'initial.bin'),Packages.c.a.b.a.u.b);engine['a(c.a.b.a.u.b,c.a.b.a.w.c,org.mozilla.javascript.ScriptableObject)'](initial,controller.a(),ctx.initSafeStandardObjects());set(engine,'c',true);}
   else{engine['a(c.a.b.a.e,c.a.b.a.w.c,org.mozilla.javascript.ScriptableObject)'](cfg,controller.a(),ctx.initSafeStandardObjects());engine['a()']();}
   var q=get(engine,'e'),states=new java.io.DataInputStream(input('states.bin'));
   for(var i=0;i<actions.length;i++){
    var length=states.readInt(),bytes=java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE,length);states.readFully(bytes);
    var expected=S['a(byte[],java.lang.Class)'](bytes,Packages.c.a.b.a.u.b);
    if(!java.util.Arrays.equals(enc(get(q,'e')),get(expected,'d'))||!java.util.Arrays.equals(enc(get(q,'f')),get(expected,'e')))throw new Error('状态分歧 rep='+rep+' action='+i);
    var action=new Packages.c.a.b.a.b(),raw=actions[i].fields;
    for(var j=0;j<9;j++){var n=String.fromCharCode(97+j);field(action,n).setInt(action,raw[n]);}
    var enumClass=java.lang.Class.forName('c.a.b.a.i$a',true,engine.getClass().getClassLoader());
    set(action,'j',java.lang.Enum.valueOf(enumClass,String(raw.j)));get(engine,'d')['a(c.a.b.a.b)'](action);engine['a()']();passed++;
   }
   if(states.read()!==-1)throw new Error('状态流存在多余数据');states.close();var expected=read(new java.io.File(source,'final.bin'),Packages.c.a.b.a.u.b);
   if(!java.util.Arrays.equals(enc(get(q,'e')),get(expected,'d'))||!java.util.Arrays.equals(enc(get(q,'f')),get(expected,'e')))throw new Error('终局分歧');
   engine.e();
  }
  write('result.json',{id:job.id,sourceId:job.sourceId||'bench-w1-v2',repeats:job.repeats,actions:passed,elapsed_seconds:Number(java.lang.System.nanoTime()-start)/1e9,all_states_equal:true,heap_used:Number(java.lang.Runtime.getRuntime().totalMemory()-java.lang.Runtime.getRuntime().freeMemory())});
 }catch(e){write('error.json',{error:String(e),stack:String(e.stack),passed:passed});}
 finally{Packages.c.a.b.a.w.a.c();}
 }
}});var t=new java.lang.Thread(task,'aeii-'+job.id);t.start();return t;})();
