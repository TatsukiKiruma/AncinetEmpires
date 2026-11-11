"""困难AI原公式的双精度批量计算；没有模型、训练或游戏结算。"""
import argparse
import json
import math
import sys
import time
import torch


def rounded(value):
    # JS Math.round向正无穷处理半整数，不使用torch.round的银行家舍入。
    return torch.floor((value + 2.220446049250313e-16) * 100 + .5) / 100


def calculate(request, device):
    positions = torch.tensor(request['positions'], dtype=torch.float64, device=device).reshape(-1, 2)
    def distance(points, count=None):
        denominator = len(points) if count is None else count
        if not denominator:
            return torch.zeros(len(positions), dtype=torch.float64, device=device)
        if points:
            targets = torch.tensor(points, dtype=torch.float64, device=device).reshape(-1, 2)
            total = (positions[:, None, :] - targets[None, :, :]).abs().sum(2).sum(1)
        else:
            total = torch.zeros(len(positions), dtype=torch.float64, device=device)
        return rounded(total / denominator)
    enemy = distance(request['enemyPositions'])
    ally = distance(request['allyPositions'])
    relocated = distance(request['landingPositions'], request['landingCount'])
    gap = rounded(relocated - enemy)
    defense = torch.tensor(request['defenses'], dtype=torch.float64, device=device) - 10
    ratio = request['situation'] if request['situation'] is not None else 1.
    positive = -(gap - ratio + 1) * request['unitValue'] / 10 + defense * 2
    middle = gap * 10 + defense * 2
    negative = (gap + request['maxRange'] - 1) * 10 + defense
    score = torch.where(gap > 0, positive, torch.where(gap >= -1, middle, torch.where(gap >= -2, negative, 0.)))
    # 只传回CPU端原决策所需的三个向量，复制过程同步设备。
    return {key: value.cpu().tolist() for key, value in dict(enemy=enemy, ally=ally, landing=score).items()}


def validate(request):
    if not isinstance(request, dict):
        raise ValueError('困难数值请求不是对象')
    size = len(request['positions'])
    if not 0 < size <= 10000 or len(request['defenses']) != size:
        raise ValueError('候选数量无效')
    for key in ['positions', 'enemyPositions', 'allyPositions', 'landingPositions']:
        if len(request[key]) > 10000:
            raise ValueError('位置数量超限')
        for row in request[key]:
            if len(row) != 2 or any(not isinstance(x, int) or abs(x) > 10000 for x in row):
                raise ValueError('位置必须是有限整数坐标')
    if request['landingCount'] != len(request['landingPositions']) + 1:
        raise ValueError('落点距离分母未保留移动单位')
    for value in [*request['defenses'], request['unitValue'], request['maxRange'], request['situation'] or 0]:
        if not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError('评分参数不是有限数')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', default='cuda:0')
    parser.add_argument('--backend', choices=['hip', 'torch'], default='hip')
    args = parser.parse_args()
    torch.set_num_threads(1)
    device = torch.device(args.device)
    if device.type not in ('cpu', 'cuda') or device.type == 'cuda' and not torch.cuda.is_available():
        raise RuntimeError('请求的GPU设备不可用；禁止静默回退CPU')
    # 首次双精度算子在握手前完成，启动成本和每次决策成本分开记录。
    warm = torch.arange(8, device=device, dtype=torch.float64).sum().item()
    implementation = None
    if args.backend == 'hip':
        from hard_hip import HipScores
        implementation = HipScores(device)
    print(json.dumps(dict(ready=True, device=str(device), backend=args.backend, kernelSha256=implementation.source_sha256 if implementation else None, name=torch.cuda.get_device_name(device) if device.type == 'cuda' else 'CPU', torch=torch.__version__, hip=torch.version.hip, warm=warm)), flush=True)
    with torch.inference_mode():
        for line in sys.stdin:
            try:
                request = json.loads(line)
                validate(request)
                start = time.perf_counter()
                result = implementation.calculate(request) if implementation else calculate(request, device)
                print(json.dumps(dict(result=result, seconds=time.perf_counter()-start), allow_nan=False), flush=True)
            except Exception as error:
                print(json.dumps(dict(error=repr(error))), flush=True)


if __name__ == '__main__':
    main()
