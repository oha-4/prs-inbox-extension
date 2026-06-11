import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // 純ロジック層のみがユニットテスト対象（CLAUDE.md参照）
      include: ['src/lib/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
