"""各冻结尝试使用独立证据目录，默认从当前运行时登记解析。"""
import os
from run_league import DIR, read


def audit_directory(directory=DIR):
    revision = directory / 'RUNTIME_REVISION.json'
    default = read(revision).get('v5AuditRoot','phase54-audit') if revision.exists() else 'phase54-audit'
    target = (directory / os.environ.get('LEAGUE_PHASE54_ROOT',default)).resolve()
    assert target.is_relative_to(directory.resolve()), '阶段5.4证据目录不得越界'
    return target
