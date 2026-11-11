/** APK 困难 AI 的无界面运行环境；每个实例使用独立棋盘、计划和随机流。 */
import { instantiateApkHardPolicy } from './apk_hard_policy.generated.js';
import type { ApkHardComputeOptions } from './apk_hard_compute';

export { APK_HARD_RUNTIME_HTML_SHA256, APK_HARD_RUNTIME_SCRIPT_SHA256 } from './apk_hard_policy.generated.js';

export interface ApkHardSnapshot extends Record<string, unknown> {
    map: { rows: number; cols: number };
    terrain: string[][];
    terrainOwners: Array<{ r: number; c: number; owner: string }>;
    units: Array<Record<string, unknown>>;
    tombstones: Array<Record<string, unknown>>;
    teams: Array<Record<string, unknown>>;
    moveMode: { currentTeam: string; round: number };
    turnNumber: number;
    matchKey: string;
    previousActionAccepted?: boolean;
}

export interface ApkHardDecision {
    kind: 'unit' | 'recruit' | 'end' | 'error';
    fromRow?: number;
    fromCol?: number;
    row?: number;
    col?: number;
    actionType?: 'wait' | 'attack' | 'heal' | 'support' | 'summon' | 'occupy' | 'repair';
    targetRow?: number;
    targetCol?: number;
    secondRow?: number;
    secondCol?: number;
    unitType?: number;
    unitId?: string;
    score?: number;
    reason?: string;
}

interface DetachedElement {
    value: string | number;
    checked: boolean;
    disabled: boolean;
    textContent: string;
    innerHTML: string;
    style: Record<string, string>;
    dataset: Record<string, string>;
    classList: { add: (...names: string[]) => void; remove: (...names: string[]) => void; contains: (name: string) => boolean; toggle: (name: string, force?: boolean) => boolean };
    querySelectorAll: () => DetachedElement[];
    querySelector: () => null;
    addEventListener: () => void;
    removeEventListener: () => void;
    appendChild: (element: DetachedElement) => DetachedElement;
    removeChild: (element: DetachedElement) => DetachedElement;
    setAttribute: () => void;
    click: () => void;
}

function createDetachedElement(): DetachedElement {
    const classes = new Set<string>();
    return {
        value: '', checked: false, disabled: false, textContent: '', innerHTML: '', style: {}, dataset: {},
        classList: {
            add: (...names) => { names.forEach(name => classes.add(name)); },
            remove: (...names) => { names.forEach(name => classes.delete(name)); },
            contains: name => classes.has(name),
            toggle: (name, force) => {
                const enabled = force ?? !classes.has(name);
                if (enabled) classes.add(name); else classes.delete(name);
                return enabled;
            },
        },
        querySelectorAll: () => [], querySelector: () => null,
        addEventListener: () => {}, removeEventListener: () => {},
        appendChild: element => element, removeChild: element => element,
        setAttribute: () => {}, click: () => {},
    };
}

export function createApkHardRuntime(rng: () => number = Math.random, compute: ApkHardComputeOptions = {}): { decide(snapshot: ApkHardSnapshot): ApkHardDecision } {
    if (compute.populationLimit !== undefined && ![20, 30, 50, 100].includes(compute.populationLimit)) throw Error('困难脚本人口上限无效');
    const elements = new Map<string, DetachedElement>();
    const document = {
        getElementById: (id: string) => {
            let element = elements.get(id);
            if (!element) { element = createDetachedElement(); elements.set(id, element); }
            return element;
        },
        createElement: () => createDetachedElement(),
        querySelectorAll: () => [], querySelector: () => null,
        addEventListener: () => {}, removeEventListener: () => {},
        body: createDetachedElement(),
    };
    const isolatedMath = Object.create(Math) as Math;
    Object.defineProperty(isolatedMath, 'random', { value: rng });
    const window: { hardAiDecide?: (input: string) => string } = {};
    const unavailable = () => { throw new Error('APK 困难 AI 无界面环境不支持页面、网络或异步操作'); };
    const environment = {
        ...compute,
        document, window, Math: isolatedMath,
        console: { log: () => {}, warn: () => {}, error: () => {} },
        setTimeout: unavailable, clearTimeout: unavailable, setInterval: unavailable, clearInterval: unavailable,
        requestAnimationFrame: unavailable, cancelAnimationFrame: unavailable,
        alert: unavailable, confirm: unavailable, prompt: unavailable, fetch: unavailable,
        XMLHttpRequest: unavailable, WebSocket: unavailable, FileReader: unavailable, Blob: unavailable,
        URL: undefined, localStorage: undefined, sessionStorage: undefined, navigator: undefined,
    };
    const decideJson = instantiateApkHardPolicy(environment) as (input: string) => string;
    if (typeof decideJson !== 'function') throw new Error('APK 困难 AI 决策入口未初始化');
    return {
        decide(snapshot) {
            const result: unknown = JSON.parse(decideJson(JSON.stringify(snapshot)));
            if (!result || typeof result !== 'object' || !('kind' in result)
                || !['unit', 'recruit', 'end', 'error'].includes(String(result.kind))) {
                throw new Error('APK 困难 AI 返回了无效决策');
            }
            return result as ApkHardDecision;
        },
    };
}
