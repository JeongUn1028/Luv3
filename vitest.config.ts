import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["{src,supabase,scripts,e2e}/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
