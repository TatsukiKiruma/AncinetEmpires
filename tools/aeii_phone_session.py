"""只在内存中读取当前 USB 手机的游戏会话，不保存认证信息。"""

import subprocess
import xml.etree.ElementTree as ET


def load_phone_session(adb_path, serial):
    # 只读取本游戏的固定配置文件，不访问其他应用，不输出配置正文。
    command = "su -c 'cat \"/data/user/0/net.toyknight.aeii.android/shared_prefs/Ancient Empires Reloaded.xml\"'"
    result = subprocess.run(
        [str(adb_path), '-s', serial, 'shell', command],
        check=True, capture_output=True, timeout=20,
    )
    preferences = {entry.get('name'): entry.text or entry.get('value')
                   for entry in ET.fromstring(result.stdout)}
    hosts = {'CN': 'aer.augix.me', 'NA': 'ae-multiplayer-na.toyknight.net'}
    host = hosts.get(preferences.get('server_region'))
    token = preferences.get('auth')
    if host is None or not isinstance(token, str) or not token.strip():
        raise ValueError('手机游戏缺少支持的服务器或有效登录会话')
    return {'host': host, 'token': token}
