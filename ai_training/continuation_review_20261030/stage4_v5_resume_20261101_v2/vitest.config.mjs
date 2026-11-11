import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['ai_training/continuation_review_20261030/stage4_v5_resume_20261101_v2/*.test.ts'], maxWorkers: 1 } });
