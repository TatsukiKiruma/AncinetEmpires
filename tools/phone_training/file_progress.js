// 只读当前批次的结果和进度文件，不操作游戏引擎与界面。
Java.perform(()=>{try{
 const U=n=>Java.use(n);
 function read(path){const f=U('java.io.BufferedReader').$new(U('java.io.FileReader').$new(path));let s='',line;while((line=f.readLine())!==null)s+=line;f.close();return JSON.parse(s);}
 const cfg=read('/data/local/tmp/aeii-jobs.json'),pending=[];let complete=0;
 for(const worker of cfg.jobs)for(const job of worker.batch){const root=cfg.outputRoot+'/'+job.id;if(U('java.io.File').$new(root+'/result.json').exists()){complete++;continue;}let progress=null;try{progress=read(root+'/progress.json');}catch(e){}pending.push({id:job.id,progress});}
 send({kind:'progress',complete,pending});send({kind:'done'});
}catch(e){send({kind:'error',error:String(e)});}});
