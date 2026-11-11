import pathlib, subprocess, json, time, hashlib, shutil, sys, traceback, re, datetime
from device import ROOT, REMOTE, adb, snapshot, suitable, run

REPO = ROOT.parent.parent
BATTLE = ROOT.parent/'sd64x3_phone_battles_20261016'
PYTORCH = 'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read(n): return json.loads((ROOT/n).read_text(encoding='utf-8'))
STARTUP_BINDINGS={name:sha(ROOT/name) for name in ['pipeline.py','device.py']}
def status(phase, **fields):
    assert all(sha(ROOT/name)==h for name,h in STARTUP_BINDINGS.items()), '运行中的控制器源码发生变化'
    value = dict(startupBindings=STARTUP_BINDINGS,phase=phase, at=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(), pid=__import__('os').getpid(), **fields)
    (ROOT/'stage-status.json').write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(value,ensure_ascii=True),flush=True)
def call(args, tag):
    name = tag+'.log';attempt=1
    while (ROOT/name).exists(): attempt+=1;name=f'{tag}.attempt{attempt}.log'
    with (ROOT/name).open('w',encoding='utf-8') as out:
        result=subprocess.run([str(x) for x in args],cwd=REPO,stdout=out,stderr=subprocess.STDOUT)
    if result.returncode: raise RuntimeError(f'{tag}失败，exit={result.returncode}，见{name}')
def guard():
    size=sum(p.stat().st_size for d in [ROOT,BATTLE] for p in d.rglob('*') if p.is_file())
    assert size<512*1024**2 and shutil.disk_usage(ROOT).free>=12*1024**3,(size,shutil.disk_usage(ROOT).free)

def recover(attempt, error):
    # 只认本阶段PID；仍有活动训练器时不再启动第二个优化器。
    for path in ROOT.glob('train-epoch-*.live.json'):
        record=json.loads(path.read_text(encoding='utf-8'))
        cmd=adb('shell','cat',f'/proc/{record["pid"]}/cmdline',check=False)
        if REMOTE+'/trainer' in cmd: raise RuntimeError('原训练PID仍活动，拒绝重复启动')
    if adb('shell',f'if [ -e {REMOTE}/pause ]; then echo PAUSED; fi',check=False): raise RuntimeError('检测到暂停文件，保留暂停状态')
    saved=adb('shell','cat',REMOTE+'/resume.json')
    state=json.loads(saved)
    assert state['configSha256']==sha(ROOT/'config.json') and state['contractSha256']==sha(ROOT/'GATE.json')
    assert state['done'] or (state['rows']%8==0 and state['updates']==state['rows']//8)
    folder=ROOT/'recovery';folder.mkdir(exist_ok=True)
    (folder/f'checkpoint-attempt-{attempt}.json').write_text(saved,encoding='utf-8')
    event=dict(at=time.time(),attempt=attempt,error=str(error),epoch=state['epoch'],rows=state['rows'],updates=state['updates'],checkpointSha256=hashlib.sha256(saved.encode()).hexdigest(),mustResume=True,reset=False)
    with (ROOT/'recovery-events.jsonl').open('a',encoding='utf-8') as out: out.write(json.dumps(event)+'\n')
    status('等待资源后从原检查点恢复',**event)
    while not suitable(snapshot()): time.sleep(10)

def trained_check():
    call([PYTORCH,ROOT/'prepare_trained_reference.py'],'trained-python')
    best=read('candidate.json')['bestEpoch'];weights=f'epoch-{best}.json' if best else ''
    suffix=f' -weights {weights}' if weights else ''
    checked=run(f'env GOMAXPROCS=1 GOMEMLIMIT=384MiB {REMOTE}/trainer -root {REMOTE} -mode verify -output-prefix trained-phone{suffix}','trained-phone-verification')
    assert checked['exitCode']==0
    for name in ['reference.jsonl.gz','gradient.json','batch-gradient.json','format-check.json','verify-metrics.json']:
        name='trained-phone-'+name
        adb('pull',REMOTE+'/'+name,str(ROOT/name),timeout=120)
        assert sha(ROOT/name)==adb('shell','sha256sum',REMOTE+'/'+name).split()[0]
    command=[ROOT/'evaluate-windows.exe','-root',ROOT,'-mode','verify','-output-prefix','trained-host']
    if weights:command+=['-weights',weights]
    call(command,'trained-host-verification')
    call([PYTORCH,ROOT/'compare_trained.py'],'trained-device-comparison')
    call(['node',ROOT/'trained_browser_runner.mjs'],'trained-chrome')

def finish():
    summary=json.loads((BATTLE/'summary.json').read_text(encoding='utf-8'))
    result=read('RESULT.json');c=summary['classifications'];metrics=result['metrics']
    comparison=['# 同一五图十槽开发面板比较','', '| 模型 | 参数 | 自然胜 | 自然负 | 动作截断 | 其他类别（含自然和） |','|---|---:|---:|---:|---:|---:|', '| 旧300父局H8 | 3566 | 0 | 10 | 0 | 0 |','| 旧900父局H32 | 20646 | 0 | 7 | 3 | 0 |',f'| 新900父局64×3＋战术 | 64582 | {c["natural_win"]} | {c["natural_loss"]} | {c["action_truncation"]} | {10-c["natural_win"]-c["natural_loss"]-c["action_truncation"]} |','',f'旧900模型开发验证loss 1.779186、top1 51.78%；新模型loss {metrics["validation"]["policyLoss"]:.6f}、top1 {metrics["validation"]["top1"]*100:.2f}%。两轮900使用同一冻结720/180父局划分；旧300划分不同。','', '同地图、同先后手顺序、同seed、同预算；失败槽保留且不补赛。规则增加定向候选生成接口以降低战术成本，完整候选与结算等价检查通过；源码SHA变化单列，不合并为总体胜率。已消费的标准初态和轨迹不构成独立最终泛化；loss/top1或动作变长不能代替棋力结论。','', '旧300/900模型已按用户授权删除；比较使用保留战报，未重建、加载或重跑旧权重。']
    (BATTLE/'COMPARISON.md').write_text('\n'.join(comparison)+'\n',encoding='utf-8')
    artifacts=[dict(path=str(p.relative_to(BATTLE)).replace('\\','/'),bytes=p.stat().st_size,sha256=sha(p)) for p in sorted(BATTLE.rglob('*')) if p.is_file() and p.name!='DELIVERY_MANIFEST.json']
    (BATTLE/'DELIVERY_MANIFEST.json').write_text(json.dumps(dict(sealedAt=time.time(),artifacts=artifacts),indent=2),encoding='utf-8')
    current=ROOT.parent/'status/CURRENT.md';text=current.read_text(encoding='utf-8')
    marker='<!-- sd64x3-phone-20261016 -->';end='<!-- end-sd64x3-phone-20261016 -->'
    section=f'''{marker}
## 2026-10-16任务：64维三层战术特征900父局阶段完成

见[训练报告](../sd64x3_phone_20261016/REPORT.md)、[结果](../sd64x3_phone_20261016/RESULT.json)、[十槽战报](../sd64x3_phone_battles_20261016/REPORT.md)与[同面板比较](../sd64x3_phone_battles_20261016/COMPARISON.md)。实体64维，策略三个各64维隐藏层、无残差，共64582参数；仅c2357770手机更新{result['epochs']}轮，最佳第{result['bestEpoch']}轮。900父局720/180固定划分，完整312413条合格原子；每轮249317条、31165次更新，末批5。PC更新0，value冻结不用。

最佳开发验证loss {metrics['validation']['policyLoss']:.6f}、top1 {metrics['validation']['top1']*100:.2f}%；十槽自然胜{c['natural_win']}、自然负{c['natural_loss']}、自然和{c['natural_draw']}、投降{c['surrender']}、循环{c['loop']}、动作截断{c['action_truncation']}、时间截断{c['wall_truncation']}、决策超时{c['decision_timeout']}、错误{c['error']}、中断{c['interrupted']}。权威引擎逐动作重放及双策略复算通过。全部数值/梯度、完整候选、batch8/末批5与最佳权重的Python/TS/真实Chrome/手机验收见交付清单。

这是已消费开发材料与标准开局，不称独立最终泛化。旧模型删除审计目录model_deletion_20261016_64x2名称保留，既存旧数据/源码/schema/战报SHA保全。阶段结束，不进行1922/3000全量、晋升或应用接入。
{end}'''
    if marker in text:text=re.sub(re.escape(marker)+'.*?'+re.escape(end),lambda _:section,text,flags=re.S)
    else:text=text.replace('# 当前接手状态','# 当前接手状态\n\n'+section,1)
    current.write_text(text,encoding='utf-8')
    guard();status('本阶段完成并停止',bestEpoch=result['bestEpoch'],classifications=c,optimizerUpdatesOnPC=0)

def main():
    status('战术侧车转换中，尚未启动训练',optimizerUpdatesOnPC=0)
    while True:
        guard()
        errors={p.name:p.read_text(encoding='utf-8') for p in ROOT.glob('convert-*.err') if p.stat().st_size}
        if errors:raise RuntimeError('转换进程错误：'+json.dumps(errors))
        receipts=[json.loads(p.read_text(encoding='utf-8')) for p in (ROOT/'tactics').glob('*.json')]
        if len(receipts)==900 and (ROOT/'conversion-exit.json').exists():break
        status('战术侧车转换中，尚未启动训练',completeParents=len(receipts),completeRows=sum(r['rows'] for r in receipts),optimizerUpdatesOnPC=0)
        time.sleep(30)
    assert all(r['code']==0 for r in read('conversion-exit.json'))
    status('转换完成，复验合同并冻结训练闸门')
    call([ROOT/'evaluate-windows.exe','-root',ROOT,'-mode','verify','-output-prefix','host'],'host-final-verify')
    call([PYTORCH,ROOT/'compare_phone.py','host'],'host-final-compare')
    call([PYTORCH,ROOT/'compare_phone.py','phone'],'phone-final-compare')
    call([PYTORCH,ROOT/'compare_contract.py'],'batch-final-compare')
    call([sys.executable,ROOT/'prepare_package.py'],'package-final')
    status('仅手机训练与逐轮开发验证')
    for attempt in range(1,4):
        try:
            call([sys.executable,ROOT/'run_900.py'],f'run-900-attempt-{attempt}')
            break
        except BaseException as error:
            if attempt==3:raise
            recover(attempt,error)
    status('最佳模型只读复验')
    trained_check()
    call([sys.executable,ROOT/'seal_training.py'],'seal-training')
    status('固定五图十槽开发对战，无补赛')
    for script in ['prepare.ts','preflight.ts','run.ts','replay.ts','report.ts']:
        call(['node','--import','tsx',BATTLE/script],'battle-'+script.replace('.ts',''))
    finish()

if __name__=='__main__':
    try:main()
    except BaseException as error:
        (ROOT/'pipeline-failure.json').write_text(json.dumps(dict(at=time.time(),error=str(error),traceback=traceback.format_exc(),reset=False,fullTrainingStarted=False),indent=2),encoding='utf-8')
        status('发生错误，保留全部证据与检查点',error=str(error),reset=False)
        raise
