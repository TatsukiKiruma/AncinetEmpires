// 防止打包的只读导入工具把编码进程误认为其独立CLI入口。
process.argv[1]='';
await import('./encoder.bundle.mjs');
