"""检查方案配额和文件身份，不生成游戏局面或连接设备。"""
import collections
import hashlib
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]

def read(name):
    return json.loads((OUT / name).read_text(encoding='utf-8-sig'))

def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def write(name, data):
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

plan = read('PLAN.json')
slots = read('DESIGN_SLOTS.json')['slots']
maps = {m['name']: m for m in read('MAP_INVENTORY.json')['maps']}
checks = []

def check(name, value):
    assert value, name
    checks.append(name)

check('3000个唯一父局设计槽位和种子', len(slots) == len({s['slotId'] for s in slots}) == len({s['nativeSeed'] for s in slots}) == 3000)
check('全部不可下发且未生成具体初态', all(not s['dispatchable'] and s['initialStateSha256'] is None for s in slots))
check('采集训练及所有重放均未授权启用', all(plan[k] is False for k in ['executionAuthorized','dispatchable','trainingAuthorized','automaticTrainingAdmission','strictReplay','forcedReplay','nativeReplay']))
check('初段126局已包含在总额', collections.Counter(s['stage'] for s in slots) == {'initial_126':126,'remaining_2874':2874})
for row in plan['quotas']:
    for n in (2,3,4):
        group = [s for s in slots if s['category'] == row['kind'] and s['actualPlayerCount'] == n]
        quota = row[f'players{n}']
        check(f"{row['kind']}/{n}方配额和设备分配", len(group) == quota and collections.Counter(s['deviceProposal'] for s in group) == {'mi8':quota//2,'note8':quota//2})
        check(f"{row['kind']}/{n}方初段6局", sum(s['stage'] == 'initial_126' for s in group) == 6)
        for device in ('mi8','note8'):
            subset = [s for s in group if s['deviceProposal'] == device]
            check(f"{row['kind']}/{n}方/{device}焦点席位覆盖", {s['focusSeatOrdinal'] for s in subset} == set(range(n)))
            check(f"{row['kind']}/{n}方/{device}子配方覆盖", {s['profile'] for s in subset} == set(row['profiles']))
            if subset[0]['derivedStateRequired']:
                check(f"{row['kind']}/{n}方/{device}先行动席位覆盖", {s['firstActorOrdinal'] for s in subset} == set(range(n)))
for slot in slots:
    item = maps[slot['proposedMap']]
    check_name = f"{slot['slotId']}地图身份人数和容量初筛"
    maximum = slot['planningMaximumUnitsPerSide']
    assert item['configuredPlayerCount'] == len(item['nativePlayerIds']) == slot['actualPlayerCount'], check_name
    assert slot['mapAssetSha256'] == item['sha256'] and slot['activeNativePlayerIds'] == item['nativePlayerIds'], check_name
    assert maximum is None or maximum * slot['actualPlayerCount'] <= int(.6 * item['nonApproximateNonDeepWaterCellCount']), check_name
checks.append('3000槽位地图身份、实际席位人数与容量粗筛一致；不证明真实落点合法')
identity = read('INPUT_IDENTITY.json')
for group in identity.values():
    for entry in group:
        assert sha(ROOT / entry['path']) == entry['sha256'], entry['path']
checks.append('历史清单、采集器源码和地图资产SHA与检查时一致')
check('首126局覆盖三种人口上限', {s['populationLimitPerSide'] for s in slots if s['stage'] == 'initial_126'} == {20,30,50})
write('VALIDATION.json', {'passed':True,'scope':'仅设计槽位和输入文件身份静态检查','checks':checks,
    'gameActionsExecuted':0,'phoneAccessed':False,'collectorStarted':False,'trainingStarted':False,'replayExecuted':False})
write('DELIVERY_MANIFEST.json', {'files':[{'path':p.name,'bytes':p.stat().st_size,'sha256':sha(p)}
    for p in sorted(OUT.iterdir()) if p.is_file() and p.name != 'DELIVERY_MANIFEST.json'],
    'note':'清单不包含自身；未打包历史数据、模型或APK资源'})
print(json.dumps({'passed':True,'checks':len(checks),'slots':len(slots),'runtimeActions':0},ensure_ascii=False))
