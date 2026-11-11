"""封存本次未完成交付的全部证据；清单明确保留complete=false。"""
from pathlib import Path
import datetime
import hashlib
import json

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent.parent
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
def sha(file):
    digest = hashlib.sha256()
    with file.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

references = '''
## 本次证据入口

- [历史PC strict收尾](revisions/xiaomi_20261020/r24-closeout-20261020T083148408839/CLOSEOUT.json)
- [R24输入完整覆盖收据](revisions/xiaomi_20261020/R24_INDEX_RECEIPT-20261020T085402287368.json)
- [全历史评测排重索引](search-scale/evaluation-index-r24-pc-stop-20261020.json)
- [原实现真机完整自检](revisions/xiaomi_20261020/phone-r24-v3/selfcheck-2026-10-20T00-44-55-794Z/SELFCHECK.json)
- [观察优化真机完整自检](revisions/xiaomi_20261020/phone-r24-v4/selfcheck-2026-10-20T00-50-50-732Z/SELFCHECK.json)
- [1557根观察逐字节一致性](revisions/xiaomi_20261020/observation-parity-1792457640710/PARITY.json)
- [公共/独立检查及保全](revisions/xiaomi_20261020/local-checks-20261020T084524831125/CHECKS.json)
- [最新失败前置门禁](revisions/xiaomi_20261020/progress-20261020T085600759260/PHONE_PRECONDITION_GATE.json)

本次空闲资产服务器和专属ADB端口已经清理，默认ADB与scrcpy保留。启动源码为phone/prepare.ts、phone/serve.mjs；正式play模式要求绑定相同bundle/config的真机功能、Value及完整根前置全部通过。目前不具备这一通过收据。
'''
with (HERE / 'REPORT.md').open('a', encoding='utf-8') as out:
    out.write(references)
with (HERE / 'BATTLES.md').open('a', encoding='utf-8') as out:
    out.write('\n完整逐槽strict收据索引见[收尾清单](revisions/xiaomi_20261020/r24-closeout-20261020T083148408839/CLOSEOUT.json)，正式新对局尚未启动。\n')
validation = HERE / 'XIAOMI_VALIDATION.md'
snapshot = HERE / 'revisions/xiaomi_20261020/XIAOMI_VALIDATION.before-session.snapshot'
with snapshot.open('xb') as out:
    out.write(validation.read_bytes())
with validation.open('a', encoding='utf-8') as out:
    out.write('\n## 2026-10-20 本次接手后的实际状态\n\n上述“strict待收尾/ADB为空”为前序停机记录。本次89槽51,280动作及224,334风险见证已全部strict；最新排重索引覆盖283,682前态。小米实际已连接并解锁，两轮前台功能一致性通过，速度失败：原Value/根p95为12.8/1405ms，观察优化版11.2/1323.4ms。未解锁120槽资格、40局专家、蒸馏或160槽验收，见REPORT.md与TASK_STATE.json。空闲服务器及本任务ADB端口已清理，默认ADB/scrcpy保留。\n')
files = set()
for folder in [HERE / 'phone', HERE / 'revisions/xiaomi_20261020']:
    files.update(file for file in folder.rglob('*') if file.is_file() and '__pycache__' not in file.parts)
for name in ['REPORT.md', 'BATTLES.md', 'TASK_STATE.json', 'WORKLOG.md', 'XIAOMI_VALIDATION.md', 'ACTIVE_DEVICE_PROTOCOL.json',
             'teacher-phone-plan-v1.json', 'final-phone-plan-v1.json', 'expert-isolation-protocol.json', 'PRESERVE.json',
             'source-freeze-teacher-r24.json', 'teacher-r24-model-identities.json', 'replay_r24_stop.ts', 'close_r24_stop.py',
             'index_consumed_inputs.py', 'search-scale/evaluation-index-r24-pc-stop-20261020.json', 'search-scale/evaluation-hashes-r24-pc-stop-20261020.txt.gz']:
    files.add(HERE / name)
files.add(ROOT / 'ai_training/status/CURRENT.md')
stop = read(HERE / 'revisions/xiaomi_20261020/20261020T010559/R24_PC_STOP.json')
for interrupted, entries in [(False, stop['completed']), (True, stop['interruptedSlots'])]:
    for entry in entries:
        folder = HERE / 'teacher-r24-battles/slots' / entry['slot']
        names = ['actions.jsonl', 'started.json', 'actions.strict-prefix.jsonl.gz', 'strict-prefix-replay.json'] if interrupted else ['actions.jsonl', 'actions.jsonl.gz', 'started.json', 'result.json', 'final.json', 'strict-replay.json']
        files.update(folder / name for name in names)
models = read(HERE / 'teacher-r24-model-identities.json')
for identity in [*models['models'].values(), models['proposal']]:
    file = Path(identity['file'])
    assert sha(file) == identity['fileSha256']
    files.add(file)
entries = [dict(path=file.relative_to(ROOT).as_posix(), bytes=file.stat().st_size, sha256=sha(file)) for file in sorted(files)]
manifest = dict(complete=False, deliveryKind='阶段5接手进度与失败门禁证据，非最终模型交付', createdAt=datetime.datetime.now().isoformat(timespec='seconds'),
                teacherQualified=False, strictPcActions=51280, strictRiskWitnessActions=224334, phoneTeacherSlots=0, trueExpertGames=0,
                distillationStarted=False, finalPhoneSlots=0, historicalModelsUnchanged=True, files=entries,
                fileCount=len(entries), totalBytes=sum(entry['bytes'] for entry in entries),
                nextDependency='真机运行环境选择/性能修订，重过Value及完整根前置，再开始120槽教师资格')
with (HERE / 'DELIVERY_MANIFEST.json').open('x', encoding='utf-8') as out:
    json.dump(manifest, out, ensure_ascii=False, indent=2)
assert all((ROOT / entry['path']).stat().st_size == entry['bytes'] and sha(ROOT / entry['path']) == entry['sha256'] for entry in entries)
print(json.dumps(dict(complete=False, files=len(entries), bytes=manifest['totalBytes'], allManifestHashesVerified=True), ensure_ascii=False))
