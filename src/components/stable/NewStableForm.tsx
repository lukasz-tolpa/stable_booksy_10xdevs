import React, { useState } from "react";
import { Building2, MapPin } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";

interface Props {
  serverError?: string | null;
}

export default function NewStableForm({ serverError }: Props) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [errors, setErrors] = useState<{ name?: string; city?: string }>({});

  function validate() {
    const next: typeof errors = {};

    // Komunikaty muszą brzmieć tak samo jak w `newStableSchema` - przy wyłączonym
    // JavaScripcie użytkownik zobaczy wersję serwerową i nie może dostać innego zdania.
    if (!name.trim()) {
      next.name = "Podaj nazwę stadniny";
    }

    if (!city.trim()) {
      next.city = "Podaj miejscowość";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/stables/create" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="Nazwa stadniny"
        value={name}
        onChange={(v) => {
          setName(v);
          clearError("name");
        }}
        placeholder="np. Stadnina Pod Dębem"
        error={errors.name}
        icon={<Building2 className="size-4" />}
      />

      <FormField
        id="city"
        label="Miejscowość"
        value={city}
        onChange={(v) => {
          setCity(v);
          clearError("city");
        }}
        placeholder="np. Kraków"
        error={errors.city}
        icon={<MapPin className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Zapisywanie..." icon={<Building2 className="size-4" />}>
        Załóż stadninę
      </SubmitButton>
    </form>
  );
}
