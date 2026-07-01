import { APK_SKIRMISH_MAP_MANIFEST } from './apk_manifest';
import { parseApkAemMap, type ApkAemMap } from './apk_map';
import { createApkSkirmishGameState } from './apk_skirmish';
import { APK_SKIRMISH_MAP_ASSETS } from './apk_skirmish_map_assets.generated';
import type { ApkSkirmishMode, GameState } from './types';

export const DEFAULT_APP_APK_MAP_NAME = '(2) Duel.aem';

export interface AppApkSkirmishMapOption {
    name: string;
    label: string;
    resourcePath: string;
    width: number;
    height: number;
    playerCount: number;
    recommendedGold: number | null;
}

const parsedMapCache = new Map<string, ApkAemMap>();
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(base64: string): Uint8Array {
    const bytes: number[] = [];
    let buffer = 0;
    let bitCount = 0;

    for (const char of base64.replace(/=+$/u, '')) {
        const value = BASE64_ALPHABET.indexOf(char);
        if (value < 0) {
            throw new Error('APK skirmish 地图 base64 数据无效');
        }

        buffer = (buffer << 6) | value;
        bitCount += 6;

        if (bitCount >= 8) {
            bitCount -= 8;
            bytes.push((buffer >> bitCount) & 0xff);
            buffer &= (1 << bitCount) - 1;
        }
    }

    return new Uint8Array(bytes);
}

function getMapAsset(name: string) {
    const asset = APK_SKIRMISH_MAP_ASSETS.find(item => item.name === name);
    if (!asset) {
        throw new Error(`缺少 APK skirmish 地图资产: ${name}`);
    }
    return asset;
}

export function getAppApkSkirmishMapOptions(): AppApkSkirmishMapOption[] {
    const availableMapNames = new Set<string>(APK_SKIRMISH_MAP_ASSETS.map(asset => asset.name));
    return APK_SKIRMISH_MAP_MANIFEST
        .filter(entry => availableMapNames.has(entry.name))
        .map(entry => ({
            name: entry.name,
            label: entry.name.replace(/\.aem$/i, ''),
            resourcePath: entry.resourcePath,
            width: entry.width,
            height: entry.height,
            playerCount: entry.playerIds.length,
            recommendedGold: entry.recommendedGold
        }));
}

export function parseAppApkSkirmishMap(name: string): ApkAemMap {
    const cached = parsedMapCache.get(name);
    if (cached) return cached;

    const asset = getMapAsset(name);
    const parsed = parseApkAemMap(decodeBase64(asset.decryptedBase64));
    parsedMapCache.set(name, parsed);
    return parsed;
}

export function createAppApkSkirmishGameState(
    name: string = DEFAULT_APP_APK_MAP_NAME,
    mode: ApkSkirmishMode = 'SD'
): GameState {
    const map = parseAppApkSkirmishMap(name);
    return createApkSkirmishGameState(map, {
        mode,
        mapName: name
    });
}
