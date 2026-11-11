"""只验证显卡张量算子；不加载模型、决策、优化器或对局数据。"""
import datetime as dt
import json
import os
from pathlib import Path
import sys
import time


def main():
    target = Path(sys.argv[1])
    if target.exists():
        raise FileExistsError("拒绝覆盖既有GPU检查证据")
    record = {
        "utc": dt.datetime.now(dt.timezone.utc).isoformat(), "pid": os.getpid(),
        "parentPid": os.getppid(), "executable": sys.executable, "argv": sys.argv,
        "purpose": "显卡可用性与简单张量计算；不能证明原APK困难AI在GPU运行",
        "gamesStarted": 0, "modelLoads": 0, "optimizerUpdates": 0,
    }
    started = time.perf_counter()
    try:
        import torch
        record.update(torch=torch.__version__, hip=torch.version.hip, cudaAvailable=torch.cuda.is_available())
        if not torch.cuda.is_available():
            raise RuntimeError("显式GPU检查不可回退CPU")
        device = torch.device("cuda:0")
        vector = torch.arange(1024, dtype=torch.float32, device=device)
        result = (vector * vector).sum()
        torch.cuda.synchronize(device)
        expected = sum(index * index for index in range(1024))
        record.update(device=str(device), name=torch.cuda.get_device_name(device),
                      resultDevice=str(result.device), actual=result.item(), expected=expected,
                      finite=bool(torch.isfinite(result).item()))
        record["passed"] = record["finite"] and abs(record["actual"] - expected) <= expected * 1e-6
    except Exception as error:
        record.update(passed=False, error=repr(error))
    record["seconds"] = time.perf_counter() - started
    with target.open("x", encoding="utf-8") as stream:
        json.dump(record, stream, ensure_ascii=False, indent=2)
    print(json.dumps(record, ensure_ascii=False))
    return 0 if record["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
