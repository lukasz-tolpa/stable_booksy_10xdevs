import { describe, expect, it } from "vitest";
import { isInvitationToken, signupInvitation } from "@/lib/auth/invitation";

const TOKEN = "0123456789abcdef".repeat(4);
const STABLE = "Stajnia Nad Rzeką";
const EMAIL = "tomasz.lis@example.com";

function row(state: string) {
  return { stable_name: STABLE, email: EMAIL, state };
}

describe("isInvitationToken", () => {
  it("rozpoznaje token z linku zaproszenia (64 znaki [0-9a-f])", () => {
    expect(isInvitationToken(TOKEN)).toBe(true);
  });

  it.each([[null], [undefined], [""], ["abc"], [TOKEN.toUpperCase()], [`${TOKEN} `], ["z".repeat(64)]])(
    "odrzuca %j",
    (value) => {
      expect(isInvitationToken(value)).toBe(false);
    },
  );
});

// US 16 i 19: żywe zaproszenie otwiera formularz z adresem i nazwą ośrodka; każdy inny stan
// daje jasny powód i prośbę o nowy link od właściciela.
describe("signupInvitation", () => {
  it("żywe zaproszenie otwiera formularz z nazwą ośrodka i adresem zaproszenia", () => {
    expect(signupInvitation(TOKEN, row("live"))).toEqual({
      kind: "open",
      token: TOKEN,
      stableName: STABLE,
      email: EMAIL,
    });
  });

  it.each([
    ["nieznany token", null, "Ten link zaproszenia jest nieprawidłowy"],
    ["wygasłe", row("expired"), "Ten link zaproszenia wygasł"],
    ["wycofane", row("revoked"), "Ten link zaproszenia został wycofany"],
    ["wykorzystane", row("accepted"), "Ten link zaproszenia został już wykorzystany"],
    ["instruktor nieaktywny", row("inactive"), "nieaktywny"],
    ["instruktor z kontem", row("has_account"), "ma już konto"],
    ["nieznany stan", row("cos-nowego"), "Ten link zaproszenia jest nieprawidłowy"],
  ])("%s — powód i prośba o nowy link od właściciela", (_name, invitation, reason) => {
    const result = signupInvitation(TOKEN, invitation);
    expect(result.kind).toBe("refused");
    if (result.kind === "refused") {
      expect(result.message).toContain(reason);
      expect(result.message).toMatch(/[Pp]oproś właściciela ośrodka o nowy link\.$/);
    }
  });

  it("odmowy to zamknięty zbiór polskich zdań bez tekstu dostawcy", () => {
    const states = [null, ...["expired", "revoked", "accepted", "inactive", "has_account"].map(row)];
    const messages = states.map((invitation) => {
      const result = signupInvitation(TOKEN, invitation);
      return result.kind === "refused" ? result.message : "";
    });
    expect(new Set(messages).size).toBe(states.length);
    for (const message of messages) {
      expect(message).not.toMatch(/SB0|expired|revoked|accepted|has_account|null/);
    }
  });

  it("wykorzystany link i instruktor z kontem prowadzą do logowania, pozostałe na stronę główną", () => {
    const target = (invitation: ReturnType<typeof row> | null) => {
      const result = signupInvitation(TOKEN, invitation);
      return result.kind === "refused" ? result.href : null;
    };
    expect(target(row("accepted"))).toBe("/auth/signin");
    expect(target(row("has_account"))).toBe("/auth/signin");
    expect(target(row("expired"))).toBe("/");
    expect(target(null)).toBe("/");
  });
});
