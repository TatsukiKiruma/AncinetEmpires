"""只生成公共缓存提案，不改写正在计时的引擎源码。"""
from pathlib import Path
import hashlib,json,difflib
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;OUT=HERE/'performance_query_cache';OUT.mkdir(exist_ok=True)
p=ROOT/'src/game/engine.ts';before=p.read_text(encoding='utf-8');after=before
def replace(a,b):
    global after
    assert after.count(a)==1,a
    after=after.replace(a,b,1)
replace('    private executingStep = false;', '    private executingStep = false;\n    private queryLegalCache = new Map<string, Action[]>();')
replace('            branch.fullLegalCache = this.fullLegalCache;', '            branch.fullLegalCache = this.fullLegalCache;\n            branch.queryLegalCache = this.queryLegalCache;')
start=after.index('    public getLegalActions(playerId: number, query?: LegalActionQuery): Action[] {');end=after.index('\n    public isTerminal()',start)
new='''    private getCachedLegalActions(playerId: number, query?: LegalActionQuery): Action[] {
        // 执行中的中间态不进入缓存；非常规参数保持原权威函数的完整语义。
        if (this.executingStep || !Number.isFinite(playerId)) return getLegalActions(this.state, playerId, query);
        if (query === undefined && this.fullLegalCache?.playerId === playerId) return this.fullLegalCache.actions;
        let unitId: string | undefined, skipMovement = false, skipRecruitment = false, onlyAttacks = false;
        if (query !== undefined) {
            if (query === null || typeof query !== 'object') return getLegalActions(this.state, playerId, query);
            const prototype = Object.getPrototypeOf(query);
            const known = ['unitId', 'skipMovement', 'skipRecruitment', 'onlyAttacks'];
            if (prototype !== null && prototype !== Object.prototype) return getLegalActions(this.state, playerId, query);
            const descriptors = Object.getOwnPropertyDescriptors(query), names = Object.getOwnPropertyNames(query);
            if (Object.getOwnPropertySymbols(query).length || names.some(k => !known.includes(k) || !('value' in descriptors[k])) || known.some(k => !Object.hasOwn(query, k) && k in query)) return getLegalActions(this.state, playerId, query);
            unitId = descriptors.unitId?.value;
            const movement = descriptors.skipMovement?.value, recruitment = descriptors.skipRecruitment?.value, attacks = descriptors.onlyAttacks?.value;
            if (unitId !== undefined && typeof unitId !== 'string' || [movement, recruitment, attacks].some(v => v !== undefined && typeof v !== 'boolean')) return getLegalActions(this.state, playerId, query);
            skipMovement = movement === true; skipRecruitment = recruitment === true; onlyAttacks = attacks === true;
        }
        const full = unitId === undefined && !skipMovement && !skipRecruitment && !onlyAttacks;
        if (full && this.fullLegalCache?.playerId === playerId) return this.fullLegalCache.actions;
        const key = JSON.stringify([playerId, unitId === undefined ? null : unitId, skipMovement, skipRecruitment, onlyAttacks]);
        let actions = this.queryLegalCache.get(key);
        if (!actions) {
            // 私有副本也不引用可变GameState坐标；同初态克隆可延迟填充并共享结果。
            actions = structuredClone(getLegalActions(this.state, playerId, query));
            this.queryLegalCache.set(key, actions);
        }
        if (full) this.fullLegalCache = { playerId, actions };
        return actions;
    }

    public getLegalActions(playerId: number, query?: LegalActionQuery): Action[] {
        // 返回值独立，调用者改写数组或落点不能污染其他查询或分支。
        return structuredClone(this.getCachedLegalActions(playerId, query));
    }
'''
after=after[:start]+new+after[end:]
replace('            this.fullLegalCache = undefined;\n            this.executingStep = false;', '            this.fullLegalCache = undefined;\n            this.queryLegalCache = new Map();\n            this.executingStep = false;')
replace(': getLegalActions(this.state, this.state.currentPlayer, moving ?', ': this.getCachedLegalActions(this.state.currentPlayer, moving ?')
replace('        this.fullLegalCache = undefined;\n        this.executingStep = true;', '        this.fullLegalCache = undefined;\n        this.queryLegalCache = new Map();\n        this.executingStep = true;')
def sha(b):return hashlib.sha256(b).hexdigest()
assert not (OUT/'engine.ts.proposed').exists()
(OUT/'engine.ts.before').write_bytes(p.read_bytes());newline='\r\n' if b'\r\n' in p.read_bytes() else '\n';(OUT/'engine.ts.proposed').write_bytes(after.replace('\n',newline).encode('utf-8'))
(OUT/'engine.patch').write_text(''.join(difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),fromfile='a/src/game/engine.ts',tofile='b/src/game/engine.ts')),encoding='utf-8')
(OUT/'proposal.json').write_text(json.dumps(dict(beforeSha256=sha(p.read_bytes()),proposedSha256=sha((OUT/'engine.ts.proposed').read_bytes()),applied=False,changesRules=False,cacheFields=['playerId','unitId','skipMovement','skipRecruitment','onlyAttacks'],requiresValidation=True)),encoding='utf-8');print('已生成提案，公共源码未改写')
