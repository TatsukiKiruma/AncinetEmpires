"""独立核对导出字节，仅允许相对首版修改实体语义前15行。"""
from run_league import DIR, read, save, sha

folder = DIR / 'generations/gen_03'; protocol = read(folder / 'semantic-repair-protocol.json')
warm = DIR / protocol['warmModel']; assert sha(warm.with_suffix('.bin')) == protocol['warmSha256']
a_meta = {e['name']: e for e in read(warm.with_suffix('.json'))['tensors']}
b_meta = {e['name']: e for e in read(folder / 'model.json')['tensors']}
a_bytes, b_bytes = warm.with_suffix('.bin').read_bytes(), (folder / 'model.bin').read_bytes()
assert a_meta.keys() == b_meta.keys(); changed = []
for name, a in a_meta.items():
    b = b_meta[name]; assert a['shape'] == b['shape']
    before = a_bytes[a['offset']*4:(a['offset']+a['length'])*4]
    after = b_bytes[b['offset']*4:(b['offset']+b['length'])*4]
    if name == 'what_entity.weight': assert before[15*128*4:] == after[15*128*4:]
    elif name == 'what_entity.bias': assert before[15*4:] == after[15*4:]
    else: assert before == after, f'未授权参数发生漂移:{name}'
    if before != after: changed.append(name)
assert set(changed) == {'what_entity.weight', 'what_entity.bias'}
result = dict(passed=True, trainedRows=protocol['trainedParameterRows'], changedTensors=changed, warmSha256=protocol['warmSha256'], modelSha256=sha(folder / 'model.bin'), unchangedOtherPolicyParameters=True, unchangedNativeHeadBias=True, unchangedValueAndBackbone=True)
save(folder / 'semantic-row-byte-audit.json', result); print(result)
