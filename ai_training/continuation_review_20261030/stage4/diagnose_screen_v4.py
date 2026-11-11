"""只读汇总三组正式预筛，保留全部原件摘要，不读取封存。"""
import collections
import gzip
import hashlib
import json
from pathlib import Path

DATA = Path('D:/AncientEmpiresData/continuation_stage4_20261031_v1')


def inspect():
    result = {}
    preserved = {}
    for config in ['margin-prior1', 'maxn-prior1', 'maxn-prior035']:
        summary_path = DATA / ('resume-v3-screen-' + config + '-aggregate') / 'SUMMARY.json'
        summary = json.loads(summary_path.read_text(encoding='utf-8'))
        buckets = {}
        for game in summary['games']:
            directory = Path(game['artifactDirectory'])
            for file in directory.iterdir():
                if file.is_file():
                    preserved[str(file)] = hashlib.file_digest(file.open('rb'), 'sha256').hexdigest()
            n = game['players']
            b = buckets.setdefault(n, dict(roots=0, substantive=0, reasons=collections.Counter(), totals=collections.Counter(), selected=collections.Counter(), complete=0, tracks=0, examples=[]))
            with gzip.open(directory / 'search.jsonl.gz', 'rt', encoding='utf-8') as stream:
                for line in stream:
                    t = json.loads(line)
                    if t['queued'] or t['stopReason'] == 'unique_action':
                        continue
                    b['roots'] += 1
                    complete = [c for c in t['candidates'] if c['responseComplete']]
                    b['substantive'] += len({c['rootAction'] for c in complete}) >= 2
                    b['complete'] += t['responseComplete']
                    b['tracks'] += t['responseComplete'] + t['responseTruncated']
                    for key in ['rootMs', 'priorMs', 'encodeMs', 'networkMs', 'legalMs', 'cloneMs', 'ownNodes', 'responseNodes']:
                        b['totals'][key] += t[key]
                    for c in t['candidates']:
                        b['reasons'].update(c.get('responseReasons', []))
                        if c['selected']:
                            b['selected'][str(c['ownChains'])] += 1
                    if len(b['examples']) < 3 and n == 4 and len(complete) < 2:
                        b['examples'].append(dict(id=game['id'], step=t['step'], candidates=t['candidates'], ms=t['rootMs']))
        for b in buckets.values():
            b['substantiveRate'] = b['substantive'] / b['roots']
            b['responseRate'] = b['complete'] / b['tracks']
            b['mean'] = {k: v / b['roots'] for k, v in b.pop('totals').items()}
        result[config] = buckets
    return dict(schema='stage4-screen-diagnosis-v4', groups=result, preservedFiles=preserved, sealedAccess=0, newGames=0)


if __name__ == '__main__':
    print(json.dumps(inspect(), ensure_ascii=False, indent=2))
