"""G1 常驻推理服务：分桶、锁页输入、单次整批输出回传。"""
import os
import sys
import struct
import json
import ctypes
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage8_20261110_v1')
os.environ['MIOPEN_USER_DB_PATH'] = str(DATA / 'miopen-fp32-db')
os.environ['MIOPEN_CUSTOM_CACHE_DIR'] = str(DATA / 'cache')
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parent / 'stage7'))
from fp32_forward import forward, torch
from batch_v2 import Collator, cpu_output
from common import load_model
from data import decode, exact
resources = []

def main():
    torch.set_num_threads(int(os.environ.get('STAGE7_THREADS', '2')))
    model = load_model('D:/AncientEmpiresData/continuation_stage5_20261104_v1/heads-v1/H1/final').accurate_reductions(False).cuda().eval()
    collate = Collator()
    # EOF后由操作系统回收锁页内存，避免函数返回或解释器终结时执行hipHostFree。
    resources.extend((model, collate))
    source, sink = sys.stdin.buffer, sys.stdout.buffer
    print(json.dumps({'ready': True, 'pid': os.getpid(), 'device': torch.cuda.get_device_name(),
        'findMode': os.environ.get('MIOPEN_FIND_MODE', 'default'), 'torch': torch.__version__}), file=sys.stderr, flush=True)
    with torch.inference_mode():
        while first := source.read(1):
            ms, bs = struct.unpack('<II', first + exact(source, 7))
            if not 0 < ms < 2**24 or not 0 < bs < 2**29:
                raise ValueError('请求长度越界')
            meta = json.loads(exact(source, ms))
            rows = decode(meta, exact(source, bs))
            mode = bool(meta.get('valueOnly', False))
            x = collate(rows)
            fields = cpu_output(forward(model, x, mode))
            parts = [struct.pack('<II', 0x35454149, len(rows))]
            for i, row in enumerate(rows):
                for k, matrix in enumerate(fields):
                    value = matrix[i]
                    if k == 0:
                        value = value[:0 if mode else len(row['pointers'])]
                    elif k == 3 and not mode:
                        import numpy as np
                        value = np.concatenate((value[:len(row['entities'])], value[-1:]))
                    parts.extend((struct.pack('<I', value.size), value.tobytes()))
            payload = b''.join(parts)
            sink.write(struct.pack('<I', len(payload)) + payload)
            sink.flush()

if __name__ == '__main__':
    if not ctypes.windll.kernel32.SetThreadExecutionState(0x80000001):
        raise RuntimeError('防休眠锁获取失败')
    exit_code = 0
    try:
        main()
    except BaseException:
        traceback.print_exc()
        exit_code = 1
    finally:
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)
        sys.stdout.flush()
        sys.stderr.flush()
    os._exit(exit_code)
