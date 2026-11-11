import ast
import pathlib

# 从已核验采集器生成独立续跑版本，保持历史文件和封存数据不变。
folder = pathlib.Path(__file__).parent
if (folder/'continuation.rhino.js').exists():
    raise SystemExit('已有续跑脚本及后续策略变更，初版生成器不再覆盖现有文件')
worker = (folder / 'worker.rhino.js').read_text(encoding='utf8')
worker = worker.replace('var batchIndex=0;while(true)', 'var batchIndex=0;while(!Thread.currentThread().isInterrupted())')
begin = worker.index('   var S=Packages.c.a.b.a.r.b, cfgInput=')
end = worker.index('   var controller=', begin)
worker = worker[:begin] + '''   var S=Packages.c.a.b.a.r.b,source=new java.io.File(String(job.sourceRoot)+'/'+job.sourceId);
   function bytes(name){var file=new java.io.File(source,name),data=java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE,Number(file.length()));var input=new java.io.DataInputStream(new java.io.FileInputStream(file));input.readFully(data);input.close();return data;}
   var initialBytes=bytes('final.bin');save('config.bin',bytes('config.bin'));save('initial.bin',initialBytes);
   var initial=S['a(byte[],java.lang.Class)'](initialBytes,Packages.c.a.b.a.u.b);
''' + worker[end:]
begin = worker.index("   engine['a(c.a.b.a.e,")
end = worker.index('   function snapshot()', begin)
worker = worker[:begin] + '''   engine['a(c.a.b.a.u.b,c.a.b.a.w.c,org.mozilla.javascript.ScriptableObject)'](initial,controller.a(),ctx.initSafeStandardObjects());set(engine,'c',true);
   var q=get(engine,'e');
   function digest(bytes){var result=java.security.MessageDigest.getInstance('SHA-256').digest(bytes),hex='';for(var k=0;k<result.length;k++){var b=(Number(result[k])&255).toString(16);hex+=(b.length===1?'0':'')+b;}return hex;}
   var initialBoardSha=digest(S['a(java.lang.Object)'](get(q,'e'))),actionTypes={};
''' + worker[end:]
worker = worker.replace("   save('initial.bin',snapshot());", "   if(!java.util.Arrays.equals(S['a(java.lang.Object)'](get(q,'e')),get(initial,'d'))||!java.util.Arrays.equals(S['a(java.lang.Object)'](get(q,'f')),get(initial,'e')))throw new Error('续跑恢复状态与前段终态不一致');")
worker = worker.replace('aiSeed=job.seed+count*104729', 'aiSeed=job.seed+(job.globalOffset+count)*104729')
worker = worker.replace("raw.j=String(get(action,'j'));", "raw.j=String(get(action,'j'));actionTypes[raw.j]=(actionTypes[raw.j]||0)+1;")
worker = worker.replace('emit({index:count,ai_seed:', 'emit({index:count,global_index:job.globalOffset+count,ai_seed:')
worker = worker.replace("   result.planId=", "   result.original_id=job.originalId;result.global_offset=job.globalOffset;result.global_end=job.globalOffset+count;result.parent_root=job.sourceRoot;result.parent_id=job.sourceId;result.parent_final_sha256=digest(initialBytes);result.action_types=actionTypes;result.initial_board_sha256=initialBoardSha;result.final_board_sha256=digest(S['a(java.lang.Object)'](get(q,'e')));\n   result.planId=")
worker = worker.replace("count>=job.maxActions?'max_actions'", "count>=job.maxActions?'continuation_checkpoint'")
(folder / 'continuation.rhino.js').write_text(worker, encoding='utf8')

# 复用已有传输、压缩流和原生回放检查函数，生成可独立审阅的控制器。
original = (folder / 'compressed_controller.py').read_text(encoding='utf8')
module = ast.parse(original)
functions = '\n\n'.join(ast.get_source_segment(original, n) for n in module.body if isinstance(n, ast.FunctionDef))
(folder / 'continuation_io.py').write_text('import datetime,gzip,hashlib,json,pathlib,shutil,struct,subprocess,sys,tarfile,time\n\n' + functions + '\n', encoding='utf8')
print('独立续跑脚本已生成，旧采集器未修改')
