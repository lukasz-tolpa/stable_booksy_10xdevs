// Podstawowe nagłówki bezpieczeństwa (spec #62, ticket #68). Bez CSP i HSTS — świadomie:
// HSTS dopiero po podpięciu domeny (#60), CSP osobno.
//
// Te same nagłówki dostają dwie drogi odpowiedzi:
// - strony renderowane na serwerze — middleware przepuszcza odpowiedź przez withSecurityHeaders;
// - pliki statyczne z public/ i _astro/ — Workers serwuje je bez udziału workera, więc nagłówki
//   ustawia plik public/_headers (test pilnuje, żeby zgadzał się z tą listą).
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Frame-Options": "DENY",
};

function setAll(headers: Headers): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
}

export function withSecurityHeaders(response: Response): Response {
  // Najpierw na miejscu: Astro trzyma na obiekcie odpowiedzi własny stan (np. ciasteczka pod
  // symbolem), więc ta sama instancja jest najbezpieczniejsza.
  try {
    setAll(response.headers);
    return response;
  } catch {
    // Nagłówki odpowiedzi z Response.redirect() albo z fetch() są niezmienne — kopia.
    const headers = new Headers(response.headers);
    setAll(headers);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}
