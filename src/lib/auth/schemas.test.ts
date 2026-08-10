import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/constants";
import { newStableSchema, signInSchema, signUpSchema } from "@/lib/auth/schemas";

const validSignUp = {
  email: "anna@example.com",
  password: "sekret123",
  confirmPassword: "sekret123",
  role: "rider",
};

describe("signUpSchema", () => {
  it("przepuszcza poprawne dane", () => {
    expect(signUpSchema.safeParse(validSignUp).success).toBe(true);
  });

  it("przepuszcza rolę ośrodka", () => {
    expect(signUpSchema.safeParse({ ...validSignUp, role: "stable" }).success).toBe(true);
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
  it("przepuszcza poprawne dane i przycina białe znaki", () => {
    const result = newStableSchema.safeParse({ name: "  Stadnina Pod Debem  ", city: " Krakow " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Stadnina Pod Debem");
      expect(result.data.city).toBe("Krakow");
    }
  });

  it("odrzuca nazwę z samych białych znaków", () => {
    expect(newStableSchema.safeParse({ name: "   ", city: "Krakow" }).success).toBe(false);
  });

  it("odrzuca pustą miejscowość", () => {
    expect(newStableSchema.safeParse({ name: "Stadnina", city: "" }).success).toBe(false);
  });
});
