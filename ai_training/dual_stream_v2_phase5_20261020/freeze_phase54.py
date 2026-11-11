"""冻结v5源码、规则只读扩展证明与执行参数。"""
import shutil
from run_league import DIR, ROOT, read, save, sha, verify_runtime_contract
from phase54_paths import audit_directory

audit = audit_directory()
protocol = read(audit / 'protocol.json')
revision = read(DIR / 'RUNTIME_REVISION.json')
runtime = {p.relative_to(ROOT).as_posix():sha(p) for p in (ROOT / 'src/ai_runtime/dual_v2').glob('*.ts') if not p.name.endswith('.test.ts')}
harness = {p.relative_to(ROOT).as_posix():sha(p) for p in [DIR / n for n in ['battle.ts','common.ts','engineering_gen4_phase53.ts','durable_log.ts','warmup.ts']]}
receipt = read(audit / 'read-only-engine-equivalence.json')
assert receipt['passed']
revision.update(activeRuntimeKey='v5RuntimeSha256',v5RuntimeSha256=runtime,v5AuditRoot=audit.relative_to(DIR).as_posix(),v5Reason='战果约束普通避险、联盟最大威胁、低权重暴露、单分支反扑、惰性哈希与定向查询、计时外回收',executionContract=protocol['executionContract'],v5AuthorityReadOnlyExtension=dict(receipt=(audit / 'read-only-engine-equivalence.json').relative_to(DIR).as_posix(),receiptSha256=sha(audit / 'read-only-engine-equivalence.json'),authoritySha256=receipt['authoritySha256'],previousAuthoritySha256=receipt['previousAuthoritySha256']),v5HistoricalManifest=dict(path=(audit / 'historical-manifest.json').relative_to(DIR).as_posix(),sha256=sha(audit / 'historical-manifest.json')))
if protocol.get('searchOptions'):
    revision.update(v5SearchOptions=protocol['searchOptions'],v5Reason='用户追加五单位反扑、多人八链预留核心、880/950ms、260节点、四/三案决赛圈；最小新生代固定128MB，保留原双链全部112槽证据')
revision.update(v5CandidateAdmissionMinWindowMs=protocol.get('candidateAdmissionMinWindowMs'),v5ExtensionReservePerRemainingEnemyMs=protocol.get('extensionReservePerRemainingEnemyMs'))
revision.update(v5AlgorithmContract=protocol.get('algorithmContract'),v5AuthorizedExternalEntrypointChanges=protocol.get('authorizedExternalEntrypointChanges'))
save(DIR / 'RUNTIME_REVISION.json',revision)
freeze = dict(runtime=runtime,harness=harness,protocolSha256=sha(audit / 'protocol.json'),authorityReceiptSha256=sha(audit / 'read-only-engine-equivalence.json'))
if protocol.get('previousEvidenceManifest'): freeze['previousEvidenceManifestSha256'] = sha(DIR / protocol['previousEvidenceManifest'])
if protocol.get('previousPhaseSummary'): freeze['previousPhaseSummarySha256'] = sha(DIR / protocol['previousPhaseSummary'])
target = audit / 'runtime-freeze.json'
if target.exists(): assert read(target) == freeze, '正式开局后不得改写运行时冻结'
else: save(target,freeze)
for name in [*runtime,*harness]:
    target = audit / 'v5-source' / name
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT / name,target)
verify_runtime_contract()
print('v5运行时身份与权威只读扩展校验通过')
