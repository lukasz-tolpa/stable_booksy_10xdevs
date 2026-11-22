import type { PlaceListItem } from "@/lib/places/queries";

/** Strona „Place”: place aktywne i nieaktywne, każda grupa alfabetycznie. */
export interface PlaceList {
  active: PlaceListItem[];
  inactive: PlaceListItem[];
  /**
   * Czy pokazać „Dezaktywuj” przy aktywnych placach — ostatni aktywny plac zostaje aktywny
   * (baza i tak odmówi: SB033), bo bez niego ośrodek nie ułoży nowego dnia.
   */
  canDeactivate: boolean;
}

const byName = (a: PlaceListItem, b: PlaceListItem) => a.name.localeCompare(b.name, "pl");

export function composePlaceList(places: PlaceListItem[]): PlaceList {
  const active = places.filter((place) => place.active).sort(byName);

  return {
    active,
    inactive: places.filter((place) => !place.active).sort(byName),
    canDeactivate: active.length > 1,
  };
}
