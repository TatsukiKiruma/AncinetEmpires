import json
import os

CONFIRMED_MAPS_10_SLOTS = [
    {"slot": 0, "map": "(2) Duel.aem", "pair_round": 1},
    {"slot": 1, "map": "(2) Liberty Port.aem", "pair_round": 1},
    {"slot": 2, "map": "(2) Swamplands.aem", "pair_round": 1},
    {"slot": 3, "map": "(2) The Crossing.aem", "pair_round": 1},
    {"slot": 4, "map": "(2) Icy Paths.aem", "pair_round": 1},
    {"slot": 5, "map": "(2) Peak Island.aem", "pair_round": 1},
    {"slot": 6, "map": "(2) Crossed swords.aem", "pair_round": 1},
    {"slot": 7, "map": "(2) Duel.aem", "pair_round": 2},
    {"slot": 8, "map": "(2) The Crossing.aem", "pair_round": 2},
    {"slot": 9, "map": "(2) Swamplands.aem", "pair_round": 2},
]

def build_manifest(name, base_seed, max_steps=3000, max_wall_sec=300):
    games = []
    game_idx = 0
    for slot_info in CONFIRMED_MAPS_10_SLOTS:
        slot = slot_info["slot"]
        map_name = slot_info["map"]
        # 每个槽位 2 局交换先后手
        for seat_candidate in [0, 1]:
            # 种子分配：独立计算
            match_seed = base_seed + slot * 100 + seat_candidate * 10
            games.append({
                "gameIndex": game_idx,
                "slotIndex": slot,
                "mapName": map_name,
                "pairRound": slot_info["pair_round"],
                "candidateSeat": seat_candidate,
                "opponentSeat": 1 - seat_candidate,
                "opponentType": "HeuristicAI",
                "matchSeed": match_seed,
                "envSeed": match_seed + 1,
                "seat0Seed": match_seed + 2,
                "seat1Seed": match_seed + 3,
                "maxSteps": max_steps,
                "maxWallSeconds": max_wall_sec
            })
            game_idx += 1
    return {
        "manifestName": name,
        "baseSeed": base_seed,
        "totalGames": len(games),
        "uniqueMaps": 7,
        "totalSlots": 10,
        "games": games
    }

dev_manifest = build_manifest("DEV_PANEL_20_GAMES", base_seed=100000)
final_manifest = build_manifest("FINAL_PANEL_20_GAMES", base_seed=500000)

configs_dir = "ai_training/r7_training_stage_20261014_083500/configs"
os.makedirs(configs_dir, exist_ok=True)

with open(os.path.join(configs_dir, "dev_manifest.json"), "w", encoding="utf-8") as f:
    json.dump(dev_manifest, f, indent=2, ensure_ascii=False)

with open(os.path.join(configs_dir, "final_manifest.json"), "w", encoding="utf-8") as f:
    json.dump(final_manifest, f, indent=2, ensure_ascii=False)

print("Generated dev_manifest.json (baseSeed=100000) and final_manifest.json (baseSeed=500000)")
print("Each has 20 paired games strictly mapped.")
