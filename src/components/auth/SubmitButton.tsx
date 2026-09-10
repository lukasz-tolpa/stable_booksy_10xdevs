import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * Przycisk wysyłki formularza auth: pigułka `--primary` na całą szerokość karty.
 * Wygląd bierze się z wariantu `default` w `@/components/ui/button`, więc tutaj
 * zostaje wyłącznie szerokość i podmiana etykiety na czas wysyłki.
 */

interface SubmitButtonProps {
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
  /** `accent` to kasztanowa pigułka - jedno wezwanie do działania na ekranie grafiku. */
  variant?: "default" | "accent";
}

export function SubmitButton({ pendingText, icon, children, variant = "default" }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={pending} className="w-full">
      {pending ? (
        <span className="flex items-center gap-2">
          <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          {pendingText}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {icon}
          {children}
        </span>
      )}
    </Button>
  );
}
