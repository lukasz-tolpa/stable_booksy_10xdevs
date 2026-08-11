import React, { useState } from "react";
import { PawPrint, StickyNote } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";

interface Props {
  serverError?: string | null;
}

export default function HorseForm({ serverError }: Props) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<{ name?: string }>({});

  function validate() {
    const next: typeof errors = {};

    // Komunikat musi brzmieć tak samo jak w `newHorseSchema`.
    if (!name.trim()) {
      next.name = "Podaj imię konia";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/horses/create" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="Imię konia"
        value={name}
        onChange={(v) => {
          setName(v);
          if (errors.name) setErrors({});
        }}
        placeholder="np. Bella"
        error={errors.name}
        icon={<PawPrint className="size-4" />}
      />

      <FormField
        id="notes"
        label="Notatka (opcjonalnie)"
        value={notes}
        onChange={setNotes}
        placeholder="np. spokojna, dobra dla początkujących"
        icon={<StickyNote className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Dodawanie..." icon={<PawPrint className="size-4" />}>
        Dodaj konia
      </SubmitButton>
    </form>
  );
}
