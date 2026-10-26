import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Database tests run against a real Postgres with the Supabase migrations
// applied (local `supabase start`, or the CI service). See tests/db/README.md.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
