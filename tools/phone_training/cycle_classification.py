import collections

# 归一化状态和实际动作必须共同重复；只将持续到最新记录的循环判为当前僵持。
def periodic_suffix(keys, minimum_span=4000, minimum_repetitions=3):
    n = len(keys)
    if n < minimum_span:
        return None
    for period in range(1, n//minimum_repetitions+1):
        if keys[-1] != keys[-1-period]:
            continue
        start = n-period
        while start and keys[start-1] == keys[start-1+period]:
            start -= 1
        span = n-start
        if span >= minimum_span and span//period >= minimum_repetitions:
            return dict(period=period, span=span, repeats=span//period, start=start)
    return None

def classify(rows):
    if any(b['index'] != a['index']+1 for a,b in zip(rows, rows[1:])):
        raise ValueError('循环检查输入动作序号不连续')
    exact = periodic_suffix([(r['state_sha256'], r['action_signature']) for r in rows])
    board_only = periodic_suffix([(r['board_sha256'], r['action_signature']) for r in rows])
    inert = len(rows)>=4000 and all(r['action_type'] in ('STANDBY','NEXT_TURN') for r in rows)
    counters = collections.Counter(r['state_sha256'] for r in rows)
    board_counts = collections.Counter(r['board_sha256'] for r in rows)
    cycle_rows=rows[exact['start']:] if exact else []
    turns = sum(r['action_type']=='NEXT_TURN' for r in cycle_rows)
    within_turn_fixed_cycle=bool(exact and len({r.get('turn') for r in cycle_rows})==1 and turns==0)
    confirmed = bool(exact and (turns>=100 or within_turn_fixed_cycle))
    # 完全没有移动、攻击、建造等行为的长时间棋盘循环也属于观测到的僵持。
    inert_confirmed = bool(inert and board_only and sum(r['action_type']=='NEXT_TURN' for r in rows)>=100)
    return dict(confirmed=confirmed or inert_confirmed,
        classification='confirmed_cyclic_stalemate' if confirmed or inert_confirmed else ('suspected_board_cycle' if board_only else 'no_confirmed_cycle'),
        criterion='normalized_state_and_actual_action_cycle' if confirmed else ('inert_board_and_action_cycle' if inert_confirmed else None),
        observed_actions=len(rows), first_global_index=rows[0]['index'] if rows else None,
        end_global_index=rows[-1]['index']+1 if rows else None,
        exact_cycle=exact, board_only_cycle=board_only,
        within_turn_fixed_cycle=within_turn_fixed_cycle,
        unique_normalized_states=len(counters), maximum_state_recurrence=max(counters.values(),default=0),
        unique_board_states=len(board_counts), maximum_board_recurrence=max(board_counts.values(),default=0),
        next_turns=sum(r['action_type']=='NEXT_TURN' for r in rows),
        action_types=dict(collections.Counter(r['action_type'] for r in rows)),
        gold_first=rows[0]['gold'] if rows else None,gold_last=rows[-1]['gold'] if rows else None,
        natural_end=False, outcome_label_eligible=False)
