import { describe, expect, it } from "vitest";
import { MAX_SEARCH_LENGTH, parseStableId, prepareSearchTerm } from "@/lib/stables/search";

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

describe("parseStableId", () => {
  it("przepuszcza dodatnie liczby całkowite", () => {
    expect(parseStableId("1")).toBe(1);
    expect(parseStableId("42")).toBe(42);
  });

  it("odrzuca brak wartości", () => {
    expect(parseStableId(undefined)).toBeNull();
    expect(parseStableId(null)).toBeNull();
    expect(parseStableId("")).toBeNull();
  });

  it("odrzuca wartości niebędące liczbą", () => {
    expect(parseStableId("abc")).toBeNull();
    expect(parseStableId("1abc")).toBeNull();
    expect(parseStableId(" 1")).toBeNull();
  });

  it("odrzuca zero i wartości ujemne", () => {
    expect(parseStableId("0")).toBeNull();
    expect(parseStableId("-3")).toBeNull();
  });

  it("odrzuca wartości ułamkowe i wykładnicze", () => {
    expect(parseStableId("1.5")).toBeNull();
    expect(parseStableId("1e3")).toBeNull();
  });

  it("odrzuca ciąg cyfr poza bezpiecznym zakresem liczb", () => {
    expect(parseStableId("9".repeat(30))).toBeNull();
  });
});
