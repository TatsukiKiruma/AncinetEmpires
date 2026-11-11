// 仅反序列化已保存轨迹；归零副本的绝对回合号，不修改原始状态或实际引擎。
(function(){var job=JSON.parse(String(jobJson));var task=new java.lang.Runnable({run:function(){
 var queue=job.batch||[job],at=0;
 while(!java.lang.Thread.currentThread().isInterrupted()){
  if(typeof sharedJobQueue!=='undefined'){var next=sharedJobQueue.poll();if(next===null)break;job=JSON.parse(String(next));}
  else{if(at>=queue.length)break;job=queue[at++];}
  var dir=new java.io.File(String(outputRoot)+'/'+job.id);dir.mkdirs();var writer=null;
  function field(o,n){var c=o.getClass();while(c!==null){try{var f=c.getDeclaredField(n);f.setAccessible(true);return f;}catch(e){c=c.getSuperclass();}}throw new Error(n);}
  function get(o,n){return field(o,n).get(o);}
  function hex(bytes){var out='';for(var k=0;k<bytes.length;k++){var b=(Number(bytes[k])&255).toString(16);out+=(b.length===1?'0':'')+b;}return out;}
  function digest(parts){var md=java.security.MessageDigest.getInstance('SHA-256');for(var k=0;k<parts.length;k++){var part=parts[k];md.update(java.nio.ByteBuffer.allocate(4).putInt(part.length).array());md.update(part);}return hex(md.digest());}
  function fileDigest(file){var md=java.security.MessageDigest.getInstance('SHA-256'),input=new java.io.FileInputStream(file),buffer=java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE,8192),n;while((n=input.read(buffer))!==-1)md.update(buffer,0,n);input.close();return hex(md.digest());}
  function report(name,obj){var f=new java.io.FileWriter(new java.io.File(dir,name));f.write(JSON.stringify(obj));f.close();}
  try{
   var start=java.lang.System.nanoTime(),S=Packages.c.a.b.a.r.b,total=0,counts=[];
   var compressed=new java.util.zip.GZIPOutputStream(new java.io.BufferedOutputStream(new java.io.FileOutputStream(new java.io.File(dir,'decision-trace.jsonl.gz'))));
   get(compressed,'def').setLevel(1);writer=new java.io.BufferedWriter(new java.io.OutputStreamWriter(compressed,'UTF-8'));
   for(var sourceIndex=0;sourceIndex<job.sources.length;sourceIndex++){
    var source=new java.io.File(String(job.sourceRoot)+'/'+job.sources[sourceIndex]);
    var expected=job.expectedSourceHashes[job.sources[sourceIndex]],stateSha=fileDigest(new java.io.File(source,'states.bin.gz')),actionSha=fileDigest(new java.io.File(source,'actions.jsonl.gz'));
    if(stateSha!==expected.states_sha256||actionSha!==expected.actions_sha256)throw new Error('源轨迹摘要与已核验电脑归档不一致');
    var states=new java.io.DataInputStream(new java.util.zip.GZIPInputStream(new java.io.BufferedInputStream(new java.io.FileInputStream(new java.io.File(source,'states.bin.gz')))));
    var actions=new java.io.BufferedReader(new java.io.InputStreamReader(new java.util.zip.GZIPInputStream(new java.io.BufferedInputStream(new java.io.FileInputStream(new java.io.File(source,'actions.jsonl.gz')))),'UTF-8'));
    var count=0,first;
    while((first=states.read())!==-1){
     var length=(first<<24)|(states.readUnsignedByte()<<16)|(states.readUnsignedByte()<<8)|states.readUnsignedByte();if(length<=0||length>67108864)throw new Error('状态长度异常');
     var bytes=java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE,length);states.readFully(bytes);
     var snap=S['a(byte[],java.lang.Class)'](bytes,Packages.c.a.b.a.u.b),line=actions.readLine();if(line===null)throw new Error('缺失动作');var action=JSON.parse(String(line));if(action.index!==count)throw new Error('段内动作序号异常');
     if(action.ai_seed!==job.seed+action.global_index*104729)throw new Error('AI种子不连续');
     var players=S['a(byte[],java.lang.Class)'](get(snap,'e'),Packages.c.a.b.a.t.a),turn=Number(get(players,'f')),current=Number(get(players,'e')),gold=[],rawGold=get(players,'l');
     for(var g=0;g<rawGold.length;g++)gold.push(Number(rawGold[g]));field(players,'f').setInt(players,0);
     var rules=get(snap,'c'),board=get(snap,'d'),selection=get(snap,'f'),normalizedPlayers=S['a(java.lang.Object)'](players);
     var signature=[];for(var k=0;k<9;k++)signature.push(action.fields[String.fromCharCode(97+k)]);signature.push(action.fields.j);
     var row={index:action.global_index,turn:turn,current_player:current,gold:gold,state_sha256:digest([rules,board,normalizedPlayers,selection]),board_sha256:digest([rules,board]),players_sha256:digest([normalizedPlayers]),action_signature:signature.join(','),action_type:action.fields.j,source:job.sources[sourceIndex]};
     writer.write(JSON.stringify(row)+'\n');count++;total++;
     if(count%250===0){writer.flush();report('progress.json',{actions:total,source:job.sources[sourceIndex]});}
    }
    if(actions.readLine()!==null||count!==expected.actions)throw new Error('源动作数量不一致');states.close();actions.close();counts.push({source:job.sources[sourceIndex],actions:count,states_sha256:stateSha,actions_sha256:actionSha});
   }
   writer.close();writer=null;
   report('result.json',{id:job.id,original_id:job.originalId,sources:counts,actions:total,elapsed_seconds:Number(java.lang.System.nanoTime()-start)/1e9,normalization:'仅将反序列化副本的玩家状态f绝对回合号设为0；金币、其余玩家字段、规则、棋盘、选择状态全部保留',read_only:true});
  }catch(e){report('error.json',{error:String(e),stack:String(e.stack)});}
  finally{if(writer)writer.close();}
 }
 }});var t=new java.lang.Thread(task,'aeii-'+job.id);t.start();return t;})();
