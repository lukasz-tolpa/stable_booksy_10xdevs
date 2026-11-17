import { describe, expect, it } from "vitest";
import {
  encodeInvitationFlash,
  invitationLink,
  invitationNotice,
  parseInvitationFlash,
} from "@/lib/instructors/invitations";
import { composeInstructorList } from "@/lib/instructors/list";

const TOKEN = "0123456789abcdef".repeat(4);
const NOW = new Date("2030-05-14T10:30:00Z");
const OWNER_ACCOUNT = "11111111-1111-1111-1111-111111111111";

describe("invitationLink", () => {
  it("prowadzi na rejestrację z tokenem w parametrze „zaproszenie”", () => {
    expect(invitationLink("https://getona.horse", TOKEN)).toBe(`https://getona.horse/auth/signup?zaproszenie=${TOKEN}`);
  });
});

describe("flash linku zaproszenia", () => {
  it("odczytuje to, co zapisał endpoint", () => {
    expect(parseInvitationFlash(encodeInvitationFlash({ instructorId: 7, token: TOKEN }))).toEqual({
      instructorId: 7,
      token: TOKEN,
    });
  });

  it.each([undefined, "", "7", `x.${TOKEN}`, `7.${TOKEN.slice(1)}`, `7.${TOKEN.toUpperCase()}`, `0.${TOKEN}`])(
    "odrzuca wartość %j",
    (value) => {
      expect(parseInvitationFlash(value)).toBeNull();
    },
  );
});

describe("invitationNotice", () => {
  const joanna = { id: 1, name: "Joanna Wrona", active: true, account_id: null };
  const karol = { id: 2, name: "Karol Jasny", active: true, account_id: null };
  const list = composeInstructorList(
    [joanna, karol],
    [],
    [{ instructor_id: joanna.id, email: "joanna@example.com", expires_at: "2030-05-21T10:00:00Z" }],
    OWNER_ACCOUNT,
    NOW,
  );

  it("pokazuje link instruktora, który ma żywe zaproszenie — z adresem i terminem", () => {
    expect(invitationNotice(list, { instructorId: joanna.id, token: TOKEN }, "http://localhost:4173")).toEqual({
      instructorName: "Joanna Wrona",
      email: "joanna@example.com",
      expiresLabel: "Zaproszenie ważne do 21 maja",
      link: `http://localhost:4173/auth/signup?zaproszenie=${TOKEN}`,
    });
  });

  it("bez flasha albo dla instruktora bez żywego zaproszenia — nic", () => {
    expect(invitationNotice(list, null, "http://localhost:4173")).toBeNull();
    expect(invitationNotice(list, { instructorId: karol.id, token: TOKEN }, "http://localhost:4173")).toBeNull();
    expect(invitationNotice(list, { instructorId: 99, token: TOKEN }, "http://localhost:4173")).toBeNull();
  });
});
