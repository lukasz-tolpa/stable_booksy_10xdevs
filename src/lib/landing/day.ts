import type { UserRole } from "@/types";

/**
 * Treść sekcji „Jeden dzień ze Stable Booksy” na stronie głównej (#53): nagłówek, sześć
 * momentów dnia i zamknięcie. Jedyne źródło tych słów — strona tylko je rysuje.
 *
 * Zrzuty to pliki z `npm run shots:day` (`scripts/shots-day.mjs`), nigdy robione ręcznie.
 * Wymiary niżej to wymiary tych plików; po odświeżeniu zrzutów trzeba je tu poprawić
 * (przeglądarka liczy z nich proporcje, zanim plik się załaduje).
 */

/** Jeden plik zrzutu: adres na stronie i wymiary w pikselach. */
export interface DayShotFile {
  src: string;
  width: number;
  height: number;
}

/** Zrzut ekranu momentu w dwóch szerokościach okna i jego opis dla czytników ekranu. */
export interface DayShot {
  /** Który to ekran i co na nim widać. */
  alt: string;
  desktop: DayShotFile;
  phone: DayShotFile;
}

export interface DayMoment {
  time: string;
  /** Czyj to krok; `null` to moment wspólny („Jazda.”). */
  role: UserRole | null;
  title: string;
  /** `null` — moment bez opisu. */
  text: string | null;
  /** `null` — moment bez zrzutu. */
  shot: DayShot | null;
}

type ShotName = "grafik" | "sloty" | "zapisy-dnia" | "moje-zapisy" | "statystyki";
type Size = [width: number, height: number];

function shot(name: ShotName, alt: string, desktop: Size, phone: Size): DayShot {
  const file = (variant: "komputer" | "telefon", [width, height]: Size): DayShotFile => ({
    src: `/jeden-dzien/${name}-${variant}.webp`,
    width,
    height,
  });
  return { alt, desktop: file("komputer", desktop), phone: file("telefon", phone) };
}

export const DAY_HEADING = "Jeden dzień ze Stable Booksy";
export const DAY_CLOSING_HEADING = "Jutro może tak wyglądać Twój dzień.";

export const DAY_MOMENTS: readonly DayMoment[] = [
  {
    time: "wczoraj, 19:00",
    role: "stable",
    title: "Ośrodek układa grafik na jutro.",
    text: "Godziny pracy, konie, instruktorzy i limit miejsc w każdej godzinie. Licznik „Koni zajętych” pilnuje, żeby miejsc nie było więcej niż koni.",
    shot: shot(
      "grafik",
      "Ekran grafiku dnia w panelu ośrodka: zaznaczone konie Bella i Kasztan, instruktorka Joanna Wrona i arkusz limitów miejsc od 10:00 do 15:00 z kolumną „Koni zajętych”.",
      [880, 677],
      [780, 1600],
    ),
  },
  {
    time: "19:20",
    role: "rider",
    title: "Anna zapisuje się na 11:00.",
    text: "Wybiera ośrodek i dzień, widzi wolne miejsca u instruktorów i klika „Zapisz się”.",
    shot: shot(
      "sloty",
      "Ekran wolnych slotów ośrodka widziany przez jeźdźca: kolejne godziny u Joanny Wrony z przyciskiem „Zapisz się”, a przy 11:00 oznaczenie „Twój zapis”.",
      [880, 918],
      [780, 2178],
    ),
  },
  {
    time: "dziś, 8:00",
    role: "stable",
    title: "Ośrodek przydziela konie.",
    text: "Na liście zapisów dnia każdy jeździec dostaje konia. Ten sam koń nie trafi do dwóch osób w jednej godzinie.",
    shot: shot(
      "zapisy-dnia",
      "Ekran zapisów dnia w panelu ośrodka: zapis Anny Kowalskiej na 11:00 u Joanny Wrony z przydzielonym koniem Bella.",
      [880, 190],
      [780, 544],
    ),
  },
  {
    time: "10:15",
    role: "rider",
    title: "Anna sprawdza swoje zapisy.",
    text: "Widzi godzinę, instruktora i konia. Gdyby coś wypadło, odwoła jazdę sama, a miejsce wróci do grafiku.",
    shot: shot(
      "moje-zapisy",
      "Ekran „Moje zapisy” jeźdźca: nadchodząca jazda o 11:00 w Stadninie Pod Dębem u Joanny Wrony na koniu Bella, z przyciskiem „Odwołaj”.",
      [880, 160],
      [780, 430],
    ),
  },
  { time: "11:00", role: null, title: "Jazda.", text: null, shot: null },
  {
    time: "koniec miesiąca",
    role: "stable",
    title: "Ośrodek patrzy w statystyki.",
    text: "Obłożenie grafiku, godziny jazd, najaktywniejsi jeźdźcy i obciążenie każdego konia.",
    shot: shot(
      "statystyki",
      "Ekran statystyk ośrodka: podsumowanie okresu z liczbą jazd, godzinami jazd, obłożeniem grafiku i odwołaniami oraz wykres godzin jazd dzień po dniu.",
      [880, 543],
      [780, 1294],
    ),
  },
];
