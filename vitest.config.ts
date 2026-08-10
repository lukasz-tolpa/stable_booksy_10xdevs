import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Konfiguracja jest minimalna celowo: testy obejmują wyłącznie czystą logikę z `src/lib/`,
// bez bazy, serwera i komponentów. Dzięki temu `npm test` biegnie w obecnym CI,
// które nie stawia żadnych usług.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
