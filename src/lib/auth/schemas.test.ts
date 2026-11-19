import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/constants";
import { invitedSignUpSchema, newStableSchema, signInSchema, signUpSchema } from "@/lib/auth/schemas";

const validSignUp = {
  fullName: "Anna Kowalska",
  email: "anna@example.com",
  password: "sekret123",
  confirmPassword: "sekret123",
  role: "rider",
};

describe("signUpSchema", () => {
  it("przepuszcza poprawne dane", () => {
    expect(signUpSchema.safeParse(validSignUp).success).toBe(true);
  });

  it("przepuszcza rolę instruktora (wybór „Ośrodek”)", () => {
    expect(signUpSchema.safeParse({ ...validSignUp, role: "instructor" }).success).toBe(true);
  });

  it("odrzuca dawną rolę ośrodka", () => {
    expect(signUpSchema.safeParse({ ...validSignUp, role: "stable" }).success).toBe(false);
  });

  it("odrzuca rolę spoza dozwolonego zbioru", () => {
    const result = signUpSchema.safeParse({ ...validSignUp, role: "admin" });
    expect(result.success).toBe(false);
  });

  it("odrzuca brak roli", () => {
    const { role: _role, ...withoutRole } = validSignUp;
    expect(signUpSchema.safeParse(withoutRole).success).toBe(false);
  });

  it("odrzuca hasło krótsze niż minimum", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    const result = signUpSchema.safeParse({ ...validSignUp, password: short, confirmPassword: short });
    expect(result.success).toBe(false);
  });

  it("odrzuca niezgodne powtórzenie hasła i wskazuje właściwe pole", () => {
    const result = signUpSchema.safeParse({ ...validSignUp, confirmPassword: "cos innego" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });

  it("odrzuca niepoprawny adres e-mail", () => {
    expect(signUpSchema.safeParse({ ...validSignUp, email: "anna-example.com" }).success).toBe(false);
  });

  // FR-005: lista zapisów ośrodka pokazuje godzinę, konia i jeźdźca. Konto bez imienia
  // wpisuje tam zapas "(bez nazwiska)", więc rejestracja nie może go przepuścić.
  it("odrzuca brak imienia", () => {
    const { fullName: _fullName, ...withoutName } = validSignUp;
    expect(signUpSchema.safeParse(withoutName).success).toBe(false);
  });

  it("odrzuca imię z samych białych znaków", () => {
    const result = signUpSchema.safeParse({ ...validSignUp, fullName: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Podaj imię i nazwisko");
    }
  });

  it("przycina białe znaki wokół imienia", () => {
    const result = signUpSchema.safeParse({ ...validSignUp, fullName: "  Anna Kowalska  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe("Anna Kowalska");
    }
  });
});

// Rejestracja z linku zaproszenia (#75): bez wyboru roli i bez adresu z formularza — rolę
// i adres wyznacza zaproszenie, więc schemat ich nie przyjmuje; niesie za to token z linku.
describe("invitedSignUpSchema", () => {
  const token = "0123456789abcdef".repeat(4);
  const validInvited = { fullName: "Tomasz Lis", password: "sekret123", confirmPassword: "sekret123", token };

  it("przepuszcza rejestrację z tokenem bez roli i bez adresu", () => {
    const result = invitedSignUpSchema.safeParse(validInvited);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        fullName: "Tomasz Lis",
        password: "sekret123",
        confirmPassword: "sekret123",
        token,
      });
    }
  });

  it("pomija rolę i adres przysłane w formularzu", () => {
    const result = invitedSignUpSchema.safeParse({ ...validInvited, role: "rider", email: "inny@example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("role");
      expect(result.data).not.toHaveProperty("email");
    }
  });

  it.each([[undefined], [""], ["0123"], [token.toUpperCase()], [`${token}0`], ["g".repeat(64)]])(
    "odrzuca token %j z komunikatem o nieprawidłowym linku",
    (bad) => {
      const result = invitedSignUpSchema.safeParse({ ...validInvited, token: bad });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Link zaproszenia jest nieprawidłowy");
      }
    },
  );

  it("odrzuca imię z samych białych znaków i przycina poprawne", () => {
    expect(invitedSignUpSchema.safeParse({ ...validInvited, fullName: "   " }).success).toBe(false);
    const result = invitedSignUpSchema.safeParse({ ...validInvited, fullName: "  Tomasz Lis " });
    expect(result.success && result.data.fullName).toBe("Tomasz Lis");
  });

  it("odrzuca hasło krótsze niż minimum", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(invitedSignUpSchema.safeParse({ ...validInvited, password: short, confirmPassword: short }).success).toBe(
      false,
    );
  });

  it("odrzuca niezgodne powtórzenie hasła i wskazuje właściwe pole", () => {
    const result = invitedSignUpSchema.safeParse({ ...validInvited, confirmPassword: "cos innego" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });
});

describe("signInSchema", () => {
  it("przepuszcza poprawne dane", () => {
    expect(signInSchema.safeParse({ email: "anna@example.com", password: "x" }).success).toBe(true);
  });

  it("odrzuca puste hasło", () => {
    expect(signInSchema.safeParse({ email: "anna@example.com", password: "" }).success).toBe(false);
  });
});

describe("newStableSchema", () => {
  const validStable = { name: "Stadnina Pod Dębem", city: "Kraków", instructorName: "Marek Dębowski" };

  it("przepuszcza poprawne dane i przycina białe znaki", () => {
    const result = newStableSchema.safeParse({
      name: "  Stadnina Pod Dębem  ",
      city: " Kraków ",
      instructorName: "  Marek Dębowski ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Stadnina Pod Dębem");
      expect(result.data.city).toBe("Kraków");
      expect(result.data.instructorName).toBe("Marek Dębowski");
    }
  });

  it("odrzuca nazwę z samych białych znaków", () => {
    expect(newStableSchema.safeParse({ ...validStable, name: "   " }).success).toBe(false);
  });

  it("odrzuca pustą miejscowość", () => {
    expect(newStableSchema.safeParse({ ...validStable, city: "" }).success).toBe(false);
  });

  it.each([[""], ["   "], [null]])("odrzuca nazwę instruktora właściciela %j z komunikatem pola", (instructorName) => {
    const result = newStableSchema.safeParse({ ...validStable, instructorName });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Podaj swoją nazwę instruktora");
    }
  });
});
