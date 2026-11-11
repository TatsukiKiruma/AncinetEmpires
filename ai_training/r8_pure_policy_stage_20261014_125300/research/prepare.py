"""冻结权威依赖闭包，并建立不穿链接的历史保护账本。"""
import pathlib,os,json,hashlib,re,shutil,time,datetime,subprocess
STAGE=pathlib.Path(__file__).resolve().parents[1]
ROOT=STAGE.parents[1]
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''): h.update(b)
    return h.hexdigest()
def save(name,obj): (STAGE/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf8')
started=time.time()
save('identity/budget.json',{'startedUnix':started,'startedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'trainDeadlineUnix':started+9.6*3600,'finalDeadlineUnix':started+12*3600,'wallLimitSeconds':43200,'reserveSeconds':8640,'description':'从冻结/保护计算作业开始计时，截止包含开发间隔；目录后缀仅标识，不用作时间凭证。'})
entries=['src/game/engine.ts','src/game/env.ts','src/game/apk_skirmish.ts','src/game/apk_skirmish_map_assets.ts','src/game/apk_manifest.ts','src/game/ai/heuristic_ai.ts','src/game/ai/spatial_tensor_encoder.ts','src/game/ai/spatial_conv_net.ts','ai_training/v17/teachers/b100_policy.ts']
pat=re.compile(r'(?:from\s*|import\s*\(|require\s*\()([\'\"])(\.[^\'\"]+)\1')
pending=[(ROOT/p).resolve() for p in entries]; seen={}
while pending:
    p=pending.pop()
    if str(p) in seen:continue
    rel=p.relative_to(ROOT); dst=STAGE/'frozen'/rel; dst.parent.mkdir(parents=True,exist_ok=True)
    raw=p.read_bytes(); text=raw.decode('utf8') if p.suffix in ('.ts','.tsx','.js','.mjs') else None
    deps=[]
    if text:
        def replace(m):
            q=(p.parent/m.group(2)).resolve(); candidates=[q,pathlib.Path(str(q)+'.ts'),pathlib.Path(str(q)+'.tsx'),pathlib.Path(str(q)+'.json'),q/'index.ts']
            target=next((v for v in candidates if v.is_file()),None)
            if not target:raise RuntimeError(f'依赖缺失 {p}: {m.group(2)}')
            target=target.resolve(); target.relative_to(ROOT);pending.append(target);deps.append(str(target.relative_to(ROOT)))
            r=os.path.relpath(STAGE/'frozen'/target.relative_to(ROOT),dst.parent).replace('\\','/')
            if not r.startswith('.'):r='./'+r
            return m.group(0).replace(m.group(2),r)
        text=pat.sub(replace,text);dst.write_text(text,encoding='utf8',newline='')
    else:dst.write_bytes(raw)
    seen[str(p)]={'source':str(rel),'sourceSha256':sha(p),'frozen':str(dst.relative_to(STAGE)),'frozenSha256':sha(dst),'dependencies':deps}
save('identity/manifest.json',{'entries':entries,'files':list(seen.values()),'principle':'算法字节仅允许相对导入改写；权威规则本体不更改。'})
shutil.copyfile(ROOT/'ai_training/r7_training_stage_20261014_083500/research/model.py',STAGE/'research/model.py')
shutil.copyfile(ROOT/'ai_training/review_r7_20261014_112649/下一大阶段计划.md',STAGE/'reports/ACCEPTED_PLAN.md')
save('identity/panel_consumption.json',{'historicalPanels':['R6 DEV/FINAL','R7 DEV/FINAL'],'newFinalConsumed':False,'legacyPackages':'只读候选课程，本轮默认不接入，以优先修复当前规则数据。'})
print('冻结完成',len(seen),flush=True)
protected={}; links=[]
roots=[ROOT/'src',ROOT/'tools',ROOT/'docs']+[ROOT/'ai_training'/n for n in ['r4_teacher_stage_20261013_121700','r5_eval_teacher_v2_20261014_023500','r6_model_training_20261014_063500','r7_training_stage_20261014_083500','v15','v16','v17','v18','v19','legacy2500_recovery_20261014_090431','legacy1395_probe_20261014_093632','review_r7_20261014_112649']]
for base in roots:
    for cur,dirs,files in os.walk(base,followlinks=False):
        keep=[]
        for d in dirs:
            q=pathlib.Path(cur)/d
            if q.lstat().st_file_attributes & 0x400: links.append(str(q.relative_to(ROOT)))
            else:keep.append(d)
        dirs[:]=keep
        for name in files:
            p=pathlib.Path(cur)/name
            if p.lstat().st_file_attributes & 0x400:links.append(str(p.relative_to(ROOT)));continue
            protected[str(p.relative_to(ROOT))]={'bytes':p.stat().st_size,'sha256':sha(p)}
for name in ['package.json','package-lock.json','AGENTS.md','README.md','ai_training/AGENTS.md','ai_training/package.json','ai_training/run.mjs']:
    p=ROOT/name
    if p.exists():protected[name]={'bytes':p.stat().st_size,'sha256':sha(p)}
save('identity/protected_before.json',{'files':protected,'linksNotTraversed':links,'elapsedSeconds':time.time()-started})
print('保护清单完成',len(protected),flush=True)
