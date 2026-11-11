import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

/** 仅替换权威移动查询的队列容器，保留全部松弛、阻挡、地形与输出代码。 */
export function movementPlugin(repo: string, target: string) {
    return { name: '手机稳定移动队列', setup(builder: any) {
        builder.onLoad({ filter: /[\\/]src[\\/]game[\\/]map\.ts$/ }, (args: any) => {
            let contents = fs.readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n');
            const declaration = 'const queue: { pos: Position; cost: number }[] = [];';
            const sorting = '        queue.sort((a, b) => a.cost - b.cost);\n';
            assert.equal(contents.split(declaration).length, 4, '权威移动队列声明变化');
            assert.equal(contents.split(sorting).length, 4, '权威移动排序接入点变化');
            contents = `import { StableMoveQueue } from ${JSON.stringify(path.join(repo, 'ai_training/tactical_exit_20261019/phone/stable_move_queue.ts'))};\n` + contents.split(declaration).join('const queue = new StableMoveQueue();').split(sorting).join('');
            fs.writeFileSync(path.join(target, 'map.stable-queue.ts.snapshot'), contents, { flag: 'wx' });
            return { contents, loader: 'ts', resolveDir: path.dirname(args.path) };
        });
    } };
}
