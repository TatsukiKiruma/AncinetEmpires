"""纯开发指标门禁，不导入模型或改变模块搜索路径。"""


def dev_gates(stats, warm, champion, protocol):
    settings = protocol['devGates']; ratios = {}; warm_ratios = {}
    for head in settings['protectedHeads']:
        number = stats['counts'].get(head, stats['counts'].get(str(head), 0))
        before = champion['counts'].get(head, champion['counts'].get(str(head), 0))
        parent = warm['counts'].get(head, warm['counts'].get(str(head), 0))
        ratios[str(head)] = number/before if before else None
        warm_ratios[str(head)] = number/parent if parent else None
    low, high = settings['protectedRatio']
    gates = dict(headTop1=stats['headTop1'] >= warm['headTop1']-settings['headTop1RegressionTolerance'], wastedWait=stats['waitWithAnyUnmovedOpportunity'] <= settings['wastedWaitMax'], protectedHeadCounts=all(r is not None and low <= r <= high for r in ratios.values()), protectedWarmCounts=all(r is not None and low <= r <= high for r in warm_ratios.values()), valueLogitsExactlyEqual=stats['maxValueLogitsDifference'] == 0., fixedDevIdentity=stats['samplesSha256'] == warm['samplesSha256'])
    return gates, ratios, warm_ratios
