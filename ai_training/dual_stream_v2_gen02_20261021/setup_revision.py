"""复制小型执行工具，数据与历史模型通过只读路径引用，建立新代身份。"""
import json
import shutil
from pathlib import Path
from bootstrap import HERE, OLD, digest


def main():
    assert (HERE / 'START_SNAPSHOT.json').exists()
    for pattern in ['*.ts', '*.py', '*.mjs']:
        for source in OLD.glob(pattern):
            target = HERE / source.name
            assert not target.exists(), f'拒绝覆盖:{target}'
            target.write_text(source.read_text('utf-8').replace('dual_stream_v2_phase5_20261020/', 'dual_stream_v2_gen02_20261021/'), encoding='utf-8')
    for name in ['tsconfig.json', 'evaluation-exclusions.txt.gz', 'evaluation-exclusion-receipt.json', 'fixed-dev-exclusions.json.gz', 'fixed-dev-exclusion-receipt.json', 'index-authority-attestation.json']:
        shutil.copyfile(OLD / name, HERE / name)
    state = json.loads((OLD / 'league-state.json').read_text('utf-8'))
    old_state_sha = digest(OLD / 'league-state.json')
    for entry in state['hallOfFame']:
        entry['modelPath'] = '../' + OLD.name + '/' + entry['modelPath']
        entry['calibrationPath'] = '../' + OLD.name + '/' + entry['calibrationPath']
    state['championModelPath'] = '../' + OLD.name + '/' + state['championModelPath']
    state['championCalibrationPath'] = '../' + OLD.name + '/' + state['championCalibrationPath']
    state['quarantinedReplayBuffer'] = state['replayBufferManifest']
    state['replayBufferManifest'] = []
    state['schema'] = 'dual-v2-resumable-league-v2-gen02'
    state['predecessor'] = dict(path='../' + OLD.name + '/league-state.json', sha256=old_state_sha)
    (HERE / 'league-state.json').write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    (HERE / 'generations').mkdir()
    print(json.dumps(dict(parent=state['championModelPath'], sha256=state['championSha256'], currentGeneration=state['currentGeneration'], oldReplayQuarantined=True)))


if __name__ == '__main__':
    main()
