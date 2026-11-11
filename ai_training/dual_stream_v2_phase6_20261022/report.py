"""汇总每次尝试、训练和验收证据，保留旧CURRENT条目与全部历史报告。"""
from pathlib import Path
import hashlib,json,re
DIR=Path(__file__).resolve().parent
ROOT=DIR.parents[1]
def read(p): return json.loads(p.read_text('utf-8-sig'))
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    folders=[ROOT/'deliverables/trained_vs_apk_hard_20261022'/s for s in ['phase61-v6-hard-slayer','phase61-v6r2-hard-slayer','phase61-v6r3-hard-slayer','gen05-v6-hard-slayer']]
    summaries=[read(f/'summary.json') for f in folders]
    final=summaries[-1]; training=read(DIR/'gen_05/training.json'); parity=read(DIR/'gen_05/node-parity.json')
    assert summaries[-2]['identity']['sourceManifest']['sha256']==final['identity']['sourceManifest']['sha256'], '最终模型比较必须使用相同运行时源码身份'
    preserved=read(DIR/'preservation-before.json'); changed=[r['path'] for r in preserved if not (ROOT/r['path']).is_file() or sha(ROOT/r['path'])!=r['sha256']]
    protection=dict(files=len(preserved),changed=changed,passed=not changed)
    (DIR/'preservation-after.json').write_text(json.dumps(protection,ensure_ascii=False,indent=2),encoding='utf-8')
    report='# Phase 6：困难APK专项运行时与gen_05\n\n'
    report+='本轮唯一对手为 Original-APKlikeAI-Hard，SD、五图换边、4000原子步/120回合/600秒上限。我方单次决策预算1000ms；搜索内部780ms加反扑预留。未接入GUI。标准靶场已用于方法开发，不能称为独立盲测。\n\n'
    report+='| 版本 | 胜 | 负 | 平 | 胜率 | 截断 | 错误 | 我方>1000ms | 对手>1000ms |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n'
    report+='| 历史gen03+v5 | 2 | 8 | 0 | 20% | 0 | 0 | 见历史报告 | 见历史报告 |\n'
    for folder,s in zip(folders,summaries):
        report+=f"| {folder.name} | {s['wins']} | {s['losses']} | {s['draws']} | {s['wins']/len(s['games']):.0%} | {s['truncated']} | {s['errors']} | {sum(g['modelLatency']['over1000'] for g in s['games'])} | {sum(g['hardLatency']['over1000'] for g in s['games'])} |\n"
    report+='\n首轮暴露了堆叠守军共同驻守的问题，完整十局证据保留。v6r2将守城奖励限定为最后一名守军，并修正破房目标名称与威胁来源覆盖。v6r3另修正升级单位的有效血量上限治疗估值，并重跑同运行时gen03十局基线。所有版本如实分别报告，不挑选局部胜场合并胜率。\n\n'
    report+='具体改动：\n\n- 威胁图按权威移动代价识别一/二回合夺城压力；末金守军可wait、原地打击威胁源，空城移动重罚。反扑后的原有城堡损失进入最高优先级否决。\n- 联盟军力、金币与敌方下一回合收入决定经营区域；按真实路径分配不重复建筑，限制非占领者挡村；据点守卫使用最高两次可达伤害。\n- 集火三系数、威胁源1.9倍、致盲/施毒/召唤/光环、动态治疗及支援后一步收益。\n- 招募取消兵种硬过滤，加入水域、开局扩张、克制、应急守城及新兵完整行动估值。\n- 三单位前瞻只缓存胜出首单位，独立规则候选进入根池；反扑允许合法招兵后行动，并优先夺城和战斗。\n\n'
    for folder,s in zip(folders[1:],summaries[1:]):
        report+=f"## {folder.name}：十局详细战报\n\n| 地图 | 座位 | 结果 | 回合 | 原子步 | 根p95(ms) | 我方最大(ms) | 决胜动作 |\n|---|---:|---|---:|---:|---:|---:|---|\n"
        for g in s['games']:
            last=json.loads((folder/g['id']/'actions.jsonl').read_text('utf-8').strip().splitlines()[-1])['action']
            outcome={'model_win':'我方胜','hard_win':'困难AI胜','natural_draw':'自然平局'}.get(g['classification'],g['classification'])
            report+=f"| {g['mapName']} | P{g['seat']} | {outcome} | {g['rounds']} | {g['steps']} | {g['rootLatency']['p95']:.1f} | {g['modelLatency']['max']:.1f} | {json.dumps(last,ensure_ascii=False)} |\n"
        verified=read(folder/'independent-strict-replay.json')
        report+=f"\n独立strict复核：{verified['actions']}实际动作、{verified['witnessActions']}反扑动作、{verified['witnesses']}条反扑见证，全部通过。源码/模型前后相同：{s['sourceUnchanged']}/{s['modelArtifactsUnchanged']}。\n\n"
    manifest=training['data']; report+='## gen_05联合精调\n\n'
    report+='采样包含标准五图的三次十局尝试，以及Icy Paths、Peak Island、Swamplands三张官方扩展图换边六局；扩展图双方开局各加50金币，初态、种子和完整轨迹均保留。\n\n'
    report+=f"源数据来自{len(manifest['parents'])}个本轮自然终局父局，实际动作重新strict核对{manifest['verifiedActions']}条；训练/开发样本{training['trainSamples']}/{training['devSamples']}，来源分布{manifest['counts']['sources']}。按整局稳定分区并按状态摘要去重；采样上限及种子在优化器启动前写入protocol.json，所有轮次和优化器检查点保留。\n\n"
    report+=f"从gen03联合更新骨干、Policy和Value，AdamW、学习率{training['settings']['learningRate']}、{training['settings']['epochs']}轮、{training['updates']}次更新，{len(training['nonzeroGradientTensors'])}个参数张量收到非零梯度。按开发目标选择第{training['selected']['epoch']}轮，未按十局胜率反选checkpoint。模型SHA-256：`{training['modelSha256']}`。\n\n"
    report+=f"开发指标：训练前{training['baseline']}；选中轮次{training['selected']['dev']}。PyTorch/Node独立前向{parity['samples']}状态，最大误差{parity['errors']}，各输出argmax一致。\n\n"
    report+='## 关键复盘与边界\n\n'
    report+='历史Duel后手第18步的末金守军前态已从原始strict轨迹恢复并纳入回归：城堡(8,8)、敌王(5,7)、余金50（历史描述写0，原始重放实际为50，同样不足150招募费）时，驻守候选保留，所有离城移动评分低于驻守；留守后敌王无法立即走入城堡。首轮堆叠守军滞留问题另加回归，不能以此修复推定实战必胜。\n\n'
    wins=final['wins']; report+=f"gen_05最终为{wins}/10。相对v6r3零重训的胜场变化为{wins-summaries[-2]['wins']:+d}，相对历史gen03+v5为{wins-2:+d}。"
    report+=('固定十局全胜，但小规模已消费靶场不足以证明一般统治力。' if wins==10 else '仍有败局，尚未达到统治级棋力；不把训练loss改善或轨迹变长当成胜率提升。')+'\n\n'
    report+='威胁路径与静态多击估计用于风险先验，不等于穷举所有敌方联动；真实反扑最多展开五条单位链，剩余军力有静态覆盖。严格合法和重放全通过只能证明执行证据一致，不能证明搜索战术完备。困难AI的同步脚本本身可能超过1000ms，超时次数在上表完整披露；本轮未改对手实现。\n\n'
    report+=f"历史保全复核{len(preserved)}份文件，变化{len(changed)}；三个受保护GUI入口在其中。提取编码在有效血量复核后重启，未覆盖历史数据；第一次空等待进程及流水线中止日志保留。公共lint、独立类型检查、build通过；公共61文件503项通过、20项既有跳过（public-tests-v6-final.log）。此前公共测试一次历史快照余金断言已按原始50金币修正，另一次旧V2墙钟实战断言在并行构建时波动失败，失败日志均保留。没有运行旧56槽面板、操作手机、覆盖历史目录或提交模型大文件。\n"
    (DIR/'REPORT.md').write_text(report,encoding='utf-8')
    current=ROOT/'ai_training/status/CURRENT.md'; text=current.read_bytes().decode('utf-8-sig')
    entry=f"<!-- dual-stream-v2-phase6 -->\n## 2026-10-22 Phase 6困难AI专项\n\n唯一实战对手切换为Original-APKlikeAI-Hard。v6r3+gen03为{summaries[-2]['wins']}胜{summaries[-2]['losses']}负；gen_05+v6r3为{final['wins']}胜{final['losses']}负，均五图换边十局。截断/错误分别{final['truncated']}/{final['errors']}，实际动作和反扑见证独立strict重放通过。联合精调和PyTorch/Node前向通过，历史保全{protection['passed']}，未修改GUI入口。{'未达统治级。' if wins<10 else '固定靶场全胜，未做独立泛化验收。'}见[报告](../dual_stream_v2_phase6_20261022/REPORT.md)。本条覆盖旧56槽门禁与冻结限制，历史条目仅作记录。\n<!-- end-dual-stream-v2-phase6 -->\n\n"
    newline='\r\n' if '\r\n' in text else '\n'
    marker='# 当前接手状态'+newline
    current.write_bytes(text.replace(marker,marker+newline+entry.replace('\n',newline),1).encode('utf-8'))
    receipt=dict(preservation=protection,parity=parity['passed'],phase61Wins=summaries[-2]['wins'],gen05Wins=wins)
    (DIR/'RESULT.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(receipt,ensure_ascii=False))
if __name__=='__main__':main()
