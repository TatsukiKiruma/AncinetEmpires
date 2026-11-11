import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['continuation_review_20261030/stage8/*.test.ts'],maxWorkers:1,testTimeout:60000}});
