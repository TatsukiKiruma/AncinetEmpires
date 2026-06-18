import React, { useState, useEffect, useRef } from 'react';
import { GameEngine } from './game/engine';
import { createDemoState } from './game/demo_map';
import { playAutoGame } from './game/ai/play';
import { GameState } from './game/types';
import { TERRAIN_CONFIG } from './game/constants';

const unitNameMap: Record<string, string> = {
  INFANTRY: '步',
  CAVALRY: '骑',
  ARCHER: '射',
  COMMANDER: '帅'
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>(createDemoState());
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleStartAutoPlay = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setLogs(prev => [...prev, "[INFO] 开始自动对局 (Heuristic AI vs Random AI)..."]);
    
    await playAutoGame(100, (engine, turnInfo) => {
      setGameState(engine.getState());
      if (turnInfo.trim() !== "") {
          setLogs(prev => [...prev, `[LOG] ${turnInfo}`]);
      }
    });
    
    setIsRunning(false);
  };

  const handleReset = () => {
    setGameState(createDemoState());
    setLogs(prev => [...prev, "[INFO] 系统已重置"]);
  };

  const getTerrainColor = (terrainId: number) => {
    switch (terrainId) {
      case 1: return 'bg-[#ffffff] text-black'; // snow
      case 2: return 'bg-[#0e2136]'; // deep water
      case 3: return 'bg-[#29170e]'; // mountain
      case 4: return 'bg-[#152010]'; // hill
      case 6: return 'bg-[#16161D]'; // road
      case 7: return 'bg-[#0f2413]'; // forest
      case 8: return 'bg-[#3b2a20] border-orange-800'; // damaged town
      case 9: return 'bg-[#1c2c3d] border-blue-800'; // town
      case 10: return 'bg-[#2d1b1b] border-red-800'; // castle
      case 11: return 'bg-[#1a2f1c] border-green-800'; // camp
      default: return 'bg-[#16161D]';
    }
  };

  return (
    <div className="flex h-screen w-full font-mono bg-[#0F0F12] text-[#E0E0E6] select-none overflow-hidden">
      {/* 左侧地图区 */}
      <div className="flex-1 p-8 flex flex-col items-center border-r border-[#2D2D35] bg-[#0A0A0C]">
        <h1 className="text-sm font-bold mb-6 text-[#00FF41] tracking-widest uppercase">WARCHESS_CORE_ENGINE :: 核心模拟场</h1>
        <div className="mb-6 flex space-x-4">
            <button 
                onClick={handleStartAutoPlay} 
                disabled={isRunning}
                className="px-4 py-2 bg-[#1A1A24] border border-blue-900/50 hover:border-blue-400 text-blue-400 text-xs font-bold uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isRunning ? '模拟执行中...' : '自动对局模拟'}
            </button>
            <button 
                onClick={handleReset}
                disabled={isRunning}
                className="px-4 py-2 bg-[#2D1A1A] border border-red-900/50 hover:border-red-500 text-red-500 text-xs font-bold uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                重置环境状态
            </button>
        </div>

        <div className="relative border border-[#2D2D35] bg-black p-2 flex flex-col space-y-1">
          {gameState.map.tiles.map((row, y) => (
            <div key={y} className="flex space-x-1">
              {row.map((tile, x) => {
                const u = gameState.units.find(u => u.pos.x === x && u.pos.y === y);
                const isBuilding = [8, 9, 10, 11, 12, 16].includes(tile.terrainId);
                const terrainConf = TERRAIN_CONFIG[tile.terrainId];

                return (
                  <div key={`${x}-${y}`} className={`w-12 h-12 flex relative items-center justify-center border border-[#22222A] ${getTerrainColor(tile.terrainId)}`}>
                    {!u && !isBuilding && <span className="text-[10px] text-[#ffffff3a]">{terrainConf?.name?.substring(0,3) || '空'}</span>}

                    {/* 地形/建筑 */}
                    {isBuilding && (
                      <div className={`absolute bottom-0 w-full text-[9px] text-center font-bold tracking-tighter border-t border-[#22222A] ${tile.ownerId === 0 ? 'bg-red-900/40 text-red-400' : tile.ownerId === 1 ? 'bg-blue-900/40 text-blue-400' : 'bg-[#16161D] text-[#8E8E99]'}`}>
                         {terrainConf?.name?.substring(0,2)}
                      </div>
                    )}
                    {/* 单位 */}
                    {u && (
                      <div className={`z-10 w-8 h-8 flex items-center justify-center font-bold text-[10px] ${u.ownerId === 0 ? 'bg-[#2D1616] border border-red-500 text-red-500' : 'bg-[#1A1A24] border border-blue-400 text-blue-400'} ${u.hasActed ? 'opacity-40' : ''}`}>
                         {unitNameMap[u.unitClass] || '?'}
                      </div>
                    )}
                    {u && <div className="absolute top-0 right-0 z-20 text-[9px] font-bold bg-black text-[#A6E22E] px-[3px] border border-[#22222A]">{u.hp}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        
        <div className="mt-8 flex justify-around w-full max-w-md bg-[#16161D] border border-[#2D2D35] p-3 text-xs uppercase text-[#8E8E99]">
            <div className="flex flex-col items-center">
                <strong className="text-red-500 mb-1">红方玩家 (0)</strong>
                <span className="text-yellow-500">金币 {gameState.players[0].gold}</span>
            </div>
            <div className="w-px bg-[#2D2D35]"></div>
            <div className="flex flex-col items-center">
                <strong className="text-blue-400 mb-1">蓝方玩家 (1)</strong>
                <span className="text-yellow-500">金币 {gameState.players[1].gold}</span>
            </div>
            <div className="w-px bg-[#2D2D35]"></div>
            <div className="flex flex-col items-center">
                <strong className="text-white mb-1">第 {gameState.turn} 回合</strong>
                <span className={gameState.currentPlayer === 0 ? "text-red-500" : "text-blue-400"}>当前行动: 玩家 {gameState.currentPlayer}</span>
            </div>
        </div>
      </div>

      {/* 右侧日志区 */}
      <div className="w-1/3 bg-[#111114] flex flex-col border-l border-[#2D2D35]">
         <div className="w-full bg-[#0A0A0C] border-b border-[#2D2D35] p-4 flex justify-between items-center">
            <span className="text-xs font-bold text-[#8E8E99] uppercase tracking-widest">引擎执行日志 (Trace)</span>
            <span className={`text-[10px] px-2 py-0.5 border ${gameState.winner !== null ? 'border-yellow-500 text-yellow-500' : 'border-[#00FF41]/30 text-[#00FF41] bg-[#00FF41]/10'} rounded-sm uppercase`}>
                {gameState.winner !== null ? `获胜方: P${gameState.winner}` : '运行状态: 活跃中'}
            </span>
         </div>
         <div className="flex-1 w-full overflow-y-auto p-4 space-y-1 text-[11px] text-[#8E8E99]">
            {logs.map((L, i) => {
                const isInfo = L.startsWith('[INFO]');
                const LogColor = isInfo ? 'text-blue-500' : 'text-[#00FF41]';
                const prefixMatch = L.match(/^\[(.*?)\] (.*)/);
                if (prefixMatch) {
                    return (
                        <div key={i} className="flex items-start break-words">
                            <span className={`${LogColor} mr-2 font-bold whitespace-nowrap`}>[{prefixMatch[1]}]</span>
                            <span className="text-[#E0E0E6]">{prefixMatch[2]}</span>
                        </div>
                    );
                }
                return (
                    <div key={i} className="flex items-start break-words text-[#E0E0E6]">
                        {L}
                    </div>
                );
            })}
            <div ref={bottomRef} />
         </div>
      </div>
    </div>
  );
}
