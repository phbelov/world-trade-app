import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests scan multi-GB Parquet; give them room.
    testTimeout: 300_000,
    hookTimeout: 120_000,
  },
});
