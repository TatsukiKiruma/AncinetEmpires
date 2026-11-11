"""创建第六阶段独立服务与预算工具；只读取历史源码，不修改历史目录。"""
from pathlib import Path

HERE = Path(__file__).resolve().parent

def write(name, text):
    with (HERE / name).open('x', encoding='utf-8') as stream:
        stream.write(text)

def main():
    old = HERE.parent / 'stage5'
    budget = (old / 'write_budget.py').read_text(encoding='utf-8').replace('continuation_stage5_20261104_v1', 'continuation_stage6_20261106_v1')
    write('write_budget.py', budget)
    for name in ['arena_io.ts', 'arena_writer.ts', 'arena.ts', 'arena_client.ts']:
        text = (old / name).read_text(encoding='utf-8').replace('continuation_stage5_20261104_v1', 'continuation_stage6_20261106_v1').replace('Stage5', 'Stage6')
        if name == 'arena_client.ts':
            text = text.replace("'../stage4_v7/infer.py'", "'infer.py'").replace('context?: { deadline: number }', 'context?: { deadline: number; valueOnly?: boolean }').replace('...packed.metadata, sources:', '...packed.metadata, valueOnly: Boolean(context?.valueOnly), sources:')
        write(name, text)
    text = (HERE.parent / 'stage4_v7/accurate_batch.py').read_text(encoding='utf-8')
    text = text.replace('def forward_batch(m, x):', 'def forward_batch(m, x, value_only=False):')
    start, end = text.index('    actor, tile, head'), text.index('    selected =')
    policy = text[start:end]
    text = text[:start] + '    if value_only:\n        logits = raw.new_empty(b, 0)\n        actor_prior = raw.new_empty(b, 0)\n    else:\n' + ''.join('    ' + line if line.strip() else line for line in policy.splitlines(True)) + text[end:]
    write('accurate_batch.py', text)
    text = (HERE.parent / 'stage4_v7/infer.py').read_text(encoding='utf-8')
    text = text.replace('def infer(model, rows, device, chunk=32):', 'def infer(model, rows, device, chunk=32, value_only=False):')
    text = text.replace('forward_batch(model, move(collate(batch), device))', 'forward_batch(model, move(collate(batch), device), value_only=value_only)')
    text = text.replace("values['actorPrior'] = torch.cat", "values['actorPrior'] = fields['actorPrior'][i] if value_only else torch.cat")
    text = text.replace("rows = decode(json.loads(exact(source, ms)), exact(source, bs))\n            outputs = infer(model, rows, device, args.chunk)", "metadata = json.loads(exact(source, ms))\n            rows = decode(metadata, exact(source, bs))\n            outputs = infer(model, rows, device, args.chunk, bool(metadata.get('valueOnly', False)))")
    write('infer.py', text)
    config = (old / 'config-C1.json').read_text(encoding='utf-8').replace('"priorAnchor": 0.1', '"priorAnchor": 0.07')
    write('config-C1.json', config)
    write('DEV_SUBSET.json', (old / 'DEV_SUBSET.json').read_text(encoding='utf-8'))

if __name__ == '__main__':
    main()
