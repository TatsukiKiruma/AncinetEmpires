"""让交付声明使用登记容量，同时保留历史Top6的事实。"""
from pathlib import Path
HERE=Path(__file__).resolve().parent;p=HERE/'deliver.py';source=p.read_text(encoding='utf-8')
assert "required+=['root-capacity-red-green-gate.json'" not in source
source=source.replace("required+=['proposal-reuse-gate.json','browser-proposal.json','numeric-proposal.json']","required+=['proposal-reuse-gate.json','browser-proposal.json','numeric-proposal.json']\nrequired+=['root-capacity-red-green-gate.json','search-capacity-speed-gate.json']")
source=source.replace("identity=read('teacher-model-identities.json')","identity=read('teacher-model-identities.json')")
source=source.replace("identities=read('final-model-identities.json');", "searchBudget=read(read('ACTIVE_SEARCH_PROTOCOL.json')['path']).get('searchBudget',dict(topK=6,maxFollowNodes=24,maximumOwnNodes=150))\nidentities=read('final-model-identities.json');")
source=source.replace("assert read('veto-objective-red-green-gate.json')['passed']","assert read('veto-objective-red-green-gate.json')['passed']\nassert read('root-capacity-red-green-gate.json')['passed'] and read('root-capacity-red-green-gate.json')['currentSha256']==sha(HERE/'model_battle_search_ai.ts')")
source=source.replace('总Top6/24/150节点预算及全部安全守卫保持','R16为Top6/24/150；R17起原六根完整保留，再补至Top12/24/300，全部安全守卫保持')
assert source.count('Top6同单位完整连动')==1
source=source.replace('Top6同单位完整连动',"Top{searchBudget['topK']}同单位完整连动")
source=source.replace("models=identities['models'],proposal=identities['proposal'],", "models=identities['models'],proposal=identities['proposal'],searchBudget=searchBudget,")
compile(source,str(p),'exec');p.write_text(source,encoding='utf-8');print('交付容量与门禁声明已更新，原历史Top6描述保留')
