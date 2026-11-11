import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { OUT } from './io';
import { packetRows } from './verify';
import { policyRecordEligible } from './release_contract';

test('真实封存包：纯投降不会变成policy示范，正常前缀保留，所有原生value/return关闭', async () => {
  const summary = JSON.parse(await readFile(path.join(OUT, 'final-summary.json'), 'utf8'));
  const release = JSON.parse(await readFile(path.join(OUT, 'policy-release-index.json'), 'utf8'));
  assert.equal(summary.modelSchemaAccepted, false); assert.equal(release.trainingAuthorized, false);
  const pure = release.emptyPolicySources.filter((r: any) => r.reason === 'PURE_SURRENDER_POLICY');
  assert.ok(pure.length >= 2, '应包含070/106两份真实纯投降来源');
  for (const r of pure) {
    const receipt = JSON.parse(await readFile(path.join(OUT, 'receipts', `${r.responseSha256}.json`), 'utf8'));
    assert.equal(receipt.policyRows, 0);
    assert.ok(!release.candidateSources.some((x: any) => x.responseSha256 === r.responseSha256));
    for await (const row of packetRows(path.join(OUT, receipt.packet.path))) if (row.kind === 'atomic') {
      assert.equal(row.action.type, 'surrender'); assert.equal(policyRecordEligible(row, true), false);
      assert.equal(row.labels.valueMask, false); assert.equal(row.labels.returnMask, false);
    }
  }
  let mixed: any = null;
  for (const r of release.candidateSources) {
    const receipt = JSON.parse(await readFile(path.join(OUT, 'receipts', `${r.responseSha256}.json`), 'utf8'));
    if (receipt.outcome.seatSurrenders.length) { mixed = receipt; break; }
  }
  assert.ok(mixed, '应存在正常前缀加投降的真实来源');
  let eligible = 0, maskedSurrender = 0;
  for await (const row of packetRows(path.join(OUT, mixed.packet.path))) if (row.kind === 'atomic') {
    if (policyRecordEligible(row, true)) eligible++;
    if (row.action.type === 'surrender') { maskedSurrender++; assert.equal(policyRecordEligible(row, true), false); }
    assert.equal(policyRecordEligible(row, false), false);
    assert.equal(row.labels.valueMask, false); assert.equal(row.labels.returnMask, false);
  }
  assert.ok(eligible > 0); assert.ok(maskedSurrender > 0); assert.equal(eligible, mixed.policyRows);
  assert.equal(summary.policyLabelEligibleRows, release.candidateSources.reduce((n: number, r: any) => n + r.policyRows, 0));
});
