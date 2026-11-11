"""前检通过后才准备当前第3代模型的三端输入与CPU参考。"""
import sys
from run_league import DIR, read, sha, node, command, verify_runtime_contract

verify_runtime_contract()
folder = DIR / 'generations/gen_03'; audit = read(folder / 'dev-policy-audit.json')
assert audit['passed'] and audit['modelSha256'] == sha(folder / 'model.bin')
env = dict(LEAGUE_FOLDER=str(folder))
node('gen3-joint-prepare-parity.log', 'prepare_parity.ts', env=env)
command('gen3-joint-reference.log', [sys.executable, '-B', '-X', 'utf8', str(DIR / 'reference.py')], env)
node('gen3-joint-node-parity.log', 'parity.ts', 'node', env=env)
print(dict(nodePassed=read(folder / 'model-node-parity.json')['passed'], chromeStillRequired=True))
