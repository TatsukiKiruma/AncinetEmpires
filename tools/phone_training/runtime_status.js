// 只读核对采集线程是否已结束，便于安全关闭本次临时采集服务。
Java.perform(()=>{try{
 const T=Java.use('java.lang.Thread'),all=T.getAllStackTraces().keySet().toArray(),active=[];
 for(const value of all){const t=Java.cast(value,T),name=String(t.getName());if(name.startsWith('aeii-'))active.push({name,state:String(t.getState()),alive:t.isAlive()});}
 send({kind:'runtime-status',active_collection_threads:active});send({kind:'done'});
}catch(e){send({kind:'error',error:String(e)});}});
