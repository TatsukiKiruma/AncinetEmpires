"""冻结价值与外置系数，重新流过完整开发集核验16切片，不按实战拟合。"""
import gzip
import json
import math
import os
import shutil
import sys
import importlib.util
import torch
from data import DIR
spec = importlib.util.spec_from_file_location('gen02_calibration', DIR / 'calibrate.py')
calibration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(calibration)
collect, evaluate, save = calibration.collect, calibration.evaluate, calibration.save


def main(gen):
    torch.set_num_threads(4)
    folder = DIR / f'generations/gen_{gen:02d}'
    original = DIR.parent / 'dual_stream_v2_phase5_20261020/generations/gen_00'
    config = json.loads((original / 'value-config.json').read_text('utf-8'))
    params = []
    for c in config['buckets']:
        mixture = max(1e-12, min(1 - 1e-12, c['mixture']))
        params.append([math.log(c['temperature']), c['army'], c['income'], c['commander'], c['actionable'], math.log(mixture / (1 - mixture))])
    # 只读取旧训练缓存中的真实标签以重建席位先验，旧网络预测与旧门禁不复用。
    with gzip.open(original / 'train-calibration.pt.gz', 'rb') as f:
        labels = torch.load(f, weights_only=False)['target']
    os.environ.pop('LEAGUE_BASE_RATE', None)
    dev = collect(folder, 'dev', max(1, gen))
    slices = evaluate(dict(target=labels), dev, torch.tensor(params, dtype=torch.float64))
    shutil.copyfile(original / 'head-calibration.json', folder / 'head-calibration.json')
    save(folder / 'value-config.json', config)
    save(folder / 'value-calibration.json', dict(passed=len(slices) == 16 and all(s['allBaselinesExceeded'] for s in slices.values()), slices=slices, trainOnly=True, frozenValueAndCalibration=True, inheritedFrom=str(original), devForwardRecomputed=True, oldNumericReceiptsReused=False, trainValueSamples=len(labels), devValueSamples=len(dev['target']), selectionUsesBattleOutcomes=False))
    print(json.dumps(dict(generation=gen, devSamples=len(dev['target']), passed=all(s['allBaselinesExceeded'] for s in slices.values()))), flush=True)


if __name__ == '__main__':
    main(int(sys.argv[1]))
