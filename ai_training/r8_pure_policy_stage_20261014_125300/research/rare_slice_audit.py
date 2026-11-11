"""把泛pending与招募后pending区分，按真实相邻转移核验稀有切片。"""
import pathlib,json,gzip,sys,collections
S=pathlib.Path(__file__).resolve().parents[1];name=sys.argv[1];D=S/'data'/name;pending={};counts=collections.Counter()
with gzip.open(D/'train.jsonl.gz','rt',encoding='utf8') as f:
    for line in f:
        s=json.loads(line);st=s['stateJson']
        if st.get('pendingUnitId'):pending[(s['gameId'],s['stepIndex']-1)]=(s['stateHash'],s['inputHash'])
        if any(u['ownerId']==st['currentPlayer'] and u['unitClass']=='commander' and u['hp']<=40 and s['spatial'][31*400+u['pos']['y']*20+u['pos']['x']]>.5 for u in st['units']):counts['commander_low_hp_in_next_turn_threat_upper_bound']+=1
recruited=[]
for game in sorted({g for g,_ in pending}):
    with gzip.open(S/f'data/raw/{game}.jsonl.gz','rt',encoding='utf8') as f:
        for line in f:
            if not line.startswith('{"type":"step"'):continue
            x=json.loads(line);k=(game,x['step'])
            if k in pending and x['action']['type'] in ['recruit_to_castle','recruit_and_deploy']:
                assert x['afterHash']==pending[k][0];recruited.append({'game':game,'recruitStep':x['step'],'inputHash':pending[k][1]})
counts['pending_immediately_after_recruit']=len(recruited)
out={'dataset':name,'counts':dict(counts),'recruitRows':recruited,'definitions':{'commanderDanger':'hp<=40且位于编码器Ch31下一敌方行动威胁上界；不是精确必杀概率','recruitPending':'该已选样本的前一个真实引擎步骤为招募，afterHash与样本stateHash相等'},'targetPerSlice':200}
(S/f'evidence/rare_slices_{name}.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print(dict(counts))
