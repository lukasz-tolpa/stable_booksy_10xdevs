import { expect, test, type Page } from "@playwright/test";
import {
  DEMO_HINT,
  RIDER_A_STATE,
  STABLE_NAME,
  STABLE_STATE,
  expectDocumentOrder,
  expectNoHorizontalScroll,
  runSql,
  signIn,
} from "./helpers";

/**
 * Zajętość placów (#116, spec #112): pensjonariuszka z seeda (Katarzyna Zając, Hrabia w pobycie od 90 dni)
 * otwiera zajętość placów z nawigacji i w dniu historii demo ze slotem treningowym widzi na „Duży plac”
 * o 10:00 instruktorów, rodzaj slotu i liczbę zajętych miejsc; na telefonie bez przewijania w bok. Właściciel
 * widzi te same liczby; jeździec rekreacyjny nie ma zajętości placów w nawigacji.
 *
 * Wyrocznia: aktywne zapisy w slotach dnia na tym placu, policzone przez superusera. Scenariusz nic nie zapisuje.
 */
const BOARDER_EMAIL = "katarzyna.zajac@example.com";
const PLACE = "Duży plac";
const HOUR = 10;
const TITLE = "Zajętość placów";

/** Najpóźniejszy dzień historii demo ze slotem treningowym na placu scenariusza. */
function demoTrainingDay(): string {
  const day = runSql(
    `select max(sd.day) from public.schedule_days sd
     join public.stables s on s.id = sd.stable_id and s.name = '${STABLE_NAME}'
     join public.schedule_slots sl on sl.schedule_day_id = sd.id and sl.kind = 'training' and sl.hour = ${String(HOUR)}
     join public.places p on p.id = sl.place_id and p.name = '${PLACE}'
     where sd.day < current_date;`,
    "odczytać dnia historii demo ze slotem treningowym",
    ["-At"],
  ).trim();
  expect(day, DEMO_HINT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  return day;
}

/** Aktywne zapisy każdego instruktora w slocie na placu scenariusza o godzinie scenariusza. */
function takenByInstructor(day: string): Map<string, number> {
  const rows = runSql(
    `select i.name, count(b.id) from public.schedule_slots sl
     join public.schedule_days sd on sd.id = sl.schedule_day_id
     join public.stables s on s.id = sd.stable_id and s.name = '${STABLE_NAME}'
     join public.places p on p.id = sl.place_id and p.name = '${PLACE}'
     join public.instructors i on i.id = sl.instructor_id
     left join public.bookings b on b.schedule_day_id = sl.schedule_day_id and b.instructor_id = sl.instructor_id
       and b.hour = sl.hour and b.status = 'active'
     where sd.day = '${day}' and sl.hour = ${String(HOUR)} and sl.seats > 0
     group by i.name;`,
    "policzyć zajętych miejsc na placu",
    ["-At", "-F", "|"],
  );
  return new Map(
    rows
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, count] = line.split("|");
        return [name, Number(count)];
      }),
  );
}

function occupancyCell(page: Page) {
  return page
    .getByRole("list", { name: "Zajętość placów w godzinach" })
    .getByRole("listitem", { name: `${PLACE}, ${String(HOUR)}:00`, exact: true });
}

/** Komórka placu: każdy instruktor z liczbą zajętych miejsc z wyroczni; slot treningowy z pigułką. */
async function expectCell(page: Page, taken: Map<string, number>, trainingInstructor: string): Promise<void> {
  const cell = occupancyCell(page);
  await expect(cell).toBeVisible();
  for (const [instructor, count] of taken) {
    const slot = cell.getByRole("listitem").filter({ hasText: instructor });
    await expect(slot).toContainText(new RegExp(`${String(count)} zaj\\S+ miejsc`));
  }
  await expect(
    cell.getByRole("listitem").filter({ hasText: trainingInstructor }).getByText("slot treningowy", { exact: true }),
  ).toBeVisible();
}

test("pensjonariuszka widzi zajętość placów w dniu z jazdami demo, także na telefonie bez przewijania w bok", async ({
  page,
}) => {
  const day = demoTrainingDay();
  const taken = takenByInstructor(day);
  const owner = "Marek Dębowski";
  expect(taken.get(owner), "slot treningowy właściciela z jazdą pensjonariuszki").toBeGreaterThan(0);

  await test.step("nawigacja jeźdźca prowadzi pensjonariuszkę do zajętości placów", async () => {
    await signIn(page, BOARDER_EMAIL, "/jezdziec");
    await page.getByRole("link", { name: TITLE, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
    await expect(page.getByText(STABLE_NAME, { exact: true })).toBeVisible();
  });

  await test.step(`dzień z jazdami demo: ${PLACE} o ${String(HOUR)}:00 — instruktorzy, rodzaj slotu, zajęte miejsca`, async () => {
    await page.getByLabel("Wybierz dzień").fill(day);
    await page.getByRole("button", { name: "Pokaż" }).click();
    await expect(page.getByLabel("Wybierz dzień")).toHaveValue(day);
    await expectCell(page, taken, owner);
  });

  await test.step("telefon: jedna kolumna bez przewijania w bok, kolejność dokumentu jak na ekranie", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expectCell(page, taken, owner);
    await expectNoHorizontalScroll(page);
    await expectDocumentOrder(page, [
      page.getByRole("heading", { level: 1, name: TITLE }),
      page.getByRole("navigation", { name: "Wybór dnia" }),
      page.getByRole("list", { name: "Zajętość placów w godzinach" }),
    ]);
  });
});

test.describe("właściciel", () => {
  test.use({ storageState: STABLE_STATE });

  test("właściciel otwiera zajętość placów z panelu i widzi te same liczby", async ({ page }) => {
    const day = demoTrainingDay();
    const taken = takenByInstructor(day);

    await page.goto("/osrodek");
    await page
      .getByRole("navigation", { name: "Ośrodek" })
      .getByRole("link", { name: /^Zajętość placów / })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
    await page.goto(`/osrodek/zajetosc-placow?dzien=${day}`);
    await expectCell(page, taken, "Marek Dębowski");
  });
});

test.describe("jeździec rekreacyjny", () => {
  test.use({ storageState: RIDER_A_STATE });

  test("jeździec rekreacyjny nie ma zajętości placów w nawigacji ani na stronie", async ({ page }) => {
    await page.goto("/jezdziec");
    await expect(page.getByRole("heading", { level: 1, name: "Ośrodki" })).toBeVisible();
    await expect(page.getByRole("link", { name: TITLE, exact: true })).toHaveCount(0);

    await page.goto("/jezdziec/zajetosc-placow");
    await expect(
      page.getByText("Zajętość placów widzi pensjonariusz, którego koń stoi w ośrodku.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "Zajętość placów w godzinach" })).toHaveCount(0);
  });
});
