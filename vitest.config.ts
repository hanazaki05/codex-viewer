import { defineConfig } from "vitest/config";

const config = defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["codex-cli/**", "dist/**", "node_modules/**"],
    setupFiles: ["src/test-setups/vitest.setup.ts"],
    env: {
      ENVIRONMENT: "local",
    },
  },
});

export default config;
