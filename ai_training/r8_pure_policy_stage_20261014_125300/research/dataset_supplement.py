"""补齐数据集级共享身份和按地图座位统计，锁定的样本字节不变。"""
import pathlib,json,gzip,collections,sys,hashlib
S=pathlib.Path(__file__).resolve().parents[1];name=sys.argv[1];D=S/'data'/name
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((D/'manifest.json').read_text(encoding='utf8'));counts=collections.Counter();rare=collections.Counter();models=set();workers=set()
for split in ['train','val']:
    with gzip.open(D/f'{split}.jsonl.gz','rt',encoding='utf8') as f:
        for line in f:
            s=json.loads(line);counts[(split,s['mapName'],s['playerId'])]+=1;models.add(s.get('behaviorModelSha256'))
            types={x.split(':')[0] for x in s['actionCodes']}
            if split=='train' and s['candidateSemantics'][s['targetActionIndex']][13]>.5:
                rare['end_turn_target']+=1
                if types<=set(['surrender','end_turn','recruit_to_castle','recruit_and_deploy']):rare['end_turn_no_unit_actions']+=1
for file in m.get('rawFiles',{}):
    p=S/'data/raw'/file.replace('.jsonl.gz','.json');r=json.loads(p.read_text(encoding='utf8'));workers.add(r['workerBundleSha256'])
out={'dataset':name,'datasetManifestSha256':sha(D/'manifest.json'),'sharedIdentityForEverySample':{'freezeManifestSha256':sha(S/'identity/manifest.json'),'encoderSchemaId':'spatial34_global20_actionSemantics53_v19','workerBundleSha256':sorted(workers),'note':'逐样本state/input/teacher RNG已内嵌；共同规则、编码和采集器身份由此共享侧车绑定，不改写锁定样本。'},'counts':[{'split':k[0],'map':k[1],'playerId':k[2],'samples':v} for k,v in counts.items()],'rareSlices':dict(rare),'behaviorModelHashes':sorted(models,key=lambda x:x or '')}
(D/'provenance.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(out,ensure_ascii=False))
