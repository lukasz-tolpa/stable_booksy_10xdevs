// PROTOTYP — do wyrzucenia. Wariant A „Arkusz": wiersze = godziny, kolumny = instruktorzy,
// ostatnia kolumna liczy na żywo konie zajęte w godzinie. Konie i instruktorzy jako chipy u góry.
import { cn } from "@/lib/utils";
import { hourLabel, hourTotal, hoursOf, seatAt, type VariantProps } from "./draft";

export const name = "Arkusz godzina × instruktor";

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "min-h-[36px] cursor-pointer rounded-full border px-3.5 text-[13.5px] font-medium transition-colors",
        on ? "border-primary bg-primary text-primary-foreground" : "border-border-2 bg-surface hover:bg-surface-2",
      )}
    >
      {on ? "✓ " : "+ "}
      {children}
    </button>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const btn =
    "grid size-8 cursor-pointer place-items-center rounded-md text-[17px] hover:bg-surface-3 disabled:opacity-30 disabled:cursor-default";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border p-0.5",
        value > 0 ? "border-primary bg-primary-soft" : "border-border-2 bg-surface",
      )}
    >
      <button
        type="button"
        className={btn}
        disabled={value === 0}
        onClick={() => {
          onChange(value - 1);
        }}
        aria-label={`${label}: mniej`}
      >
        −
      </button>
      <span className={cn("w-6 text-center font-mono tabular-nums", value === 0 && "text-faint")}>
        {value === 0 ? "–" : value}
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => {
          onChange(value + 1);
        }}
        aria-label={`${label}: więcej`}
      >
        +
      </button>
    </div>
  );
}

export default function VariantA({ init, draft, actions, onSave }: VariantProps) {
  const hours = hoursOf(draft);
  const capacity = draft.horseIds.length;
  const working = init.instructors.filter((i) => draft.instructorIds.includes(i.id));
  const hourOptions = Array.from({ length: 25 }, (_, h) => h);
  const select =
    "min-h-[40px] rounded-md border border-border-2 bg-surface px-2.5 font-mono tabular-nums focus:border-primary focus:outline-none";

  return (
    <div className="grid gap-5">
      {init.prefillFrom && (
        <p className="bg-warn-soft text-warn-ink m-0 rounded-md px-3.5 py-2.5 text-[13.5px]">
          Szkic na podstawie dnia {init.prefillFrom}. Sprawdź i zapisz — dopóki nie zapiszesz, jeźdźcy nic nie widzą.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
        <span className="text-muted-foreground text-[13px] font-semibold">Godziny</span>
        <div className="flex items-center gap-2">
          <select
            className={select}
            value={draft.open}
            onChange={(e) => {
              actions.setHours(Number(e.target.value), draft.close);
            }}
          >
            {hourOptions.slice(0, 24).map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
          <span className="text-faint">→</span>
          <select
            className={select}
            value={draft.close}
            onChange={(e) => {
              actions.setHours(draft.open, Number(e.target.value));
            }}
          >
            {hourOptions.slice(1).map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-[13px]">
            {hours.length > 0 ? `ostatnia jazda o ${hourLabel(hours[hours.length - 1])}` : "nieprawidłowy zakres"}
          </span>
        </div>

        <span className="text-muted-foreground text-[13px] font-semibold">Konie ({capacity})</span>
        <div className="flex flex-wrap gap-2">
          {init.horses.map((h) => (
            <Chip
              key={h.id}
              on={draft.horseIds.includes(h.id)}
              onClick={() => {
                actions.toggleHorse(h.id);
              }}
            >
              {h.name}
            </Chip>
          ))}
        </div>

        <span className="text-muted-foreground text-[13px] font-semibold">Instruktorzy</span>
        <div className="flex flex-wrap gap-2">
          {init.instructors.map((i) => (
            <Chip
              key={i.id}
              on={draft.instructorIds.includes(i.id)}
              onClick={() => {
                actions.toggleInstructor(i.id);
              }}
            >
              {i.name}
            </Chip>
          ))}
        </div>
      </div>

      {working.length === 0 || hours.length === 0 ? (
        <p className="text-muted-foreground bg-surface-2 m-0 rounded-md p-4 text-center">
          Wybierz instruktora, żeby rozpisać miejsca na godziny.
        </p>
      ) : (
        <div className="border-border-2 overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-[14px]">
            <thead className="bg-surface-2">
              <tr>
                <th className="px-3 py-2.5 text-left text-[12.5px] font-semibold">Godzina</th>
                {working.map((i) => (
                  <th key={i.id} className="px-2 py-2.5 text-center text-[13px] font-semibold">
                    <div>{i.name}</div>
                    <div className="mt-1 flex justify-center gap-1">
                      {[1, 2, 3].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className="border-border-2 hover:bg-surface cursor-pointer rounded border px-1.5 font-mono text-[11.5px] font-normal"
                          onClick={() => {
                            actions.setSeatsFor(i.id, hours, n);
                          }}
                          title={`Ustaw ${String(n)} we wszystkich godzinach`}
                        >
                          wszędzie {n}
                        </button>
                      ))}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right text-[12.5px] font-semibold">Koni zajętych</th>
              </tr>
            </thead>
            <tbody>
              {hours.map((hour) => {
                const total = hourTotal(draft, hour);
                const over = total > capacity;
                return (
                  <tr key={hour} className={cn("border-border border-t", over && "bg-danger-soft")}>
                    <td className="px-3 py-2 font-mono tabular-nums">{hourLabel(hour)}</td>
                    {working.map((i) => (
                      <td key={i.id} className="px-2 py-2 text-center">
                        <Stepper
                          value={seatAt(draft, i.id, hour)}
                          label={`${i.name} ${hourLabel(hour)}`}
                          onChange={(v) => {
                            actions.setSeat(i.id, hour, v);
                          }}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 font-mono text-[13px] tabular-nums",
                          over
                            ? "bg-danger text-white"
                            : total === capacity && total > 0
                              ? "bg-success-soft text-success-ink"
                              : "text-muted-foreground",
                        )}
                      >
                        {total} / {capacity}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
  );
}
