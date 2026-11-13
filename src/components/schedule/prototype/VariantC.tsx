// PROTOTYP — do wyrzucenia. Wariant C „Malowanie osi czasu": instruktorzy to pasy na osi godzin,
// wybierasz pędzel (liczba miejsc) i malujesz komórki kliknięciem lub przeciągnięciem.
// Nad pasami: obłożenie koni w każdej godzinie. Konie, instruktorzy i godziny w bocznym panelu.
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { hourTotal, hoursOf, seatAt, type VariantProps } from "./draft";

export const name = "Oś czasu z malowaniem";

export default function VariantC({ init, draft, actions, onSave }: VariantProps) {
  const [brush, setBrush] = useState(1);
  const [painting, setPainting] = useState(false);
  const hours = hoursOf(draft);
  const capacity = draft.horseIds.length;
  const working = init.instructors.filter((i) => draft.instructorIds.includes(i.id));
  const brushes = Array.from({ length: Math.max(capacity, 1) + 1 }, (_, n) => n);

  useEffect(() => {
    const stop = () => {
      setPainting(false);
    };
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
    };
  }, []);

  const cols = { gridTemplateColumns: `140px repeat(${String(hours.length)}, minmax(44px, 1fr))` };

  const toggleRow = (label: string, on: boolean, onClick: () => void, key: number) => (
    <label key={key} className="flex cursor-pointer items-center gap-2 py-1 text-[14px]">
      <input type="checkbox" checked={on} onChange={onClick} className="accent-primary size-4" />
      {label}
    </label>
  );

  return (
    <div className="grid gap-5 md:grid-cols-[190px_1fr]">
      <aside className="bg-surface-2 grid content-start gap-4 rounded-lg p-3.5">
        <div>
          <div className="text-muted-foreground mb-1 font-mono text-[11px] tracking-widest uppercase">Godziny</div>
          <div className="flex items-center gap-1.5 font-mono">
            <input
              type="number"
              className="border-border-2 bg-surface w-14 rounded border px-1.5 py-1"
              value={draft.open}
              onChange={(e) => {
                actions.setHours(Number(e.target.value), draft.close);
              }}
            />
            –
            <input
              type="number"
              className="border-border-2 bg-surface w-14 rounded border px-1.5 py-1"
              value={draft.close}
              onChange={(e) => {
                actions.setHours(draft.open, Number(e.target.value));
              }}
            />
          </div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1 font-mono text-[11px] tracking-widest uppercase">
            Konie · {capacity}
          </div>
          {init.horses.map((h) =>
            toggleRow(
              h.name,
              draft.horseIds.includes(h.id),
              () => {
                actions.toggleHorse(h.id);
              },
              h.id,
            ),
          )}
        </div>
        <div>
          <div className="text-muted-foreground mb-1 font-mono text-[11px] tracking-widest uppercase">Instruktorzy</div>
          {init.instructors.map((i) =>
            toggleRow(
              i.name,
              draft.instructorIds.includes(i.id),
              () => {
                actions.toggleInstructor(i.id);
              },
              i.id,
            ),
          )}
        </div>
        {init.prefillFrom && (
          <p className="text-muted-foreground m-0 text-[12.5px]">Wstępnie jak {init.prefillFrom}.</p>
        )}
      </aside>

      <div className="grid min-w-0 content-start gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold">Pędzel — miejsc w godzinie:</span>
          {brushes.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setBrush(n);
              }}
              className={cn(
                "size-9 cursor-pointer rounded-md border font-mono text-[14px]",
                brush === n ? "border-primary bg-primary text-primary-foreground" : "border-border-2 bg-surface",
              )}
            >
              {n === 0 ? "✕" : n}
            </button>
          ))}
          <span className="text-muted-foreground text-[12.5px]">Kliknij lub przeciągnij po godzinach.</span>
        </div>

        {hours.length === 0 || working.length === 0 ? (
          <p className="text-muted-foreground bg-surface-2 m-0 rounded-md p-4 text-center">
            Zaznacz instruktorów po lewej, żeby malować ich jazdy.
          </p>
        ) : (
          <div className="overflow-x-auto select-none">
            <div className="grid gap-1" style={cols}>
              <div />
              {hours.map((h) => (
                <div key={h} className="text-muted-foreground text-center font-mono text-[12px]">
                  {h}:00
                </div>
              ))}

              <div className="text-muted-foreground self-center text-[12.5px]">Konie zajęte</div>
              {hours.map((h) => {
                const total = hourTotal(draft, h);
                const pct = capacity > 0 ? Math.min(100, (total / capacity) * 100) : total > 0 ? 100 : 0;
                const over = total > capacity;
                return (
                  <div
                    key={h}
                    className="bg-surface-3 relative h-7 overflow-hidden rounded"
                    title={`${String(total)}/${String(capacity)}`}
                  >
                    <div
                      className={cn("absolute inset-x-0 bottom-0", over ? "bg-danger" : "bg-primary/60")}
                      style={{ height: `${String(pct)}%` }}
                    />
                    <span
                      className={cn(
                        "relative grid h-full place-items-center font-mono text-[11.5px]",
                        over && "font-bold text-white",
                      )}
                    >
                      {total}/{capacity}
                    </span>
                  </div>
                );
              })}

              {working.map((i) => (
                <div key={i.id} className="contents">
                  <div className="self-center pr-2 text-[14px] font-semibold">{i.name}</div>
                  {hours.map((h) => {
                    const v = seatAt(draft, i.id, h);
                    return (
                      <button
                        key={h}
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          setPainting(true);
                          actions.setSeat(i.id, h, brush);
                        }}
                        onPointerEnter={() => {
                          if (painting) actions.setSeat(i.id, h, brush);
                        }}
                        className={cn(
                          "h-11 cursor-crosshair rounded-md border font-mono text-[15px] font-semibold transition-colors",
                          v === 0
                            ? "border-border-2 text-faint border-dashed bg-transparent"
                            : "border-primary text-primary-foreground",
                        )}
                        style={
                          v > 0
                            ? { background: `color-mix(in oklab, var(--color-primary) ${String(40 + v * 15)}%, white)` }
                            : undefined
                        }
                        aria-label={`${i.name} ${String(h)}:00 — ${String(v)} miejsc`}
                      >
                        {v === 0 ? "·" : v}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onSave}
          className="bg-chestnut hover:bg-chestnut-ink font-display min-h-[46px] cursor-pointer rounded-full font-semibold text-white"
        >
          Zapisz grafik
        </button>
      </div>
    </div>
  );
}
