import { Building2, CircleAlert, User } from "lucide-react";
import { ROLE_LABELS, USER_ROLES } from "@/lib/auth/constants";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

/**
 * Wybór rodzaju konta. Zrealizowany na natywnych polach radio o wspólnej nazwie `role`,
 * więc wartość dojeżdża do serwera także przy wyłączonym JavaScripcie - stan Reacta
 * służy wyłącznie podświetleniu wybranej opcji i czyszczeniu błędu.
 */

const DESCRIPTIONS: Record<UserRole, string> = {
  stable: "Układasz grafik jazd, wskazujesz konie i przyjmujesz zapisy.",
  rider: "Przeglądasz ośrodki i zapisujesz się na jazdy.",
};

const ICONS: Record<UserRole, typeof Building2> = {
  stable: Building2,
  rider: User,
};

interface RoleSelectProps {
  value: UserRole | "";
  onChange: (value: UserRole) => void;
  error?: string;
}

export function RoleSelect({ value, onChange, error }: RoleSelectProps) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm text-blue-100/80">Rodzaj konta</legend>
      <div className="space-y-2">
        {USER_ROLES.map((role) => {
          const Icon = ICONS[role];
          const selected = value === role;

          return (
            <label
              key={role}
              htmlFor={`role-${role}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors",
                selected ? "border-purple-400 bg-white/15" : "border-white/20 bg-white/5 hover:bg-white/10",
                error && !value ? "border-red-400/60" : undefined,
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
                className="mt-1 accent-purple-400"
              />
              <span className="flex-1">
                <span className="flex items-center gap-2 text-sm font-medium text-white">
                  <Icon className="size-4" />
                  {ROLE_LABELS[role]}
                </span>
                <span className="mt-0.5 block text-xs text-blue-100/60">{DESCRIPTIONS[role]}</span>
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
