"""收尾独立核验全部256样本的纯价值输出与编译后端错误。"""
from gpu_bench import *
def check():
    torch.set_num_threads(2)
    rows=decode(json.loads((DATA/'observations.json').read_text()),(DATA/'observations.bin').read_bytes())
    model=load_model('D:/AncientEmpiresData/continuation_stage5_20261104_v1/heads-v1/H1/final').cuda().eval()
    result=json.loads((HERE/'GPU_KERNEL_BENCH.json').read_text('utf-8'));result['consistencyValueOnly']={};reference=None
    with torch.inference_mode():
      for tier in ['G0','G1','G2']:
        model.accurate_reductions(tier=='G0');values=[];parity=0.
        for i in range(0,256,16):
            x=move(accurate_batch.collate(rows[i:i+16]),'cuda')
            a=forward(model,x,tier,False)['valueProbs'].float().cpu()
            b=forward(model,x,tier,True)['valueProbs'].float().cpu()
            parity=max(parity,(a-b).abs().max().item());values.append(b)
        values=torch.cat(values)
        if reference is None:reference=values
        difference=(values-reference).abs()
        result['consistencyValueOnly'][tier]={'samples':256,'maxAbsValueProbDiff':difference.max().item(),'meanAbsValueProbDiff':difference.mean().item(),'fullVersusValueOnlyMaxAbsDiff':parity,'policyMetrics':None}
      try:
        os.environ['TORCHINDUCTOR_CACHE_DIR']=str(DATA/'inductor-cache')
        os.environ['TRITON_CACHE_DIR']=str(DATA/'triton-cache')
        compiled=torch.compile(lambda x:x.sin()+x,fullgraph=True)
        compiled(torch.ones(8,device='cuda'));torch.cuda.synchronize()
        result['G3']['actualProbe']='小算子后端成功；没有完成整模型编译基准，不能声称整模型加速'
      except Exception as e:
        result['G3']['actualProbeException']=repr(e)
    save(result)
if __name__=='__main__':
    ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)
    try:check()
    finally:ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)
