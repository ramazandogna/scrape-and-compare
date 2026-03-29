import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Test timeout — DB testleri biraz yavaş olabilir
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Workspace paketleri tsx ile doğal çözülür,
      // vitest için de erişilebilir olması lazım
    },
  },
});
