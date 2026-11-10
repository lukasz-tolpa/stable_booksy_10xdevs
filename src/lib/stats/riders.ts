/**
 * Tabela jeźdźców strony statystyk: wiersz na konto jeźdźca z rozbiciem jazd na konie.
 * Część modułu statystyk — wołana wyłącznie przez `computeStableStats`, które decyduje,
 * co jest jazdą, a co odwołaniem; tu jest tylko grupowanie i sortowanie.
 */

/** Jeździec znany ośrodkowi: konto (`id`) i nazwa z profilu (`null`, gdy jej nie podał). */
export interface StatsRider {
  id: string;
  name: string | null;
}

/** Koń stadniny — także zdezaktywowany, bo statystyki opisują historię. */
export interface StatsHorse {
  id: number;
  name: string;
}

/** Liczba jazd jeźdźca na jednym koniu. */
export interface StatsRiderHorse {
  horseId: number;
  horseName: string;
  rides: number;
}

export interface StatsRiderRow {
  /** Konto jeźdźca — jeźdźcy są rozróżniani po koncie, nie po nazwie. */
  riderId: string;
  name: string;
  rides: number;
  rideHours: number;
  cancellations: number;
  /** Rozbicie jazd na konie, od konia najczęściej dosiadanego. Puste, gdy jazd nie było. */
  horses: StatsRiderHorse[];
}

/** Zapis w zakresie potrzebnym tabeli jeźdźców. */
interface RiderBooking {
  riderId: string;
  horseId: number;
}

export interface RiderRowsInput {
  /** Jazdy okresu (aktywne zapisy z zakończoną godziną). */
  rides: RiderBooking[];
  /** Odwołania okresu. */
  cancellations: RiderBooking[];
  riders: StatsRider[];
  horses: StatsHorse[];
  /** Czas trwania jednej jazdy w godzinach. */
  slotDurationHours: number;
}

/** Fallback dla profilu bez imienia i nazwiska — ten sam tekst co na liście zapisów dnia. */
const UNNAMED_RIDER = "(bez nazwiska)";

/**
 * Wiersze tabeli jeźdźców: każdy jeździec, który w okresie miał jazdę albo odwołanie.
 * Kolejność: od najaktywniejszego (godziny jazd, potem jazdy), przy remisie według
 * nazwy i konta — żeby kolejność była stabilna między odświeżeniami.
 */
export function computeRiderRows(input: RiderRowsInput): StatsRiderRow[] {
  const riderNames = new Map(input.riders.map((rider) => [rider.id, rider.name]));
  const horseNames = new Map(input.horses.map((horse) => [horse.id, horse.name]));

  const tallies = new Map<string, { cancellations: number; ridesByHorse: Map<number, number> }>();
  const tallyOf = (riderId: string) => {
    let tally = tallies.get(riderId);
    if (!tally) {
      tally = { cancellations: 0, ridesByHorse: new Map() };
      tallies.set(riderId, tally);
    }
    return tally;
  };

  for (const ride of input.rides) {
    const { ridesByHorse } = tallyOf(ride.riderId);
    ridesByHorse.set(ride.horseId, (ridesByHorse.get(ride.horseId) ?? 0) + 1);
  }
  for (const cancellation of input.cancellations) {
    tallyOf(cancellation.riderId).cancellations += 1;
  }

  return [...tallies]
    .map(([riderId, tally]): StatsRiderRow => {
      const horses = [...tally.ridesByHorse]
        .map(([horseId, rides]) => ({
          horseId,
          // Koń spoza listy stada nie powinien wystąpić, ale wiersz z identyfikatorem
          // jest lepszy niż wywrócenie tabeli (jak w `composeBookingRows`).
          horseName: horseNames.get(horseId) ?? `(koń #${String(horseId)})`,
          rides,
        }))
        .sort((a, b) => b.rides - a.rides || a.horseName.localeCompare(b.horseName, "pl") || a.horseId - b.horseId);
      const rides = horses.reduce((sum, horse) => sum + horse.rides, 0);

      return {
        riderId,
        name: riderNames.get(riderId) ?? UNNAMED_RIDER,
        rides,
        rideHours: rides * input.slotDurationHours,
        cancellations: tally.cancellations,
        horses,
      };
    })
    .sort(
      (a, b) =>
        b.rideHours - a.rideHours ||
        b.rides - a.rides ||
        a.name.localeCompare(b.name, "pl") ||
        a.riderId.localeCompare(b.riderId),
    );
}
