/** Plac ze swoją nazwą — źródło nazw placów przy slotach (`listStablePlaces`). */
export interface PlaceName {
  id: number;
  name: string;
}

/**
 * Nazwa placu slotu dla widoków dnia (jeździec, zapisy dnia ośrodka, „Moje sloty”). Plac spoza listy
 * nie powinien wystąpić (FK i RLS ośrodka), ale wiersz z identyfikatorem jest lepszy niż wywrócony widok.
 */
export function placeNamer(places: PlaceName[]): (placeId: number) => string {
  const names = new Map(places.map((place) => [place.id, place.name]));
  return (placeId) => names.get(placeId) ?? `(plac #${String(placeId)})`;
}
