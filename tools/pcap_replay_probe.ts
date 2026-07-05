import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

type Endian = 'le' | 'be';

interface PacketRecord {
    index: number;
    seconds: number;
    payload: Buffer;
}

interface FlowStats {
    packets: number;
    payloadBytes: number;
}

interface DnsRecord {
    kind: 'Q' | 'A' | 'NS' | 'AR';
    name: string;
    type: number;
    value?: string;
}

interface TlsClientHello {
    packetIndex: number;
    source: string;
    target: string;
    sni: string[];
    alpn: string[];
}

interface HttpSnippet {
    packetIndex: number;
    source: string;
    target: string;
    text: string;
}

interface ParsedPacket {
    packetIndex: number;
    proto: 'tcp' | 'udp';
    sourceIp: string;
    targetIp: string;
    sourcePort: number;
    targetPort: number;
    payload: Buffer;
}

const INTERESTING_WORDS = [
    'toyknight',
    'ae-multiplayer',
    'onesignal',
    'mumu',
    'netease',
    'replay',
    '.act',
    'http',
];

function usage(): never {
    console.log(`用法:
  npm run pcap:replay-probe -- --pcap <captures/file.pcap>
  npm run pcap:replay-probe -- <captures/file.pcap>

说明:
  该脚本读取 tcpdump 生成的 pcap，输出 TCP/UDP 流量、DNS、TLS SNI、HTTP 明文和关键字符串。
`);
    process.exit(1);
}

function parseArgs(): { pcapPath: string; top: number } {
    const args = process.argv.slice(2);
    let pcapPath = '';
    let top = 20;

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            usage();
        }
        if (arg === '--pcap') {
            pcapPath = args[i + 1] ?? '';
            i += 1;
            continue;
        }
        if (arg === '--top') {
            top = Number(args[i + 1] ?? top);
            i += 1;
            continue;
        }
        if (!arg.startsWith('-') && !pcapPath) {
            pcapPath = arg;
        }
    }

    if (!pcapPath) {
        usage();
    }

    return { pcapPath, top: Number.isFinite(top) && top > 0 ? top : 20 };
}

function readUInt16(buffer: Buffer, offset: number, endian: Endian): number {
    return endian === 'le' ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

function readUInt32(buffer: Buffer, offset: number, endian: Endian): number {
    return endian === 'le' ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}

function parsePcap(buffer: Buffer): PacketRecord[] {
    if (buffer.length < 24) {
        throw new Error('pcap 文件太短。');
    }

    const magic = buffer.subarray(0, 4).toString('hex');
    let endian: Endian;
    let divisor = 1_000_000;
    if (magic === 'd4c3b2a1') {
        endian = 'le';
    } else if (magic === 'a1b2c3d4') {
        endian = 'be';
    } else if (magic === '4d3cb2a1') {
        endian = 'le';
        divisor = 1_000_000_000;
    } else if (magic === 'a1b23c4d') {
        endian = 'be';
        divisor = 1_000_000_000;
    } else {
        throw new Error(`不支持的 pcap magic：${magic}。当前脚本只支持 tcpdump 默认 pcap，不支持 pcapng。`);
    }

    const packets: PacketRecord[] = [];
    let offset = 24;
    while (offset + 16 <= buffer.length) {
        const tsSec = readUInt32(buffer, offset, endian);
        const tsFrac = readUInt32(buffer, offset + 4, endian);
        const includedLength = readUInt32(buffer, offset + 8, endian);
        offset += 16;
        if (offset + includedLength > buffer.length) {
            break;
        }
        packets.push({
            index: packets.length + 1,
            seconds: tsSec + tsFrac / divisor,
            payload: buffer.subarray(offset, offset + includedLength),
        });
        offset += includedLength;
    }
    return packets;
}

function ipv4(buffer: Buffer, offset: number): string {
    return `${buffer[offset]}.${buffer[offset + 1]}.${buffer[offset + 2]}.${buffer[offset + 3]}`;
}

function ipv6(buffer: Buffer): string {
    const parts: string[] = [];
    for (let i = 0; i < 16; i += 2) {
        parts.push(buffer.readUInt16BE(i).toString(16));
    }
    return parts.join(':');
}

function parseEthernetPacket(record: PacketRecord): ParsedPacket | undefined {
    const frame = record.payload;
    if (frame.length < 14) {
        return undefined;
    }

    const etherType = frame.readUInt16BE(12);
    if (etherType !== 0x0800) {
        return undefined;
    }

    const ipOffset = 14;
    const ipHeaderLength = (frame[ipOffset] & 0x0f) * 4;
    const proto = frame[ipOffset + 9];
    const totalLength = frame.readUInt16BE(ipOffset + 2);
    const sourceIp = ipv4(frame, ipOffset + 12);
    const targetIp = ipv4(frame, ipOffset + 16);
    const layer4 = frame.subarray(ipOffset + ipHeaderLength, ipOffset + totalLength);

    if (proto === 6 && layer4.length >= 20) {
        const sourcePort = layer4.readUInt16BE(0);
        const targetPort = layer4.readUInt16BE(2);
        const tcpHeaderLength = ((layer4[12] >> 4) & 0x0f) * 4;
        return {
            packetIndex: record.index,
            proto: 'tcp',
            sourceIp,
            targetIp,
            sourcePort,
            targetPort,
            payload: layer4.subarray(tcpHeaderLength),
        };
    }

    if (proto === 17 && layer4.length >= 8) {
        const sourcePort = layer4.readUInt16BE(0);
        const targetPort = layer4.readUInt16BE(2);
        const udpLength = layer4.readUInt16BE(4);
        return {
            packetIndex: record.index,
            proto: 'udp',
            sourceIp,
            targetIp,
            sourcePort,
            targetPort,
            payload: layer4.subarray(8, Math.max(8, udpLength)),
        };
    }

    return undefined;
}

function endpoint(packet: ParsedPacket, source = true): string {
    return source
        ? `${packet.sourceIp}:${packet.sourcePort}`
        : `${packet.targetIp}:${packet.targetPort}`;
}

function flowKey(packet: ParsedPacket): string {
    return `${endpoint(packet)} -> ${endpoint(packet, false)}`;
}

function addFlow(map: Map<string, FlowStats>, key: string, payloadBytes: number): void {
    const stats = map.get(key) ?? { packets: 0, payloadBytes: 0 };
    stats.packets += 1;
    stats.payloadBytes += payloadBytes;
    map.set(key, stats);
}

function parseDnsName(payload: Buffer, start: number, depth = 0): { name: string; next: number } | undefined {
    if (depth > 10) {
        return undefined;
    }

    const labels: string[] = [];
    let offset = start;
    while (offset < payload.length) {
        const length = payload[offset];
        if (length === 0) {
            return { name: labels.join('.'), next: offset + 1 };
        }

        if ((length & 0xc0) === 0xc0) {
            if (offset + 1 >= payload.length) {
                return undefined;
            }
            const pointer = ((length & 0x3f) << 8) | payload[offset + 1];
            const pointed = parseDnsName(payload, pointer, depth + 1);
            if (!pointed) {
                return undefined;
            }
            labels.push(pointed.name);
            return { name: labels.join('.'), next: offset + 2 };
        }

        offset += 1;
        if (offset + length > payload.length) {
            return undefined;
        }
        labels.push(payload.subarray(offset, offset + length).toString('ascii'));
        offset += length;
    }

    return undefined;
}

function parseDns(payload: Buffer): DnsRecord[] {
    const records: DnsRecord[] = [];
    if (payload.length < 12) {
        return records;
    }

    const qd = payload.readUInt16BE(4);
    const an = payload.readUInt16BE(6);
    const ns = payload.readUInt16BE(8);
    const ar = payload.readUInt16BE(10);
    if (qd > 20 || an > 100 || ns > 50 || ar > 50) {
        return records;
    }

    let offset = 12;
    for (let i = 0; i < qd; i += 1) {
        const parsed = parseDnsName(payload, offset);
        if (!parsed || parsed.next + 4 > payload.length) {
            return records;
        }
        const type = payload.readUInt16BE(parsed.next);
        records.push({ kind: 'Q', name: parsed.name, type });
        offset = parsed.next + 4;
    }

    const readAnswers = (kind: 'A' | 'NS' | 'AR', count: number): void => {
        for (let i = 0; i < count; i += 1) {
            const parsed = parseDnsName(payload, offset);
            if (!parsed || parsed.next + 10 > payload.length) {
                return;
            }
            const type = payload.readUInt16BE(parsed.next);
            const rdLength = payload.readUInt16BE(parsed.next + 8);
            const rdOffset = parsed.next + 10;
            const rd = payload.subarray(rdOffset, rdOffset + rdLength);
            let value: string | undefined;

            if (type === 1 && rd.length === 4) {
                value = ipv4(rd, 0);
            } else if (type === 28 && rd.length === 16) {
                value = ipv6(rd);
            } else if ((type === 2 || type === 5 || type === 12) && rdOffset < payload.length) {
                value = parseDnsName(payload, rdOffset)?.name;
            }

            records.push({ kind, name: parsed.name, type, value });
            offset = rdOffset + rdLength;
        }
    };

    readAnswers('A', an);
    readAnswers('NS', ns);
    readAnswers('AR', ar);
    return records;
}

function parseTlsClientHello(packet: ParsedPacket): TlsClientHello | undefined {
    const payload = packet.payload;
    if (payload.length < 5 || payload[0] !== 22) {
        return undefined;
    }

    const recordLength = payload.readUInt16BE(3);
    const record = payload.subarray(5, 5 + recordLength);
    if (record.length < 4 || record[0] !== 1) {
        return undefined;
    }

    const handshakeLength = record.readUIntBE(1, 3);
    const body = record.subarray(4, 4 + handshakeLength);
    let offset = 2 + 32;
    if (offset >= body.length) {
        return undefined;
    }

    const sessionIdLength = body[offset];
    offset += 1 + sessionIdLength;
    if (offset + 2 > body.length) {
        return undefined;
    }

    const cipherSuiteLength = body.readUInt16BE(offset);
    offset += 2 + cipherSuiteLength;
    if (offset >= body.length) {
        return undefined;
    }

    const compressionLength = body[offset];
    offset += 1 + compressionLength;
    if (offset + 2 > body.length) {
        return { packetIndex: packet.packetIndex, source: endpoint(packet), target: endpoint(packet, false), sni: [], alpn: [] };
    }

    const extensionLength = body.readUInt16BE(offset);
    offset += 2;
    const extensionEnd = Math.min(body.length, offset + extensionLength);
    const sni: string[] = [];
    const alpn: string[] = [];

    while (offset + 4 <= extensionEnd) {
        const extensionType = body.readUInt16BE(offset);
        const length = body.readUInt16BE(offset + 2);
        const extension = body.subarray(offset + 4, offset + 4 + length);
        offset += 4 + length;

        if (extensionType === 0 && extension.length >= 5) {
            let nameOffset = 2;
            while (nameOffset + 3 <= extension.length) {
                const nameType = extension[nameOffset];
                const nameLength = extension.readUInt16BE(nameOffset + 1);
                nameOffset += 3;
                if (nameOffset + nameLength > extension.length) {
                    break;
                }
                if (nameType === 0) {
                    sni.push(extension.subarray(nameOffset, nameOffset + nameLength).toString('utf8'));
                }
                nameOffset += nameLength;
            }
        }

        if (extensionType === 16 && extension.length >= 2) {
            let protocolOffset = 2;
            while (protocolOffset < extension.length) {
                const protocolLength = extension[protocolOffset];
                protocolOffset += 1;
                if (protocolOffset + protocolLength > extension.length) {
                    break;
                }
                alpn.push(extension.subarray(protocolOffset, protocolOffset + protocolLength).toString('utf8'));
                protocolOffset += protocolLength;
            }
        }
    }

    return {
        packetIndex: packet.packetIndex,
        source: endpoint(packet),
        target: endpoint(packet, false),
        sni,
        alpn,
    };
}

function parseHttp(packet: ParsedPacket): HttpSnippet | undefined {
    const text = packet.payload.subarray(0, 256).toString('latin1');
    if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT) |^HTTP\//.test(text)) {
        return {
            packetIndex: packet.packetIndex,
            source: endpoint(packet),
            target: endpoint(packet, false),
            text: text.replace(/\r?\n/g, ' | ').slice(0, 240),
        };
    }
    return undefined;
}

function collectInterestingStrings(buffer: Buffer): string[] {
    const text = buffer.toString('latin1');
    const matches: string[] = [];
    const regex = /[ -~]{4,}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        const value = match[0];
        const lower = value.toLowerCase();
        if (INTERESTING_WORDS.some(word => lower.includes(word))) {
            matches.push(`@${match.index}: ${value.slice(0, 180)}`);
        }
    }
    return [...new Set(matches)].slice(0, 60);
}

function printFlowTable(title: string, flows: Map<string, FlowStats>, top: number): void {
    console.log(`\n${title}`);
    const rows = [...flows.entries()]
        .sort((a, b) => b[1].payloadBytes - a[1].payloadBytes || b[1].packets - a[1].packets)
        .slice(0, top);

    if (rows.length === 0) {
        console.log('  无');
        return;
    }

    for (const [key, stats] of rows) {
        console.log(`  ${key}  包=${stats.packets}  负载字节=${stats.payloadBytes}`);
    }
}

function main(): void {
    const { pcapPath, top } = parseArgs();
    const buffer = readFileSync(pcapPath);
    const records = parsePcap(buffer);
    const tcpFlows = new Map<string, FlowStats>();
    const udpFlows = new Map<string, FlowStats>();
    const dnsRecords: DnsRecord[] = [];
    const tlsHellos: TlsClientHello[] = [];
    const httpSnippets: HttpSnippet[] = [];

    for (const record of records) {
        const packet = parseEthernetPacket(record);
        if (!packet) {
            continue;
        }

        if (packet.proto === 'tcp') {
            addFlow(tcpFlows, flowKey(packet), packet.payload.length);
            const hello = parseTlsClientHello(packet);
            if (hello) {
                tlsHellos.push(hello);
            }
            const http = parseHttp(packet);
            if (http) {
                httpSnippets.push(http);
            }
        } else {
            addFlow(udpFlows, flowKey(packet), packet.payload.length);
            if (packet.sourcePort === 53 || packet.targetPort === 53) {
                dnsRecords.push(...parseDns(packet.payload));
            }
        }
    }

    console.log(`pcap：${pcapPath}`);
    console.log(`文件：${basename(pcapPath)}，大小：${buffer.length} 字节，包数量：${records.length}`);
    printFlowTable('TCP 流量 Top', tcpFlows, top);
    printFlowTable('UDP 流量 Top', udpFlows, top);

    console.log('\nDNS 记录');
    if (dnsRecords.length === 0) {
        console.log('  无标准 DNS 记录，可能使用缓存、DoH，或抓包开始时 DNS 已完成。');
    } else {
        for (const record of dnsRecords.slice(0, 80)) {
            console.log(`  ${record.kind} ${record.name} type=${record.type}${record.value ? ` value=${record.value}` : ''}`);
        }
    }

    console.log('\nTLS ClientHello');
    if (tlsHellos.length === 0) {
        console.log('  未发现 ClientHello。可能连接已复用，或抓包未覆盖握手。');
    } else {
        for (const hello of tlsHellos) {
            const sni = hello.sni.length > 0 ? hello.sni.join(', ') : '无';
            const alpn = hello.alpn.length > 0 ? hello.alpn.join(', ') : '无';
            console.log(`  #${hello.packetIndex} ${hello.source} -> ${hello.target}  SNI=${sni}  ALPN=${alpn}`);
        }
    }

    console.log('\nHTTP 明文');
    if (httpSnippets.length === 0) {
        console.log('  未发现明文 HTTP 请求或响应。');
    } else {
        for (const http of httpSnippets.slice(0, 40)) {
            console.log(`  #${http.packetIndex} ${http.source} -> ${http.target}  ${http.text}`);
        }
    }

    console.log('\n关键字符串');
    const strings = collectInterestingStrings(buffer);
    if (strings.length === 0) {
        console.log('  未发现关注字符串。');
    } else {
        for (const value of strings) {
            console.log(`  ${value}`);
        }
    }

    const toyknightHellos = tlsHellos.filter(hello =>
        hello.sni.some(name => name.includes('toyknight') || name.includes('ae-multiplayer'))
    );
    const hasHttp = httpSnippets.length > 0;

    console.log('\n结论');
    if (toyknightHellos.length > 0 && !hasHttp) {
        console.log('  已抓到游戏服务器 TLS 流量，但回放内容处于 HTTPS 加密负载内，单靠 pcap 不能直接提取 .act。');
        console.log('  下一步应做 HTTPS 解密代理（Fiddler/mitmproxy + 模拟器安装 CA）或运行时拦截。');
    } else if (hasHttp) {
        console.log('  抓包中存在 HTTP 明文，可继续按请求路径或响应体定位回放数据。');
    } else {
        console.log('  当前抓包未明确定位到游戏回放下载流量，建议使用 start -ForceStopGame 后重新打开游戏加载回放。');
    }
}

main();
