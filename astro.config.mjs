// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";
import { isInSitemap } from "./src/lib/seo/robots.ts";

// https://astro.build/config
export default defineConfig({
  site: "https://stable-booksy.tolpa-lukasz97.workers.dev",
  output: "server",
  // Mapa strony zawiera tylko stronę główną — reguła i jej test w src/lib/seo/robots.ts.
  integrations: [react(), sitemap({ filter: isInSitemap })],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      // Zależności przeglądarkowe jsPDF (PDF rozliczenia, spec #100) — poza paczką workera.
      alias: Object.fromEntries(
        ["html2canvas", "canvg", "dompurify"].map((name) => [
          name,
          fileURLToPath(new URL("./src/lib/settlements/pdf/browser-only.ts", import.meta.url)),
        ]),
      ),
    },
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
