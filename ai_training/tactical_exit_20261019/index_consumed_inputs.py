"""只提取已消费评测的前态身份，包含已strict的用户中断前缀。"""
from pathlib import Path
import gzip,hashlib,json,shutil,sys
HERE=Path(__file__).resolve().parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
    return h.hexdigest()
def evaluation_logs():
    logs=[]
    for base in sorted(HERE.glob('*battles/slots/*')):
        if (base/'result.json').exists():
            r=read(base/'result.json');s=read(base/'strict-replay.json');assert s['passed'] and s['actions']==r['actions']
            file=base/'actions.jsonl.gz';logs.append(dict(path=file.relative_to(HERE).as_posix(),sha256=sha(file),actions=r['actions']))
        elif (base/'strict-prefix-replay.json').exists():
            s=read(base/'strict-prefix-replay.json');raw=base/'actions.jsonl';assert s['passed'] and s['classification']=='user_interrupted_prefix' and sha(raw)==s['rawLogSha256']
            file=base/'actions.strict-prefix.jsonl.gz'
            if not file.exists():
                with raw.open('rb') as inp,file.open('xb') as out,gzip.GzipFile(filename='',fileobj=out,mode='wb',mtime=0) as gz:shutil.copyfileobj(inp,gz)
            with gzip.open(file,'rb') as inp:
                h=hashlib.sha256()
                for chunk in iter(lambda:inp.read(1048576),b''):h.update(chunk)
                assert h.hexdigest()==s['rawLogSha256']
            logs.append(dict(path=file.relative_to(HERE).as_posix(),sha256=sha(file),actions=s['actions'],interruptedPrefix=True,strictReceiptSha256=sha(base/'strict-prefix-replay.json')))
    assert logs
    return logs
if __name__=='__main__':
    tag=sys.argv[1];target=HERE/'search-scale'/f'evaluation-index-{tag}.json';assert not target.exists()
    logs=evaluation_logs();hashes=set();actions=0;partial=0
    for entry in logs:
        count=0
        with gzip.open(HERE/entry['path'],'rt',encoding='utf-8') as f:
            for line in f:hashes.add(json.loads(line)['beforeHash']);count+=1
        assert count==entry['actions'];actions+=count;partial+=int(entry.get('interruptedPrefix',False))
    file=target.with_name(f'evaluation-hashes-{tag}.txt.gz')
    with file.open('xb') as out,gzip.GzipFile(filename='',fileobj=out,mode='wb',mtime=0) as gz:gz.write(('\n'.join(sorted(hashes))+'\n').encode())
    report=dict(passed=True,tag=tag,uniqueStates=len(hashes),actions=actions,logs=logs,interruptedPrefixes=partial,hashFileSha256=sha(file),inputIdentityOnly=True,protocolSha256=sha(HERE/'search_scale_protocol.json'),indexerSha256=sha(Path(__file__)),scope='只按已消费前态排重，不把评测动作或胜负当监督；保留重复副本出处，状态集合去重')
    with target.open('x',encoding='utf-8') as out:json.dump(report,out,ensure_ascii=False)
    print(json.dumps({k:v for k,v in report.items() if k!='logs'},ensure_ascii=False))
