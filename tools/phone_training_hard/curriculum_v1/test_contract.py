"""对冻结3000局做合同检查，不调用游戏结算或重放。"""
from collections import Counter
from pathlib import Path
import hashlib
import json
import unittest
import time
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from html import make_htmls
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'ai_training/hard_curriculum3000_execution_20261027'
PLAN=ROOT/'ai_training/hard_curriculum3000_plan_20261027'

def load(p):return json.loads(p.read_text(encoding='utf-8'))
class ContractTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.jobs=load(OUT/'JOBS.json')['jobs'];cls.slots={s['slotId']:s for s in load(PLAN/'DESIGN_SLOTS.json')['slots']}
 def test_frozen_design_unchanged(self):
  for entry in load(PLAN/'DELIVERY_MANIFEST.json')['files']:
   p=PLAN/entry['path'];self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),entry['sha256'])
 def test_sequence_identity_and_all_slots(self):
  self.assertEqual([j['executionSequence'] for j in self.jobs],list(range(1,3001)))
  self.assertEqual({j['designSlotId'] for j in self.jobs},set(self.slots))
  self.assertEqual(len({j['seed'] for j in self.jobs}),3000)
  for j in self.jobs:
   s=self.slots[j['designSlotId']];self.assertEqual(j['seed'],s['nativeSeed']);self.assertEqual(j['parentId'],s['slotId']);self.assertEqual(j['mapAssetSha256'],s['mapAssetSha256'])
 def test_batch_quotas(self):
  for k in range(3):
   jobs=self.jobs[k*1000:(k+1)*1000]
   self.assertEqual(Counter(j['actualPlayerCount'] for j in jobs),{2:400,3:300,4:300})
   self.assertEqual(Counter(j['category'] for j in jobs),{'normal':100,'parameter_variant':100,'advantage_endgame':300,'preset_units':200,'high_tier':100,'skill':100,'building_finish':100})
   self.assertEqual(len(Counter((j['category'],j['actualPlayerCount']) for j in jobs[:42])),21)
   self.assertEqual(set(Counter((j['category'],j['actualPlayerCount']) for j in jobs[:42]).values()),{2})
 def test_complete_derived_fields_and_hash(self):
  required={'type','ownerId','pos','level','exp','hp','movementRemaining','hasActed','supported','registeredCommander','targeted','status','head','code'}
  for j in self.jobs:
   if not j['state']:continue
   s=j['state'];self.assertEqual(len(s['players']),j['actualPlayerCount'])
   self.assertEqual(set(p['id'] for p in s['players']),set(j['activeNativePlayerIds']))
   self.assertEqual(hashlib.sha256(json.dumps(s,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),j['initialStateSha256'])
   positions=set()
   for u in s['units']:
    self.assertEqual(set(u),required);self.assertGreater(u['hp'],0)
    p=(u['pos']['x'],u['pos']['y']);self.assertNotIn(p,positions);positions.add(p)
   for p in s['players']:
    own=[u for u in s['units'] if u['ownerId']==p['id']]
    self.assertEqual(sum(u['registeredCommander'] for u in own),1)
    target=self.slots[j['designSlotId']]['targetUnitsPerSide']
    if target:self.assertEqual(len(own),target)
   for b in s['buildings']:self.assertIn(b['owner'],[0,1,2,3,4,5,4094,4095])
 def test_skill_and_endgame_requirements(self):
  ratios={'small_advantage':1.25,'medium_advantage':1.75,'large_advantage':2.5,'small_disadvantage':.8,'medium_disadvantage':.57}
  for j in self.jobs:
   if j['category']=='advantage_endgame':self.assertLessEqual(abs(j['construction']['materialRatio']/ratios[j['profile']]-1),.1)
   if j['category']=='skill':
    for o in j['construction']['opportunities']:
     key=j['profile'];value=o['auraPairs'] if key=='aura' else o['assaultRoutes'] if key=='assault' else o['legalActionCounts'].get(key,0)
     self.assertGreater(value,0)
 def test_two_shards_no_overlap_and_no_replay(self):
  p=load(OUT/'mi8-v1/PLAN.json');a,b=[set(w['sequences']) for w in p['workers']]
  self.assertEqual(len(a),500);self.assertEqual(len(b),500);self.assertFalse(a&b);self.assertEqual(a|b,set(range(1,1001)))
  for wid in ['w00','w01']:
   controller=(OUT/'collector-v5/controller.sh').read_text(encoding='utf-8')
   self.assertIn('test "$STARTED_COUNT" -ge 3',controller);self.assertIn('test "$RUN_ORDINAL" -ge 3',controller)
   for f in (OUT/'mi8-v1'/wid/'configs').glob('*.json'):
    cfg=load(f);self.assertEqual(cfg['replay'],'disabled_by_user');self.assertFalse(cfg['independentReplayDeferred']);self.assertEqual(cfg['job']['maxEffectiveSeconds'],21600)
    self.assertEqual(cfg['populationLimit'],cfg['job']['setup']['unitLimit'])
 def test_html_cap_and_receipt_marker_are_the_only_changes(self):
  import re
  original=(ROOT/'ai_training/hard_native_1000_20261022/production-independent-05/hard-ai-runtime.fixed.html').read_text(encoding='utf-8')
  values=make_htmls(original)
  for cap,value in values.items():
   normalized=re.sub(r'TEAM_POPULATION_LIMIT\s*=\s*'+cap+r'\s*;','TEAM_POPULATION_LIMIT = 30;',value)
   normalized=re.sub(r'__AEII_NATIVE_POP_LIMIT__\s*=\s*'+cap+r'\s*;','__AEII_NATIVE_POP_LIMIT__=30;',normalized)
   self.assertEqual(normalized,original)

if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(ContractTests)
 result=unittest.TextTestRunner(verbosity=2).run(suite)
 target=OUT/'CONTRACT_TESTS.json'
 if target.exists():target=OUT/('CONTRACT_TESTS-'+str(time.time_ns())+'.json')
 with target.open('x',encoding='utf-8') as f:json.dump({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'replay':'disabled_by_user'},f,ensure_ascii=False,indent=2)
 raise SystemExit(0 if result.wasSuccessful() else 1)
