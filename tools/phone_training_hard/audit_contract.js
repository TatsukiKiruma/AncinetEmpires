// 纯函数供 Frida 和离线自检共用，不连接任何设备。
var HardAudit = (function () {
 function classify(row) {
  if (row.ordinary) return 'ordinary_ai';
  if (row.fallback) return 'hard_java_fallback';
  if (row.error) return 'decision_error';
  if (row.chooseNull) return 'hard_fallback_required';
  if (row.createCalls === 1 && row.createdId === null) return 'create_action_rejected';
  var kind = row.browserKind;
  if (row.callCount === 1 && row.chooseCalls === 1 && row.browserCalls === 1 && row.createCalls === 1 &&
   (kind === 'unit' || kind === 'recruit' || kind === 'end') &&
   row.createdId !== null && row.createdId === row.chooseId && row.chooseId === row.returnedId) {
   return 'hard_js_primary';
  }
  return 'unknown';
 }
 function canCleanup(state) {
  return state.workerAlive === false && state.inCall === false && state.pendingCallbacks === 0 &&
   state.pageLoadPending === false && state.restartRequired === false;
 }
 return { classify: classify, canCleanup: canCleanup };
})();
