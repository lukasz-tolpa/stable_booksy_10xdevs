import { Eye, EyeOff } from "lucide-react";

/**
 * Przełącznik widoczności hasła: kwadrat 36 px wewnątrz pola, po prawej.
 * Etykieta dostępna zmienia się razem ze stanem - to jedyna informacja
 * o tym, co przycisk zrobi, bo ikona jest dekoracją.
 */

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
}

export function PasswordToggle({ visible, onToggle }: PasswordToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:outline-primary absolute right-1.5 inline-flex size-9 items-center justify-center rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      aria-label={visible ? "Ukryj hasło" : "Pokaż hasło"}
    >
      {visible ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
    </button>
  );
}
