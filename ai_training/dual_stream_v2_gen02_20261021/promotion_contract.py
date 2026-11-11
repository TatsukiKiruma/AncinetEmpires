"""第2代晋升合同：五个子面板分别守门，完整性与错误不得由胜场抵消。"""
PANELS = ('fixed', 'expanded', '3ffa', '4ffa', '2v2')
EXPECTED = dict(fixed=20, expanded=20, **{'3ffa': 4, '4ffa': 8, '2v2': 4})
LEAGUE_QUALITY_KEYS = ('zeroModelTimeouts', 'zeroOpponentTimeouts', 'zeroExecutionErrors', 'zeroWallStops', 'zeroUnknownStops', 'retaliationComplete100', 'finiteNumerics', 'rootMaxWithin1000ms', 'queueBelow1ms')


def panel_gates(current, pure_baseline, search_baseline):
    result = {}
    for mode, previous in [('pure', pure_baseline), ('turn_search', search_baseline)]:
        for panel in PANELS:
            key = mode + '/' + panel
            c, p = current['groups'].get(key, {}), previous['groups'].get(key, {})
            cw, pw = c.get('outcomes', {}).get('natural_win', 0), p.get('outcomes', {}).get('natural_win', 0)
            complete = c.get('slots') == p.get('slots') == EXPECTED[panel]
            result[key] = dict(candidateWins=cw, championWins=pw, complete=complete, passed=complete and cw >= pw)
    return result


def qualify(current, pure_baseline, search_baseline, value, parity, extraction):
    panels = panel_gates(current, pure_baseline, search_baseline)
    gates = {name: current.get(name) is True for name in ['complete', 'strictAllAttempts', 'zeroModelTimeouts', 'zeroOpponentTimeouts', 'zeroExecutionErrors', 'zeroWallStops', 'zeroUnknownStops', 'retaliationComplete100', 'finiteNumerics', 'p95', 'rootMaxWithin1000ms', 'queueBelow1ms', 'identityVerified']}
    gates.update(value16Slices=value, parity89ThreeRuntimes=parity, leagueStrict=extraction.get('strictAllAttempts') is True and extraction.get('games') == 60 and extraction.get('corrections', 0) > 0, panelsNoRegression=all(p['passed'] for p in panels.values()))
    gates['baselineIntegrity'] = all(previous.get(key) is True for previous in [pure_baseline, search_baseline] for key in ['complete', 'strictAllAttempts', 'zeroModelTimeouts', 'zeroOpponentTimeouts', 'zeroExecutionErrors', 'zeroWallStops', 'zeroUnknownStops', 'finiteNumerics', 'identityVerified'])
    gates.update({'league/' + key: extraction.get('quality', {}).get(key) is True for key in LEAGUE_QUALITY_KEYS})
    return dict(contract='five-panel-promotion-v2', promoted=all(gates.values()), gates=gates, panels=panels, failedGates=[k for k, v in gates.items() if not v])
