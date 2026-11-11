"""用户切换真机后的执行边界；旧PC调度器只保留历史只读用途。"""
from pathlib import Path
import json


def reject_pc_games():
    protocol = Path(__file__).resolve().parent / 'ACTIVE_DEVICE_PROTOCOL.json'
    if protocol.exists() and not json.loads(protocol.read_text(encoding='utf-8'))['allowPcBattleExecution']:
        raise RuntimeError('用户已要求所有后续对局在小米真机执行，旧PC对局/专家调度器已停用；请使用真机入口，禁止复用旧Random面板。')
