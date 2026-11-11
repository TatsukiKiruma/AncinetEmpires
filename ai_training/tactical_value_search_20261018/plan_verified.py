"""补齐用户实际事件条件后的独立50槽，原200槽与模型完整保留。"""
from pathlib import Path
import json,hashlib
HERE=Path(__file__).resolve().parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
save=lambda n,x:(HERE/n).write_text(json.dumps(x,ensure_ascii=False),encoding='utf-8')
assert not (HERE/'battle-verified-plan.json').exists()
for name in ['verified-search-gate.json','response-verified-regression.json','search-verified-purity-gate.json']:assert read(HERE/name)['passed'],name
plan=read(HERE/'battle-plan.json');slots=[dict(s,id='verified-'+s['id'],model='bounded_verified',decoder='bounded_verified',variant='verified_events',pairedOriginalSlotId=s['id']) for s in plan['slots'] if s['model']=='bounded'];assert len(slots)==50
save('battle-verified-plan.json',dict(plan,slots=slots,totalSlots=50,arms=['bounded_verified'],additionalDevelopmentVariant=True,originalResultsReplaced=False))
save('verified-search-protocol.json',dict(reason='补齐用户真实斩杀/占城/招募接管条件，原纯Value分差接管过宽；保留全部原200对比',modelUnchanged=True,policyAndValueRetrained=False,originalResultsReplaced=False,additionalSlots=50,pairedInitialsAndOpponentSeeds=True,topK=6,friendlyRolloutSteps=3,oppProbeK=3,maxTreeNodes=48,maxGameTreeNodes=2400,maxTriggerMoveProbes=6,triggerProbeTimeIncludedInWallBudget=True,takeoverMargin=.08,vetoMargin=.03,vetoRequiresVerifiedThreat=True,takeoverRequiresAdditionalFriendlyEvent=True,ordinaryRootTakeoverEvents=['enemy_commander_kill','enemy_castle_capture'],closingRootAdditionalEvents=['enemy_kill','capture','recruit','free_attack'],isPreregistered=False,usesBattleResultsToFitParameters=False))
frozen=read(HERE/'battle-dynamic-source-freeze.json')
for name in ['battle_verified.ts','search_verified.ts','model_battle_search_verified_ai.ts','verified_events.ts','battle-verified-plan.json','verified-search-protocol.json']:frozen[name]=hashlib.sha256((HERE/name).read_bytes()).hexdigest()
save('battle-verified-source-freeze.json',frozen);print(json.dumps(dict(slots=50,originalSlotsRetained=200)))
