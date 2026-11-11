"""复用历史数学实现，所有新输出和修改只落在阶段5目录。"""
from pathlib import Path
import json,sys,importlib.util
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
OLD=HERE.parent/'tactical_value_search_20261018'
def put(n,s):
    p=HERE/n
    assert not p.exists(),n
    p.write_text(s,encoding='utf-8')
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
if __name__=='__main__':
    original=read(OLD/'model-final.json');old=original['valueWeights'];d=297;h=64
    weights=[0.]*(d*h)+old[285*h:]
    for i in range(260):weights[i*h:(i+1)*h]=old[i*h:(i+1)*h]
    mapping={0:0,1:1,2:2,3:3,4:4,5:5,7:9,8:14,9:15,10:16,11:17,12:18,13:19,15:23,16:28,17:29,18:30,19:31,20:10,21:11,22:32,23:33,24:36}
    for a,b in mapping.items():weights[(260+b)*h:(261+b)*h]=old[(260+a)*h:(261+a)*h]
    initial=dict(original,valueWeights=weights,valueStateVersion=5,valueInputDimension=d,arm='stage5',epoch=0)
    put('initial.json',json.dumps(initial));put('old-schema.json',(OLD/'old-schema.json').read_text(encoding='utf-8'))
    put('browser-states.json',(OLD/'browser-states.json').read_text(encoding='utf-8'))
    # 数据重放入口保留历史准入和自动换手审计，只替换缓存来源和状态Value摘要。
    source=(OLD/'prepare.ts').read_text(encoding='utf-8')
    source=source.replace("from './features'","from '../tactical_value_search_20261018/features'")
    source=source.replace("import { extendFeatures,valueSummary }", "import { extendFeatures,valueSummary }")
    source=source.replace("const lane =", "import { stateSummary } from './value_state';\nconst lane =")
    source=source.replace("?? 600","?? 900")
    source=source.replace("['prepare.ts','features.ts','focus_threat.ts','../../src/game/engine.ts','../../src/game/rules.ts']","['prepare.ts','value_state.ts','../tactical_value_search_20261018/features.ts','../tactical_value_search_20261018/focus_threat.ts','../../src/game/engine.ts','../../src/game/rules.ts']")
    source=source.replace("const cachedReceipt=path.resolve(DIR,'../tactical_scale_20261018/data-final',parent.parentId+'.receipt.json');", "const stage4Receipt=path.resolve(DIR,'../tactical_value_search_20261018/data',parent.parentId+'.receipt.json');\n    const cachedReceipt=fs.existsSync(stage4Receipt)?stage4Receipt:path.resolve(DIR,'../tactical_scale_20261018/data-final',parent.parentId+'.receipt.json');")
    source=source.replace("const focus=extendFeatures(engine,ordered),offset=141;", "const complete=!!prior&&prior.featuresSchema==='tactics-value-focus-v4';\n                    const focus=complete?[]:extendFeatures(engine,ordered),offset=141;")
    source=source.replace("const candidates=encoded.candidates.map", "const candidates=complete?encoded.candidates:encoded.candidates.map")
    source=source.replace("valueSummary:valueSummary(state,focus)", "valueSummary:stateSummary(engine)")
    source=source.replace("'tactics-value-focus-v4'", "'tactics-value-focus-v4'",1)
    source=source.replace("featuresSchema: 'tactics-value-focus-v4'", "featuresSchema: 'tactics-state-value-v5'")
    put('prepare.ts',source)
    source=(OLD/'pack.py').read_text(encoding='utf-8').replace("['features.ts','focus_threat.ts','prepare.ts','pack.py']","['value_state.ts','prepare.ts','pack.py']")
    put('pack.py',source)
    source=(OLD/'parity.py').read_text(encoding='utf-8')
    source=source.replace("from residual_value import ResidualValue","ResidualValue=stage4Residual.ResidualValue")
    source=source.replace("'initial.json' if name=='initial'", "'initial.json' if name=='initial'")
    source=source.replace("model.get('valueWeights',read(HERE/'value-initial.json'))", "model['valueWeights']")
    source=source.replace("read(HERE/('inputs-army.json' if model.get('valueArmyFeature') else 'inputs.json'))","read(HERE/'inputs.json')")
    source=source.replace("r['valueSummary']+([r['valueArmy']] if model.get('valueArmyFeature') else [])","r['valueSummary']+[r['valueSummary'][8]-r['valueSummary'][22]]")
    put('parity.py',source)
    source=(OLD/'numeric.ts').read_text(encoding='utf-8').replace("from './value_model'","from '../tactical_value_search_20261018/value_model'")
    source=source.replace("import { valueInput } from './value_input';","import { valueInput } from './value_state';").replace("valueInput(policy.context,x.valueSummary,model,x.valueArmy)","valueInput(policy.context,x.valueSummary)")
    put('numeric.ts',source)
    source=(OLD/'browser_runner.mjs').read_text(encoding='utf-8')
    put('browser_runner.mjs',source)
    print('阶段5初始化及复用入口已创建')
