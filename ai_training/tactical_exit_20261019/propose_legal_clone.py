"""权威动作列表的专用隔离复制提案，不改变任何规则或动作顺序。"""
from pathlib import Path
import hashlib,json
HERE=Path(__file__).resolve().parent;OUT=HERE/'performance_legal_clone';OUT.mkdir(exist_ok=True);p=HERE.parent.parent/'src/game/engine.ts';before=p.read_bytes();text=before.decode('utf-8').replace('\r\n','\n')
helper='''/** 权威动作仅含标量和位置；保留列表内位置别名，同时隔离调用者与引擎状态。 */
function cloneLegalActions(actions: Action[]): Action[] {
    let positions: Map<Position, Position> | undefined;
    const unusual = Symbol();
    const copyPosition = (pos: Position): Position => {
        // 非常规扩展位置交回通用复制，保留原有行为。
        if (Object.getPrototypeOf(pos) !== Object.prototype || Object.keys(pos).length !== 2
            || !Object.hasOwn(pos, 'x') || !Object.hasOwn(pos, 'y') || Object.getOwnPropertySymbols(pos).length) throw unusual;
        positions ??= new Map();
        let copy = positions.get(pos);
        if (!copy) { copy = { ...pos }; positions.set(pos, copy); }
        return copy;
    };
    try {
        return actions.map(action => {
            switch (action.type) {
                case 'move': case 'post_attack_move': return { ...action, to: copyPosition(action.to) };
                case 'recruit_to_castle': return { ...action, castlePos: copyPosition(action.castlePos) };
                case 'recruit_and_deploy': return { ...action, castlePos: copyPosition(action.castlePos), to: copyPosition(action.to) };
                case 'summon': return { ...action, spawnPos: copyPosition(action.spawnPos) };
                case 'destroy_town': return action.target ? { ...action, target: copyPosition(action.target) } : { ...action };
                default: return { ...action };
            }
        });
    } catch (error) {
        if (error === unusual) return structuredClone(actions);
        throw error;
    }
}

'''
assert text.count('function isSamePos(')==1;text=text.replace('function isSamePos(',helper+'function isSamePos(',1)
old='structuredClone(getLegalActions(this.state, playerId, query))';assert text.count(old)==1;text=text.replace(old,'cloneLegalActions(getLegalActions(this.state, playerId, query))')
old='structuredClone(this.getCachedLegalActions(playerId, query))';assert text.count(old)==1;text=text.replace(old,'cloneLegalActions(this.getCachedLegalActions(playerId, query))')
for old,new in [
    ('const immediate = this.getLegalActions(this.state.currentPlayer, { skipMovement: true, skipRecruitment: true });','const immediate = this.getCachedLegalActions(this.state.currentPlayer, { skipMovement: true, skipRecruitment: true });'),
    ('const actions = this.getLegalActions(this.state.currentPlayer);','const actions = this.getCachedLegalActions(this.state.currentPlayer);')]:
    assert text.count(old)==1;text=text.replace(old,new)
after=text.replace('\n','\r\n').encode('utf-8');(OUT/'engine.ts.before').write_bytes(before);(OUT/'engine.ts.proposed').write_bytes(after)
sha=lambda b:hashlib.sha256(b).hexdigest()
(OUT/'proposal.json').write_text(json.dumps(dict(beforeSha256=sha(before),proposedSha256=sha(after),applied=False,changesRules=False)),encoding='utf-8')
print('动作复制提案已生成')
