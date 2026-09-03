import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Real Postgres and MinIO round trips; the default 5s is tight on a cold
    // `make up`.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Adapters share one database and one bucket - running files in parallel
    // makes them fight over the same rows.
    fileParallelism: false,
  },
});
