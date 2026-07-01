import { describe, expect, it } from 'vitest';
import { collectAemTerrainPositions } from './apk_map_report';

describe('APK AEM 地图报告工具', () => {
    it('按 APK tile ID 收集地形坐标和归属码', () => {
        const terrainOnly = {
            terrain: [
                [
                    { x: 0, y: 0, apkTerrainId: 81, ownerCode: 0xff, ownerId: null },
                    { x: 1, y: 0, apkTerrainId: 82, ownerCode: 1, ownerId: 1 }
                ],
                [
                    { x: 0, y: 1, apkTerrainId: 81, ownerCode: 2, ownerId: 2 },
                    { x: 1, y: 1, apkTerrainId: 83, ownerCode: 0xfe, ownerId: null }
                ]
            ]
        };

        expect(collectAemTerrainPositions(terrainOnly, 81)).toEqual([
            { x: 0, y: 0, ownerCode: 0xff, ownerId: null },
            { x: 0, y: 1, ownerCode: 2, ownerId: 2 }
        ]);
        expect(collectAemTerrainPositions(terrainOnly, 80)).toEqual([]);
    });
});
