// 只中断本次采集线程，不重启手机、不停止游戏进程。
Java.perform(()=>{try{
 const U=n=>Java.use(n),threads=U('java.lang.Thread').getAllStackTraces().keySet().toArray();
 const stopped=[];for(const thread of threads){const t=Java.cast(thread,U('java.lang.Thread'));const name=String(t.getName());if(name.startsWith('aeii-')){t.interrupt();stopped.push(name);}}
 send({kind:'stopped',threads:stopped});send({kind:'done'});
}catch(e){send({kind:'error',error:String(e)});}});
