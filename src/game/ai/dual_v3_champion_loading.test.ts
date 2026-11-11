import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

describe('冠军模型浏览器加载合同', () => {
    function browserAssets(corrupt = false) {
        const manifest = readFileSync('public/models/dual_v3_stage7_k1/final.json', 'utf8');
        const bytes = new Uint8Array(readFileSync('public/models/dual_v3_stage7_k1/final.bin'));
        if (corrupt) bytes[0] ^= 1;
        const fetchMock = vi.fn(async (url: string) => new Response(url.endsWith('.json') ? manifest : bytes));
        vi.stubGlobal('process', { ...process, getBuiltinModule: undefined });
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    }

    it('浏览器并发预热仅下载一次并缓存经过哈希校验的模型', async () => {
        browserAssets();
        const adapter = await import('./dual_v3_champion_adapter');
        const [a, b] = await Promise.all([adapter.preloadDualV3ChampionModel(), adapter.preloadDualV3ChampionModel()]);
        expect(a).toBe(b);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch).toHaveBeenCalledWith('/models/dual_v3_stage7_k1/final.bin');
    });

    it('浏览器同步未预热时明确拒绝，损坏权重不会伪装成冠军输出', async () => {
        browserAssets(true);
        const adapter = await import('./dual_v3_champion_adapter');
        const { GameEngine } = await import('../engine');
        const { createDefaultAppGameState } = await import('../default_state');
        const engine = new GameEngine(createDefaultAppGameState());
        expect(() => adapter.getDualV3ChampionAction(engine, engine.getState().currentPlayer)).toThrow('预加载');
        await expect(adapter.preloadDualV3ChampionModel()).rejects.toThrow('SHA256');
        browserAssets();
        await expect(adapter.preloadDualV3ChampionModel()).resolves.toBeDefined();
    });

    it('资源下载失败可重试', async () => {
        const fetchMock = browserAssets();
        fetchMock.mockImplementation(async () => new Response('', { status: 404 }));
        const adapter = await import('./dual_v3_champion_adapter');
        await expect(adapter.preloadDualV3ChampionModel()).rejects.toThrow('加载失败');
        browserAssets();
        await expect(adapter.preloadDualV3ChampionModel()).resolves.toBeDefined();
    });
});
