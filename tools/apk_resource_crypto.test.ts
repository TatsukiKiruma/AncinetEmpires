import { describe, expect, it } from 'vitest';
import { APK_RESOURCE_DECRYPTION_INFO, getLegacyDesProviderHint, hexToBytes } from './apk_resource_crypto';

describe('APK 资源解密工具', () => {
    it('复用 APK 脚本和地图资源的 DES key/iv', () => {
        expect(APK_RESOURCE_DECRYPTION_INFO).toEqual({
            cipher: 'DES/CBC/PKCS7',
            keyHex: '72 6b 00 00 00 00 46 46',
            ivHex: '72 6b 00 00 00 00 46 46'
        });
        expect(Array.from(hexToBytes(APK_RESOURCE_DECRYPTION_INFO.keyHex))).toEqual([0x72, 0x6b, 0, 0, 0, 0, 0x46, 0x46]);
    });

    it('拒绝无效 hex 字节串并给出 legacy DES 提示', () => {
        expect(() => hexToBytes('abc')).toThrow('无效 hex 字节串');
        expect(() => hexToBytes('72 zz')).toThrow('无效 hex 字节串');
        expect(getLegacyDesProviderHint()).toContain('--openssl-legacy-provider');
    });
});
