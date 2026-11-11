"""仅从已生成的检查结果汇总G1，不将缺项视为通过。"""
import pathlib,json,hashlib
S=pathlib.Path(__file__).resolve().parents[1]
names=['runner_contracts.json','core_contracts.json','resume_contract.json','parity_fe9ab8a2af6ddd795e0f366e48589cee5bbe1cba256373c9ff7a73ce3f0fb4b5.json']
checks={n:json.loads((S/'evidence'/n).read_text(encoding='utf8'))['passed'] for n in names}
for name in ['worker','fixtures','parity']:
    d=json.loads((S/f'identity/{name}_bundle_metafile.json').read_text(encoding='utf8'));checks[name+'_closed']=all(str(S) in str(pathlib.Path(p).resolve()) for p in d['inputs'])
report={'passed':all(checks.values()),'checks':checks,'workerSha256':hashlib.sha256((S/'runs/worker.cjs').read_bytes()).hexdigest(),'limits':{'maxSteps':3000,'maxDecisionMs':1000,'maxWallSeconds':300},'repetition':'完整状态hash，只作保护截断，不引入和棋规则。'}
(S/'evidence/gate_g1.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');assert report['passed'];print('G1通过')
