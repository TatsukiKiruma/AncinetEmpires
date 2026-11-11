"""只有通过且仍匹配当前数值输入与权重的真实Chrome收据才可复用。"""
from pathlib import Path
import hashlib,json

def numeric_receipt_valid(here:Path,name:str):
    read=lambda n:json.loads((here/n).read_text(encoding='utf-8-sig'))
    try:
        browser=read(f'browser-{name}.json');numeric=read(f'numeric-{name}.json')
        if not browser.get('passed') or not browser.get('argmax') or browser.get('expertBatchChecks',0)<2 or not numeric.get('passed'):return False
        if any(browser.get(k,float('inf'))>=1e-8 for k in ['maxForwardError','maxGradientError','maxLossError']):return False
        model={'initial':'initial.json','teacher':'teacher-model.json','proposal':'base-policy-final.json','best':'model-final.json'}[name]
        if read(model)!=read(f'numeric-model-{name}.json'):return False
        binding=browser.get('fileSha256',{})
        required=[f'numeric-model-{name}.json',f'python-{name}.json','inputs.json','old-schema.json','browser-states.json']
        if any(n not in binding for n in required):return False
        code=browser.get('numericCodeBinding')
        if code:
            if code['bundleSha256']!=hashlib.sha256((here/'browser.js').read_bytes()).hexdigest():return False
            if not code.get('sourceFiles'):return False
            if any(hashlib.sha256((here.parent.parent/n).read_bytes()).hexdigest()!=digest for n,digest in code['sourceFiles'].items()):return False
        elif (here/'REQUIRE_NUMERIC_CODE_BINDING.json').exists():return False
        return all(hashlib.sha256((here/n).read_bytes()).hexdigest()==digest for n,digest in binding.items())
    except (FileNotFoundError,json.JSONDecodeError):return False
