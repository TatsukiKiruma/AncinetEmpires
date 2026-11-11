"""仅调整本轮资源守卫；冻结转换源、输入协议和已有收据身份保持可核对。"""
import ast
import ctypes
from ctypes import wintypes
import datetime
import hashlib
import json
import os
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE = HERE/'run_phone.py'
LIMIT = 1342177280


def sha(data):
    return hashlib.sha256(data).hexdigest()


def resource_size(directory):
    # 并行任务原子封存时，枚举到的.partial可能已改名；消失项按零计，下一局重新扫描。
    total = 0
    for file in directory.rglob('*'):
        try:
            if file.is_file():
                total += file.stat().st_size
        except FileNotFoundError:
            pass
    return total


def derive():
    original = BASE.read_bytes()
    expected = json.loads((HERE/'full_v6/source-identity.json').read_text(encoding='utf8'))
    if sha(original) != expected['source'][str(BASE.relative_to(ROOT)).replace('\\', '/')]:
        raise RuntimeError('冻结基准源码变化，拒绝资源派生')
    tree = ast.parse(original, filename=str(BASE))
    old_size = ast.parse("size=sum(p.stat().st_size for p in HERE.parent.rglob('*') if p.is_file())").body[0]
    old_guard = ast.parse('if free<12*1024**3 or size>1024**3:\n raise RuntimeError("占位")').body[0].test
    replacements = [0, 0]

    class ResourceOnly(ast.NodeTransformer):
        def visit_Assign(self, node):
            if ast.dump(node) == ast.dump(old_size):
                replacements[0] += 1
                return ast.copy_location(ast.parse('size=_resource_size(HERE.parent)').body[0], node)
            return self.generic_visit(node)

        def visit_If(self, node):
            if ast.dump(node.test) == ast.dump(old_guard):
                replacements[1] += 1
                node.test = ast.parse('free<12*1024**3 or size>1342177280', mode='eval').body
            return self.generic_visit(node)

    tree = ast.fix_missing_locations(ResourceOnly().visit(tree))
    if replacements != [1, 1]:
        raise RuntimeError('资源派生必须且只能匹配两处守卫节点')
    return original, tree, ast.unparse(tree).encode(), expected['sourceId']


def main():
    original, tree, derived, baseline = derive()
    output = Path(sys.argv[sys.argv.index('--out')+1]).resolve()
    if not output.is_relative_to(HERE):
        raise RuntimeError('资源执行记录不能越过本轮目录')
    output.mkdir(exist_ok=True)
    stamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')
    files_before = set((output/'receipts').glob('*.json'))
    driver_before = Path(__file__).read_bytes()
    if os.name != 'nt':
        raise RuntimeError('本启动器仅针对当前Windows主机')
    kernel = ctypes.windll.kernel32
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    kernel.SetPriorityClass.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.SetPriorityClass.restype = wintypes.BOOL
    if not kernel.SetPriorityClass(kernel.GetCurrentProcess(), 0x4000):
        raise RuntimeError('无法设置低于正常优先级')
    os.environ['NODE_OPTIONS'] = '--max-old-space-size=1536'
    report = dict(startedAt=stamp, baselineSourceIdentity=baseline,
                  frozenDriverSha256=sha(original), resourceDriverSha256=sha(driver_before),
                  derivedDriverSha256=sha(derived), resourceLimitBytes=LIMIT,
                  cFreeBytesMin=12*1024**3, argv=sys.argv[1:],
                  scope='仅替换累计输出守卫与并发改名时的资源扫描；数据协议、job、inputHash、转换/规则代码不变',
                  sourceStable=False, completed=False)
    target = output/('resource-execution-'+stamp+'.json')
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    try:
        exec(compile(tree, str(BASE), 'exec'), {'__name__': '__main__', '__file__': str(BASE), '_resource_size': resource_size})
        report['completed'] = True
    finally:
        report['sourceStable'] = BASE.read_bytes() == original and Path(__file__).read_bytes() == driver_before
        report['newReceiptHashes'] = {p.name: sha(p.read_bytes()) for p in sorted(set((output/'receipts').glob('*.json'))-files_before)}
        report['finishedAt'] = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
        target.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
        if not report['sourceStable']:
            raise RuntimeError('资源执行期间源码变化，禁止发布')


if __name__ == '__main__':
    main()
