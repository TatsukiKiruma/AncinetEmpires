"""汇总真实验收证据，不训练、不修改历史结果。"""
from pathlib import Path
import datetime
import hashlib
import json
import shutil
import sqlite3

HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1')


def read(name):
    return json.loads((HERE / name).read_text(encoding='utf-8-sig'))


def save(name, data):
    with (HERE / name).open('x', encoding='utf-8') as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)


def main():
    comparisons = read('FINAL_PAIRED_COMPARISON.json')
    audit = read('FINAL_TELEMETRY_AUDIT.json')
    offline = read('SEALED_OFFLINE_REPORT.json')
    checks = read('FINAL_PUBLIC_CHECKS.json')
    processes = read('FINAL_PROCESS_CHECK.json')
    assert all(v == 0 for v in checks.values()) and processes['activeCount'] == 0
    assert read('GATE_DECISION.json')['passed']
    assert all(a['completeCoverage'] and a['timeForfeits'] == a['invalidTeacher'] == a['waitOverCaptureCount'] == 0 for a in audit.values())
    assert offline['policyMaxAbsDiffStage3Stage5'] == 0
    with sqlite3.connect(HERE / 'WRITE_BUDGET.sqlite3') as db:
        budget = dict(db.execute('SELECT key,value FROM metadata'))
    free = shutil.disk_usage(DATA).free
    assert sum(budget.values()) <= 3000000000 and free >= 15000000000
    sealed = comparisons['generations']['stage5C1']
    historical = comparisons['historicalGenerations']['stage5C1']
    acceptance = {'status': 'completed_with_disclosed_protocol_amendments', 'sealedAccess': 1, 'sealed54': sealed, 'historical40': historical, 'sealedOffline329': offline, 'telemetry': audit, 'protocolAmendments': ['原34局串行完赛后切换双worker，两局一批', 'p3-14-s2在Codex重启后中断，经用户明确确认完整Move归档后重跑，旧尝试保留'], 'statisticalConclusion': '相对Stage4等权胜率提高3.935个百分点，但95%配对簇bootstrap区间跨零；历史回归31/40，较Stage4少1胜；不宣称显著全面提升', 'noPostTestTuning': True}
    save('STAGE5_SEALED_ACCEPTANCE.json', acceptance)
    close = {'status': 'completed', 'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sealedAccess': 1, 'naturalGames': 94, 'sealedWins': 37, 'historicalWins': 31, 'activeStage5Processes': 0, 'sleepLockReleased': 'restart-two-worker.stdout.log记录finally释放', 'publicChecks': checks, 'tests': {'filesPassed': 72, 'passed': 556, 'skipped': 20}, 'budgetMetadata': budget, 'conservativeCumulativeBytes': sum(budget.values()), 'diskFreeBytes': free, 'automation': '收官后删除stage5；工具收据另存AUTOMATION_CLOSEOUT.json', 'limitations': acceptance['protocolAmendments'] + [acceptance['statisticalConclusion']]}
    save('STAGE5_CLOSEOUT.json', close)
    save('RUN_CLOSED.json', close)
    rows = []
    for name, score in comparisons['generations'].items():
        wins = sum(g['wins'] for g in score['byPlayers'].values())
        rows.append(f"| {name} | {wins}/54 | {score['equalWin']:.4%} | {score['equalRank']:.6f} | {comparisons['historicalGenerations'][name]['equalWin']:.1%} |")
    delta = comparisons['pairs']['stage5C1_vs_stage4V7C2']['equal']
    report = '''# Stage5最终收官报告

Stage5全部执行工作完成。开发54局36胜并通过冻结门禁；唯一封存验收最终54/54自然完赛37胜，历史40/40自然完赛31胜。未据封存结果调参或重选候选。

## 四代配对结果

| 模型 | 封存独胜 | 人数等权胜率 | 等权排名 | 历史40胜率 |
|---|---:|---:|---:|---:|
''' + '\n'.join(rows) + f'''

Stage5封存分层：2P 14/20、3P 14/18、4P 9/16。注意37/54的原始胜率与人数等权68.0093%不是同一口径。
四代六组两两比较均执行10000次配对簇bootstrap；54局按20个初态槽、人数分层抽样。历史40也完成六组配对。逐局核对初态SHA、seed、seat、opponent；历史非自然局保守评分与完整自然置信区间分开，详见FINAL_PAIRED_COMPARISON.json。
相对Stage4等权胜率差{delta['winDelta']:.6f}，95%区间{delta['completeNaturalCI']['win']}；排名差{delta['rankDelta']:.6f}，95%区间{delta['completeNaturalCI']['rank']}。两个区间均跨零，不宣称统计显著。历史31/40较Stage4的32/40少1胜。

## 数据、训练及离线验收

严格OOD训练900自然局10800样本、开发180自然局2160样本；每局12样本，前中后期各2边界态和2首单位链完成态，人数及A/B配额已冻结。锚点10800样本；仅训练来源参与梯度，OOD-Dev与封存不参与训练。H1/H2仅更新四个价值模块，H3九桶校准；C1由Dev18选出，Dev54通过后才启用封存令牌。旧域单列回退，原Stage1 Dev按来源内父局等权、两来源各半执行门禁。
缓存64样本前向/梯度检查、导出策略logits零差与H1/H2边界子集证据均保留。封存离线固定329父局776样本，Stage3→Stage5父局等权Brier 0.303199→0.289768，CE 0.539199→0.510563，槽Reliability ECE 0.054202→0.041758。PolicyNLL均1.766425，策略logits最大绝对差0。分桶Brier、10等宽桶槽/联盟ECE详见SEALED_OFFLINE_REPORT.json。Stage4使用Stage3同一价值权重，离线指标相同。策略logits不变不意味着搜索棋力不变。

## 实战审计和协议变更

94局逐局收据及配置/模型/runtime SHA核验通过，92686步权威引擎完整重放通过。两面板timeForfeits、invalidTeacher、waitOverCapture均0。封存实质比较率95.4084%，4P为90.7561%；历史为100%。见FINAL_TELEMETRY_AUDIT.json。
原34局串行完赛后用户授权改双worker；共享GPU竞争可能改变限时搜索，不能将代际差异全部归因价值头。p3-14-s2中断于2800步后，经用户确认完整归档后从头重跑；因此这是同一封存令牌下获授权的中断重试，并非所有对局绝无重试。旧尝试及系统休眠开发局归档全部保留，不能冒充自然负局或删除。
未修改src/ai_runtime及Stage1至4原件。唯一令牌及原绑定源码保持不变；新增调度器授权和SHA单独留存。I/O优化使用SQLite一次基准扫描与累计预留、状态文件分块配额及前后态哈希复用。

## 公共检查及关闭

npm run lint、npm test、npm run build全部退出码0；72测试文件、556通过、20跳过。构建有既有大分块提示，非失败。Stage5额外TypeScript检查通过。全部Stage5/GPU/审计子进程已退出，防休眠锁释放。
预算账本保守累计{sum(budget.values())}字节（上限3000000000），D盘剩余{free}字节（护栏15000000000）；归档不退款、不抹除累计写入。停止stage5定时任务的工具收据见AUTOMATION_CLOSEOUT.json；聊天不归档。
'''
    for name in ['STAGE5_REPORT.md', 'REPORT.md']:
        with (HERE / name).open('x', encoding='utf-8') as f:
            f.write(report)
    progress = HERE / 'PROGRESS.md'
    progress.write_text('# 第五阶段执行进度\n\n## 最终收官完成\n\n94/94自然完赛，封存37/54、历史31/40；四代10000次配对簇bootstrap及92686步重放完成，公共检查全部通过，所有子进程退出。最终报告STAGE5_REPORT.md；定时删除收据AUTOMATION_CLOSEOUT.json。此前中断与等待说明均为历史状态，不再启动训练或验收。\n\n' + progress.read_text(encoding='utf-8').split('\n', 1)[1], encoding='utf-8')


if __name__ == '__main__':
    main()
