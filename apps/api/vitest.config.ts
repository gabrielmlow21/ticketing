import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /**
     * Concurrency tests open real connections against real Postgres. Running
     * files in parallel against one database makes failures non-reproducible,
     * which defeats the purpose of the test.
     */
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
