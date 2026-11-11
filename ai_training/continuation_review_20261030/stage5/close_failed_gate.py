"""时间判负已使硬门禁不可满足，保留全部证据并关闭本次验收流程。"""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import shutil
import sqlite3

HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1')


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(name, value):
    with (HERE / name).open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)


def main():
    games = [json.loads(p.read_text()) for p in (DATA / 'development-v2/C1').glob('*/*/result.json')]
    failed = [g for g in games if g['classification'] == 'time_forfeit']
    assert len(failed) == 1 and failed[0]['id'] == 'p4-17-s3'
    assert not (HERE / 'FINAL_TEST_ATTEMPT.json').exists()
    assert not (DATA / 'development-v2/CONTROLLER.lock').exists()
    counts = {str(n): {'scheduled': total, 'attempted': sum(g['players'] == n for g in games), 'natural': sum(g['players'] == n and g['natural'] for g in games), 'wins': sum(g['players'] == n and g['firstPlace'] == 1 for g in games)} for n, total in ((2, 20), (3, 18), (4, 16))}
    decision = {'passed': False, 'stage': 'Dev54', 'selectedId': 'C1', 'reason': 'timeForfeits必须为0，现有1次时间判负；提前终止不可通过的门禁，禁止封存', 'scheduled': 54, 'attempted': len(games), 'natural': sum(g['natural'] for g in games), 'wins': sum(g['firstPlace'] == 1 for g in games), 'byPlayers': counts, 'timeForfeits': 1, 'stoppedByGate': 1, 'unstarted': 54-len(games), 'failedMatch': failed[0], 'sealedAccess': 0}
    save('DEV54_SUMMARY.json', {**decision, 'games': games, 'complete': False})
    save('GATE_DECISION.json', decision)
    save('STAGE5_SEALED_ACCEPTANCE.json', {'status': 'not_run_gate_rejected', 'sealedAccess': 0, 'reason': decision['reason'], 'Sealed54': '未执行', 'Historical40': '未执行', 'SealedOffline329': '未执行'})
    save('FINAL_PAIRED_COMPARISON.json', {'status': 'not_applicable', 'bootstrapIterationsExecuted': 0, 'reason': '封存门禁未通过，没有Stage5封存数据，不编造四代配对及置信区间'})
    closeout = {'status': 'closed_gate_rejected', 'success': False, 'sealedAccess': 0, 'activeStage5Processes': 0, 'processVerification': '停止后经Win32_Process确认无Stage5控制器/arena/GPU进程', 'publicChecks': {'lint': 'passed', 'test': {'filesPassed': 72, 'passed': 556, 'skipped': 20}, 'build': 'passed'}, 'createdAt': datetime.now(timezone.utc).isoformat(), 'diskFreeBytes': shutil.disk_usage(DATA).free, 'dataBytes': sum(p.stat().st_size for p in DATA.rglob('*') if p.is_file()), 'failure': 'Dev54时间判负硬门禁未通过'}
    with sqlite3.connect(HERE / 'WRITE_BUDGET.sqlite3') as db:
        closeout['budgetMetadata'] = dict(db.execute('SELECT key,value FROM metadata'))
    save('STAGE5_CLOSEOUT.json', closeout); save('RUN_CLOSED.json', closeout)
    report = '''# Stage5收官：开发健康门禁未通过

本次实验已停止并完成失败收尾，不是全部验收成功。封存访问次数为0。

训练900局/10800样本、独立开发180局/2160样本及10800锚点完成。H1/H2各6000步、H3拟合完成；导出策略零差和离线整体等权门禁通过，旧域单项退化已在离线报告披露。

三组Dev18全部完成，C1以14/18胜晋级。C1 Dev54实际尝试50局：48局自然结束、33胜、1次时间判负，另1局在发现硬门禁失败后安全停止，4局未启动。2P自然20局16胜、3P自然18局11胜、4P自然10局6胜。不能将这些数字报告成完整54局结果。

关键失败为p4-17-s3：第626步时间判负；GPU日志在2026-11-05 18:20:44至21:00:57（北京时间）之间出现约160分钟空档，随后触发传输看门狗与迟到响应错误。日志能证明时序空档与时间判负，不能单凭此断言GPU故障、系统休眠或其他根因。该局完整结果保留，未重跑、未修改为自然完赛。

用户硬门禁要求timeForfeits=0和54/54自然完赛，现已无法满足，因此设置STOP，停止当前p4-18-s3并终止晋级。该局代码分类为user_stop，实际停止原因是本次硬门禁失败，不是新的用户暂停指令。所有控制器与推理进程已退出。

Sealed54、Historical40、SealedOffline329均未执行；不存在本阶段封存四代配对数据，因此未执行10000次簇Bootstrap，不虚构结果。既有原件、阶段1至4及已完成收据保留。

公共检查：npm run lint通过；npm test为72文件通过、556项通过及20项跳过；npm run build通过（保留已有包体积提示）。证据与日志见同目录closeout-*.log及EVIDENCE_MANIFEST.json。性能修复不改变src/ai_runtime；续跑runtimeSha与历史收据一致。
'''
    for name in ('STAGE5_REPORT.md', 'REPORT.md'):
        with (HERE / name).open('x', encoding='utf-8') as stream:
            stream.write(report)
    hashes = {}
    for directory in (HERE, DATA):
        for file in directory.rglob('*'):
            if file.is_file() and '__pycache__' not in file.parts and file.name not in ('EVIDENCE_MANIFEST.json', 'PROGRESS.md'):
                hashes[str(file)] = {'sha256': sha(file), 'bytes': file.stat().st_size}
    save('EVIDENCE_MANIFEST.json', {'files': hashes, 'sealedAccess': 0, 'status': 'closed_gate_rejected', 'excluded': '动态进度文档和Python缓存'})
    print(json.dumps({k:v for k,v in decision.items() if k != 'failedMatch'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
