export const PURE_SURRENDER_POLICY = '纯投降或无未屏蔽policy行的来源不进入policy候选索引；含正常前缀的合格来源保留非投降行';
export function policyRecordEligible(row: any, wholeGameAccepted: boolean): boolean {
  return wholeGameAccepted && row.kind === 'atomic' && row.action?.type !== 'surrender' && row.labels?.policyMask === true;
}
export function hasPolicyRows(receipt: any): boolean {
  return receipt.accepted === true && Number.isInteger(receipt.policyRows) && receipt.policyRows > 0;
}
export function pureSurrender(receipt: any): boolean {
  const counts = receipt.counts?.actions ?? {};
  return receipt.atomicActions > 0 && Object.keys(counts).every(k => k === 'surrender') && counts.surrender === receipt.atomicActions;
}
