import { save } from './io';
const [file, expected] = process.argv.slice(2);
console.log('开始原子替换');
const tick = performance.now();
try {
    await save(file, { version: '新内容' });
    console.log(JSON.stringify({ success: true, ms: performance.now() - tick, expected }));
} catch (error: any) {
    console.log(JSON.stringify({ success: false, ms: performance.now() - tick, code: error.code, expected }));
}
