import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import type { Action, GameState, Unit } from '../src/game/types';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { TERRAIN_CONFIG, UNIT_CONFIGS } from '../src/game/constants';

type RecordedAction = {
  playerId: number;
  action: Action;
  source: 'human' | 'ai';
};

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1] ?? fallback;
}

function seededRng(seed: number) {
  let value = seed >>> 0;
  return {
    next: () => {
      value |= 0;
      value = (value + 0x6d2b79f5) | 0;
      let next = Math.imul(value ^ (value >>> 15), 1 | value);
      next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    },
    getState: () => value >>> 0,
    setState: (nextValue: number) => { value = nextValue >>> 0; }
  };
}

function copyState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function unitName(unit: Unit | undefined): string {
  if (!unit) return '未知单位';
  return UNIT_CONFIGS[unit.unitClass]?.name ?? unit.unitClass;
}

function unitAt(state: GameState, x: number, y: number): Unit | undefined {
  return state.units.find(unit => unit.pos.x === x && unit.pos.y === y && unit.hp > 0);
}

function tileCode(state: GameState, x: number, y: number): string {
  const unit = unitAt(state, x, y);
  if (unit) return unit.ownerId === 0 ? 'R' : unit.ownerId === 1 ? 'B' : String(unit.ownerId);
  const tile = state.map.tiles[y][x];
  const key = TERRAIN_CONFIG[tile.terrainId]?.key ?? 'unknown';
  if (key === 'castle') return tile.ownerId === 0 ? 'c' : tile.ownerId === 1 ? 'd' : 'C';
  if (key === 'town') return tile.ownerId === 0 ? 't' : tile.ownerId === 1 ? 'u' : 'T';
  if (key === 'damaged_town') return tile.ownerId === 0 ? 'x' : tile.ownerId === 1 ? 'y' : 'X';
  if (key === 'deep_water' || key === 'water_temple') return '~';
  if (key === 'mountain') return '^';
  if (key === 'forest') return 'f';
  if (key === 'hill') return 'h';
  if (key === 'road' || key === 'bridge') return '=';
  if (key === 'camp' || key === 'temple') return '+';
  return '.';
}

function shortUnit(unit: Unit | undefined): string {
  if (!unit) return '已移除单位';
  const marker = unit.ownerId === 0 ? 'R' : unit.ownerId === 1 ? 'B' : 'P' + unit.ownerId;
  return marker + ' ' + unitName(unit) + '#' + unit.id
    + '@(' + unit.pos.x + ',' + unit.pos.y + ')'
    + ' HP' + unit.hp
    + (unit.hasActed ? ' 已行动' : '');
}

function actionDescription(state: GameState, action: Action): string {
  const find = (id: string) => state.units.find(unit => unit.id === id);
  switch (action.type) {
    case 'move':
    case 'post_attack_move': {
      const unit = find(action.unitId);
      return action.type + ' ' + shortUnit(unit as Unit)
        + ' → (' + action.to.x + ',' + action.to.y + ')';
    }
    case 'attack':
      return '攻击 ' + shortUnit(find(action.attackerId) as Unit)
        + ' → ' + shortUnit(find(action.targetId) as Unit);
    case 'capture':
    case 'repair':
    case 'wait':
    case 'destroy_town':
      return action.type + ' ' + shortUnit(find(action.unitId) as Unit);
    case 'heal':
      return '治疗 ' + shortUnit(find(action.healerId) as Unit)
        + ' → ' + shortUnit(find(action.targetId) as Unit);
    case 'support':
      return '支援 ' + shortUnit(find(action.supporterId) as Unit)
        + ' → ' + shortUnit(find(action.targetId) as Unit);
    case 'summon':
      return '召唤 (' + action.spawnPos.x + ',' + action.spawnPos.y + ')';
    case 'recruit_to_castle':
      return '招募 ' + (UNIT_CONFIGS[action.unitClass]?.name ?? action.unitClass)
        + ' 于城堡 (' + action.castlePos.x + ',' + action.castlePos.y + ')';
    case 'recruit_and_deploy':
      return '招募部署 ' + (UNIT_CONFIGS[action.unitClass]?.name ?? action.unitClass)
        + ' 于 (' + action.to.x + ',' + action.to.y + ')';
    case 'end_turn':
      return '结束回合';
    case 'surrender':
      return '投降';
  }
}

function printBoard(state: GameState): void {
  const header = Array.from({ length: state.map.width }, (_, x) => String(x % 10)).join(' ');
  console.log('    ' + header);
  for (let y = 0; y < state.map.height; y++) {
    const row = Array.from({ length: state.map.width }, (_, x) => tileCode(state, x, y)).join(' ');
    console.log(String(y).padStart(2, '0') + '  ' + row);
  }
  for (const player of state.players) {
    const units = state.units.filter(unit => unit.ownerId === player.id && unit.hp > 0);
    console.log('P' + player.id + ' 金币=' + player.gold + ' 存活单位=' + units.length);
    for (const unit of units) console.log('  ' + shortUnit(unit));
  }
  console.log('地图符号：R/B 单位，c/d 已占城堡，t/u 已占城镇，T/C 中立据点，~=水，^=山，f=林，h=丘，.=雪地。');
}

function listActions(state: GameState, actions: readonly Action[], page: number): void {
  const pageSize = 100;
  const start = page * pageSize;
  const end = Math.min(actions.length, start + pageSize);
  console.log('红方合法动作 ' + actions.length + ' 项（显示 ' + start + '-' + (end - 1) + '）：');
  for (let index = start; index < end; index++) {
    console.log('  [' + index + '] ' + actionDescription(state, actions[index]));
  }
  if (end < actions.length) console.log('输入 more 查看下一页；输入 list 返回第一页。');
}

async function main() {
  const mapName = '(2) Icy Paths.aem';
  const seed = Number(arg('--seed', '1001'));
  const outputPath = path.resolve(arg(
    '--out',
    'captures/cli_duels_20260927/human_duel_2_Icy_Paths_seed1001.json'
  ));
  const checkpointPath = outputPath + '.checkpoint.json';
  const resume = process.argv.includes('--resume');
  const checkpoint = resume
    ? JSON.parse(await readFile(checkpointPath, 'utf8')) as {
        initialState: GameState;
        currentState: GameState;
        startedAt: string;
        actions: RecordedAction[];
        rngState: number;
      }
    : null;
  const engine = new GameEngine(
    checkpoint?.currentState ?? createAppApkSkirmishGameState(mapName, 'SD'),
    { applyInitialTurnStart: !checkpoint }
  );
  const initialState = checkpoint?.initialState ?? copyState(engine.getState());
  const startedAt = checkpoint?.startedAt ?? new Date().toISOString();
  const rng = seededRng(checkpoint?.rngState ?? seed + 999);
  const blue = new HeuristicAI(rng.next);
  const actions: RecordedAction[] = checkpoint?.actions ?? [];
  const maxSteps = 48000;
  const maxTurns = 600;
  const maxBlueSteps = Number(arg('--max-blue-steps', '10000'));
  const rl = createInterface({ input: stdin, output: stdout });

  const saveCheckpoint = async () => {
    await mkdir(path.dirname(checkpointPath), { recursive: true });
    await writeFile(checkpointPath, JSON.stringify({
      initialState,
      currentState: engine.getState(),
      startedAt,
      actions,
      rngState: rng.getState()
    }), 'utf8');
  };

  console.log('命令行人机对局：P0 红方由我逐步选择动作；P1 蓝方由 HeuristicAI 自动走完整回合。');
  console.log('地图：' + mapName + '；HeuristicAI 种子：' + seed);
  console.log('输入动作编号执行；输入 end 结束红方回合；输入 more/list 翻页。');
  if (resume) console.log('已从检查点恢复；累计动作=' + actions.length + '；回合=' + engine.getState().turn);

  try {
    while (!engine.isTerminal() && actions.length < maxSteps && engine.getState().turn <= maxTurns) {
      if (engine.getState().currentPlayer === 0) {
        const state = engine.getState();
        const legal = engine.getLegalActions(0);
        let page = 0;
        printBoard(state);
        listActions(state, legal, page);

        let turnEnded = false;
        while (!engine.isTerminal() && engine.getState().currentPlayer === 0 && !turnEnded) {
          const input = (await rl.question('红方动作> ')).trim().toLowerCase();
          if (input === 'more') {
            page = Math.min(page + 1, Math.max(0, Math.ceil(legal.length / 100) - 1));
            listActions(engine.getState(), legal, page);
            continue;
          }
          if (input === 'list') {
            page = 0;
            listActions(engine.getState(), legal, page);
            continue;
          }

          let selected: Action | undefined;
          if (input === 'end') {
            selected = legal.find(action => action.type === 'end_turn');
            if (!selected) {
              console.log('当前局面不允许结束回合，请先处理待行动单位。');
              continue;
            }
          } else {
            const index = Number(input);
            if (!Number.isInteger(index) || index < 0 || index >= legal.length) {
              console.log('请输入当前列表中的合法动作编号。');
              continue;
            }
            selected = legal[index];
          }

          const beforePlayer = engine.getState().currentPlayer;
          const result = engine.step(selected);
          if (result.info.includes('非法')) {
            console.log('引擎拒绝该动作：' + result.info);
            continue;
          }
          actions.push({ playerId: beforePlayer, action: selected, source: 'human' });
          await saveCheckpoint();
          console.log('红方：' + actionDescription(engine.getState(), selected) + '；' + result.info);
          if (selected.type === 'end_turn' || engine.isTerminal() || engine.getState().currentPlayer !== 0) {
            turnEnded = true;
          } else {
            const freshState = engine.getState();
            const freshLegal = engine.getLegalActions(0);
            page = 0;
            printBoard(freshState);
            listActions(freshState, freshLegal, page);
            // 下一轮使用新状态对应的合法动作集合。
            legal.splice(0, legal.length, ...freshLegal);
          }
        }
      }

      if (engine.isTerminal()) break;
      if (engine.getState().currentPlayer === 1) {
        const startTurn = engine.getState().turn;
        let blueSteps = 0;
        while (
          !engine.isTerminal()
          && engine.getState().currentPlayer === 1
          && blueSteps < maxBlueSteps
        ) {
          const turnBeforeAction = engine.getState().turn;
          const action = blue.getAction(engine, 1);
          const result = engine.step(action);
          if (result.info.includes('非法')) {
            throw new Error('HeuristicAI 返回非法动作：' + JSON.stringify(action));
          }
          actions.push({ playerId: 1, action, source: 'ai' });
          blueSteps++;
          if (actions.length % 10 === 0 || action.type === 'end_turn') {
            await saveCheckpoint();
          }
          const afterAction = engine.getState();
          if (action.type === 'end_turn' && afterAction.currentPlayer === 1 && afterAction.turn > turnBeforeAction) {
            console.log('红方本轮没有可执行行动，游戏引擎已自动跳过；蓝方继续。');
          }
        }
        if (!engine.isTerminal() && engine.getState().currentPlayer === 1) {
          await saveCheckpoint();
          throw new Error('蓝方连续自动回合超过 ' + maxBlueSteps + ' 步安全上限；检查点已保存，可用 --resume 继续。');
        }
        const state = engine.getState();
        console.log(
          '蓝方 HeuristicAI 完成本回合：' + blueSteps + ' 步；回合 ' + startTurn
          + ' → ' + state.turn + '；胜者=' + state.winner
          + '；红/蓝存活单位='
          + state.units.filter(unit => unit.ownerId === 0 && unit.hp > 0).length + '/'
          + state.units.filter(unit => unit.ownerId === 1 && unit.hp > 0).length
        );
      }
    }

    if (!engine.isTerminal()) {
      throw new Error(
        '对局达到安全上限但未自然结束；步数=' + actions.length
        + '，回合=' + engine.getState().turn
      );
    }

    const finalState = copyState(engine.getState());
    const payload = {
      kind: 'human_duel',
      version: 1,
      mapName,
      startedAt,
      exportedAt: new Date().toISOString(),
      controllers: {
        red: 'Assistant manually selected actions through the CLI',
        blue: 'HeuristicAI'
      },
      initialState,
      actions,
      finalState,
      winner: finalState.winner
    };
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
    await unlink(checkpointPath).catch(() => undefined);

    console.log(
      '自然终局：胜者 P' + finalState.winner + '；总步数=' + actions.length
      + '；终局回合=' + finalState.turn
    );
    console.log('最终 JSON 已导出：' + outputPath);
  } finally {
    rl.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

