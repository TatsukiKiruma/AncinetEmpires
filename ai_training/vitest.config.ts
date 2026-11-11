import { defineConfig } from 'vitest/config';

// 历史产物和支持链接不参与默认测试发现。
export default defineConfig({test:{include:['tools/**/*.test.ts','v*/**/*.test.ts'],exclude:['**/out/**','**/archive/**','**/tmp/**','**/_original_tools/**'],maxWorkers:2,testTimeout:300000}});
