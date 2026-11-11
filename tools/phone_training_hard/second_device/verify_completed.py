"""核对采集文件身份、摘要、gzip和记录闭合；不调用游戏引擎或执行严格重放。"""
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import struct

FILES = {'config.bin','initial.bin','final.bin','actions.jsonl.gz','states.bin.gz','result.json'}


def digest(path):
    with Path(path).open('rb') as source:
        return hashlib.file_digest(source,'sha256').hexdigest()


def verify(directory, row, worker, job, segment_sha, source_sha):
    directory=Path(directory)
    manifest=json.loads((directory/'artifact-manifest.json').read_text(encoding='utf-8'))
    result=json.loads((directory/'result.json').read_text(encoding='utf-8'))
    exited=json.loads((directory/'THREAD_EXITED.json').read_text(encoding='utf-8'))
    state=json.loads((directory/'STATE.json').read_text(encoding='utf-8'))
    seq,parent,attempt,epoch=row
    for value in (manifest,result,exited,state):
        assert value['parentId']==parent and value['attemptId']==attempt,'父局或尝试身份不符'
    for value in (manifest,result,state):
        assert value['package']==worker['package'] and value['workerId']==worker['workerId'],'worker身份不符'
        assert value['sourceApkSha256']==source_sha and value['installedApkSha256']==worker['sha256'],'APK来源不符'
        assert value['planSha256']==segment_sha,'冻结计划不符'
        assert value['populationLimit']==30,'人口上限不符'
    assert manifest['naturalEnd'] is True and result['naturalEnd'] is True and state['naturalEnd'] is True,'并非自然终局'
    assert state['standalonePhase']=='complete' and state['workerCleanupComplete'] is True,'状态未完成收尾'
    assert result['truncationReason'] is None and result['originalBCall'] is True,'动作来源或截断状态不符'
    assert result['map']==job['map'] and result['seed']==job['seed'],'地图或原生seed不符'
    assert result['requestedPlayerType']==3 and result['jsRngMode']=='original_webview_rng' and result['jsSeedControlled'] is False,'困难入口或随机合同不符'
    assert exited['standalonePhase']=='thread_exited','线程退出证据缺失'
    entries=manifest['files']
    assert len(entries)==6 and {v['name'] for v in entries}==FILES,'文件清单不完整或重复'
    for entry in entries:
        path=directory/entry['name']
        assert path.is_file() and path.stat().st_size==entry['bytes'],'文件长度不符：'+entry['name']
        assert digest(path)==entry['sha256'],'文件摘要不符：'+entry['name']
    paths=Counter();actions=0
    with gzip.open(directory/'actions.jsonl.gz','rt',encoding='utf-8') as stream:
        for line in stream:
            assert line.strip(),'动作流出现空记录'
            value=json.loads(line)
            assert value['parentId']==parent and value['attemptId']==attempt and value['index']==actions,'动作记录身份或索引不连续'
            assert value['path'] in {'hard_js_primary','hard_java_fallback'},'动作策略路径未知'
            paths[value['path']]+=1;actions+=1
    frames=0
    with gzip.open(directory/'states.bin.gz','rb') as stream:
        while header:=stream.read(4):
            assert len(header)==4,'状态帧头不完整'
            length=struct.unpack('>i',header)[0]
            assert 0<length<=64*1024*1024,'状态帧长度无效'
            left=length
            while left:
                block=stream.read(min(left,1024*1024))
                assert block,'状态帧截断'
                left-=len(block)
            frames+=1
    assert 0<actions<=20000 and actions==frames==result['actions']==state['committedActions'],'动作数、状态帧数或结果计数不符'
    assert dict(paths)=={k:v for k,v in result['pathCounts'].items() if v},'决策路径计数不符'
    return {'sequenceIndex':int(seq),'parentId':parent,'attemptId':attempt,'completedEpoch':int(epoch),
            'package':worker['package'],'workerId':worker['workerId'],'directory':str(directory.resolve()),
            'map':job['map'],'seed':job['seed'],'actions':actions,'stateFrames':frames,'seconds':result['elapsedSeconds'],
            'pathCounts':result['pathCounts'],'manifestSha256':digest(directory/'artifact-manifest.json'),
            'bytes':sum(v['bytes'] for v in entries),'transferHashesVerified':True,'gzipAndRecordCountsVerified':True,
            'nativeReplayVerified':False,'projectStrictVerified':False,'automaticTrainingAdmission':False}
