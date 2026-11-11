import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['ai_training/r7_training_stage_20261014_083500/research/**/*.test.ts'],
        globals: true
    }
});
