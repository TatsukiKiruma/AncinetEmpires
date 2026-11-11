"""常驻推理服务；同协议支持256观测及整批有限性检查。"""
from gpu_bench import *
import struct
from data import exact
def main_service():
    torch.set_num_threads(2)
    tier=sys.argv[1] if len(sys.argv)>1 else 'G1'
    model=load_model('D:/AncientEmpiresData/continuation_stage5_20261104_v1/heads-v1/H1/final').accurate_reductions(tier=='G0').cuda().eval()
    source,sink=sys.stdin.buffer,sys.stdout.buffer
    with torch.inference_mode():
      while first:=source.read(1):
        ms,bs=struct.unpack('<II',first+exact(source,7));meta=json.loads(exact(source,ms));rows=decode(meta,exact(source,bs))
        if not 1<=len(rows)<=256:raise ValueError('物理批次超限')
        value_only=bool(meta.get('valueOnly',False));x=move(accurate_batch.collate(rows),'cuda')
        torch.cuda.synchronize();start=time.perf_counter();out=forward(model,x,tier,value_only)
        if not bool(torch.stack([torch.isfinite(v).all() for v in out.values()]).all()):raise ValueError('非有限输出')
        torch.cuda.synchronize();ms_gpu=(time.perf_counter()-start)*1000
        fields={k:v.float().cpu() for k,v in out.items()};parts=[struct.pack('<II',0x35454149,len(rows))]
        for i,row in enumerate(rows):
          for k in ['logits','valueLogits','valueProbs','actorPrior']:
            v=fields[k][i]
            if k=='logits':v=v[:len(row['pointers'])] if not value_only else v[:0]
            if k=='actorPrior' and not value_only:v=torch.cat([v[:len(row['entities'])],v[-1:]])
            v=v.numpy().astype('<f4',copy=False);parts.extend([struct.pack('<I',v.size),v.tobytes()])
        payload=b''.join(parts);sink.write(struct.pack('<I',len(payload))+payload);sink.flush()
        print(json.dumps({'gpuMs':ms_gpu,'batch':len(rows),'valueOnly':value_only}),file=sys.stderr,flush=True)
if __name__=='__main__':
    ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)
    try:main_service()
    finally:ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)
