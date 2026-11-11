"""直接比较导出二进制，独立核验同代辅助阶段只改待机语义行。"""
from run_league import DIR, read, save, sha

folder = DIR / 'generations/gen_03'; archive = folder / 'training-attempt01-prior-aware'
old_meta = {e['name']: e for e in read(archive / 'model.json')['tensors']}
new_meta = {e['name']: e for e in read(folder / 'model.json')['tensors']}
old_bytes, new_bytes = (archive / 'model.bin').read_bytes(), (folder / 'model.bin').read_bytes()
assert old_meta.keys() == new_meta.keys()
changed = []
for name, before in old_meta.items():
    after = new_meta[name]; assert before['shape'] == after['shape']
    a = old_bytes[before['offset'] * 4:(before['offset'] + before['length']) * 4]
    b = new_bytes[after['offset'] * 4:(after['offset'] + after['length']) * 4]
    if name == 'what_entity.weight':
        assert before['shape'] == [36, 128]
        start, end = 4 * 128 * 4, 5 * 128 * 4
        assert a[:start] == b[:start] and a[end:] == b[end:]
    elif name == 'what_entity.bias':
        assert a[:16] == b[:16] and a[20:] == b[20:]
    else:
        assert a == b, f'辅助阶段意外改动其它张量:{name}'
    if a != b: changed.append(name)
assert changed and set(changed) <= {'what_entity.weight', 'what_entity.bias'}
result = dict(passed=True, onlyWaitSemanticRowChanged=True, changedTensors=changed, warmSha256=sha(archive / 'model.bin'), modelSha256=sha(folder / 'model.bin'), unchangedNativeHeadBias=True, unchangedOtherPolicyRows=True, unchangedValueAndBackbone=True)
save(folder / 'wait-row-byte-audit.json', result)
print(result)
