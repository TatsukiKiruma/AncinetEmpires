"""保存交付身份和结束保护检查，不改写历史资产。"""
import pathlib,json,hashlib,subprocess,os
OUT=pathlib.Path(__file__).resolve().parent
ROOT=OUT.parents[1]
R=ROOT/'ai_training/r7_training_stage_20261014_083500'
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
    return h.hexdigest()
audit=json.loads((OUT/'audit_results.json').read_text(encoding='utf8'))
checks=[]
for v in audit['protected']:
    checks.append({'path':v['path'],'match':sha(ROOT/v['path'])==v['actual']})
for v in audit['frozenVsCurrent']:
    rel=v['path'];checks.append({'path':'冻结/'+rel,'match':sha(R/'env/src_game_frozen'/rel)==sha(ROOT/'src/game'/rel)})
for name,v in audit['datasets'].items():
    checks.append({'path':f'数据/{name}','match':sha(R/f'artifacts/data/{name}.jsonl')==v['sha256']})
checks.append({'path':'候选','match':sha(R/'artifacts/models/round3_enhanced_v2_best.json')==audit['hashes']['round3_enhanced_v2_best.json']})
status=subprocess.check_output(['git','status','--short'],cwd=ROOT)
(OUT/'git_status_after.txt').write_bytes(status)
before=(OUT/'git_status_before.txt').read_text(encoding='utf-8-sig').splitlines()
after=status.decode('utf8').splitlines()
result={'checks':checks,'allMatch':all(c['match'] for c in checks),'gitStatusLinesBefore':len(before),'gitStatusLinesAfter':len(after),'statusAdded':sorted(set(after)-set(before)),'statusRemoved':sorted(set(before)-set(after)),'cleanup':{'deletedFiles':[],'reason':'本审核只建立可复核证据与文档，无需删除临时文件；未穿越junction。'},'limitations':'结束哈希复核只覆盖列出的资产，不追溯证明R7历史期间所有文件未被改动。'}
(OUT/'protection_after.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
# 原始R7产物全部登记为本次观察身份，遍历明确拒绝重解析目录。
sources={}
for cur,dirs,files in os.walk(R,followlinks=False):
    dirs[:]=[d for d in dirs if not (pathlib.Path(cur)/d).lstat().st_file_attributes & 0x400]
    for name in files:
        p=pathlib.Path(cur)/name
        if p.lstat().st_file_attributes & 0x400:continue
        sources[str(p.relative_to(ROOT))]={'bytes':p.stat().st_size,'sha256':sha(p)}
(OUT/'source_observation_manifest.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2),encoding='utf8')
delivery={p.name:sha(p) for p in OUT.iterdir() if p.is_file() and p.name!='DELIVERY_SHA256.json'}
(OUT/'DELIVERY_SHA256.json').write_text(json.dumps(delivery,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'protectedChecks':len(checks),'allMatch':result['allMatch'],'gitStatusAdded':result['statusAdded'],'gitStatusRemoved':result['statusRemoved'],'r7FilesObserved':len(sources),'deliveryFiles':len(delivery)},ensure_ascii=False))
