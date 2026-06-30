import { createDecipheriv } from 'node:crypto';
import { APK_SCRIPT_DECRYPTION_INFO } from '../src/game/apk_script_manifest';

export interface ApkResourceDecryptionInfo {
    cipher: 'DES/CBC/PKCS7';
    keyHex: string;
    ivHex: string;
}

export const APK_RESOURCE_DECRYPTION_INFO: ApkResourceDecryptionInfo = {
    cipher: APK_SCRIPT_DECRYPTION_INFO.cipher,
    keyHex: APK_SCRIPT_DECRYPTION_INFO.keyHex,
    ivHex: APK_SCRIPT_DECRYPTION_INFO.ivHex
};

export function hexToBytes(hex: string): Buffer {
    const compact = hex.replace(/\s+/g, '').toLowerCase();
    if (compact.length === 0 || compact.length % 2 !== 0 || /[^0-9a-f]/.test(compact)) {
        throw new Error(`无效 hex 字节串: ${hex}`);
    }

    const bytes = Buffer.alloc(compact.length / 2);
    for (let i = 0; i < compact.length; i += 2) {
        bytes[i / 2] = Number.parseInt(compact.slice(i, i + 2), 16);
    }
    return bytes;
}

export function getLegacyDesProviderHint(): string {
    return '当前 Node/OpenSSL 需要 legacy provider 才能使用 DES：请通过 npm run apk:map-report 或 node --openssl-legacy-provider 启动。';
}

export function decryptApkResourceBytes(
    encrypted: Uint8Array,
    info: ApkResourceDecryptionInfo = APK_RESOURCE_DECRYPTION_INFO
): Buffer {
    if (info.cipher !== 'DES/CBC/PKCS7') {
        throw new Error(`不支持的 APK 资源加密方式: ${info.cipher}`);
    }

    const key = hexToBytes(info.keyHex);
    const iv = hexToBytes(info.ivHex);

    try {
        // Node 使用 PKCS#5/PKCS#7 自动填充；APK 的 DES/CBC/PKCS7 可直接对应。
        const decipher = createDecipheriv('des-cbc', key, iv);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/unsupported|unknown cipher/i.test(message)) {
            throw new Error(`${getLegacyDesProviderHint()} 原始错误: ${message}`);
        }
        throw error;
    }
}
