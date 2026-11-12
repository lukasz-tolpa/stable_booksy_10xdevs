import React, { useState } from "react";
import { UserRound } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";

interface Props {
  serverError?: string | null;
}

export default function InstructorForm({ serverError }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    // Komunikat musi brzmieć tak samo jak w `newInstructorSchema`.
    if (!name.trim()) {
      setError("Podaj nazwę instruktora");
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/instructors/create" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="Nazwa instruktora"
        value={name}
        onChange={(v) => {
          setName(v);
          if (error) setError(undefined);
        }}
        placeholder="np. Ania Nowicka"
        error={error}
        icon={<UserRound className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Dodawanie..." icon={<UserRound className="size-4" />}>
        Dodaj instruktora
      </SubmitButton>
    </form>
  );
}
