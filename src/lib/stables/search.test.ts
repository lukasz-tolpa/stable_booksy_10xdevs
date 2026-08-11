import { describe, expect, it } from "vitest";
import { MAX_SEARCH_LENGTH, prepareSearchTerm } from "@/lib/stables/search";

describe("prepareSearchTerm", () => {
  it("traktuje brak parametru jako brak filtra", () => {
    expect(prepareSearchTerm(null)).toBeNull();
    expect(prepareSearchTerm(undefined)).toBeNull();
    expect(prepareSearchTerm("")).toBeNull();
  });

  it("traktuje frazę z samych białych znaków jako brak filtra", () => {
    expect(prepareSearchTerm("   ")).toBeNull();
    expect(prepareSearchTerm("\t\n ")).toBeNull();
  });

  it("przycina białe znaki z brzegów", () => {
    expect(prepareSearchTerm("  Krakow  ")).toBe("Krakow");
  });

  it("przepuszcza zwykłą frazę bez zmian", () => {
    expect(prepareSearchTerm("Stadnina Pod Debem")).toBe("Stadnina Pod Debem");
  });

  it("ekranuje metaznaki wzorca LIKE", () => {
    expect(prepareSearchTerm("%")).toBe("\\%");
    expect(prepareSearchTerm("_")).toBe("\\_");
    expect(prepareSearchTerm("100%")).toBe("100\\%");
  });

  it("ekranuje ukośnik przed pozostałymi metaznakami", () => {
    // Odwrotna kolejność dałaby "\\\\%" - ukośnik dodany przy ekranowaniu procenta
    // zostałby potraktowany jako znak do zaekranowania.
    expect(prepareSearchTerm("\\%")).toBe("\\\\\\%");
  });

  it("usuwa znaki strukturalne filtra PostgREST", () => {
    expect(prepareSearchTerm("Krakow, Wieliczka")).toBe("Krakow Wieliczka");
    expect(prepareSearchTerm('Stadnina "Pod Debem"')).toBe("Stadnina Pod Debem");
    expect(prepareSearchTerm("(Krakow)")).toBe("Krakow");
  });

  it("traktuje frazę złożoną wyłącznie ze znaków strukturalnych jako brak filtra", () => {
    expect(prepareSearchTerm(",,,")).toBeNull();
    expect(prepareSearchTerm('()"')).toBeNull();
  });

  it("obcina frazę dłuższą niż limit", () => {
    const long = "a".repeat(MAX_SEARCH_LENGTH + 50);
    expect(prepareSearchTerm(long)).toHaveLength(MAX_SEARCH_LENGTH);
  });
});
