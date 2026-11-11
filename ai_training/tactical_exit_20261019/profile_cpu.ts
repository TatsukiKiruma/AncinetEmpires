import { GameEngine } from '../../src/game/engine';
import { extractFeatures } from './combined_tactics';
import { legalActions } from './policy_runtime';
import { read } from './io';
const s=read('performance_query_cache/slow-state-expanded-teacher_search-r6-s0.json'),engine=new GameEngine(s);engine.getLegalActions(s.currentPlayer);
console.log(extractFeatures(engine,legalActions(engine).slice(0,100)).stats);
