import json
import re

with open(r'src/game/apk_skirmish_map_assets.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# Match entries in the map assets
entries = re.findall(r"name:\s*['\"]([^'\"]+)['\"].*?playerCount:\s*(\d+)", text, re.DOTALL)
print(f"Total entries found: {len(entries)}")

maps_by_players = {}
for name, pc in entries:
    pc = int(pc)
    maps_by_players.setdefault(pc, []).append(name)

for pc in sorted(maps_by_players.keys()):
    print(f"Player count {pc}: {len(maps_by_players[pc])} maps")
    for m in maps_by_players[pc]:
        print(f"  - {m}")
