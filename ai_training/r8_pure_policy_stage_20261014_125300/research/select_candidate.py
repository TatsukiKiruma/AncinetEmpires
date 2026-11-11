"""按冻结规则选择研究起点或最终候选，完整保留失败臂。"""
import pathlib,json,hashlib,sys
S=pathlib.Path(__file__).resolve().parents[1];tag=sys.argv[1];names=sys.argv[2:];rows=[]
def read(p):return json.loads(p.read_text(encoding='utf8'))
for name in names:
    p=S/f'checkpoints/{name}/best.json';h=hashlib.sha256(p.read_bytes()).hexdigest();parity=read(S/f'evidence/parity_{h}.json');b=read(S/f'evidence/behavior_{h}.json');off=read(S/f'evidence/offline_{h}.json');dev=read(S/f'runs/dev_{name}/summary.json');assert dev['games']==20
    assert all(r['loadedModelSha256']==h for r in dev['results']);c=dev['counts'];trunc=sum(v for k,v in c.items() if 'truncated' in k)
    eligible=parity['passed'] and b['surrenderChoices']==0 and c.get('error',0)==0
    row={'name':name,'modelSha256':h,'eligible':eligible,'wins':c.get('natural_win',0),'losses':c.get('natural_loss',0),'truncated':trunc,'errors':c.get('error',0),'behaviorSurrenders':b['surrenderChoices'],'validationTop1':off['slices']['all']['top1'],'maps':{}}
    for r in dev['results']:
        m=row['maps'].setdefault(r['mapName'],{'wins':0,'games':0});m['games']+=1;m['wins']+=r['outcome']=='natural_win'
    rows.append(row)
rows.sort(key=lambda r:(r['eligible'],r['wins'],-r['truncated']-r['errors'],r['validationTop1']),reverse=True)
report={'tag':tag,'selected':rows[0]['name'],'eligible':rows[0]['eligible'],'rows':rows,'tieBreak':'合同及行为回归先行；DEV自然胜最多；更少截断/错误；最后完整验证Top1。同胜分地图退化供人工结合第二seed复核。','scope':'若eligible=false只可作诊断或修复起点，不得当最终合格候选。'}
with (S/f'identity/selection_{tag}.json').open('x',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
print(json.dumps(report,ensure_ascii=False,indent=2))
