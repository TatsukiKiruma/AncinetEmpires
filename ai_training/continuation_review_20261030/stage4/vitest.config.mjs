import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['ai_training/continuation_review_20261030/stage4/*.test.ts'], exclude: ['**/node_modules/**', '**/revisions/**'], maxWorkers: 1 } });
