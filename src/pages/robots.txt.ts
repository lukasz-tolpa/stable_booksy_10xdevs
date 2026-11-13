import type { APIRoute } from "astro";
import { robotsTxt } from "@/lib/seo/robots";
import { requireSite } from "@/lib/seo/site";

export const prerender = false;

/**
 * `robots.txt` jest generowany, bo linia `Sitemap:` bierze adres z `site` w astro.config.mjs
 * (po podpięciu domeny przełączy się sam). Zastępuje domyślny tekst wstawiany przez Cloudflare.
 */
export const GET: APIRoute = ({ site }) =>
  new Response(robotsTxt(requireSite(site, "robots.txt nie zbuduje adresu mapy strony")), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
