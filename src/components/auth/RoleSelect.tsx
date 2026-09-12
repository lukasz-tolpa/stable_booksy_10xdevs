import { CircleAlert, User } from "lucide-react";
import { StableBarn } from "@/components/ui/StableBarn";
import { ROLE_LABELS, USER_ROLES } from "@/lib/auth/constants";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

/**
 * Wybór rodzaju konta. Zrealizowany na natywnych polach radio o wspólnej nazwie `role`,
 * więc wartość dojeżdża do serwera także przy wyłączonym JavaScripcie - stan Reacta
 * służy wyłącznie podświetleniu wybranej opcji i czyszczeniu błędu.
 *
 * Wygląd wg DESIGN.md §5 i `auth.html`: każda opcja to karta z pigułką roli, a
 * zaznaczenie maluje ramkę i tło kolorem roli. Pigułka jest tu powtórzona w
 * Tailwindzie, bo `RoleBadge.astro` nie da się wyrenderować wewnątrz wyspy Reacta;
 * wartości tokenów są te same.
 */

const DESCRIPTIONS: Record<UserRole, string> = {
  stable: "Układasz grafik jazd, wskazujesz konie i przyjmujesz zapisy.",
  rider: "Przeglądasz ośrodki i zapisujesz się na jazdy.",
};

const ICONS: Record<UserRole, (props: { className?: string }) => React.ReactNode> = {
  stable: StableBarn,
  rider: User,
};

/** Kolory roli: ośrodek na zieleni marki, jeździec na kasztanie (DESIGN.md §2). */
const OPTION_STYLES: Record<UserRole, { selected: string; radio: string; pill: string }> = {
  stable: {
    selected: "border-primary bg-primary-soft",
    radio: "accent-primary",
    pill: "bg-primary-soft text-primary-strong",
  },
  rider: {
    selected: "border-chestnut bg-chestnut-soft",
    radio: "accent-chestnut",
    pill: "bg-chestnut-soft text-chestnut-ink",
  },
};

interface RoleSelectProps {
  value: UserRole | "";
  onChange: (value: UserRole) => void;
  error?: string;
}

export function RoleSelect({ value, onChange, error }: RoleSelectProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-foreground mb-2 text-[13px] font-semibold">Rodzaj konta</legend>
      <div className="flex flex-col gap-2.5">
        {USER_ROLES.map((role) => {
          const Icon = ICONS[role];
          const selected = value === role;
          const styles = OPTION_STYLES[role];

          return (
            <label
              key={role}
              htmlFor={`role-${role}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border px-3.5 py-[13px] transition-colors",
                "has-[input:focus-visible]:outline-primary has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2",
                selected ? styles.selected : "border-border-2 bg-surface hover:bg-surface-2",
                error && !value ? "border-danger" : undefined,
              )}
            >
              <input
                id={`role-${role}`}
                type="radio"
                name="role"
                value={role}
                checked={selected}
                onChange={() => {
                  onChange(role);
                }}
                className={cn("mt-0.5 size-[17px] flex-none", styles.radio)}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-[11px] py-[5px] text-[12.5px] leading-[1.35] font-semibold",
                    styles.pill,
                  )}
                >
                  <Icon className="size-3.5" />
                  {ROLE_LABELS[role]}
                </span>
                <span className="text-muted-foreground mt-1.5 block text-[13px]">{DESCRIPTIONS[role]}</span>
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p className="text-danger-ink mt-1.5 flex items-center gap-1.5 text-[12.5px] font-medium">
          <CircleAlert className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
