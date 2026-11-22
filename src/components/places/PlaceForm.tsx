import React, { useState } from "react";
import { MapPin } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { newPlaceSchema } from "@/lib/places/schemas";

/** Dodanie placu (#113); walidacja tym samym schematem co na serwerze, więc komunikaty brzmią tak samo. */
export default function PlaceForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const result = newPlaceSchema.safeParse({ name });
    if (!result.success) {
      setError(result.error.issues[0]?.message);
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/places/create" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="Nazwa placu"
        value={name}
        onChange={(v) => {
          setName(v);
          if (error) setError(undefined);
        }}
        placeholder="np. Duży plac"
        error={error}
        icon={<MapPin className="size-4" />}
      />

      <SubmitButton pendingText="Dodawanie..." icon={<MapPin className="size-4" />}>
        Dodaj plac
      </SubmitButton>
    </form>
  );
}
