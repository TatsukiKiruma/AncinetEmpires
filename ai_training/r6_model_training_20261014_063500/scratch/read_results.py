import json

for name in ['P1_champion', 'theta1_v19', 'B100-Q', 'B100-R']:
    p = f'C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/artifacts/dev_benchmarks/{name}_vs_heuristic.json'
    with open(p, 'r') as f:
        data = json.load(f)
    print(f'=== {name} (Wins: {data["winsA"]}, Losses: {data["winsB"]}, Draws: {data["draws"]}, Trunc: {data["truncations"]}) ===')
    for r in data['results']:
        print(f"  Game {r['gameIndex']} ({r['mapName']}): steps={r['totalSteps']}, trunc={r['isTruncated']}, reason={r['truncationReason']}, winnerAlliance={r['winnerAlliance']}, wall={r['elapsedWallSeconds']:.2f}s, first5actions={r['actionCodes'][:5]}")
