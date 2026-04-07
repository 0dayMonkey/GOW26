import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@game-logic': resolve(__dirname, 'src/game-logic'),
      '@application': resolve(__dirname, 'src/application'),
      '@presentation': resolve(__dirname, 'src/presentation'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@assets': resolve(__dirname, 'src/assets'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/game-logic/**/*.ts', 'src/application/**/*.ts', 'src/infrastructure/**/*.ts'],
      exclude: ['src/presentation/**/*.ts', 'src/**/*.d.ts'],
      thresholds: {
        statements: 75,
        branches: 75,
        functions: 75,
        lines: 75,
      },
    },
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
});
