"""异形请求合批、缓冲复用和非法输入回归；不读取历史轨迹。"""
import sys
from pathlib import Path
import unittest
import numpy as np
import torch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_hard_kernel import HardKernelTests, reference
from hip_batch import HipBatch


def pack(r):
    groups = ['positions', 'enemyPositions', 'allyPositions', 'landingPositions']
    return np.array([*[len(r[k]) for k in groups], r['landingCount'], r['unitValue'], r['maxRange'],
                     r['situation'] if r['situation'] is not None else 1,
                     *[x for k in groups for p in r[k] for x in p], *r['defenses']], dtype=np.float64)


class BatchTests(unittest.TestCase):
    def test_all_start_movement_order_and_mixed_batches(self):
        import random
        rng=random.Random(20261029)
        backend=HipBatch()
        for rows,cols,move in [(3,4,0),(3,4,5),(8,9,7),(16,20,9)]:
            cells=rows*cols
            costs=[rng.choice([1,1,2,3,1000]) for _ in range(cells)]
            blocked=[int(rng.random()<.15) for _ in range(cells)]
            capacity=min(cells,1+2*move*(move+1))
            actual=[]
            for first in range(0,cells,32):
                inputs=[np.array([capacity,-1,rows,cols,move,origin,0,0,*costs,*blocked],dtype=np.float64) for origin in range(first,min(cells,first+32))]
                ordinary=pack(next(HardKernelTests().requests()))
                output,counts,_=backend.calculate([ordinary,*inputs,ordinary])
                actual.extend(output[counts[0]*3:-counts[-1]*3].reshape(len(inputs),capacity,3).copy())
            for origin in range(cells):
                best=[-1]*cells;order=[-1]*cells;best[origin]=move;order[origin]=0
                queue=[(origin,move)];head=0;discovered=1
                while head<len(queue):
                    pos,remaining=queue[head];head+=1;r,c=divmod(pos,cols)
                    for dr,dc in [(0,-1),(1,0),(0,1),(-1,0)]:
                        nr,nc=r+dr,c+dc
                        if not 0<=nr<rows or not 0<=nc<cols:continue
                        k=nr*cols+nc
                        if blocked[k]:continue
                        left=remaining-costs[k]
                        if left>=0 and left>(best[k] or -1):
                            best[k]=left;queue.append((k,left))
                            if order[k]<0:order[k]=discovered;discovered+=1
                expected=sorted((order[k],k,best[k]) for k in range(cells) if order[k]>=0)
                found=[(int(item[0]),int(item[1])) for item in actual[origin] if item[0]>=0]
                self.assertEqual(found,[(k,left) for _,k,left in expected])

    def test_heterogeneous_batches_and_reused_buffers(self):
        torch.set_num_threads(1)
        backend = HipBatch()
        requests = list(HardKernelTests().requests())
        for indices in [list(range(64)), [63, 0, 17, 2], [7], list(range(63, -1, -1))]:
            batch = [requests[i] for i in indices]
            output, counts, _ = backend.calculate([pack(r) for r in batch])
            offset = 0
            for request, count in zip(batch, counts):
                expected = reference(request)
                actual = output[offset:offset+count*3].reshape(count, 3)
                np.testing.assert_allclose(actual, np.array([expected[k] for k in ['enemy','ally','landing']]).T, rtol=1e-12, atol=1e-10)
                offset += count*3

    def test_invalid_layout_and_noninteger_coordinates(self):
        data = pack(next(HardKernelTests().requests()))
        for mutated in [data[:-1], np.concatenate([data, [0]])]:
            with self.assertRaises(ValueError): HipBatch.validate(mutated)
        data[8] = .5
        with self.assertRaises(ValueError): HipBatch.validate(data)


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(BatchTests)
    result = unittest.TextTestRunner().run(suite)
    # HIP卸载可能阻塞，测试结果先刷新再结束进程。
    import os
    import ctypes
    sys.stderr.flush(); sys.stdout.flush()
    terminate = ctypes.windll.kernel32.TerminateProcess
    terminate.argtypes = [ctypes.c_void_p, ctypes.c_uint]
    terminate(ctypes.c_void_p(-1), 0 if result.wasSuccessful() else 1)
