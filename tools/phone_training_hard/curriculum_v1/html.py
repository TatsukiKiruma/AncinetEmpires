"""人口常量和只读核对标记同时匹配原生设置，不改困难AI评分。"""
import re
def make_htmls(html):
    assert len(re.findall(r'const\s+TEAM_POPULATION_LIMIT\s*=\s*30\s*;',html))==1
    assert len(re.findall(r'window\.__AEII_NATIVE_POP_LIMIT__\s*=\s*30\s*;',html))==1
    out={}
    for cap in [20,30,50]:
        value=re.sub(r'const\s+TEAM_POPULATION_LIMIT\s*=\s*30\s*;',f'const TEAM_POPULATION_LIMIT = {cap};',html)
        value=re.sub(r'window\.__AEII_NATIVE_POP_LIMIT__\s*=\s*30\s*;',f'window.__AEII_NATIVE_POP_LIMIT__={cap};',value)
        assert re.search(r'TEAM_POPULATION_LIMIT\s*=\s*'+str(cap)+r'\s*;',value)
        assert re.search(r'__AEII_NATIVE_POP_LIMIT__\s*=\s*'+str(cap)+r'\s*;',value)
        out[str(cap)]=value
    return out
