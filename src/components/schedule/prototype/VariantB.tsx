// PROTOTYP — do wyrzucenia. Wariant B „Kreator ze zmianami": jeden krok na ekranie,
// a limity wpisuje się jako zmiany instruktora („od 10 do 13, po 2 miejsca”), nie komórka po komórce.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { hourLabel, hourTotal, hoursOf, seatAt, type Draft, type VariantProps } from "./draft";

export const name = "Kreator: kroki + zmiany instruktorów";

interface Shift {
  from: number;
  to: number; // wyłącznie
  seats: number;
}

/** Ciągłe godziny z tym samym niezerowym limitem → jedna zmiana. */
function shiftsOf(draft: Draft, instructorId: number): Shift[] {
  const out: Shift[] = [];
  for (const hour of hoursOf(draft)) {
    const seats = seatAt(draft, instructorId, hour);
    const last = out.at(-1);
    if (seats === 0) continue;
    if (last?.to === hour && last.seats === seats) last.to = hour + 1;
    else out.push({ from: hour, to: hour + 1, seats });
  }
  return out;
}

const STEPS = ["Godziny", "Konie", "Instruktorzy", "Zmiany i miejsca", "Podsumowanie"];

export default function VariantB({ init, draft, actions, onSave }: VariantProps) {
  const [step, setStep] = useState(0);
  const hours = hoursOf(draft);
  const capacity = draft.horseIds.length;
  const working = init.instructors.filter((i) => draft.instructorIds.includes(i.id));
  const num =
    "w-[64px] min-h-[40px] rounded-md border border-border-2 bg-surface px-2 text-center font-mono tabular-nums focus:border-primary focus:outline-none";

  function writeShifts(instructorId: number, shifts: Shift[]) {
    actions.setSeatsFor(instructorId, hours, 0);
    for (const s of shifts) {
      actions.setSeatsFor(
        instructorId,
        hours.filter((h) => h >= s.from && h < s.to),
        s.seats,
      );
    }
  }

  const bigToggle = (on: boolean) =>
    cn(
      "flex min-h-[56px] w-full cursor-pointer items-center justify-between rounded-lg border px-4 text-left text-[15px] font-medium",
      on ? "border-primary bg-primary-soft" : "border-border-2 bg-surface hover:bg-surface-2",
    );

  return (
    <div className="grid gap-5">
      <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => {
                setStep(i);
              }}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1.5 text-[12.5px] font-semibold",
                i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary-soft" : "bg-surface-2",
              )}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {init.prefillFrom && step === 0 && (
        <p className="text-muted-foreground m-0 text-[13.5px]">
          Podpowiadamy ustawienia z dnia {init.prefillFrom} — przejdź kroki i zmień, co trzeba.
        </p>
      )}

      <section className="min-h-[240px]">
        {step === 0 && (
          <div className="grid gap-3">
            <h2 className="m-0 text-[20px]">W jakich godzinach ośrodek prowadzi jazdy?</h2>
            <div className="flex items-center gap-3">
              <label className="grid gap-1 text-[13px] font-semibold">
                Pierwsza jazda
                <input
                  className={num}
                  type="number"
                  value={draft.open}
                  onChange={(e) => {
                    actions.setHours(Number(e.target.value), draft.close);
                  }}
                />
              </label>
              <label className="grid gap-1 text-[13px] font-semibold">
                Ostatnia jazda
                <input
                  className={num}
                  type="number"
                  value={draft.close - 1}
                  onChange={(e) => {
                    actions.setHours(draft.open, Number(e.target.value) + 1);
                  }}
                />
              </label>
            </div>
            <p className="text-muted-foreground m-0 text-[13.5px]">
              {hours.length} jazd w ciągu dnia: {hours.map(hourLabel).join(", ")}.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-3">
            <h2 className="m-0 text-[20px]">Które konie pracują?</h2>
            <p className="text-muted-foreground m-0 text-[13.5px]">
              Liczba koni to maksimum jeźdźców w jednej godzinie, łącznie u wszystkich instruktorów.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {init.horses.map((h) => {
                const on = draft.horseIds.includes(h.id);
                return (
                  <button
                    type="button"
                    key={h.id}
                    className={bigToggle(on)}
                    onClick={() => {
                      actions.toggleHorse(h.id);
                    }}
                  >
                    {h.name}
                    <span className="text-[13px]">{on ? "pracuje ✓" : "wolne"}</span>
                  </button>
                );
              })}
            </div>
            <p className="m-0 text-[14px] font-semibold">
              Razem: {capacity} koni → do {capacity} jeźdźców na godzinę.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3">
            <h2 className="m-0 text-[20px]">Kto prowadzi jazdy?</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {init.instructors.map((i) => {
                const on = draft.instructorIds.includes(i.id);
                return (
                  <button
                    type="button"
                    key={i.id}
                    className={bigToggle(on)}
                    onClick={() => {
                      actions.toggleInstructor(i.id);
                    }}
                  >
                    {i.name}
                    <span className="text-[13px]">{on ? "pracuje ✓" : "wolne"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4">
            <h2 className="m-0 text-[20px]">Kiedy i ilu jeźdźców przyjmuje każdy instruktor?</h2>
            {working.length === 0 && (
              <p className="text-muted-foreground m-0">Najpierw wybierz instruktorów (krok 3).</p>
            )}
            {working.map((i) => {
              const shifts = shiftsOf(draft, i.id);
              return (
                <div key={i.id} className="border-border-2 grid gap-2.5 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <strong className="text-[15px]">{i.name}</strong>
                    <button
                      type="button"
                      className="text-primary cursor-pointer text-[13.5px] font-semibold"
                      onClick={() => {
                        writeShifts(i.id, [...shifts, { from: draft.open, to: draft.close, seats: 1 }]);
                      }}
                    >
                      + dodaj zmianę
                    </button>
                  </div>
                  {shifts.length === 0 && (
                    <p className="text-muted-foreground m-0 text-[13.5px]">
                      Brak jazd — instruktor nie przyjmuje zapisów.
                    </p>
                  )}
                  {shifts.map((s, idx) => {
                    const update = (patch: Partial<Shift>) => {
                      writeShifts(
                        i.id,
                        shifts.map((x, j) => (j === idx ? { ...x, ...patch } : x)),
                      );
                    };
                    return (
                      <div
                        key={idx}
                        className="bg-surface-2 flex flex-wrap items-center gap-2 rounded-md p-2.5 text-[14px]"
                      >
                        od
                        <input
                          className={num}
                          type="number"
                          value={s.from}
                          onChange={(e) => {
                            update({ from: Number(e.target.value) });
                          }}
                        />
                        do
                        <input
                          className={num}
                          type="number"
                          value={s.to - 1}
                          onChange={(e) => {
                            update({ to: Number(e.target.value) + 1 });
                          }}
                        />
                        włącznie, po
                        <input
                          className={num}
                          type="number"
                          min={1}
                          value={s.seats}
                          onChange={(e) => {
                            update({ seats: Number(e.target.value) });
                          }}
                        />
                        {s.seats === 1 ? "miejscu" : "miejsca"}
                        <button
                          type="button"
                          className="text-danger-ink ml-auto cursor-pointer text-[13px]"
                          onClick={() => {
                            writeShifts(
                              i.id,
                              shifts.filter((_, j) => j !== idx),
                            );
                          }}
                        >
                          usuń
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-3">
            <h2 className="m-0 text-[20px]">Sprawdź dzień</h2>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {hours.map((h) => {
                const total = hourTotal(draft, h);
                const over = total > capacity;
                const who = working
                  .filter((i) => seatAt(draft, i.id, h) > 0)
                  .map((i) => `${i.name} (${String(seatAt(draft, i.id, h))})`);
                return (
                  <li
                    key={h}
                    className={cn(
                      "flex gap-3 rounded-md px-3 py-2",
                      over ? "bg-danger-soft text-danger-ink" : "bg-surface-2",
                    )}
                  >
                    <span className="font-mono tabular-nums">{hourLabel(h)}</span>
                    <span className="flex-1">{who.length > 0 ? who.join(", ") : "brak jazd"}</span>
                    <span className="font-mono">
                      {total}/{capacity} koni {over && "— za mało koni!"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <div className="flex gap-3">
        {step > 0 && (
          <button
            type="button"
            className="border-border-2 min-h-[46px] flex-1 cursor-pointer rounded-full border font-semibold"
            onClick={() => {
              setStep(step - 1);
            }}
          >
            Wstecz
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="bg-primary text-primary-foreground min-h-[46px] flex-[2] cursor-pointer rounded-full font-semibold"
            onClick={() => {
              setStep(step + 1);
            }}
          >
            Dalej: {STEPS[step + 1]}
          </button>
        ) : (
          <button
            type="button"
            className="bg-chestnut hover:bg-chestnut-ink min-h-[46px] flex-[2] cursor-pointer rounded-full font-semibold text-white"
            onClick={onSave}
          >
            Zapisz grafik
          </button>
        )}
      </div>
    </div>
  );
}
