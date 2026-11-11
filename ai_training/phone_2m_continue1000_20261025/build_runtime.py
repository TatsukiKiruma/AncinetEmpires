"""从已运行通过的两worker实现生成新段；保护完整恢复和1000局新增预算。"""
import hashlib
import json
from pathlib import Path
from device import HERE, write

OLD=HERE.parent/'phone_2m_continue900_20261024'


def replace(text,old,new):
    assert text.count(old)==1,(old,text.count(old))
    return text.replace(old,new)


text=(OLD/'train_continue.py').read_text(encoding='utf-8')
text=replace(text,'"""小米8两worker同步续训：继承100局完整状态，只追加900父局一遍。"""','"""小米8两worker同步续训：继承1000局完整状态，只追加第1001—2000局一遍。"""')
text=replace(text,"WORK=Path('/continue900')","WORK=Path('/continue2000')")
text=replace(text,"auth['authorizedParents']!=900","auth['authorizedParents']!=1000")
text=replace(text,"    OUT.mkdir(exist_ok=True)","    if base.sha(Path(protocol['nodeRuntime']))!=protocol['nodeRuntimeSha256']:raise RuntimeError('复用的手机Node运行时摘要不符')\n    OUT.mkdir(exist_ok=True)")
start=text.index('    repair=None\n');end=text.index("    model.load_state_dict(saved['model'])",start)
text=text[:start]+"    if args.resume and saved['identity']!=auth['files']:raise RuntimeError('本段恢复源码身份不一致')\n"+text[end:]
text=replace(text,"    if not args.resume and (step!=9139 or saved['cursor']!=73112):raise RuntimeError('必须从100局主检查点续训')",
    "    if not args.resume and (step!=plan['baseStep'] or saved['cursor']!=plan['baseSegmentSamples'] or saved['cumulativeSamples']!=plan['baseSamples']\n"
    "        or saved['completedParentsBeforeSegment']+saved['completedParents']!=plan['previousParents']\n"
    "        or saved['identity']!=plan['baseCheckpointIdentity'] or saved['parentOrder']!=plan['baseParentOrder']):raise RuntimeError('必须完整继承已完成1000局的主检查点')")
text=replace(text,"worker_rng=saved.get('workerRngStates') if args.resume else None","worker_rng=saved.get('workerRngStates')\n    if not worker_rng or len(worker_rng)!=2:raise RuntimeError('缺少两个训练worker的完整随机状态')")
text=replace(text,",'registeredEncodingRepair':repair is not None",",'inheritedParents':plan['previousParents'],'workerRngStatesInherited':True")
text=replace(text,"'parents':900,'cumulativeCompletedParents':100+done","'parents':plan['parents'],'cumulativeCompletedParents':plan['previousParents']+done")
text=replace(text,"'completedParentsBeforeSegment':100,","'completedParentsBeforeSegment':plan['previousParents'],")
text=text.replace('automaticBeyond1000','automaticBeyond2000')
text=replace(text,'输入超过900局授权预算','输入超过第1001—2000局授权预算')
text=replace(text,"checkpoint('authorized_900_parents_complete')","checkpoint('authorized_1000_parents_complete')")
text=replace(text,"'parents':900,'cumulativeParents':1000","'parents':1000,'cumulativeParents':2000")
(HERE/'train_continue.py').write_text(text,encoding='utf-8',newline='\n')
stream=(OLD/'streaming.py').read_text(encoding='utf-8').replace("WORK=Path('/continue900')","WORK=Path('/continue2000')")
stream=replace(stream,"str(WORK/'node/bin/node')","'/continue900/node/bin/node'")
(HERE/'streaming.py').write_text(stream,encoding='utf-8',newline='\n')
encoder=(OLD/'encoder_stream.ts').read_text(encoding='utf-8').replace("||'/continue900'","||'/continue2000'")
(HERE/'encoder_stream.ts').write_text(encoder,encoding='utf-8',newline='\n')
controller=(OLD/'controller.sh').read_text(encoding='utf-8').replace('aeii-2m-continue900-20261024','aeii-2m-continue1000-20261025').replace('/continue900','/continue2000')
controller=controller.replace('追加900局','追加第1001—2000局').replace('达到1000局','达到2000局').replace('automaticBeyond1000','automaticBeyond2000')
(HERE/'controller.sh').write_text(controller,encoding='utf-8',newline='\n')
monitor=(OLD/'resource_monitor.sh').read_text(encoding='utf-8').replace('aeii-2m-continue900-20261024','aeii-2m-continue1000-20261025')
(HERE/'resource_monitor.sh').write_text(monitor,encoding='utf-8',newline='\n')
write(HERE/'RUNTIME_DERIVATION.json',{'sourceDirectory':str(OLD),'baseTrainingSourceSha256':hashlib.sha256((OLD/'train_continue.py').read_bytes()).hexdigest(),
    'changes':['独立任务目录及新增1000父局预算','继承1000局完整状态、两个worker随机状态和冻结顺序','AdamW、学习率参考日程及全部模型参数保持','受控第10步恢复一次，2000局后停止'],
    'strictReplayExecuted':False,'hostOptimizerUpdates':0})
print(json.dumps({'runtimePrepared':True,'inheritedWorkerRng':True,'stopAfterCumulativeParents':2000}))
