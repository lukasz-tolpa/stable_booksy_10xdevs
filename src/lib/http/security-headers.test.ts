import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "./security-headers";

describe("nagłówki bezpieczeństwa odpowiedzi stron", () => {
  it("strona dostaje nosniff, Referrer-Policy, Permissions-Policy i zakaz ramki", () => {
    const response = withSecurityHeaders(new Response("<html></html>", { headers: { "Content-Type": "text/html" } }));

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("nie dodaje CSP ani HSTS (świadomie poza zakresem)", () => {
    const response = withSecurityHeaders(new Response("ok"));

    expect(response.headers.has("Content-Security-Policy")).toBe(false);
    expect(response.headers.has("Strict-Transport-Security")).toBe(false);
  });

  it("zachowuje status, treść i własne nagłówki strony", async () => {
    const response = withSecurityHeaders(
      new Response("treść", { status: 404, headers: { "Content-Type": "text/html", "Set-Cookie": "a=1" } }),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("treść");
    expect(response.headers.get("Content-Type")).toBe("text/html");
    expect(response.headers.get("Set-Cookie")).toBe("a=1");
  });

  it("przekierowanie z niezmiennymi nagłówkami też dostaje nagłówki i zachowuje adres", () => {
    const response = withSecurityHeaders(Response.redirect("https://example.com/auth/signin", 302));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://example.com/auth/signin");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
