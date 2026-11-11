// T14-11 独立复核：工件身份台账（只读）
const fs = require('fs');
const crypto = require('crypto');
const R = 'C:/code/AncinetEmpires/v14/out/v14_20260924_t14/';
const list = [
  'commands.ps1', 'task_status.json', 'claim_ledger.json',
  'T14-00/source_delta.json', 'T14-00/source_snapshot.json', 'T14-00/artifact_identity.json', 'T14-00/environment.json',
  'T14-01/rule_suite_results.json', 'T14-01/fixture_manifest.json', 'T14-01/rule_contract.md', 'T14-01/triage_20260924_exec.json',
  'T14-02/dataset_contract.json', 'T14-02/split_manifest.json', 'T14-02/label_independence.json', 'T14-02/audit_20260924_exec.json',
  'T14-02/quarantine.jsonl', 'T14-02/codec_roundtrip.json', 'T14-02/raw/collection_report.json',
  'T14-03/parity_fixture.json', 'T14-03/feature_semantics_report.json', 'T14-03/schema_compatibility.json', 'T14-03/state_aliasing_cases.json',
  'T14-04/tiny_fit_metrics.json', 'T14-04/tiny_fit_link_diagnosis.json', 'T14-04/tiny_fixture_manifest.json', 'T14-04/tiny_split_manifest.json',
  'T14-04/run_s42/tiny_metrics.json', 'T14-04/run_s42/tiny_last.json', 'T14-04/run_s42/tiny_best.json',
  'T14-04/run_s42/optimized.json', 'T14-04/run_s42/planned.json',
  'T14-04/run_s42_lr3e4/tiny_metrics.json', 'T14-04/run_s42_lr3e4/tiny_best.json',
  'T14-05/eval_protocol_v14.json', 'T14-05/selftest_aggregate_report.json', 'T14-05/task_status.json',
  'T14-06/c1_s42/c1_s42_metrics.json', 'T14-06/c1_s42/c1_s42.ledger_summary.json', 'T14-06/c1_s42/c1_s42_best.json',
  'T14-06/c1_s1337/c1_s1337_metrics.json', 'T14-06/c1_s1337/c1_s1337.ledger_summary.json',
  'T14-06/c1_s2026/c1_s2026_metrics.json', 'T14-06/c1_s2026/c1_s2026.ledger_summary.json',
  'T14-06/matches/dev_matches_summary.json', 'T14-06/matches/dev_matches_manifest.json', 'T14-06/failure_taxonomy.json',
  'T14-08/dagger_groups_summary.json', 'T14-08/dagger_D1_report.json', 'T14-08/dagger_D2_report.json',
  'T14-08/group_D0_split_manifest.json', 'T14-08/group_D1_split_manifest.json', 'T14-08/group_D2_split_manifest.json',
  'T14-08/run_D0/D0_metrics.json', 'T14-08/run_D0/optimized.json', 'T14-08/run_D0/planned.json',
  'T14-08/run_D1/D1_metrics.json', 'T14-08/run_D1/optimized.json', 'T14-08/run_D1/planned.json',
  'T14-08/run_D2/D2_metrics.json', 'T14-08/run_D2/optimized.json', 'T14-08/run_D2/planned.json',
  'T14-08/student_states/student_states_report.json', 'T14-08/student_states_s0/student_states_report.json', 'T14-08/student_states_s1/student_states_report.json',
  'T14-07/teacher_qualification.json',
];
const out = [];
for (const rel of list) {
  const p = R + rel;
  try {
    const st = fs.statSync(p);
    const h = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    out.push({ path: rel, bytes: st.size, mtime: st.mtime.toISOString(), sha256: h });
  } catch (e) { out.push({ path: rel, error: e.code }); }
}
console.log(JSON.stringify(out, null, 1));
