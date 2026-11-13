import type { APIRoute } from "astro";
import { robotsTxt } from "@/lib/seo/robots";

/**
 * `robots.txt` jest generowany, bo linia `Sitemap:` bierze adres z `site` w astro.config.mjs
 * (po podpięciu domeny przełączy się sam). Zastępuje domyślny tekst wstawiany przez Cloudflare.
 */
export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error("Brak `site` w astro.config.mjs — robots.txt nie zbuduje adresu mapy strony.");
  return new Response(robotsTxt(site), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
