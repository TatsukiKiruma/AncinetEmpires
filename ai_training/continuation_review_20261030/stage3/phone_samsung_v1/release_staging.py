"""完整输入验收后释放唯一传输临时副本，D盘完整交付包保留。"""
import json
from device import HERE,shell,save
from prepare_data import read,sha
from runtime_setup import termux
from linux_setup import PHONE

package=read(HERE/'PACKAGE.json')
assert read(HERE/'DEPLOY_VERIFIED.json')['passed']
assert sha(package['file'])==package['sha256']
verified=json.loads(termux('cat '+PHONE+'/work/INPUTS_VERIFIED.json'))
assert verified['passed'] and verified['payloadManifestSha256']==package['payloadManifestSha256']
temporary='/data/local/tmp/aeii-omni-samsung-independent-v1.tar'
shell('test -f '+temporary+' && rm -- '+temporary)
after=shell('df -k /data')
save(HERE/'TRANSPORT_CACHE_RELEASED.json',dict(removedOnly=temporary,hostArchivePreserved=package,verified=verified,phoneDiskAfter=after))
print(after)
