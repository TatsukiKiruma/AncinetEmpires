import fs from 'node:fs';
import path from 'node:path';
import type { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { choosePolicy } from '../tactical_scale_20261018/policy';
import { chooseBounded } from '../tactical_exit_20261019/search';
import { DIR } from './common';

/** 历史模型仅用于补齐同一16槽多人面板；严格复用原解码与特征，不重新训练。 */
export class HistoricalPolicy {
    private model: any;
    private schema: any;
    constructor(private arm: string) {
        this.model = JSON.parse(fs.readFileSync(path.resolve(DIR, arm === 'stage3_hierarchical' ? '../tactical_scale_20261018/group-best.json' : '../tactical_value_search_20261018/model-final.json'), 'utf8'));
        this.schema = JSON.parse(fs.readFileSync(path.resolve(DIR, '../tactical_exit_20261019/old-schema.json'), 'utf8'));
    }
    getAction(engine: GameEngine, player: number) {
        const legal = engine.getLegalActions(player).filter(a => a.type !== 'surrender').sort((a, b) => encodeAction(a) < encodeAction(b) ? -1 : encodeAction(a) > encodeAction(b) ? 1 : 0);
        return this.arm === 'stage3_hierarchical' ? choosePolicy(engine, legal, this.model, this.schema, 'hierarchical', false).action : chooseBounded(engine, legal, this.model, this.schema, 'pure', Number.MAX_SAFE_INTEGER, {}).action;
    }
}
