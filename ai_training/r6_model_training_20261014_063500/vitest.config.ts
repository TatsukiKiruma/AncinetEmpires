import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['ai_training/r6_model_training_20261014_063500/research/**/*.test.ts'],
        globals: true,
        environment: 'node'
    }
});
