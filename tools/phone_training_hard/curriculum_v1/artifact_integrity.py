# 只检查文件、身份与状态帧；不执行游戏动作。
from collections import Counter
import gzip
import hashlib
import json
import struct

def json_bytes(b):return json.loads(b.decode('utf-8'))

def verify(directory,job):
    manifest=json_bytes((directory/'artifact-manifest.json').read_bytes())
    result=json_bytes((directory/'result.json').read_bytes());receipt=json_bytes((directory/'initial-state-receipt.json').read_bytes())
    assert result['parentId']==job['parentId'] and receipt['verified'] and result['naturalEnd']
    assert result['populationLimit']==job['setup']['unitLimit']
    assert receipt['requestedInitialStateSha256']==job['initialStateSha256']
    for f in manifest['files']:
        data=(directory/f['name']).read_bytes();assert len(data)==f['bytes'] and hashlib.sha256(data).hexdigest()==f['sha256']
    initial=receipt['actual']
    # 早期回执把空的招募列表表示成0；规范化表示后再统计轨迹，原文件保持不变。
    if 'n' in initial.get('playerArrays',{}):initial['playerArrays']['n']=[None if v==0 else v for v in initial['playerArrays']['n']]
    digest=hashlib.sha256(json.dumps(initial,sort_keys=True,separators=(',',':')).encode())
    actions=0;skills=Counter()
    with gzip.open(directory/'actions.jsonl.gz','rt',encoding='utf-8') as stream:
        for line in stream:
            value=json.loads(line);assert value['index']==actions and value['parentId']==job['parentId'] and value['attemptId']==result['attemptId']
            digest.update(json.dumps(value['fields'],sort_keys=True,separators=(',',':')).encode()+b'\n')
            skills[value['fields']['j']]+=1;actions+=1
    frames=0
    with gzip.open(directory/'states.bin.gz','rb') as stream:
        while True:
            prefix=stream.read(4)
            if not prefix:break
            assert len(prefix)==4;length=struct.unpack('>i',prefix)[0];assert 0<length<64000000
            assert len(stream.read(length))==length;frames+=1
    assert frames==actions==result['actions']
    assert sum(result['pathCounts'].values())==actions
    assert json_bytes((directory/'THREAD_EXITED.json').read_bytes())['attemptId']==result['attemptId']
    return {'executionSequence':job['executionSequence'],'parentId':job['parentId'],'attemptId':result['attemptId'],'category':job['category'],'profile':job['profile'],'players':job['actualPlayerCount'],'map':job['map'],'actions':actions,'frames':frames,'bytes':sum(p.stat().st_size for p in directory.iterdir() if p.is_file()),'effectiveSeconds':result['effectiveSeconds'],'paths':result['pathCounts'],'initialCounts':receipt['counts'],'initialPopulations':receipt['populations'],'observedPlayers':result['observedPlayers'],'skillEventCounts':dict(skills),'trajectorySha256':digest.hexdigest(),'replay':'disabled_by_user'}
