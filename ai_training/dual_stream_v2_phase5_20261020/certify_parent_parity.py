"""汇合已实际执行的PyTorch/Node/Chrome收据，核验当前模型、父代及运行时身份。"""
from run_league import DIR, ROOT, read, save, sha

folder = DIR / 'generations/gen_02'
n, c = read(folder / 'model-node-parity.json'), read(folder / 'model-browser-parity.json')
runtime = read(DIR / 'RUNTIME_REVISION.json')['gen2RuntimeSha256']
assert n['passed'] and c['passed'] and c['chromeProfileCleaned']
assert n['modelSha256'] == c['weightsSha256'] == sha(folder / 'model.bin')
assert n['samplesSha256'] == c['samplesSha256'] == sha(folder / 'samples.bin')
assert all(sha(ROOT / path) == digest and c['runtimeIdentity'][path.split('/')[-1]] == digest for path, digest in runtime.items())
config = read(folder / 'value-config.json')
assert config['parentModelSha256'] == sha(folder / 'parent-model.bin')
save(folder / 'tri-runtime-parity.json', dict(passed=True, states=89, modelSha256=sha(folder / 'model.bin'), parentModelSha256=config['parentModelSha256'], valueConfigSha256=sha(folder / 'value-config.json'), headCalibrationSha256=sha(folder / 'head-calibration.json'), runtimeSha256=runtime, node=n, chrome=c))
print('89状态三端、父代、校准及运行时身份均核验通过')
