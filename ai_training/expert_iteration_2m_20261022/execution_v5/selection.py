"""固定面板的配对晋升；截断只计非胜，扩采门槛分母固定20局。"""


def panel_summary(results):
    wins=sum(r['natural'] and r['outcome']=='win' for r in results)
    return dict(games=len(results),wins=wins,losses=sum(r['natural'] and r['outcome']=='loss' for r in results),draws=sum(r['natural'] and r['outcome']=='draw' for r in results),truncated=sum(not r['natural'] and not r['error'] for r in results),errors=sum(bool(r['error']) for r in results),winRate=wins/len(results) if results else 0.,over4000=sum(r['over4000'] for r in results))


def paired(left,right):
    assert len(left)==len(right)==20,'固定面板必须完整记录20局'
    for a,b in zip(left,right):
        assert (a['job']['id'],a['job']['seat'],a['openingCanonicalSha256'])==(b['job']['id'],b['job']['seat'],b['openingCanonicalSha256']),'配对开局身份不一致'
    def win(r):return r['natural'] and r['outcome']=='win'
    new=sum(not win(a) and win(b) for a,b in zip(left,right))
    lost=sum(win(a) and not win(b) for a,b in zip(left,right))
    return dict(newWins=new,lostWins=lost,netWins=new-lost)


def assess(champion_history,candidate_history,champion_hard,candidate_hard):
    history=paired(champion_history,candidate_history);hard=paired(champion_hard,candidate_hard)
    candidate=panel_summary(candidate_history);hard_candidate=panel_summary(candidate_hard)
    gates=dict(historicalPairedNetPositive=history['netWins']>0,hardPairedNoRegression=hard['netWins']>=0,noRuntimeErrors=candidate['errors']==0 and hard_candidate['errors']==0,rootBudgetStrict=candidate['over4000']==0 and hard_candidate['over4000']==0)
    promoted=all(gates.values())
    return dict(promoted=promoted,gates=gates,historicalPair=history,hardPair=hard,candidateHistorical=candidate,candidateHard=hard_candidate,historical50Reached=candidate['wins']>=10,expansionEligible=promoted and candidate['wins']>=10,automaticExpansion=False,qualification='所有面板在series中已独立strict通过；历史面板仅为开发选择，50%不等于最终盲测通过。')
