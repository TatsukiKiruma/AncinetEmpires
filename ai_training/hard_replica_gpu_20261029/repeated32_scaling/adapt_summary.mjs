import fs from 'node:fs';
const file=new URL('./summarize.py',import.meta.url);let s=fs.readFileSync(file,'utf8');
s=s.replace("assert len(r)==n and run['limit']==run['workers']==p['maxActive']==n", "assert len(r)==n and run['limit']==run['workers']==p['maxActive']==n and run['repeatFirst']==32\n    assert all(x['natural'] and not x['error'] for x in r) and sum(x['steps'] for x in r)==44310*(n//32)");
const start=s.indexOf("for a,b,count in "),end=s.indexOf("(P/'IDENTITY_CHECKS.json')",start);
s=s.slice(0,start)+`for n in [32,64,128]:
    for index in range(n):
        seq=2001+index;source=2001+index%32
        left=P/'batch-32'/f'parent-{source}/attempt-1';right=P/f'batch-{n}'/f'parent-{seq}/attempt-1'
        job=read(right/'job.json');original=read(left/'job.json')
        assert job['benchmarkSourceSequence']==source and job['benchmarkReplica']==index//32+1
        for key in ['benchmarkSourceSequence','benchmarkReplica','executionSequence']:job.pop(key);original.pop(key)
        assert job==original
        hashes={}
        for name in ['initial.json','final.json','decisions.jsonl.gz']:
            h=sha(left/name);assert h==sha(right/name),(n,seq,name);hashes[name]=h
        lr=read(left/'result.json');rr=read(right/'result.json')
        for key in ['steps','stop','winner','finalSha256','telemetry']:assert lr[key]==rr[key]
        checks.append(dict(workers=n,sequence=seq,source=source,hashes=hashes))
for seq in range(2001,2033):
    for name in ['initial.json','final.json','decisions.jsonl.gz']:
        assert sha(P/'batch-32'/f'parent-{seq}/attempt-1'/name)==sha(P/'../cpu_v5/candidate_full'/f'parent-{seq}/attempt-1'/name)
`+s.slice(end);
s=s.replace("cols=[]", "cols=[]\nbase=results[0]['totalSeconds']");
s=s.replace("text='''# 当前优化版", "add('相对32并发总耗时倍数',lambda r:round(r['totalSeconds']/base,3));add('相对吞吐倍率',lambda r:round((r['workers']/32)*base/r['totalSeconds'],3));add('每32局等效秒',lambda r:round(r['totalSeconds']/(r['workers']/32),2))\ntext='''# 同一32局重复1／2／4份：");
s=s.replace('各组分别取2001起的前32／64／128个job，保留原job异常保护。','各组均取2001—2032号相同32个job，分别重复1／2／4份，全部副本同时派发。每个副本保留原父局标识、地图、初态、种子和原异常保护，只分配独立测试编号及输出目录。');
s=s.replace('各组对局数量与场景集合不同，完整尾部长度也不同，不能把墙钟比值当固定工作量的纯并发加速比。动作／秒及自然局／小时辅助比较，但仍受场景组成、保护截断和机器后台负载影响。','各组场景组成、难度与随机流完全相同，总工作量是1／2／4倍。总耗时倍率衡量增加并发后的整批延迟；相对吞吐倍率=(并发数/32)×T32/T组，1代表吞吐不变。每32局等效秒为整批时间除以副本份数，不是单个对局的延迟。三档各运行一次，机器后台负载仍会影响结果。');
s=s.replace('128份跨组共有记录（含32局与cpu_v5最终结果）核对job、初态、终态、完整压缩日志SHA一致','224个副本逐份核对实际job输入（剔除独立测试编号与副本标记）、初态、终态、完整压缩日志SHA一致；基准32局另与cpu_v5最终结果核对');
fs.writeFileSync(file,s);
