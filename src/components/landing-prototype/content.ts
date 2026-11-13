// PROTOTYP — do wyrzucenia. Wspólna treść wariantów sekcji pod połowami strony głównej.
// Zrzuty w `public/landing-prototype/` to prawdziwe ekrany aplikacji z danymi demo.

export interface Step {
  title: string;
  text: string;
  img: string;
  alt: string;
}

const img = (name: string) => `/landing-prototype/${name}.png`;

export const riderSteps: Step[] = [
  {
    title: "Znajdź ośrodek",
    text: "Przeglądasz listę ośrodków i wybierasz ten, w którym chcesz jeździć.",
    img: img("rider-catalogue"),
    alt: "Ekran z listą ośrodków",
  },
  {
    title: "Wybierz dzień, godzinę i instruktora",
    text: "Przy każdej godzinie widzisz, ile miejsc zostało. Klikasz „Zapisz się” i gotowe.",
    img: img("rider-slots"),
    alt: "Ekran z wolnymi slotami ośrodka w wybranym dniu",
  },
  {
    title: "Miej swoje jazdy w jednym miejscu",
    text: "W „Moich zapisach” widzisz nadchodzące jazdy i konia przydzielonego przez ośrodek. Jazdę odwołasz sam, aż do jej rozpoczęcia.",
    img: img("rider-bookings"),
    alt: "Ekran „Moje zapisy” z nadchodzącą jazdą",
  },
];

export const stableSteps: Step[] = [
  {
    title: "Dodaj konie i instruktorów",
    text: "Wpisujesz stado i ludzi raz. Potem tylko zaznaczasz, kto pracuje danego dnia.",
    img: img("stable-panel"),
    alt: "Panel ośrodka",
  },
  {
    title: "Ułóż grafik dnia",
    text: "Godziny pracy, konie, instruktorzy i limit miejsc w każdej godzinie. Licznik „Koni zajętych” od razu pokazuje, czy starczy koni.",
    img: img("stable-schedule"),
    alt: "Ekran grafiku dnia z arkuszem limitów miejsc",
  },
  {
    title: "Prowadź dzień z listy zapisów",
    text: "Widzisz, kto u kogo jeździ. Przydzielasz konie i w razie potrzeby odwołujesz zapis.",
    img: img("stable-bookings"),
    alt: "Ekran zapisów dnia z przydziałem konia",
  },
  {
    title: "Sprawdź, jak pracuje ośrodek",
    text: "Obłożenie grafiku, godziny jazd, najaktywniejsi jeźdźcy i obciążenie każdego konia w wybranym okresie.",
    img: img("stable-stats"),
    alt: "Ekran statystyk ośrodka",
  },
];

export const features = [
  [
    "Wolne miejsca na żywo",
    "Jeździec widzi tylko to, co naprawdę jest wolne. Gdy ktoś odwoła, miejsce wraca do grafiku.",
  ],
  ["Limit miejsc u instruktora", "Ośrodek decyduje, ilu jeźdźców przyjmie każdy instruktor w każdej godzinie."],
  ["Koni nie zabraknie", "Aplikacja nie pozwoli wystawić więcej miejsc, niż pracuje koni."],
  ["Konie przydziela ośrodek", "Jeden koń nie trafi do dwóch jeźdźców w tej samej godzinie."],
  ["Odwołania bez telefonu", "Jeździec odwołuje sam; ośrodek też może odwołać zapis i jeździec to zobaczy."],
  ["Statystyki", "Obłożenie grafiku, godziny jazd i obciążenie koni w dowolnym okresie."],
];
