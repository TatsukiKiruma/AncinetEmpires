"""只读查看当前手机评测，不启动或修改任何作业。"""
from collections import Counter
import json
from device import HERE, PHONE, root, write


def read(name):
    raw = root('if test -f ' + PHONE + '/' + name + '; then cat ' + PHONE + '/' + name + '; fi')
    return json.loads(raw) if raw else None


def main():
    progress = read('PROGRESS.json')
    results = read('RESULTS.json') or []
    value = {'progress': progress, 'resource': read('RESOURCE.json'), 'controllerExit': read('CONTROLLER_EXIT.json'),
             'error': read('ERROR.json'), 'outcomes': {name: dict(Counter(r['classification'] for r in results if r['slot']['opponent'] == name))
                                                    for name in ['hard', 'simple']},
             'latestResults': [{'id': r['slot']['id'], 'classification': r['classification'], 'steps': r['steps'],
                               'modelLatency': r['latency']['model'], 'hardTelemetry': r.get('hardTelemetry')} for r in results[-2:]]}
    write(HERE / 'LATEST_STATUS.json', value)
    print(json.dumps(value, ensure_ascii=False))


if __name__ == '__main__':
    main()
