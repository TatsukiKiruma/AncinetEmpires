/** 科学门禁及真实手序纯函数，不创建游戏或GPU子进程。 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HERE, ROOT } from './io';

export function arenaPreflight(config = path.join(HERE, 'STAGE2_CONFIG.json'), python = path.join(ROOT, 'ai_training/.venv-rocm/Scripts/python.exe')) {
    return JSON.parse(execFileSync(python, ['-X', 'utf8', path.join(HERE, 'contracts.py'), '--config', config], { cwd: ROOT, encoding: 'utf8', timeout: 60000, windowsHide: true }));
}
export function playerIdentity(initial: any, seat: number) {
    const ids = initial.players.filter((p: any) => p.isAlive).map((p: any) => p.id).sort((a: number, b: number) => a - b);
    if (ids.length !== 2 || ![0, 1].includes(seat) || !ids.includes(initial.currentPlayer)) throw Error('双人手序输入无效');
    const modelPlayer = ids[seat];
    return { seat, modelPlayer, firstToActPlayer: initial.currentPlayer, actualHand: modelPlayer === initial.currentPlayer ? 'first' : 'second' };
}
export function naturalCoverage(games: any[]) {
    return games.filter(g => g.natural && g.winner !== null && g.error == null && g.timeForfeit == null && ['natural_win', 'natural_draw', 'natural_loss'].includes(g.classification)).length;
}
