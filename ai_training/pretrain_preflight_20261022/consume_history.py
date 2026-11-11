"""实战结束后顺序补齐旧靶场消费状态，不写旧目录。"""
from pathlib import Path
import importlib.util

TASK = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('evaluation_driver', TASK / 'run_evaluation.py')
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)

def main():
    assert driver.read(driver.OUT / 'progress.json')['phase'] == 'complete', '必须等待新实战及逐组strict全部完成'
    root = driver.ROOT
    for name in ['phase61-v6-hard-slayer', 'phase61-v6r2-hard-slayer', 'phase62-sampling-extended', 'phase54-search', 'gen04-search']:
        source = root / 'deliverables/trained_vs_apk_hard_20261022' / name
        destination = driver.OUT / 'consumed-history' / name
        driver.verify(source, destination)
        print(name, 'strict与canonical排重完成', flush=True)
    source = root / 'deliverables/original_apk_hard_20261021/arena'
    destination = driver.OUT / 'consumed-history/original-apk-hard-20261021'
    if not (destination / 'independent-strict-replay.json').exists():
        destination.mkdir(parents=True, exist_ok=True)
        driver.run(['node', 'ai_training/run.mjs', 'node', '--import', 'tsx', 'pretrain_preflight_20261022/verify_original_history.ts', str(source), str(destination)], destination / 'verify.log')
    driver.verify(source, destination)
    print('original-apk-hard-20261021 strict与canonical排重完成', flush=True)

if __name__ == '__main__':
    main()
