import { describe, expect, it } from "vitest";
import {
  EMAIL_EXISTS,
  EMAIL_NOT_CONFIRMED,
  INVALID_CREDENTIALS,
  OUTAGE_MESSAGE,
  RATE_LIMITED,
  REQUEST_TIMEOUT,
  USER_ALREADY_EXISTS,
  WEAK_PASSWORD,
  authErrorMessage,
  isExpectedUserError,
  isProviderOutage,
  isTransportError,
} from "@/lib/auth/errors";

// Oracle: PRD NFR "interfejs po polsku" + test-plan §6.4 (bez `{}` i tekstu dostawcy).
// Zdania mówią, co zrobić dalej, a nie co poszło nie tak w GoTrue.
describe("authErrorMessage", () => {
  it("złe dane logowania mówią o e-mailu lub haśle", () => {
    expect(authErrorMessage(INVALID_CREDENTIALS, "signin")).toBe("Nieprawidłowy e-mail lub hasło.");
  });

  it("niepotwierdzony adres każe sprawdzić skrzynkę", () => {
    expect(authErrorMessage(EMAIL_NOT_CONFIRMED, "signin")).toContain("Sprawdź skrzynkę");
  });

  it("istniejące konto (oba kody GoTrue) każe się zalogować", () => {
    const message = authErrorMessage(USER_ALREADY_EXISTS, "signup");

    expect(message).toBe("Konto z tym adresem już istnieje. Zaloguj się.");
    expect(authErrorMessage(EMAIL_EXISTS, "signup")).toBe(message);
  });

  it("słabe hasło i limit prób mają własne zdania", () => {
    expect(authErrorMessage(WEAK_PASSWORD, "signup")).toContain("Hasło");
    expect(authErrorMessage(RATE_LIMITED[0], "signin")).toContain("Zbyt wiele prób");
    expect(authErrorMessage(RATE_LIMITED[1], "signup")).toContain("Zbyt wiele prób");
  });

  it("timeout dostawcy to zdanie o chwilowym problemie", () => {
    expect(authErrorMessage(REQUEST_TIMEOUT, "signin")).toBe(OUTAGE_MESSAGE);
  });

  it("nieznany kod daje wariant domyślny zależny od akcji", () => {
    expect(authErrorMessage("42501", "signin")).toBe("Nie udało się zalogować. Spróbuj ponownie.");
    expect(authErrorMessage(undefined, "signup")).toBe("Nie udało się utworzyć konta. Spróbuj ponownie.");
  });

  // Zbiór jest zamknięty: cokolwiek wejdzie, wychodzi jedno z polskich zdań.
  // Regresja, którą łapie: przepuszczenie `error.message` ("Invalid login credentials",
  // "fetch failed", `{}`) do parametru `?error=`.
  it("każdy kod trafia w zamknięty zbiór polskich zdań bez treści dostawcy", () => {
    const known = [
      INVALID_CREDENTIALS,
      EMAIL_NOT_CONFIRMED,
      USER_ALREADY_EXISTS,
      EMAIL_EXISTS,
      WEAK_PASSWORD,
      ...RATE_LIMITED,
      REQUEST_TIMEOUT,
      undefined,
    ];
    const closedSet = new Set([
      ...known.map((code) => authErrorMessage(code, "signin")),
      ...known.map((code) => authErrorMessage(code, "signup")),
    ]);
    expect(closedSet.size).toBe(8);

    const probes = [...known, "42501", "", "PGRST116", "invalid_credentialsx", "bad_json", "unexpected_failure"];
    for (const action of ["signin", "signup"] as const) {
      for (const message of probes.map((code) => authErrorMessage(code, action))) {
        expect(closedSet.has(message)).toBe(true);
        expect(message).not.toMatch(/fetch|TypeError|Invalid login|rate limit|registered|\{\}/);
      }
    }
  });
});

describe("isTransportError", () => {
  // AuthRetryableFetchError z auth-js: brak kodu, status 0; TypeError z fetch: nic.
  it.each([
    [
      "AuthRetryableFetchError",
      { name: "AuthRetryableFetchError", status: 0, code: undefined, message: "fetch failed" },
    ],
    ["TypeError z fetch", new TypeError("fetch failed")],
    ["obiekt bez kodu i statusu", { message: "socket hang up" }],
  ])("%s to awaria transportu", (_label, value) => {
    expect(isTransportError(value)).toBe(true);
  });

  it.each([
    ["błąd auth z kodem", { code: "invalid_credentials", status: 400, message: "Invalid login credentials" }],
    ["błąd z samym statusem HTTP", { status: 500, message: "boom" }],
    ["null", null],
  ])("%s nie jest awarią transportu", (_label, value) => {
    expect(isTransportError(value)).toBe(false);
  });
});

describe("isProviderOutage", () => {
  it.each([
    ["transport", { name: "AuthRetryableFetchError", status: 0, code: undefined, message: "fetch failed" }],
    ["5xx z GoTrue", { code: "unexpected_failure", status: 500, message: "Database error querying schema" }],
    ["502 z bramki", { status: 502, message: "Bad Gateway" }],
  ])("%s to awaria dostawcy", (_label, value) => {
    expect(isProviderOutage(value)).toBe(true);
  });

  it.each([
    ["złe hasło", { code: "invalid_credentials", status: 400 }],
    ["odrzucona sesja", { code: "session_not_found", status: 403 }],
    ["null", null],
  ])("%s nie jest awarią dostawcy", (_label, value) => {
    expect(isProviderOutage(value)).toBe(false);
  });
});

describe("isExpectedUserError", () => {
  it.each([
    INVALID_CREDENTIALS,
    EMAIL_NOT_CONFIRMED,
    USER_ALREADY_EXISTS,
    EMAIL_EXISTS,
    WEAK_PASSWORD,
    ...RATE_LIMITED,
  ])("%s to błąd użytkownika, nie incydent", (code) => {
    expect(isExpectedUserError(code)).toBe(true);
  });

  it.each([REQUEST_TIMEOUT, "unexpected_failure", "", undefined])("%j wymaga wpisu w logu", (code) => {
    expect(isExpectedUserError(code)).toBe(false);
  });
});
