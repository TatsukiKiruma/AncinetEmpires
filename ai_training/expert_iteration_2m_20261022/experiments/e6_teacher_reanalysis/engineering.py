"""本轮冠军105例跨语言复测，写入新目录，旧参考结果仅只读。"""
import shutil
import subprocess
import sys
from core import HERE, R, ROOT, write_new, digest, check_budget, read


def node(script, *args):
    check_budget()
    subprocess.run(['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', str(script), *map(str, args)], cwd=ROOT, check=True)


def parity(prefix):
    check_budget()
    subprocess.run([sys.executable, '-B', '-X', 'utf8', str(R / 'export_reference.py'), str(prefix)], cwd=ROOT, check=True)
    node(R / 'parity.ts', prefix)
    result = read(str(prefix) + '-node-parity.json')
    assert result['passed'] and result['samples'] == 105
    return result


if __name__ == '__main__':
    directory = __import__('pathlib').Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'engineering'
    assert directory.is_relative_to(HERE)
    directory.mkdir(parents=True, exist_ok=True)
    node(HERE / 'regression.ts', directory / 'encoding-regression.json')
    for suffix in ['.bin', '.json']:
        with (R / 'training/pretrain_full' / ('model' + suffix)).open('rb') as src, (directory / ('champion' + suffix)).open('xb') as dst:
            shutil.copyfileobj(src, dst)
    result = parity(directory / 'champion')
    write_new(directory / 'gate.json', dict(passed=True, parity=result, championSha256=digest(directory / 'champion.bin'), experimentTrainingUpdates=0))
