import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  include: ['ai_training/data_acceptance_20261016/phone/compact_reader.test.ts', 'ai_training/data_acceptance_20261016/phone/projection.test.ts', 'ai_training/data_acceptance_20261016/native_reader/reader.test.ts'],
  exclude: [], maxWorkers: 2, testTimeout: 300000,
} });
