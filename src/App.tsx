import React, { useState, useEffect, useRef } from 'react';
import { GameEngine } from './game/engine';
import { createDefaultAppGameState } from './game/default_state';
import { playAutoGame } from './game/ai/play';
import { GameState, Action, Position, Unit, UnitClass } from './game/types';
import { TERRAIN_CONFIG, UNIT_CONFIGS } from './game/constants';
import { getLegalActions } from './game/rules';
import { getEffectiveStats } from './game/abilities';
import {
  DEFAULT_APP_APK_MAP_NAME,
  createAppApkSkirmishGameState,
  getAppApkSkirmishMapOptions
} from './game/apk_skirmish_map_assets';
import { getAiAction, type SupportedAiPolicy, type AiActionResult } from './game/ai/neural_ai_adapter';

const unitNameMap: Record<string, string> = {
  soldier: '兵',
  ghost: '幽',
  mermaid: '鱼',
  archer: '弓',
  slime: '泥',
  water_elemental: '水',
  dark_mage: '黑',
  witch: '巫',
  paladin: '骑',
  elf: '精',
  berserker: '狂',
  wolf: '狼',
  golem: '石',
  ice_elemental: '冰',
  druid: '德',
  catapult: '炮',
  wolf_archer: '狼弓',
  dragon: '龙',
  commander: '帅',
  skeleton: '骷',
  crystal: '晶',
};

// 状态对应的中文翻译
const statusNameMap: Record<string, string> = {
  poisoned: '中毒',
  inspired: '鼓舞',
  blinded: '致盲',
  weakened: '虚弱'
};

const sandboxMapOptions = getAppApkSkirmishMapOptions();

const playerStyleMap: Record<number, {
  name: string;
  marker: string;
  textClass: string;
  badgeClass: string;
  panelClass: string;
  buttonClass: string;
  buildingClass: string;
  unitClass: string;
}> = {
  0: {
    name: '红方',
    marker: '■',
    textClass: 'text-red-400',
    badgeClass: 'bg-red-500 text-black',
    panelClass: 'bg-[#1A1111] border-red-950/50',
    buttonClass: 'bg-[#2E1A1A] text-red-400 hover:bg-red-950 border-red-900/40',
    buildingClass: 'bg-red-900/50 text-red-300 border-red-800',
    unitClass: 'bg-[#3C1313] border border-red-500 text-red-400'
  },
  1: {
    name: '蓝方',
    marker: '■',
    textClass: 'text-blue-400',
    badgeClass: 'bg-blue-400 text-black',
    panelClass: 'bg-[#10141D] border-blue-950/50',
    buttonClass: 'bg-[#1A2535] text-blue-400 hover:bg-blue-950 border-blue-900/40',
    buildingClass: 'bg-blue-900/50 text-blue-300 border-blue-800',
    unitClass: 'bg-[#141C31] border border-blue-400 text-blue-300'
  },
  2: {
    name: '绿方',
    marker: '■',
    textClass: 'text-emerald-400',
    badgeClass: 'bg-emerald-400 text-black',
    panelClass: 'bg-[#0E1B15] border-emerald-950/50',
    buttonClass: 'bg-[#123323] text-emerald-400 hover:bg-emerald-950 border-emerald-900/40',
    buildingClass: 'bg-emerald-900/50 text-emerald-300 border-emerald-800',
    unitClass: 'bg-[#102A1D] border border-emerald-400 text-emerald-300'
  },
  3: {
    name: '黄方',
    marker: '■',
    textClass: 'text-amber-400',
    badgeClass: 'bg-amber-400 text-black',
    panelClass: 'bg-[#1D170A] border-amber-950/50',
    buttonClass: 'bg-[#34270E] text-amber-400 hover:bg-amber-950 border-amber-900/40',
    buildingClass: 'bg-amber-900/50 text-amber-300 border-amber-800',
    unitClass: 'bg-[#2D220E] border border-amber-400 text-amber-300'
  }
};

const neutralBuildingClass = 'bg-zinc-800 text-zinc-400 border-zinc-700';
const fallbackPlayerStyle = {
  name: '未知方',
  marker: '■',
  textClass: 'text-zinc-300',
  badgeClass: 'bg-zinc-400 text-black',
  panelClass: 'bg-[#17171D] border-zinc-800',
  buttonClass: 'bg-[#22222A] text-zinc-300 hover:bg-zinc-800 border-zinc-700',
  buildingClass: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  unitClass: 'bg-[#202026] border border-zinc-400 text-zinc-300'
};

function getPlayerStyle(playerId: number) {
  return playerStyleMap[playerId] ?? fallbackPlayerStyle;
}

function getPlayerLabel(playerId: number): string {
  return `${getPlayerStyle(playerId).name} (P${playerId})`;
}

function getGraveAt(state: GameState, x: number, y: number) {
  return state.graves?.find(grave => grave.pos.x === x && grave.pos.y === y);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'auto' | 'sandbox'>('sandbox');

  // --- 自动对局模式状态 ---
  const [autoGameState, setAutoGameState] = useState<GameState>(createDefaultAppGameState());
  const [autoLogs, setAutoLogs] = useState<string[]>([]);
  const [autoIsRunning, setAutoIsRunning] = useState(false);
  const bottomAutoRef = useRef<HTMLDivElement>(null);

  // --- 手动沙盒对抗状态 ---
  const [selectedSandboxMapName, setSelectedSandboxMapName] = useState(DEFAULT_APP_APK_MAP_NAME);
  const [sandboxGameState, setSandboxGameState] = useState<GameState>(createDefaultAppGameState());
  const [sandboxLogs, setSandboxLogs] = useState<string[]>([
    "[系统] 欢迎来到手动沙盒试炼场！默认载入 APK 官方 Duel 地图，可切换 20 张官方 skirmish 地图并手动操纵各阵营对战。"
  ]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedCastlePos, setSelectedCastlePos] = useState<Position | null>(null);
  const [selectedRecruitUnitClass, setSelectedRecruitUnitClass] = useState<UnitClass | null>(null);
  const [hoveredTilePos, setHoveredTilePos] = useState<Position | null>(null);
  const bottomSandboxRef = useRef<HTMLDivElement>(null);

  // 滚动至最新日志
  useEffect(() => {
    bottomAutoRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [autoLogs]);

  useEffect(() => {
    bottomSandboxRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sandboxLogs]);

  // --- 策略选择状态 ---
  const [p0Policy, setP0Policy] = useState<SupportedAiPolicy>('heuristic');
  const [p1Policy, setP1Policy] = useState<SupportedAiPolicy>('random');
  const [lastAiMeta, setLastAiMeta] = useState<AiActionResult | null>(null);

  // --- 自动对局控制 ---
  const handleStartAutoPlay = async () => {
    if (autoIsRunning) return;
    setAutoIsRunning(true);
    setAutoLogs(prev => [...prev, `[INFO] 开始自动对局 (P0: ${p0Policy} vs P1: ${p1Policy})...`]);
    
    await playAutoGame({
      delayMs: 80,
      p0Policy,
      p1Policy,
      onStep: (engine, turnInfo, meta) => {
        setAutoGameState(engine.getState());
        if (meta) setLastAiMeta(meta);
        if (turnInfo.trim() !== "") {
            setAutoLogs(prev => [...prev, `[LOG] ${turnInfo}`]);
        }
      }
    });
    
    setAutoIsRunning(false);
  };

  const handleResetAuto = () => {
    setAutoGameState(createDefaultAppGameState());
    setLastAiMeta(null);
    setAutoLogs(prev => [...prev, "[INFO] 自动对局状态已重置"]);
  };

  const handleAiStepSandbox = (policy: SupportedAiPolicy) => {
    const engine = new GameEngine(sandboxGameState);
    const cp = sandboxGameState.currentPlayer;
    const res = getAiAction(policy, engine, cp);
    const stepRes = engine.step(res.action);
    setSandboxGameState(engine.getState());
    resetSandboxSelections();
    const nodeInfo = res.nodesExpanded !== undefined ? ` (展开节点: ${res.nodesExpanded})` : '';
    setSandboxLogs(prev => [...prev, `[AI 行动] P${cp} [${res.source}] 执行 ${res.action.type} 耗时: ${res.latencyMs}ms${nodeInfo} - ${stepRes.info}`]);
  };

  // --- 沙盒模式控制 ---
  const resetSandboxSelections = () => {
    setSelectedUnitId(null);
    setSelectedCastlePos(null);
    setSelectedRecruitUnitClass(null);
    setHoveredTilePos(null);
  };

  const handleResetSandbox = () => {
    setSandboxGameState(createAppApkSkirmishGameState(selectedSandboxMapName));
    resetSandboxSelections();
    setSandboxLogs(prev => [...prev, `[系统] 沙盒已重置为 ${selectedSandboxMapName}。`]);
  };

  const handleChangeSandboxMap = (mapName: string) => {
    setSelectedSandboxMapName(mapName);
    setSandboxGameState(createAppApkSkirmishGameState(mapName));
    resetSandboxSelections();
    setSandboxLogs(prev => [...prev, `[系统] 已切换 APK 地图：${mapName}`]);
  };

  const handleAddGold = (playerId: number, amount: number) => {
    setSandboxGameState(prev => {
      const copy = JSON.parse(JSON.stringify(prev)) as GameState;
      const player = copy.players.find(p => p.id === playerId);
      if (player) {
        player.gold += amount;
      }
      return copy;
    });
    setSandboxLogs(prev => [...prev, `[调试] 为${getPlayerLabel(playerId)}补充了 ${amount} 金币`]);
  };

  const executeSandboxAction = (action: Action) => {
    const engine = new GameEngine(sandboxGameState);
    
    let actionDesc = '';
    switch (action.type) {
      case 'move': actionDesc = `移动单位 ${action.unitId} 至 (${action.to.x}, ${action.to.y})`; break;
      case 'post_attack_move': actionDesc = `二次移动单位 ${action.unitId} 至 (${action.to.x}, ${action.to.y})`; break;
      case 'attack': actionDesc = `攻击: 单位 ${action.attackerId} 攻击了 ${action.targetId}`; break;
      case 'heal': actionDesc = `治疗: 单位 ${action.healerId} 治疗了 ${action.targetId}`; break;
      case 'support': actionDesc = `支援: 单位 ${action.supporterId} 支援了 ${action.targetId}`; break;
      case 'summon': actionDesc = `召唤: 单位 ${action.summonerId} 在 (${action.spawnPos.x}, ${action.spawnPos.y}) 唤醒骷髅`; break;
      case 'capture': actionDesc = `占领: 单位 ${action.unitId} 正在占领当前据点`; break;
      case 'repair': actionDesc = `修理: 单位 ${action.unitId} 修理当前城镇`; break;
      case 'destroy_town': actionDesc = `破坏: 单位 ${action.unitId} 袭击损坏了当前城镇`; break;
      case 'wait': actionDesc = `待命: 单位 ${action.unitId} 在原地结束了本回合行动`; break;
      case 'recruit_to_castle': actionDesc = `招募: 城堡 (${action.castlePos.x}, ${action.castlePos.y}) 招募了 [${UNIT_CONFIGS[action.unitClass]?.name}]`; break;
      case 'recruit_and_deploy': actionDesc = `空投招募: 城堡 (${action.castlePos.x}, ${action.castlePos.y}) 空投招募了 [${UNIT_CONFIGS[action.unitClass]?.name}] 至 (${action.to.x}, ${action.to.y})`; break;
      case 'surrender': actionDesc = `投降：当前玩家主动认输`; break;
      case 'end_turn': actionDesc = `回合结束：交替行动控制权`; break;
    }

    const result = engine.step(action);
    setSandboxGameState(result.state);
    setSelectedRecruitUnitClass(null);
    
    if (result.info) {
      setSandboxLogs(prev => [...prev, `[动作] ${actionDesc} | ${result.info}`]);
    } else {
      setSandboxLogs(prev => [...prev, `[动作] ${actionDesc}`]);
    }

    // 动作完成后根据单位最近行动状态智能化抉择是否自动解除当前选中
    const updatedSelectedUnit = result.state.units.find(u => u.id === selectedUnitId);
    if (!updatedSelectedUnit || updatedSelectedUnit.hasActed) {
      setSelectedUnitId(null);
    }
  };

  // --- 沙盒合法动作快速读取 ---
  const currentSandboxPlayer = sandboxGameState.currentPlayer;
  const sandboxLegalActions = getLegalActions(sandboxGameState, currentSandboxPlayer);

  // 根据当前选中单位ID，抽取出和它的所有合法子动作
  const selectedUnit = sandboxGameState.units.find(u => u.id === selectedUnitId);
  const myUnits = sandboxGameState.units.filter(u => u.ownerId === currentSandboxPlayer);

  const unitMoves = selectedUnitId ? sandboxLegalActions.filter(a => a.type === 'move' && a.unitId === selectedUnitId) : [];
  const unitPostMoves = selectedUnitId ? sandboxLegalActions.filter(a => a.type === 'post_attack_move' && a.unitId === selectedUnitId) : [];
  const unitAttacks = selectedUnitId ? sandboxLegalActions.filter(a => a.type === 'attack' && a.attackerId === selectedUnitId) : [];
  const unitHeals = selectedUnitId ? sandboxLegalActions.filter(a => a.type === 'heal' && a.healerId === selectedUnitId) : [];
  const unitSupports = selectedUnitId ? sandboxLegalActions.filter(a => a.type === 'support' && a.supporterId === selectedUnitId) : [];
  const unitSummons = selectedUnitId ? sandboxLegalActions.filter(a => a.type === 'summon' && a.summonerId === selectedUnitId) : [];

  const unitWaitAction = selectedUnitId ? sandboxLegalActions.find(a => a.type === 'wait' && a.unitId === selectedUnitId) : undefined;
  const unitCaptureAction = selectedUnitId ? sandboxLegalActions.find(a => a.type === 'capture' && a.unitId === selectedUnitId) : undefined;
  const unitRepairAction = selectedUnitId ? sandboxLegalActions.find(a => a.type === 'repair' && a.unitId === selectedUnitId) : undefined;
  const unitDestroyAction = selectedUnitId ? sandboxLegalActions.find(a => a.type === 'destroy_town' && a.unitId === selectedUnitId) : undefined;

  // 针对选中城堡位置的招募动作集合
  const castleRecruitsToCastle = selectedCastlePos 
    ? sandboxLegalActions.filter(a => a.type === 'recruit_to_castle' && a.castlePos.x === selectedCastlePos.x && a.castlePos.y === selectedCastlePos.y) 
    : [];
  const castleRecruitsAndDeploy = selectedCastlePos
    ? sandboxLegalActions.filter(a => a.type === 'recruit_and_deploy' && a.castlePos.x === selectedCastlePos.x && a.castlePos.y === selectedCastlePos.y)
    : [];

  const deploySpawns = selectedRecruitUnitClass && selectedCastlePos
    ? castleRecruitsAndDeploy.filter(a => (a as any).unitClass === selectedRecruitUnitClass)
    : [];
  const selectedSandboxMapOption = sandboxMapOptions.find(option => option.name === selectedSandboxMapName);
  const sandboxMaxDimension = Math.max(sandboxGameState.map.width, sandboxGameState.map.height);
  const sandboxTileSize = Math.max(28, Math.min(48, Math.floor(640 / sandboxMaxDimension)));
  const sandboxUnitSize = Math.max(22, sandboxTileSize - 10);
  const sandboxTileStyle: React.CSSProperties = { width: sandboxTileSize, height: sandboxTileSize };
  const sandboxUnitStyle: React.CSSProperties = { width: sandboxUnitSize, height: sandboxUnitSize };

  // 获取格子对应的地形色彩
  const getTerrainColor = (terrainId: number) => {
    switch (terrainId) {
      case 1: return 'bg-[#ECEFF4] text-black'; // snow
      case 2: return 'bg-[#0E2136]'; // deep water
      case 3: return 'bg-[#2D1C13]'; // mountain
      case 4: return 'bg-[#1C2816]'; // hill
      case 5: return 'bg-[#142A27]'; // island
      case 6: return 'bg-[#191921]'; // road
      case 7: return 'bg-[#0F2E14]'; // forest
      case 8: return 'bg-[#402C1F] border-orange-900'; // damaged town
      case 9: return 'bg-[#1C2C3D] border-blue-900'; // town
      case 10: return 'bg-[#311111] border-red-900'; // castle
      case 11: return 'bg-[#1A381C] border-emerald-950'; // camp
      case 12: return 'bg-[#3F1B5C] border-purple-900'; // temple
      case 13: return 'bg-[#253225]'; // special_1
      case 16: return 'bg-[#1A255C] border-indigo-900'; // water temple
      default: return 'bg-[#16161D]';
    }
  };

  const renderHoveredTilePanel = () => {
    if (!hoveredTilePos) {
      return (
        <div className="bg-[#111116]/80 border border-[#22222A] p-4 rounded-md text-xs w-full max-w-sm h-36 flex items-center justify-center text-center text-zinc-500 select-none shadow-inner">
          <div className="space-y-1">
            <span className="text-lg block">🔭</span>
            <span className="text-[11px]">将鼠标悬停在上方任意地图格子上<br />即可查看地形及底座单位的详细数据参数</span>
          </div>
        </div>
      );
    }
    const { x, y } = hoveredTilePos;
    const displayGameState = activeTab === 'auto' ? autoGameState : sandboxGameState;
    
    // 越界保护
    if (y >= displayGameState.map.tiles.length || x >= displayGameState.map.tiles[y]?.length) return null;
    
    const tile = displayGameState.map.tiles[y][x];
    const u = displayGameState.units.find(u => u.pos.x === x && u.pos.y === y);
    const grave = getGraveAt(displayGameState, x, y);
    const terrainConf = TERRAIN_CONFIG[tile.terrainId];

    return (
      <div className="bg-[#111116]/95 border border-zinc-700/60 p-3 rounded-md text-xs space-y-2 w-full max-w-sm min-h-[9rem] shrink-0 shadow-lg backdrop-blur text-gray-300">
         <div className="flex justify-between items-center pb-1 border-b border-zinc-850">
           <span className="font-extrabold text-blue-400 text-[11px] flex items-center space-x-1">
             <span>🕵️ 战地检视 [X: {x}, Y: {y}]</span>
           </span>
           <span className="text-[9px] text-zinc-500 font-mono tracking-tighter">TILE INSPECTOR</span>
         </div>
         
         <div className="space-y-1 text-[11px]">
           <div className="flex justify-between">
             <span>地形: <strong className="text-white font-black">{terrainConf?.name || '未知地形'}</strong></span>
             <span className="text-zinc-400">地形防御加成: <strong className="text-yellow-500 bg-yellow-500/10 px-1 rounded">+{terrainConf?.defenseBonus}点</strong></span>
           </div>
           <div className="flex justify-between text-[11px] text-zinc-400">
             <span>常规消耗: <strong className="text-cyan-400">{terrainConf?.moveCost}</strong></span>
             {terrainConf && terrainConf.healPerTurn > 0 && (
               <span>回复: <strong className="text-green-400">+{terrainConf.healPerTurn}HP</strong></span>
             )}
             {terrainConf && terrainConf.incomePerTurn > 0 && (
               <span>金币收益: <strong className="text-yellow-400">+{terrainConf.incomePerTurn}H</strong></span>
             )}
           </div>
           {tile.ownerId !== null && (
             <div className="text-[11px] text-zinc-400">
               据点势力: <strong className={`${getPlayerStyle(tile.ownerId).textClass} font-bold`}>{getPlayerLabel(tile.ownerId)}</strong>
             </div>
           )}
           {grave && (
             <div className="text-[11px] text-zinc-400">
               墓碑: <strong className="text-purple-300 font-bold">剩余 {grave.remainingTurns} 回合</strong>
             </div>
           )}
         </div>

         {u ? (
           <div className="pt-1 border-t border-dashed border-zinc-800 space-y-1">
             <div className="flex justify-between items-center leading-none">
              <span className={`font-black text-[11px] ${getPlayerStyle(u.ownerId).textClass}`}>
                [{getPlayerLabel(u.ownerId)}] {UNIT_CONFIGS[u.unitClass]?.name} {u.hasActed ? ' (已行动)' : ''}
              </span>
               <span className="text-yellow-500 text-[9px] font-bold bg-yellow-500/10 px-1 rounded scale-90">Lv.{u.level || 0}</span>
             </div>

             <div className="grid grid-cols-4 gap-1 text-[10px] text-zinc-400 leading-tight">
               <div>生命:<span className="font-bold text-green-400 ml-0.5">{u.hp}</span></div>
               <div>攻击:<span className="font-bold text-red-400 ml-0.5">{getEffectiveStats(u).attack}</span></div>
               <div>物防:<span className="font-bold text-orange-400 ml-0.5">{getEffectiveStats(u).physicalDefense}</span></div>
               <div>射程:<span className="font-bold text-yellow-500 ml-0.5">{getEffectiveStats(u).minRange}-{getEffectiveStats(u).maxRange}</span></div>
             </div>

             {u.status && (
               <div className="text-[9px] text-orange-400 bg-orange-950/20 px-1 rounded border border-orange-900/30 w-fit scale-95 origin-left">
                 ⚠️ 异常: <span className="font-bold">{statusNameMap[u.status.type]}</span>
               </div>
             )}
           </div>
         ) : (
           <div className="text-[9px] text-zinc-600 text-center py-0.5 bg-black/10 rounded border border-zinc-900/40">
             无驻守单位
           </div>
         )}
      </div>
    );
  };

  // 棋盘上每格的点击处理器（手动沙盒模式下生效）
  const handleTileClick = (x: number, y: number) => {
    // 0.5 如果处于招募部署状态，判断点击的地方是否能部署
    if (selectedRecruitUnitClass && deploySpawns.length > 0) {
      const matchSpawn = deploySpawns.find(s => (s as any).to.x === x && (s as any).to.y === y);
      if (matchSpawn) {
        executeSandboxAction(matchSpawn);
        return;
      } else {
        // 点错取消招募选择
        setSelectedRecruitUnitClass(null);
      }
    }

    // 1. 如果玩家点击的是高亮可移动的目标点
    const matchMove = unitMoves.find(m => (m as any).to.x === x && (m as any).to.y === y);
    if (matchMove) {
      executeSandboxAction(matchMove);
      return;
    }

    // 2. 如果是高亮二次移动的目标点（突击部队）
    const matchPostMove = unitPostMoves.find(m => (m as any).to.x === x && (m as any).to.y === y);
    if (matchPostMove) {
      executeSandboxAction(matchPostMove);
      return;
    }

    // 3. 寻找格子上的单位
    const targetUnit = sandboxGameState.units.find(u => u.pos.x === x && u.pos.y === y);

    // 4. 判断是否是合法的攻击/治疗/支援动作
    if (targetUnit) {
      const matchAttack = unitAttacks.find(a => (a as any).targetId === targetUnit.id);
      if (matchAttack) {
        executeSandboxAction(matchAttack);
        return;
      }

      const matchHeal = unitHeals.find(h => (h as any).targetId === targetUnit.id);
      if (matchHeal) {
        executeSandboxAction(matchHeal);
        return;
      }

      const matchSupport = unitSupports.find(s => (s as any).targetId === targetUnit.id);
      if (matchSupport) {
        executeSandboxAction(matchSupport);
        return;
      }
    }

    // 5. 如果点击了可召唤落脚点或墓碑（若存在合法的特定对该点召唤动作）
    const matchSummon = unitSummons.find(s => (s as any).spawnPos.x === x && (s as any).spawnPos.y === y);
    if (matchSummon) {
      executeSandboxAction(matchSummon);
      return;
    }

    // 6. 如果没有满足的衍生执行，则切换选择目标
    if (targetUnit) {
      // 必须是当前行动玩家自己的单位且没有全部行动完成
      if (targetUnit.ownerId === currentSandboxPlayer) {
        setSelectedUnitId(targetUnit.id);
        setSelectedCastlePos(null);
      } else {
        // 如果是敌方单位，仅作为检视目标，不提供控制
        setSelectedUnitId(targetUnit.id);
        setSelectedCastlePos(null);
      }
    } else {
      // 点击了没有单位的格子，判断是否是自己的城堡
      const tile = sandboxGameState.map.tiles[y][x];
      if (tile.terrainId === 10 && tile.ownerId === currentSandboxPlayer) {
        setSelectedCastlePos({ x, y });
        setSelectedUnitId(null);
      } else {
        // 选择纯清空
        setSelectedUnitId(null);
        setSelectedCastlePos(null);
      }
    }
  };

  return (
    <div className="flex h-screen w-full font-mono bg-[#0B0B0D] text-[#E2E2EA] select-none overflow-hidden flex-col">
      {/* 顶部现代导航 Tab */}
      <div className="h-14 w-full bg-[#111115] border-b border-[#2C2C35] flex items-center justify-between px-6 shrink-0 z-30">
        <div className="flex items-center space-x-3">
          <div className="w-2.5 h-2.5 bg-[#00FF41] rounded-full animate-pulse"></div>
          <span className="text-sm font-bold tracking-wider text-white uppercase">WARCHESS CORE SIMULATOR :: 战棋训练终端</span>
        </div>
        <div className="flex space-x-2 bg-[#09090C] p-1 rounded border border-[#23232C]">
          <button 
            onClick={() => setActiveTab('sandbox')}
            className={`px-4 py-1.5 text-xs font-bold uppercase transition-all rounded-sm ${activeTab === 'sandbox' ? 'bg-[#1C2C3D] text-blue-400 border border-blue-900/50' : 'text-[#8E8E99] hover:text-white'}`}
          >
            🕹️ 手动沙盒试炼 (APK地图)
          </button>
          <button 
            onClick={() => setActiveTab('auto')}
            className={`px-4 py-1.5 text-xs font-bold uppercase transition-all rounded-sm ${activeTab === 'auto' ? 'bg-[#1C2C3D] text-blue-400 border border-blue-900/50' : 'text-[#8E8E99] hover:text-white'}`}
          >
            🤖 自动 AI 演示对局
          </button>
        </div>
      </div>

      {activeTab === 'auto' ? (
        // --- 核心自动对局展示 ---
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧地图 */}
          <div className="flex-1 p-8 flex flex-col items-center justify-center border-r border-[#2C2C35] bg-[#09090B] overflow-y-auto">
            <div className="mb-4 flex flex-wrap items-center justify-center gap-3 bg-[#111116] border border-[#23232D] p-3 rounded text-xs w-full max-w-xl">
                <div className="flex items-center space-x-2">
                    <span className="font-bold text-red-500">P0 (红方):</span>
                    <select 
                        value={p0Policy} 
                        onChange={e => setP0Policy(e.target.value as SupportedAiPolicy)}
                        disabled={autoIsRunning}
                        className="bg-[#191922] border border-[#353545] text-gray-200 px-2 py-1 rounded text-xs focus:outline-none focus:border-red-500"
                    >
                        <option value="heuristic">Heuristic AI (原生启发式)</option>
                        <option value="spatial_resnet_v1">Spatial ResNet v1 (空间残差卷积)</option>
                        <option value="net_b_s10">NET_B S10 (战术搜索先验)</option>
                        <option value="net_b_1ply">NET_B 1-ply (纯策略网络)</option>
                        <option value="random">Random AI (随机)</option>
                    </select>
                </div>
                <div className="w-px h-4 bg-[#2A2A35]"></div>
                <div className="flex items-center space-x-2">
                    <span className="font-bold text-blue-400">P1 (蓝方):</span>
                    <select 
                        value={p1Policy} 
                        onChange={e => setP1Policy(e.target.value as SupportedAiPolicy)}
                        disabled={autoIsRunning}
                        className="bg-[#191922] border border-[#353545] text-gray-200 px-2 py-1 rounded text-xs focus:outline-none focus:border-blue-500"
                    >
                        <option value="heuristic">Heuristic AI (原生启发式)</option>
                        <option value="spatial_resnet_v1">Spatial ResNet v1 (空间残差卷积)</option>
                        <option value="net_b_s10">NET_B S10 (战术搜索先验)</option>
                        <option value="net_b_1ply">NET_B 1-ply (纯策略网络)</option>
                        <option value="random">Random AI (随机)</option>
                    </select>
                </div>
                {lastAiMeta && (
                    <div className="w-full text-center text-[10px] text-cyan-400 bg-cyan-950/40 border border-cyan-800/60 py-1 rounded">
                        最近决策: {lastAiMeta.source} (耗时: {lastAiMeta.latencyMs}ms{lastAiMeta.nodesExpanded ? `, 展开节点: ${lastAiMeta.nodesExpanded}` : ''})
                    </div>
                )}
            </div>

            <div className="mb-6 flex space-x-4">
                <button 
                    onClick={handleStartAutoPlay} 
                    disabled={autoIsRunning}
                    className="px-5 py-2.5 bg-[#1F2C23] border border-green-800 hover:border-green-400 text-green-400 text-xs font-bold uppercase transition-all disabled:opacity-50"
                >
                    {autoIsRunning ? '⚡ 自动模拟运行中...' : '▶ 启动 AI 沙盘博弈'}
                </button>
                <button 
                    onClick={handleResetAuto}
                    disabled={autoIsRunning}
                    className="px-5 py-2.5 bg-[#251A1A] border border-red-900/50 hover:border-red-500 text-red-500 text-xs font-bold uppercase transition-all disabled:opacity-50"
                >
                    🔄 重置沙盘环境
                </button>
            </div>

            <div className="relative border border-[#2D2D35] bg-[#020202] p-3 flex flex-col space-y-1">
              {autoGameState.map.tiles.map((row, y) => (
                <div key={y} className="flex space-x-1">
                  {row.map((tile, x) => {
                    const u = autoGameState.units.find(u => u.pos.x === x && u.pos.y === y);
                    const grave = getGraveAt(autoGameState, x, y);
                    const isBuilding = [8, 9, 10, 11, 12, 13, 16].includes(tile.terrainId);
                    const terrainConf = TERRAIN_CONFIG[tile.terrainId];

                    return (
                      <div 
                        key={`${x}-${y}`} 
                        onMouseEnter={() => setHoveredTilePos({ x, y })}
                        onMouseLeave={() => setHoveredTilePos(null)}
                        className={`w-12 h-12 flex relative items-center justify-center border border-[#1e1e24] ${getTerrainColor(tile.terrainId)}`}
                      >
                        {!u && !isBuilding && !grave && <span className="text-[9px] text-[#ffffff1D]">{terrainConf?.name?.substring(0,3)}</span>}

                        {grave && (
                          <div
                            className={`absolute z-[6] flex items-center justify-center border border-purple-300/50 bg-purple-950/70 text-purple-100 font-black shadow-sm pointer-events-none ${u ? 'bottom-0 right-0 w-4 h-4 text-[9px] rounded-sm' : 'inset-2 text-[13px] rounded'}`}
                            title={`墓碑：剩余 ${grave.remainingTurns} 回合`}
                          >
                            碑
                          </div>
                        )}

                        {isBuilding && (
                          <div className={`absolute bottom-0 w-full text-[9px] text-center font-bold tracking-tighter border-t border-[#22222A] ${tile.ownerId === 0 ? 'bg-red-900/40 text-red-400 border-red-800' : tile.ownerId === 1 ? 'bg-blue-900/40 text-blue-400 border-blue-800' : 'bg-[#16161D] text-[#8E8E99]'}`}>
                             {terrainConf?.name?.substring(0,2)}
                          </div>
                        )}
                        {u && (
                          <div className={`z-10 w-8 h-8 flex items-center justify-center font-bold text-[10px] rounded-sm ${u.ownerId === 0 ? 'bg-[#311111] border border-red-500 text-red-500' : 'bg-[#181D2D] border border-blue-400 text-blue-400'} ${u.hasActed ? 'opacity-40 animate-pulse' : ''}`}>
                             {unitNameMap[u.unitClass] || '?'}
                          </div>
                        )}
                        {u && <div className="absolute top-0 right-0 z-20 text-[9px] font-bold bg-black text-[#A6E22E] px-[3px] border border-[#222228] scale-90">{u.hp}</div>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            
            <div className="mt-8 flex justify-around w-full max-w-md bg-[#111115] border border-[#2D2D35] p-4 text-xs uppercase text-[#8E8E99] rounded">
                <div className="flex flex-col items-center">
                    <strong className="text-red-500 mb-1">红方阵营 [P0]</strong>
                    <span className="text-yellow-500">金币: {autoGameState.players[0].gold}</span>
                </div>
                <div className="w-px bg-[#2D2D35]"></div>
                <div className="flex flex-col items-center">
                    <strong className="text-blue-400 mb-1">蓝方阵营 [P1]</strong>
                    <span className="text-yellow-500">金币: {autoGameState.players[1].gold}</span>
                </div>
                <div className="w-px bg-[#2D2D35]"></div>
                <div className="flex flex-col items-center">
                    <strong className="text-white mb-1">回合 {autoGameState.turn}</strong>
                    <span className={autoGameState.currentPlayer === 0 ? "text-red-500" : "text-blue-400"}>当前行动: P{autoGameState.currentPlayer}</span>
                </div>
            </div>

            <div className="mt-4 w-full flex justify-center">
              {renderHoveredTilePanel()}
            </div>
          </div>

          {/* 右侧日志 */}
          <div className="w-96 bg-[#0E0E12] flex flex-col border-l border-[#2C2C35] shrink-0">
             <div className="w-full bg-[#111115] border-b border-[#2C2C35] p-4 flex justify-between items-center">
                <span className="text-xs font-bold text-[#8E8E99] uppercase tracking-widest">博弈沙盘数据流 (Auto Trace)</span>
                <span className={`text-[10px] px-2 py-0.5 border ${autoGameState.winner !== null ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10' : 'border-green-500/30 text-green-400 bg-green-500/5'} rounded-sm uppercase`}>
                    {autoGameState.winner !== null ? `红蓝决胜: P${autoGameState.winner}` : '模拟运行中'}
                </span>
             </div>
             <div className="flex-1 w-full overflow-y-auto p-4 space-y-1 text-[11px] text-[#A1A1B3]">
                {autoLogs.map((L, i) => {
                    const isInfo = L.startsWith('[INFO]');
                    const LogColor = isInfo ? 'text-blue-400' : 'text-[#00FF41]';
                    const prefixMatch = L.match(/^\[(.*?)\] (.*)/);
                    if (prefixMatch) {
                        return (
                            <div key={i} className="flex items-start break-words border-b border-[#181822]/40 pb-1">
                                <span className={`${LogColor} mr-2 font-bold whitespace-nowrap`}>[{prefixMatch[1]}]</span>
                                <span className="text-white">{prefixMatch[2]}</span>
                            </div>
                        );
                    }
                    return <div key={i} className="flex items-start break-words text-[#D1D1E0]">{L}</div>;
                })}
                <div ref={bottomAutoRef} />
             </div>
          </div>
        </div>
      ) : (
        // --- 核心手动沙盒对抗模式 ---
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧：沙盒大地图交互 */}
          <div className="flex-1 p-6 flex flex-col items-center justify-center border-r border-[#2C2C35] bg-[#08080C] overflow-y-auto">
            {/* 顶排：回合头顶指示 */}
            <div className="mb-4 w-full max-w-3xl bg-[#0F0F14] border border-[#22222E] px-4 py-3 text-xs space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-400 font-bold uppercase">当前决策权限:</span>
                <div className="flex items-center space-x-3">
                  <span className={`font-black uppercase tracking-wider px-2 py-0.5 rounded ${getPlayerStyle(sandboxGameState.currentPlayer).badgeClass}`}>
                    {getPlayerLabel(sandboxGameState.currentPlayer)}
                  </span>
                  <span className="text-gray-500">|</span>
                  <span className="text-yellow-400 font-bold">第 {sandboxGameState.turn} 回合</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-gray-500 font-bold shrink-0" htmlFor="sandbox-map-select">APK 地图</label>
                <select
                  id="sandbox-map-select"
                  value={selectedSandboxMapName}
                  onChange={event => handleChangeSandboxMap(event.target.value)}
                  className="min-w-0 flex-1 bg-[#07070A] border border-[#2C2C35] text-zinc-200 px-3 py-1.5 rounded-sm outline-none focus:border-blue-500"
                >
                  {sandboxMapOptions.map(option => (
                    <option key={option.name} value={option.name}>
                      {option.label} / {option.width}x{option.height} / {option.playerCount}人
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-zinc-500 shrink-0">
                  {selectedSandboxMapOption?.resourcePath ?? '未找到地图'}
                </span>
              </div>
            </div>

            {/* 核心棋盘 */}
            <div className="w-full flex justify-center overflow-auto pb-1">
            <div className="relative border border-[#262630] bg-[#020203] p-3 flex flex-col gap-1 shrink-0">
              {sandboxGameState.map.tiles.map((row, y) => (
                <div key={y} className="flex gap-1">
                  {row.map((tile, x) => {
                    const u = sandboxGameState.units.find(u => u.pos.x === x && u.pos.y === y);
                    const grave = getGraveAt(sandboxGameState, x, y);
                    const isBuilding = [8, 9, 10, 11, 12, 13, 16].includes(tile.terrainId);
                    const terrainConf = TERRAIN_CONFIG[tile.terrainId];

                    // 1. 判断是否被选中的格子
                    const isSelectedGrid = selectedUnit && selectedUnit.pos.x === x && selectedUnit.pos.y === y;
                    const isSelectedCastleGrid = selectedCastlePos && selectedCastlePos.x === x && selectedCastlePos.y === y;

                    // 2. 交互动作高亮：可移动/攻击/治疗等
                    const canMoveTo = unitMoves.some(m => (m as any).to.x === x && (m as any).to.y === y);
                    const canPostMoveTo = unitPostMoves.some(m => (m as any).to.x === x && (m as any).to.y === y);
                    const canAttackTarget = u && unitAttacks.some(a => (a as any).targetId === u.id);
                    const canHealTarget = u && unitHeals.some(h => (h as any).targetId === u.id);
                    const canSupportTarget = u && unitSupports.some(s => (s as any).targetId === u.id);
                    const canSummonTo = unitSummons.some(s => (s as any).spawnPos.x === x && (s as any).spawnPos.y === y);
                    const canDeployTo = selectedRecruitUnitClass && deploySpawns.some(s => (s as any).to.x === x && (s as any).to.y === y);

                    // 高亮类名的累加决定器
                    let overlayClass = '';
                    if (isSelectedGrid || isSelectedCastleGrid) {
                      overlayClass = 'ring-2 ring-white z-20 scale-105';
                    } else if (canMoveTo) {
                      overlayClass = 'ring-2 ring-yellow-400/80 cursor-pointer bg-yellow-500/10 z-10';
                    } else if (canDeployTo) {
                      overlayClass = 'ring-2 ring-blue-400/80 cursor-pointer bg-blue-500/10 z-10';
                    } else if (canPostMoveTo) {
                      overlayClass = 'ring-2 ring-cyan-400/80 cursor-pointer bg-cyan-500/10 z-10';
                    } else if (canAttackTarget) {
                      overlayClass = 'ring-2 ring-red-500 cursor-pointer bg-red-500/20 z-10';
                    } else if (canHealTarget) {
                      overlayClass = 'ring-2 ring-emerald-500 cursor-pointer bg-emerald-500/20 z-10';
                    } else if (canSupportTarget) {
                      overlayClass = 'ring-2 ring-blue-500 cursor-pointer bg-blue-500/20 z-10';
                    } else if (canSummonTo) {
                      overlayClass = 'ring-2 ring-purple-500 cursor-pointer bg-purple-500/20 z-10';
                    }

                    return (
                      <div 
                        key={`${x}-${y}`} 
                        onClick={() => handleTileClick(x, y)}
                        onMouseEnter={() => setHoveredTilePos({ x, y })}
                        onMouseLeave={() => setHoveredTilePos(null)}
                        style={sandboxTileStyle}
                        className={`flex relative items-center justify-center border border-[#1e1e25] cursor-pointer transition-all duration-150 ${getTerrainColor(tile.terrainId)} ${overlayClass}`}
                      >
                        {/* 如果是空地，印一个微弱的地形名称做底 */}
                        {!u && !isBuilding && !grave && <span className="text-[8px] text-[#ffffff20] select-none pointer-events-none">{terrainConf?.name?.substring(0,3)}</span>}

                        {/* APK 墓碑格显示 */}
                        {grave && (
                          <div
                            className={`absolute z-[6] flex items-center justify-center border border-purple-300/50 bg-purple-950/70 text-purple-100 font-black shadow-sm pointer-events-none select-none ${u ? 'bottom-0 right-0 w-4 h-4 text-[9px] rounded-sm' : 'inset-1.5 text-[13px] rounded'}`}
                            title={`墓碑：剩余 ${grave.remainingTurns} 回合`}
                          >
                            碑
                          </div>
                        )}

                        {/* 建筑据点底部标签 */}
                        {isBuilding && (
                          <div className={`absolute bottom-0 w-full text-[9px] text-center font-bold tracking-tighter border-t border-[#22222A] overflow-hidden select-none ${tile.ownerId === null ? neutralBuildingClass : getPlayerStyle(tile.ownerId).buildingClass}`}>
                             {terrainConf?.name?.substring(0,2)}
                          </div>
                        )}

                        {/* 棋子渲染 */}
                        {u && (
                          <div
                            style={sandboxUnitStyle}
                            className={`z-10 flex items-center justify-center font-bold text-[10px] rounded-md transition-opacity select-none ${getPlayerStyle(u.ownerId).unitClass} ${u.hasActed ? 'opacity-35 line-through' : ''}`}
                          >
                             {unitNameMap[u.unitClass] || '?'}
                          </div>
                        )}

                        {/* 特殊状态(Poisoned / Blinded / Weakened) 指示标贴 */}
                        {u && u.status && (
                          <div className="absolute bottom-0 left-0 bg-orange-600 text-white rounded-full text-[7px] w-3 h-3 flex items-center justify-center font-black" title={statusNameMap[u.status.type]}>
                            {u.status.type === 'poisoned' ? '毒' : u.status.type === 'inspired' ? '鼓' : u.status.type === 'blinded' ? '盲' : '弱'}
                          </div>
                        )}

                        {/* 生命值和高亮辅助器 */}
                        {u && <div className="absolute top-0 right-0 z-20 text-[9px] font-bold bg-black text-[#A6E22E] px-[3px] border border-[#22222A] scale-90">{u.hp}</div>}
                        
                        {/* 地图内辅助功能小气泡（提示动作） */}
                        {canMoveTo && <span className="absolute text-[8px] text-yellow-400 font-bold top-0 left-0 bg-black/60 px-0.5 rounded pointer-events-none scale-75 transform origin-top-left">移动</span>}
                        {canDeployTo && <span className="absolute text-[8px] text-blue-400 font-bold top-0 left-0 bg-black/60 px-0.5 rounded pointer-events-none scale-75 transform origin-top-left">建</span>}
                        {canAttackTarget && <span className="absolute text-[8px] text-red-500 font-bold top-0 left-0 bg-black/60 px-0.5 rounded pointer-events-none scale-75 transform origin-top-left">击</span>}
                        {canHealTarget && <span className="absolute text-[8px] text-green-400 font-bold top-0 left-0 bg-black/60 px-0.5 rounded pointer-events-none scale-75 transform origin-top-left">加</span>}
                        {canSummonTo && <span className="absolute text-[8px] text-purple-400 font-bold top-0 left-0 bg-black/60 px-0.5 rounded pointer-events-none scale-75 transform origin-top-left">召</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            </div>

            {/* 沙盘环境的简易操作辅助区 */}
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <button 
                onClick={() => executeSandboxAction({ type: 'end_turn' })}
                className="px-5 py-2 bg-[#253225] border border-green-600 hover:border-green-400 text-green-400 text-xs font-bold uppercase transition-all rounded shadow"
              >
                ⏩ 结束当前方回合 (End Turn)
              </button>
              <button 
                onClick={() => handleAiStepSandbox('net_b_s10')}
                className="px-4 py-2 bg-[#1b2a3a] border border-cyan-700 hover:border-cyan-400 text-cyan-300 text-xs font-bold transition-all rounded shadow"
                title="调用 NET_B S10 进行当前玩家单步决策"
              >
                🤖 NET_B 走一步
              </button>
              <button 
                onClick={() => handleAiStepSandbox('heuristic')}
                className="px-4 py-2 bg-[#2a241b] border border-amber-700 hover:border-amber-400 text-amber-300 text-xs font-bold transition-all rounded shadow"
                title="调用 原生启发式 进行当前玩家单步决策"
              >
                💡 启发式走一步
              </button>
              <button 
                onClick={handleResetSandbox}
                className="px-4 py-2 bg-[#2D1F2D] border border-purple-800 hover:border-purple-400 text-purple-400 text-xs font-bold transition-all rounded"
              >
                🔄 重置沙盒
              </button>
            </div>

            <div className="mt-4 w-full flex justify-center">
              {renderHoveredTilePanel()}
            </div>
          </div>

          {/* 右侧：动作控制面板 + 热更试验 + 沙盒日志 */}
          <div className="w-[420px] bg-[#0E0E12] flex flex-col border-l border-[#2C2C35] shrink-0 overflow-y-auto">
            {/* 顶排据点拥资统计 */}
            <div className="p-4 bg-[#121217] border-b border-[#22222A] grid grid-cols-2 gap-2 text-xs">
              {sandboxGameState.players.map(player => {
                const style = getPlayerStyle(player.id);
                return (
                  <div key={player.id} className={`p-2 border rounded flex flex-col ${style.panelClass}`}>
                    <span className={`${style.textClass} font-bold`}>{style.marker} {getPlayerLabel(player.id)} 状态</span>
                    <span className="text-yellow-500 font-bold mt-1">金币: {player.gold} G</span>
                    <button
                      onClick={() => handleAddGold(player.id, 200)}
                      className={`mt-2 text-[10px] py-0.5 rounded transition-colors border ${style.buttonClass}`}
                    >
                      ➕ 注入 200 金币
                    </button>
                  </div>
                );
              })}
            </div>

            {/* 中区：动作构建与选定查看器 */}
            <div className="p-4 border-b border-[#22222A] flex-1 flex flex-col min-h-[220px]">
              <span className="text-xs font-bold text-[#8E8E99] uppercase tracking-wider mb-2">🔭 操作与检视面板 (Control Bench)</span>
              
              {/* 1. 选中单位的详细检视 */}
              {selectedUnit ? (
                <div className="bg-[#15151B] border border-[#2D2D37] p-3 rounded text-xs space-y-2 flex-1">
                  <div className="flex justify-between items-center pb-2 border-b border-[#2A2A34]">
                    <span className={`font-bold text-sm ${getPlayerStyle(selectedUnit.ownerId).textClass}`}>
                      [{getPlayerLabel(selectedUnit.ownerId)}] {UNIT_CONFIGS[selectedUnit.unitClass]?.name} (id: {selectedUnit.id})
                    </span>
                    <button 
                      onClick={() => { setSelectedUnitId(null); setSelectedCastlePos(null); }}
                      className="text-[10px] text-gray-500 hover:text-white"
                    >
                      取消选择 [X]
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[11px] text-gray-400">
                    <div>生命值 (HP): <span className="font-bold text-green-400">{selectedUnit.hp} / {getEffectiveStats(selectedUnit).maxHp}</span></div>
                    <div>等级/经验: <span className="font-bold text-yellow-500">Lv.{selectedUnit.level ?? 0} (Exp: {selectedUnit.exp})</span></div>
                    <div>攻击力/物御: <span className="font-bold text-red-400">{getEffectiveStats(selectedUnit).attack} / {getEffectiveStats(selectedUnit).physicalDefense}</span></div>
                    <div>射程: <span className="font-bold text-orange-400">{getEffectiveStats(selectedUnit).minRange} - {getEffectiveStats(selectedUnit).maxRange}</span></div>
                    <div>二次剩余移动力: <span className="font-bold text-cyan-400">{selectedUnit.movementRemaining !== undefined ? selectedUnit.movementRemaining : '未行动'}</span></div>
                    <div>当前位置: <span className="font-bold text-gray-200">({selectedUnit.pos.x}, {selectedUnit.pos.y})</span></div>
                  </div>

                  {/* 列出身上持有的 Debuff / Status */}
                  {selectedUnit.status && (
                    <div className="p-1 px-2 bg-yellow-950/30 border border-yellow-800/40 text-[11px] text-yellow-500 rounded">
                      ⚠️ 状态异常: <strong className="underline">{statusNameMap[selectedUnit.status.type]}</strong> (持续还剩 {selectedUnit.status.remainingTicks} 期)
                    </div>
                  )}

                  {/* 显示持有的特性技能 */}
                  <div className="text-[11px] bg-black/40 p-2 rounded">
                    <span className="text-gray-500 font-bold block mb-1">兵种被动特性:</span>
                    <div className="flex flex-wrap gap-1">
                      {UNIT_CONFIGS[selectedUnit.unitClass].abilities.map((abi, idx) => (
                        <span key={idx} className="bg-[#2A2A35] px-1.5 py-0.5 rounded text-[10px] text-zinc-300">
                          {abi}
                        </span>
                      ))}
                      {UNIT_CONFIGS[selectedUnit.unitClass].abilities.length === 0 && (
                        <span className="text-gray-600 text-[10px]">无被动技能</span>
                      )}
                    </div>
                  </div>

                  {/* 核心非指向性操作按钮区 */}
                  <div className="pt-2 border-t border-[#2A2A34] space-y-1.5">
                    <div className="text-gray-500 text-[10px] mb-1 font-bold">可直接触发动作:</div>
                    <div className="grid grid-cols-2 gap-2">
                      {/* 原地待命 */}
                      {unitWaitAction && (
                        <button 
                          onClick={() => executeSandboxAction(unitWaitAction)}
                          className="py-1.5 bg-[#40404D] hover:bg-[#525263] text-white font-bold rounded text-[10px] uppercase transition-colors"
                        >
                          🛌 原地待命
                        </button>
                      )}

                      {/* 占领据点 */}
                      {unitCaptureAction && (
                        <button 
                          onClick={() => executeSandboxAction(unitCaptureAction)}
                          className="py-1.5 bg-[#5D1F1F] hover:bg-red-700 text-white font-bold rounded text-[10px] uppercase transition-colors"
                        >
                          🚩 占领据点
                        </button>
                      )}

                      {/* 修理城镇 */}
                      {unitRepairAction && (
                        <button 
                          onClick={() => executeSandboxAction(unitRepairAction)}
                          className="py-1.5 bg-[#1F415D] hover:bg-blue-600 text-white font-bold rounded text-[10px] uppercase transition-colors"
                        >
                          🔧 修理城镇
                        </button>
                      )}

                      {/* 破坏城镇 */}
                      {unitDestroyAction && (
                        <button 
                          onClick={() => executeSandboxAction(unitDestroyAction)}
                          className="py-1.5 bg-[#522D1F] hover:bg-orange-600 text-white font-bold rounded text-[10px] uppercase transition-colors"
                        >
                          🔥 破坏城镇
                        </button>
                      )}
                    </div>
                    
                    {!unitWaitAction && !unitCaptureAction && !unitRepairAction && !unitDestroyAction && (
                      <span className="text-[10px] text-gray-500 block italic">（请利用地图高亮指引对其他方格点击进行移动、袭击、支援或治疗治疗）</span>
                    )}
                  </div>
                </div>
              ) : selectedCastlePos ? (
                // 2. 选中自己城堡时的召兵快捷菜单
                <div className="bg-[#15151B] border border-[#2D2D37] p-3 rounded text-xs space-y-2 flex-1">
                  <div className="flex justify-between items-center pb-2 border-b border-[#2A2A34]">
                    <span className="font-black text-blue-400">
                      🏰 城堡招募站 (点: {selectedCastlePos.x}, {selectedCastlePos.y})
                    </span>
                    <button 
                      onClick={() => { setSelectedUnitId(null); setSelectedCastlePos(null); }}
                      className="text-[10px] text-gray-500 hover:text-white"
                    >
                      [X]
                    </button>
                  </div>
                  
                  <span className="text-gray-400 text-[11px] block">
                    您可以花费金币在当前城堡空地招募各色战力兵种（若已被兵种站立则不可召）：
                  </span>

                  <div className="grid grid-cols-2 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {castleRecruitsToCastle.length === 0 && castleRecruitsAndDeploy.length === 0 ? (
                      <div className="col-span-2 text-center py-4 text-gray-600 text-[10px]">
                        无可招募动作，可能该城堡周边的空降点全部被占据或您的阵营金币不够。
                      </div>
                    ) : (
                      <>
                        {castleRecruitsToCastle.map((act, i) => {
                          const rec = act as any;
                          const config = UNIT_CONFIGS[rec.unitClass];
                          return (
                            <button
                              key={`t_${i}`}
                              onClick={() => executeSandboxAction(rec)}
                              className="p-1 px-2 border border-[#3C3C46] hover:border-yellow-500 bg-[#25252D] text-[11px] font-bold text-zinc-300 rounded text-left transition-all"
                            >
                              ➕ {config?.name} ({config?.cost}G)
                              <div className="text-[8px] text-gray-500 font-normal">立刻进驻</div>
                            </button>
                          );
                        })}
                        {/* 提炼出唯一兵种 */}
                        {Array.from(new Set(castleRecruitsAndDeploy.map(a => (a as any).unitClass))).map((uclass, i) => {
                           const cName = uclass as string;
                           const config = UNIT_CONFIGS[cName];
                           const isSelected = selectedRecruitUnitClass === cName;
                           return (
                              <button
                                key={`d_${i}`}
                                onClick={() => setSelectedRecruitUnitClass(cName as UnitClass)}
                                className={`p-1 px-2 border ${isSelected ? 'border-blue-500 bg-blue-900/30' : 'border-[#3C3C46] hover:border-blue-400 bg-[#25252D]'} text-[11px] font-bold text-zinc-300 rounded text-left transition-all`}
                              >
                                🗺️ {config?.name} ({config?.cost}G)
                                <div className={`text-[8px] ${isSelected ? 'text-blue-300 font-bold' : 'text-gray-500 font-normal'}`}>
                                  {isSelected ? '已选：请在地图点击部署点' : '准备空投部署'}
                                </div>
                              </button>
                           );
                        })}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                // 3. 初始未选择时：列出该阵营未行动的空置据点和单位方便玩家快速找到
                <div className="border border-[#22222E] bg-black/30 p-4 rounded text-center flex-1 flex flex-col items-center justify-center space-y-2">
                  <span className="text-[13px] font-bold text-gray-400">💡 指引：请在左侧棋盘内点击属于玩家自己的任何单位、城堡开始操作。</span>
                  <div className="flex flex-col space-y-1 text-[11px] text-gray-500 items-start w-full text-left p-2 bg-[#121216] rounded border border-zinc-900">
                    <span className="font-bold text-[#8E8E99] mb-1">📢 当前可行动单位:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {myUnits.filter(u => !u.hasActed).map(u => (
                        <button 
                          key={u.id}
                          onClick={() => { setSelectedUnitId(u.id); setSelectedCastlePos(null); }}
                          className={`py-0.5 px-1.5 rounded transition-colors border ${getPlayerStyle(u.ownerId).buttonClass}`}
                        >
                          {UNIT_CONFIGS[u.unitClass]?.name} ({u.pos.x}, {u.pos.y})
                        </button>
                      ))}
                      {myUnits.filter(u => !u.hasActed).length === 0 && (
                        <span className="text-gray-600 text-[10px] italic">本方已全数行动完毕，请点击“结束当前方回合”。</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 下区：手动即时动作日志流 */}
            <div className="h-44 flex flex-col bg-[#0A0A0C]">
              <div className="py-2.5 px-4 bg-[#111115] border-b border-[#2C2C35] text-xs font-bold text-gray-400 tracking-wider">
                🪵 动作跟踪 Trace Logs
              </div>
              <div className="flex-1 w-full overflow-y-auto p-3 space-y-1 text-[11px] font-mono scrollbar-thin">
                {sandboxLogs.map((log, i) => (
                  <div key={i} className="flex items-start break-words border-b border-[#14141A] pb-1 text-[#8F94A6]">
                    <span className="text-yellow-500 mr-1 bg-[#1A1810] px-1 rounded scale-90">LOG</span>
                    <span className="text-zinc-200">{log}</span>
                  </div>
                ))}
                <div ref={bottomSandboxRef} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

