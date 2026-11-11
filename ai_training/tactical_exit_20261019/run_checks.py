"""公共检查与训练工作区检查分别留存退出码，不互相替代。"""
from pathlib import Path
import subprocess,json,time,shutil,hashlib
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
sources=[]
for directory in ['src','tools','ai_training']:
    for p in (ROOT/directory).rglob('*'):
        if not p.is_file() or any(v in ['node_modules','__pycache__','source-snapshots'] or v.startswith('chrome-profile') for v in p.relative_to(ROOT).parts):continue
        if p.suffix in ['.ts','.tsx','.js','.mjs','.py','.css','.html'] or p.name in ['package.json','tsconfig.json','tsconfig.node.json']:sources.append(p)
sources.extend(p for p in ROOT.iterdir() if p.is_file() and (p.suffix in ['.ts','.js','.mjs','.css','.html'] or p.name in ['package.json','package-lock.json','tsconfig.json','tsconfig.node.json']))
binding={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(sources))}
digest=hashlib.sha256(json.dumps(binding,sort_keys=True).encode()).hexdigest()
if (HERE/'checks-source.json').exists() and (HERE/'checks.json').exists():
    previous=json.loads((HERE/'checks-source.json').read_text(encoding='utf-8'))
    if previous['sha256']==digest and len(json.loads((HERE/'checks.json').read_text(encoding='utf-8')))==6:
        print('检查输入源码未变，复用六项原始检查收据（含历史失败），不重复执行');raise SystemExit(0)
if (HERE/'checks.json').exists():
    archive=HERE/f'checks-archive-{int(time.time())}';archive.mkdir()
    shutil.copy2(HERE/'checks.json',archive/'checks.json')
    for p in HERE.glob('*-lint.log'):shutil.copy2(p,archive/p.name)
    for p in HERE.glob('*-test.log'):shutil.copy2(p,archive/p.name)
    for n in ['public-build.log','stage5-typecheck.log']:
        if (HERE/n).exists():shutil.copy2(HERE/n,archive/n)
checks=[('public-lint',['node',str(ROOT/'node_modules/typescript/bin/tsc'),'--noEmit']),('public-test',['node',str(ROOT/'node_modules/vitest/vitest.mjs'),'run']),('public-build',['node',str(ROOT/'node_modules/vite/bin/vite.js'),'build']),('stage5-typecheck',['node',str(ROOT/'ai_training/run.mjs'),'node','../node_modules/typescript/bin/tsc','--noEmit','-p','tactical_exit_20261019/tsconfig.json']),('workspace-lint',['node',str(ROOT/'ai_training/run.mjs'),'node','../node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json']),('workspace-test',['node',str(ROOT/'ai_training/run.mjs'),'node','../node_modules/vitest/vitest.mjs','run','--config','vitest.config.ts'])]
results=[]
for name,args in checks:
    start=time.perf_counter()
    with (HERE/(name+'.log')).open('w',encoding='utf-8') as f:r=subprocess.run(args,cwd=ROOT,stdout=f,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    results.append(dict(name=name,passed=r.returncode==0,code=r.returncode,seconds=time.perf_counter()-start,log=name+'.log'))
    (HERE/'checks.json').write_text(json.dumps(results),encoding='utf-8');print(name,r.returncode,flush=True)
(HERE/'checks-source.json').write_text(json.dumps(dict(sha256=digest,files=binding,completedAt=time.time())),encoding='utf-8')
