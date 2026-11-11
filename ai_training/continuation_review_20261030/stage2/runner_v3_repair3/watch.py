"""只监看普通进度、追加事件和闭合证据，不读取活动预算账本。"""
import argparse
import json
from pathlib import Path
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    while True:
        closed = list(args.output.glob('RUN_CLOSURE-*.json'))
        if closed:
            value = json.loads(closed[0].read_text('utf-8'))
            print(json.dumps(dict(状态=value['status'], 完整更新=value['completedUpdates'],
                                  完整样本=value['completedSamples'], 原始错误=value['primaryError']), ensure_ascii=False), flush=True)
            return
        progress = args.output / 'PROGRESS.json'
        if progress.exists():
            try:
                value = json.loads(progress.read_text('utf-8'))
                print(json.dumps(dict(状态='运行中', 更新=value['stageUpdates'], 样本=value['samples'],
                                      累计秒=value['wallSeconds']), ensure_ascii=False), flush=True)
            except (OSError, ValueError) as error:
                print('进度读取暂时失败：' + str(error), flush=True)
        time.sleep(30)


if __name__ == '__main__':
    main()
