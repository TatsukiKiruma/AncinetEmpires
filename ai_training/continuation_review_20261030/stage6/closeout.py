"""只有真实执行收据及独立零进程审计齐全后，生成第六阶段最终报告。"""
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3

HERE=Path(__file__).resolve().parent
DATA=Path('D:/AncientEmpiresData/continuation_stage6_20261106_v1')

def read(name):return json.loads((HERE/name).read_text(encoding='utf-8-sig'))
def digest(file):
    with file.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def save(name,value):
    with (HERE/name).open('x',encoding='utf-8') as stream:json.dump(value,stream,ensure_ascii=False,indent=2)

def main():
    preflight=read('PREFLIGHT_CORRECTED.json'); parity=read('VALUE_ONLY_PARITY.json'); diagnosis=read('DIAGNOSTIC_FIXTURE_AUDIT.json')
    dataset=read('DISTILL_DATA_MANIFEST.json'); isolation=read('POLICY_HEAD_ISOLATION_CHECK.json'); exports=read('EXPORTED_VALUE_PARITY.json')
    offline=read('OFFLINE_DISTILLATION_REPORT.json'); gate=read('GATE_DECISION.json'); checks=read('FINAL_PUBLIC_CHECKS.json'); processes=read('FINAL_PROCESS_CHECK.json')
    benchmark=read('SINGLE_GAME_VALUE_BENCHMARK.json')
    assert preflight['passed'] and parity['passed'] and diagnosis['passed'] and dataset['complete'] and isolation['passed'] and exports['passed'] and offline['complete']
    assert all(v==0 for v in checks.values()) and processes['activeCount']==0
    assert len(dataset['receipts'])==3240
    if gate['passed']:assert read('STAGE6_SEALED_ACCEPTANCE.json')['completed']
    else:assert not (HERE/'FINAL_TEST_ATTEMPT.json').exists()
    with sqlite3.connect(HERE/'WRITE_BUDGET.sqlite3') as db:budget=dict(db.execute('SELECT key,value FROM metadata'))
    free=shutil.disk_usage(DATA).free
    assert sum(budget.values())<=3_000_000_000 and free>=15_000_000_000
    for entry in preflight['checks'].values():
        if 'path' in entry:assert digest(Path(entry['path']))==entry['actual']
    valid={split:{str(n):sum(r['valid'] and r['split']==split and r['players']==n for r in dataset['receipts']) for n in (2,3,4)} for split in ('train','dev')}
    sealed=int(gate['passed'])
    close={'status':'completed','completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sealedAccess':sealed,'gatePassed':gate['passed'],'selectedId':gate.get('selectedId'),'publicChecks':checks,'activeCount':0,'budget':budget,'diskFreeBytes':free,'teacherValidByPlayers':valid,'step2BenchmarkScope':benchmark['scope'],'noPostTestTuning':True,'formalModelDeploymentChanged':False}
    save('STAGE6_CLOSEOUT.json',close)
    lines=['# Stage 6 最终报告','',f"执行收官：开发门控{'通过，已执行唯一封存验收' if gate['passed'] else '未通过，封存保持关闭，Stage5 C1保持正式版本'}。本轮未改动应用的模型部署。",'',
           '## 预检及用户确认的修订','',
           '执行书中的Stage3检查点SHA256为61位笔误；用户确认采用Stage3锁定收据中的64位正确值。首次失败记录及更正收据分别保留。H1三个文件及Stage3检查点结束时再次核对一致。',
           '用户明确裁决纯价值路径保留寻路与威胁特征；只跳过完整根动作菜单、动作指针、战术先验及GPU策略头。实体关系输入必需的定向规则查询保留。', '',
           '## Step 1–2：夹具、搜索优化与回归','',
           '四个开发前态均逐步核验权威合法动作及前后态哈希。两处堵城夹具选择均避开占城断产惩罚；Liberty Port移至(11,2)，Swamplands选择其他单位的城外行动。Crucible北上，classic 2仍选择原前出动作，不能宣称四类战术问题全部解决。',
           f"64个多尺寸训练状态的空间、实体、关系输入逐字节一致；GPU valueProbs最大差{parity['maxAbs']}，valueLogits最大差{parity['maxLogitAbs']}。缓存使用完整状态字符串，在同一只克隆不原位修改的搜索分支上复用；旧客户端未声明能力时继续完整前向。",
           f"单局固定开发轨迹覆盖{benchmark['modelStates']}个模型前态，完整编码/前向{benchmark['fullMs']:.2f}ms，纯价值{benchmark['valueMs']:.2f}ms，加速{benchmark['speedup']:.3f}倍，最大价值差{benchmark['maxAbs']}。这是固定轨迹估值工作量基准，不是限时搜索整局墙钟加速证明。", '',
           '## Step 3–4：来源隔离及策略蒸馏','',
           '冻结Train和OOD-Dev中分别选2700和540个根节点，按人数及前中后期等权，合法动作至少3个；未使用实战开发或封存状态训练。全部根节点保留完整教师掩码与分数，只有available且至少2个已评估未否决动作的样本参与蒸馏。',
           f'有效教师人数分布：{json.dumps(valid,ensure_ascii=False)}。首轮四异步工作槽失败尝试及双槽试验均保留，未将不可用标签伪造为均匀分布。正式采集两异步工作槽共享GPU服务，1500ms/2500节点，己方预算占比0.5。',
           'Stage5锚点缓存中的策略目标原为占位值；本轮从同一冻结父局宏动作补齐10800个真实目标，并逐个核对动作指针。384个Stage1-Dev样本只用于检查点选择。冻结所有非策略参数并保持eval；子集KL仅索引有效子集，未展开及否决动作梯度为零，另有完整锚点CE与初始策略KL。',
           f"64样本更新前后价值logits及probs最大差严格为0；D1/D2导出与H1的64样本价值差也为0。训练有效样本数{offline['validTrain']}，验证有效样本数{offline['validDev']}。",'']
    for name,candidate in offline['candidates'].items():
        lines.append(f"- {name}：完成{candidate['updates']}步，选第{candidate['best']['update']}步；最佳验证指标{json.dumps(candidate['best'],ensure_ascii=False)}。")
    lines+=['','## Step 5–6：开发门控及条件封存','', '实战使用3000ms/5000节点，所有面板两局并行；Dev54复用晋级者18局收据，仅补36局。所有非自然结果单列，不能计为自然胜利。','']
    for candidate in read('DEV18_SUMMARY.json'):
        lines.append(f"- Dev18 {candidate['id']}：{sum(g['firstPlace']==1 for g in candidate['games'])}/18胜，equalWin={candidate['scores']['equalWin']:.6f}，equalRank={candidate['scores']['equalRank']:.6f}。")
    if gate.get('full'):
        s=gate['full']['scores']; lines+=['',f"晋级{gate['selectedId']}，Dev54独胜{sum(g['firstPlace']==1 for g in gate['full']['games'])}/54，equalWin={s['equalWin']:.6f}，equalRank={s['equalRank']:.6f}；健康门控={gate['healthPassed']}，实力门控={gate['strengthPassed']}。"]
    if gate['passed']:
        acceptance=read('STAGE6_SEALED_ACCEPTANCE.json'); comparison=read('FINAL_PAIRED_COMPARISON.json')
        lines+=['',f"封存结果：{json.dumps(acceptance['sealed54'],ensure_ascii=False)}",f"历史回归：{json.dumps(acceptance['historical40'],ensure_ascii=False)}",f"离线329父局：{json.dumps(acceptance['offline'],ensure_ascii=False)}",'五代模型十组配对比较均采用20个初态簇、人数分层、10000次bootstrap、固定种子20261101。区间及保守缺失口径见FINAL_PAIRED_COMPARISON.json；不以点估计宣称显著提升。']
    else:lines+=['','门控未通过，sealedAccess严格保持0；未运行封存54、历史40或封存离线329，也未生成伪造封存结果。']
    if (HERE/'INTERRUPTION_RECOVERY_20261106.json').exists():
        lines+=['','开发C3的p2-0-s1于2026-11-06 23:18:55最后留存第960步心跳，随后确认全部Stage6进程已退出。中断尝试逐文件核对SHA后原样归档，37份已完成对局收据保留，仅该未完开发局从初态重跑并接续未开始对局；原中断未计为自然负局，原因未确定。见INTERRUPTION_RECOVERY_20261106.json。']
    lines+=['','## Step 7：收官验证','',f"公共lint/test/build全部退出码0；完整测试计数见final-test.log。全部Stage6控制器、采集、训练、推理子进程退出，独立进程审计activeCount=0，控制器finally释放防休眠锁。预算保守累计{sum(budget.values())}字节，D盘剩余{free}字节。历史模型、收据与实验原件保留。",'', '## 限制','', '教师有效覆盖受限时搜索预算影响，完整选集与有效子集分别报告。双worker竞争GPU会影响限时搜索，跨代差异包含调度因素。单局固定轨迹估值提速不等同于实战整局加速。未把封存结果反馈到候选或超参数。','']
    with (HERE/'STAGE6_REPORT.md').open('x',encoding='utf-8') as stream:stream.write('\n'.join(lines))
    files={}
    for root in (HERE,DATA):
        for file in root.rglob('*'):
            if file.is_file() and '__pycache__' not in file.parts and file.name not in ('EVIDENCE_MANIFEST.json','detached-finalizer.log'):files[str(file)]={'bytes':file.stat().st_size,'sha256':digest(file)}
    for file in (HERE.parents[2]/'src/ai_runtime').rglob('*.ts'):files[str(file)]={'bytes':file.stat().st_size,'sha256':digest(file)}
    save('EVIDENCE_MANIFEST.json',{'createdAt':close['completedAt'],'sealedAccess':sealed,'files':files})
    print(json.dumps(close,ensure_ascii=False))

if __name__=='__main__':main()
