import os
import re
import json
from collections import defaultdict

def fast_split():
    data_dir = 'ai_training/r7_training_stage_20261014_083500/artifacts/data'
    raw_path = os.path.join(data_dir, 'raw_samples.jsonl')
    train_jsonl = os.path.join(data_dir, 'train_samples.jsonl')
    val_jsonl = os.path.join(data_dir, 'val_samples.jsonl')
    train_json = os.path.join(data_dir, 'train_samples.json')
    val_json = os.path.join(data_dir, 'val_samples.json')
    manifest_path = os.path.join(data_dir, 'data_manifest.json')

    print("Phase 1: Scanning game metadata using fast stream parsing...")
    game_map = {}
    game_sample_count = defaultdict(int)
    total_samples = 0

    re_game = re.compile(r'"gameId":\s*"([^"]+)"')
    re_map = re.compile(r'"mapName":\s*"([^"]+)"')
    re_hash = re.compile(r'"inputHash":\s*"([^"]+)"')

    unique_hashes = set()

    with open(raw_path, 'r', encoding='utf-8') as f:
        for line in f:
            line_str = line.strip()
            if not line_str:
                continue
            total_samples += 1
            m_g = re_game.search(line_str)
            m_m = re_map.search(line_str)
            m_h = re_hash.search(line_str)

            if m_g and m_m:
                g_id = m_g.group(1)
                m_name = m_m.group(1)
                game_map[g_id] = m_name
                game_sample_count[g_id] += 1
            if m_h:
                unique_hashes.add(m_h.group(1))

    print(f"Total raw lines: {total_samples}, Unique games: {len(game_map)}, Unique inputs: {len(unique_hashes)}")

    # 分层划分
    map_to_games = defaultdict(list)
    for g_id, m_name in game_map.items():
        map_to_games[m_name].append(g_id)

    train_games = set()
    val_games = set()

    for m_name, g_list in sorted(map_to_games.items()):
        g_list = sorted(g_list)
        val_count = max(1, int(len(g_list) * 0.2))
        train_count = len(g_list) - val_count

        t_sub = g_list[:train_count]
        v_sub = g_list[train_count:]
        train_games.update(t_sub)
        val_games.update(v_sub)
        print(f"  Map '{m_name}': {len(g_list)} games -> Train={len(t_sub)}, Val={len(v_sub)}")

    print(f"\nPhase 2: Streaming partition to train & val files...")
    train_count = 0
    val_count = 0
    train_hashes = set()
    leak_count = 0

    train_map_dist = defaultdict(int)
    val_map_dist = defaultdict(int)

    with open(raw_path, 'r', encoding='utf-8') as fin, \
         open(train_jsonl, 'w', encoding='utf-8') as f_train_l, \
         open(val_jsonl, 'w', encoding='utf-8') as f_val_l, \
         open(train_json, 'w', encoding='utf-8') as f_train_j, \
         open(val_json, 'w', encoding='utf-8') as f_val_j:

        f_train_j.write('[\n')
        f_val_j.write('[\n')

        first_t = True
        first_v = True

        for line in fin:
            line_str = line.strip()
            if not line_str:
                continue

            m_g = re_game.search(line_str)
            m_h = re_hash.search(line_str)
            m_m = re_map.search(line_str)

            if not m_g or not m_h or not m_m:
                continue

            g_id = m_g.group(1)
            h = m_h.group(1)
            m_name = m_m.group(1)

            if g_id in train_games:
                # 写入 jsonl
                f_train_l.write(line_str + '\n')
                # 写入 json array
                if not first_t:
                    f_train_j.write(',\n')
                else:
                    first_t = False
                f_train_j.write(line_str)

                train_hashes.add(h)
                train_map_dist[m_name] += 1
                train_count += 1

            elif g_id in val_games:
                # 写入 jsonl
                f_val_l.write(line_str + '\n')
                # 写入 json array
                if not first_v:
                    f_val_j.write(',\n')
                else:
                    first_v = False
                f_val_j.write(line_str)

                if h in train_hashes:
                    leak_count += 1
                val_map_dist[m_name] += 1
                val_count += 1

        f_train_j.write('\n]')
        f_val_j.write('\n]')

    leak_rate = (leak_count / max(1, val_count)) * 100
    print(f"\n--- Split Summary ---")
    print(f"Train samples: {train_count} across {len(train_games)} games")
    print(f"Val samples: {val_count} across {len(val_games)} games")
    print(f"Leakage Check: {leak_count} / {val_count} ({leak_rate:.2f}%)")
    print("Train Map Distribution:", dict(train_map_dist))
    print("Val Map Distribution:", dict(val_map_dist))

    manifest = {
        "timestamp": "2026-10-14T09:42:00Z",
        "datasetStrategy": "Stratified Game-Family Split",
        "totalUniqueInputs": len(unique_hashes),
        "totalSamples": total_samples,
        "trainSamplesCount": train_count,
        "valSamplesCount": val_count,
        "trainGamesCount": len(train_games),
        "valGamesCount": len(val_games),
        "leakCount": leak_count,
        "leakRatePercent": leak_rate,
        "mapsCount": len(map_to_games),
        "mapsList": sorted(list(map_to_games.keys())),
        "trainMapDistribution": dict(train_map_dist),
        "valMapDistribution": dict(val_map_dist),
        "schema": "spatial34_global20_actionSemantics53_v19",
        "inputChannels": 34,
        "globalFeaturesDim": 20,
        "actionSemanticsDim": 53
    }

    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"Successfully generated train and val datasets (both .jsonl and .json)!")
    print(f"Train JSON size: {os.path.getsize(train_json) / 1024 / 1024:.1f} MB")
    print(f"Val JSON size: {os.path.getsize(val_json) / 1024 / 1024:.1f} MB")

if __name__ == '__main__':
    fast_split()
