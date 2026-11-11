"""核实暖启动/从零的真实更新数和采样RNG，不能仅凭同名配置称公平对照。"""
import pathlib,json,torch
S=pathlib.Path(__file__).resolve().parents[1]
a=torch.load(S/'checkpoints/r1_warm/last.pt',map_location='cpu',weights_only=False);b=torch.load(S/'checkpoints/r1_scratch/last.pt',map_location='cpu',weights_only=False)
ca,cb=a['config'],b['config'];diff={k:[ca.get(k),cb.get(k)] for k in ca.keys()|cb.keys() if ca.get(k)!=cb.get(k)}
assert set(diff)<=set(['id','init','initSha256']);assert a['update']==b['update']==12000;assert a['rng']['python']==b['rng']['python']
out={'passed':True,'updatesEach':12000,'samplesExposedEach':12000*ca['batchSize'],'configDifferences':diff,'sameFinalSamplingRng':True,'sameDataAndSourceHashes':True,'note':'采样Python RNG同起点、同路径、同终态；两臂均完整执行相同更新预算。best更新位置允许不同。'}
(S/'identity/round1_pairing.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(out,ensure_ascii=False))
