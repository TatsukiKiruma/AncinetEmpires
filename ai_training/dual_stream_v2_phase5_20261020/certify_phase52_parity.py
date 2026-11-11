"""仅组合已有的真实PyTorch/Node/Chrome收据，不替代任何实际执行。"""
from run_league import DIR, read, save, sha, verify_runtime_contract

verify_runtime_contract()
folder = DIR / 'generations/gen_03'
node, chrome = read(folder / 'model-node-parity.json'), read(folder / 'model-browser-parity.json')
model, samples = sha(folder / 'model.bin'), sha(folder / 'samples.bin')
assert node['passed'] and chrome['passed'] and chrome['chromeProfileCleaned']
assert node['modelSha256'] == chrome['weightsSha256'] == model
assert node['samplesSha256'] == chrome['samplesSha256'] == samples
assert node['finalPipelineOriginalStates'] == 89 and node['calibratedSamples'] == 89
assert all(node[k] == 0 for k in ['maxLogit', 'maxActor', 'maxValue', 'pipelineError', 'calibratedError'])
assert all(chrome[k] == 0 for k in ['maxLogit', 'maxActor', 'maxValue', 'maxNode'])
save(folder / 'tri-runtime-parity.json', dict(passed=True, states=89, modelSha256=model, node=node, chrome=chrome))
print(dict(passed=True, states=89, maximumError=0, chromeProfileCleaned=True))
