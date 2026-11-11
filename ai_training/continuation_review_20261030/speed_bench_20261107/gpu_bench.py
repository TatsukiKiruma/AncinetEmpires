"""独立推理实验：历史代码只读加载，所有新结果仅写入本次目录。"""
import os, sys, json, time, statistics, ctypes, traceback, hashlib
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
DATA=Path('D:/AncientEmpiresData/speed_bench_20261107_v1')
os.environ['PYTHONDONTWRITEBYTECODE']='1'
os.environ['MIOPEN_USER_DB_PATH']='D:/AncientEmpiresData/continuation_stage5_20261104_v1/miopen-db'
os.environ['MIOPEN_CUSTOM_CACHE_DIR']='D:/AncientEmpiresData/continuation_stage5_20261104_v1/miopen-cache'
sys.dont_write_bytecode=True
sys.path[:0]=[str(HERE.parent/'stage6'),str(HERE.parent/'stage3'),str(ROOT/'ai_training/gpu')]
import torch
from common import load_model, move
from data import decode
import ragged_map
native_norm,native_pool=ragged_map.norm,ragged_map.pool
import accurate_batch
precise_norm,precise_pool=ragged_map.norm,ragged_map.pool

# 在独立命名空间生成纯FP32归约路径，旧模块不会被写回。
source=(HERE.parent/'stage6/accurate_batch.py').read_text('utf-8')
source=source[source.index('def forward_batch'):].replace('.double()', '.float()').replace('torch.float64','torch.float32').replace(', True)', ', False)')
# autocast仅覆盖主干，策略组装及价值归约使用FP32。
split=source.index('    if value_only:')
source=source[:split]+source[split:].replace('    if value_only:', '    ent = ent.float(); fmap = fmap.float(); gmap = gmap.float()\n    if value_only:',1)
split=source.index('    ent = ent.float()')
source=source[:split]+"    with torch.autocast('cuda', enabled=False):\n"+''.join('    '+line if line.strip() else line for line in source[split:].splitlines(True))
scope={'torch':torch,'F':torch.nn.functional,'ragged_map':ragged_map,'ops':accurate_batch.ops}
exec(compile(source,str(HERE/'generated_fp32_forward.py'),'exec'),scope)
fast_forward=scope['forward_batch']

def forward(model,x,tier,value_only=False):
    if tier=='G0':
        ragged_map.norm,ragged_map.pool=precise_norm,precise_pool
        return accurate_batch.forward_batch(model,x,value_only)
    ragged_map.norm,ragged_map.pool=native_norm,native_pool
    if tier=='G1': return fast_forward(model,x,value_only)
    # 线性层通过包装关闭策略与价值部分的autocast，保持输出头FP32。
    with torch.autocast('cuda',dtype=torch.bfloat16):
        return fast_forward(model,x,value_only)

def save(obj): (HERE/'GPU_KERNEL_BENCH.json').write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')
def main():
    torch.set_num_threads(2)
    prefix='D:/AncientEmpiresData/continuation_stage5_20261104_v1/heads-v1/H1/final'
    model=load_model(prefix).cuda().eval()
    rows=decode(json.loads((DATA/'observations.json').read_text()),(DATA/'observations.bin').read_bytes())
    report={'status':'running','device':torch.cuda.get_device_name(0),'torch':torch.__version__,'hip':torch.version.hip,'samples':256,'rounds':20,'measurements':[],'consistency':{},'errors':[],'sealedAccess':0}
    references=[]
    with torch.inference_mode():
      for tier in ['G0','G1','G2']:
        model.accurate_reductions(tier=='G0')
        try:
          outputs=[]
          for i in range(0,256,16):
            x=move(accurate_batch.collate(rows[i:i+16]),'cuda')
            o=forward(model,x,tier)
            for j,r in enumerate(rows[i:i+16]):outputs.append((o['valueProbs'][j].float().cpu(),o['logits'][j,:len(r['pointers'])].float().cpu()))
          if tier=='G0':references=outputs
          else:
            vd=torch.cat([(a[0]-b[0]).abs() for a,b in zip(outputs,references)])
            pd=torch.cat([(a[1]-b[1]).abs() for a,b in zip(outputs,references)])
            report['consistency'][tier]={'maxAbsValueProbDiff':vd.max().item(),'meanAbsValueProbDiff':vd.mean().item(),'maxAbsPolicyLogitDiff':pd.max().item(),'top1PolicyAgreement':sum(a[1].argmax()==b[1].argmax() for a,b in zip(outputs,references)).item()/256,'top3PolicyOverlap':sum(len(set(a[1].topk(3).indices.tolist())&set(b[1].topk(3).indices.tolist()))/3 for a,b in zip(outputs,references))/256}
          for value_only in [False,True]:
            for batch in [1,4,16,64,128,256]:
              # 固定分层样本前缀混合人数及阶段；计时含前向与一次整批有限性同步，不含编码搬运。
              x=move(accurate_batch.collate(rows[:batch]),'cuda')
              for _ in range(3):forward(model,x,tier,value_only)
              torch.cuda.synchronize();torch.cuda.reset_peak_memory_stats();times=[]
              for _ in range(20):
                start=time.perf_counter();o=forward(model,x,tier,value_only)
                valid=torch.stack([torch.isfinite(v).all() for v in o.values()]).all()
                if not bool(valid):raise ValueError('输出含非有限值')
                torch.cuda.synchronize();times.append((time.perf_counter()-start)*1000)
              report['measurements'].append({'tier':tier,'B':batch,'valueOnly':value_only,'obsPerSec':batch/(statistics.mean(times)/1000),'meanMs':statistics.mean(times),'medianMs':statistics.median(times),'max_memory_allocated_mb':torch.cuda.max_memory_allocated()/2**20})
              save(report);print(json.dumps(report['measurements'][-1]),flush=True)
              del x,o
        except Exception as e:
          report['errors'].append({'tier':tier,'error':str(e),'traceback':traceback.format_exc()});save(report)
          torch.cuda.empty_cache()
      # 只探测后端可用性，避免编译吞掉整体预算。
      try:
        import importlib.util
        if importlib.util.find_spec('triton') is None:raise RuntimeError('Windows ROCm环境未安装Triton，inductor GPU编译不可用；未将eager回退记为编译加速')
        compiled=torch.compile(lambda x:x.sin()+x,fullgraph=True)
        compiled(torch.ones(8,device='cuda'));torch.cuda.synchronize()
        report['G3']={'status':'backend_probe_only','modelBenchmark':False}
      except Exception as e:report['G3']={'status':'unavailable','error':repr(e)}
      eligible=['G0']+[k for k,v in report['consistency'].items() if v['top1PolicyAgreement']>=.99 and v['maxAbsValueProbDiff']<.002 and not any(e['tier']==k for e in report['errors'])]
      report['selected']=max(eligible,key=lambda k:statistics.mean(r['obsPerSec'] for r in report['measurements'] if r['tier']==k and r['B'] in [4,16,64]))
      report['status']='complete';save(report)
if __name__=='__main__':
    ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)
    try:main()
    finally:ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)
