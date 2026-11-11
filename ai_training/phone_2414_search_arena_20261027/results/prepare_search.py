"""派生独立搜索评测，只改推理桥接与搜索装配，原20局和训练证据保持原位。"""
from pathlib import Path
import json

HERE = Path(__file__).resolve().parent
OLD = HERE.parent / 'phone_2414_arena_20261027'


def replace_once(text, old, new):
    assert text.count(old) == 1, (old, text.count(old))
    return text.replace(old, new)


def main():
    assert not (HERE / 'IDENTITY.json').exists()
    for name in ['device.py', 'deploy.py', 'controller.sh', 'resource_monitor.sh', 'status.py', 'collect_report.py', 'build.mjs', 'tsconfig.json']:
        text = (OLD / name).read_text(encoding='utf-8')
        text = text.replace('aeii-2414-arena', 'aeii-2414-search-arena').replace('/eval2414', '/evalsearch2414')
        (HERE / name).write_text(text, encoding='utf-8', newline='\n')
    text = (OLD / 'infer.py').read_text(encoding='utf-8')
    text = text.replace('import hashlib\n', 'import hashlib\nimport io\n')
    text = replace_once(text, 'def main():\n', "def main():\n    sys.stdin = io.TextIOWrapper(open(sys.argv[1], 'rb'), encoding='utf-8')\n    sys.stdout = io.TextIOWrapper(open(sys.argv[2], 'wb'), encoding='utf-8')\n")
    text = replace_once(text, "'logits': logits.tolist(), 'forwardMs': elapsed", "'logits': logits.tolist(), 'valueLogits': result['valueLogits'][0].tolist(), 'valueProbs': result['valueProbs'][0].tolist(), 'actorPrior': result['actorPrior'][0].tolist(), 'forwardMs': elapsed")
    (HERE / 'infer.py').write_text(text, encoding='utf-8', newline='\n')
    text = (OLD / 'arena.ts').read_text(encoding='utf-8')
    start = text.index('class Inference {')
    end = text.index('\nfunction preparation()', start)
    text = text[:start] + text[end:]
    text = text.replace("import { packTensorBatch } from '../dual_stream_v2_phase1_20261020/tensor_bridge';",
                        "import { SyncInference } from './sync_inference';\nimport { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';")
    text = text.replace("const inference = new Inference();", "const inference = new SyncInference(WORK);")
    text = replace_once(text, "modelPolicy: '当前2M网络logits加训练既有softPriors，稳定argmax；不额外搜索',",
                        "modelPolicy: '冻结2M模型接v6回合搜索；未套用0.5M模型外置校准',\n        searchOptions: { budgetMs: 780, maxNodes: 220, beamWidth: 6, maxUnits: 3, defaultQueue: 'full' },")
    text = replace_once(text, "const prefix = `matches/${slot.id}`;", "const searchPolicy = new DualStreamTurnSearchAI({ forward: (observation: any) => inference.forwardSync(observation) } as any, plan.searchOptions);\n            const prefix = `matches/${slot.id}`;")
    start = text.index("                    if (side === 'model') {")
    end = text.index("                    const code = encodeAction(action);", start)
    text = text[:start] + """                    inference.resetCounters();
                    let searchTelemetry: any = null;
                    if (side === 'model') {
                        action = searchPolicy.getAction(engine, modelPlayer);
                        searchTelemetry = { ...searchPolicy.telemetry };
                        forwardMs = inference.counters.forwardMs;
                        collateMs = inference.counters.collateMs;
                        rpcMs = inference.counters.rpcMs;
                    } else action = slot.opponent === 'hard' ? hard.getAction(engine, opposite) : simple.getAction(engine, opposite, legal);
""" + text[end:]
    text = replace_once(text, "beforeSha256, afterSha256: sha(JSON.stringify(result.state)), turn: state.turn,",
                        "beforeSha256, afterSha256: sha(JSON.stringify(result.state)), turn: state.turn, searchTelemetry, networkCalls: inference.counters.calls,")
    text = text.replace("rootMs: 0", "rootMs: 0")
    text = replace_once(text, "times[side].push(totalMs);", "times[side].push(totalMs);\n                    if (side === 'model') (searchTelemetry.queued ? queueTimes : rootTimes).push(totalMs);")
    text = replace_once(text, "const times: { model:", "const rootTimes: number[] = [], queueTimes: number[] = [];\n            const times: { model:")
    text = replace_once(text, "networkForward: stats(times.forward.filter(x => x > 0)),", "searchRoot: stats(rootTimes), searchQueue: stats(queueTimes), networkForwardTotalPerDecision: stats(times.forward.filter(x => x > 0)),")
    (HERE / 'arena.ts').write_text(text, encoding='utf-8', newline='\n')
    # 新文件也加入身份清单，封存的公共搜索代码由打包依赖清单覆盖。
    file = HERE / 'build.mjs'
    text = file.read_text(encoding='utf-8')
    text = text.replace("'infer.py', 'arena.bundle.mjs'", "'infer.py', 'sync_inference.ts', 'arena.bundle.mjs'")
    file.write_text(text, encoding='utf-8', newline='\n')
    print(json.dumps({'preparedSource': True, 'search': 'v6', 'budgetMs': 780, 'nodes': 220, 'games': 20}))


if __name__ == '__main__':
    main()
