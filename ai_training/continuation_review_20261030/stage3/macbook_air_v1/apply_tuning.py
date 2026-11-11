"""冻结平衡配置并按唯一已核验旧合同断点接续，禁止重置日程或晋升工程模型。"""
import json
from pathlib import Path
import shlex
import shutil
import tarfile
import time
from device import HERE,DATA,REMOTE,ssh,scp,save
from prepare_inputs import PAYLOAD,read,sha

def main():
    pause=read(HERE/'TUNING_PAUSE.json');bench=read(HERE/'TUNING_BENCHMARK.json');chosen=bench['chosen'];tag=pause['tag']
    assert bench['passed'] and bench['sourceCheckpointSha256']==pause['latest']['sha256']
    assert chosen['averageWholeCpuPercent']<=55 and chosen['p95WholeCpuPercent']<=70
    assert sha(PAYLOAD/'MAC_CONTRACT.json')==pause['sourceContractSha256']
    backup=DATA/'revisions'/tag;backup.mkdir(parents=True,exist_ok=False)
    for name in ['MAC_RUNTIME.json','MAC_CONTRACT.json','train_mac.py']:shutil.copy2(PAYLOAD/name,backup/name)
    controller_source=DATA/'runtime-scripts/controller.py';shutil.copy2(controller_source,backup/'controller.py')
    remote_backup=REMOTE+'/revisions/'+tag
    ssh('cd '+REMOTE+' && test -f work/STOP && mkdir '+remote_backup+'/training && cp work/training/last.bin work/training/last.json work/training/RESULT.json work/training/LATEST.json '+remote_backup+'/training/')
    runtime=read(PAYLOAD/'MAC_RUNTIME.json');runtime.update(cpuThreads=chosen['threads'],encoderProcesses=chosen['workers'],
        profile='balanced-workers-v3',tuningSourceUpdate=pause['latest']['updates'],
        performancePreference='保持CPU余量，工程平均≤55%、P95≤70%，不追求满载')
    save(PAYLOAD/'MAC_RUNTIME.json',runtime)
    (PAYLOAD/'encoder_pool.py').write_text((HERE/'encoder_pool.py').read_text('utf-8'),'utf-8',newline='\n')
    source=(PAYLOAD/'train_mac.py').read_text('utf-8')
    old="if pointer and saved['contractSha256']!=contract:raise ValueError('本地续接合同变化')"
    assert old in source
    transition="""if pointer and saved['contractSha256']!=contract:
        transition=read(WORK/'MAC_CONTRACT.json').get('resumeTransition',{})
        if not(transition.get('sourceCheckpointSha256')==expected and transition.get('fromContractSha256')==saved['contractSha256'] and transition.get('sourceUpdate')==saved['updates']):
            raise ValueError('当前断点不在唯一已授权配置衔接合同内')"""
    source=source.replace(old,transition)
    source=source.replace('from sampler_mobile import MobileSampler','from sampler_mobile import MobileSampler\nfrom encoder_pool import EncoderPool')
    assert 'encoder=Encoder(OUT)' in source
    source=source.replace('encoder=Encoder(OUT)',"encoder=EncoderPool(OUT,runtime['encoderProcesses'])")
    (PAYLOAD/'train_mac.py').write_text(source,'utf-8',newline='\n')
    source=controller_source.read_text('utf-8')
    old="environment=dict(os.environ,OMNI_WORK=str(WORK),OMP_NUM_THREADS='4',OPENBLAS_NUM_THREADS='1',VECLIB_MAXIMUM_THREADS='4',"
    assert old in source
    source=source.replace(old,"native_threads=str(read(WORK/'MAC_RUNTIME.json')['cpuThreads'])\n        environment=dict(os.environ,OMNI_WORK=str(WORK),OMP_NUM_THREADS=native_threads,OPENBLAS_NUM_THREADS='1',VECLIB_MAXIMUM_THREADS=native_threads,")
    controller_source.write_text(source,'utf-8',newline='\n')
    selection=dict(chosen=chosen,sourceUpdate=pause['latest']['updates'],sourceCheckpointSha256=pause['latest']['sha256'],
        engineeringResultSha256=sha(HERE/'TUNING_BENCHMARK.json'),choiceRule=bench['choiceRule'],formalUpdatesInBenchmark=0,
        orderedInputsExact=True,originalScienceConfigUnchanged=True)
    save(PAYLOAD/'TUNING_SELECTION.json',selection)
    contract=read(PAYLOAD/'MAC_CONTRACT.json');contract['schema']='mac4500-omni-contract-balanced-v3'
    for name in ['MAC_RUNTIME.json','train_mac.py','encoder_pool.py','TUNING_SELECTION.json']:contract['files'][name]=sha(PAYLOAD/name)
    contract['files'][REMOTE+'/controller.py']=sha(controller_source)
    contract['resumeTransition']=dict(sourceCheckpointSha256=pause['latest']['sha256'],fromContractSha256=pause['sourceContractSha256'],sourceUpdate=pause['latest']['updates'])
    save(PAYLOAD/'MAC_CONTRACT.json',contract)
    archive=DATA/tag/'production-balanced-v3.tar'
    with tarfile.open(archive,'w',format=tarfile.GNU_FORMAT) as tar:
        for name in ['MAC_RUNTIME.json','train_mac.py','encoder_pool.py','TUNING_SELECTION.json','MAC_CONTRACT.json']:tar.add(PAYLOAD/name,arcname='work/'+name)
        tar.add(controller_source,arcname='controller.py')
    scp(archive,REMOTE+'/production-balanced-v3.tar')
    assert ssh('shasum -a256 '+REMOTE+'/production-balanced-v3.tar').split()[0]==sha(archive)
    assert ssh('shasum -a256 '+REMOTE+'/work/MAC_CONTRACT.json').split()[0]==pause['sourceContractSha256']
    output=ssh('cd '+REMOTE+' && test -f work/STOP && tar --no-same-owner -xf production-balanced-v3.tar && cd work && ../runtime/venv/bin/python -m compileall -q train_mac.py encoder_pool.py && ../runtime/venv/bin/python -c '+shlex.quote('from mac_core import validate;print(validate())'))
    assert output.splitlines()[-1]==sha(PAYLOAD/'MAC_CONTRACT.json')
    # 本轮暂停标记在归档后解除，随后只执行一个真实更新作跨版本完整衔接验证。
    ssh('cd '+REMOTE+' && mv work/STOP '+remote_backup+'/STOP-before-tuning')
    log=REMOTE+'/logs/tuned-handoff-pilot.log'
    command='cd '+REMOTE+'/work && OMP_NUM_THREADS='+str(chosen['threads'])+' VECLIB_MAXIMUM_THREADS='+str(chosen['threads'])+' OPENBLAS_NUM_THREADS=1 ../runtime/venv/bin/python -u train_mac.py --handoff-probe 1 > '+log+' 2>&1; code=$?; tail -12 '+log+'; exit $code'
    ssh(command,timeout=300)
    pilot=json.loads(ssh('cat '+REMOTE+'/work/training/RESULT.json'))
    assert pilot['updates']==pause['latest']['updates']+1 and pilot['stopReason']=='handoff_probe'
    save(HERE/'TUNED_FORMAL_PILOT.json',pilot)
    launch=read(HERE/'LAUNCH_AGENT.json');ssh('launchctl kickstart '+launch['domain']+'/'+launch['label'])
    time.sleep(3)
    proof=dict(passed=True,sourceUpdate=pause['latest']['updates'],sourceCheckpointSha256=pause['latest']['sha256'],
        newContractSha256=sha(PAYLOAD/'MAC_CONTRACT.json'),chosen=chosen,pilotUpdate=pilot['updates'],
        pilotCheckpoint=pilot['lastCheckpoint'],oldSourcesAndStopPreserved=remote_backup,learningRateAndPriorScheduleNotReset=True)
    save(HERE/'TUNING_APPLIED.json',proof);save(DATA/'TUNING_APPLIED.json',proof)
    print(json.dumps(proof),flush=True)

if __name__=='__main__':main()
