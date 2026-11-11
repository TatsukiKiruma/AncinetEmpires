import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['expert_iteration_2m_20261022/experiments/e6_teacher_reanalysis/*.test.ts'], maxWorkers: 1, testTimeout: 60000 } });
