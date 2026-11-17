import React, { useState } from "react";
import { Link, Mail } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";

interface Props {
  instructorId: number;
  /** Nazwa instruktora w etykiecie pola — na liście stoi wiele takich formularzy. */
  instructorName: string;
  /** Adres poprzedniego zaproszenia przy „Zaproś ponownie”; pusty przy pierwszym. */
  defaultEmail?: string;
}

/** Bez `@` po czymś i przed czymś nie ma adresu; pełną walidację robi `inviteInstructorSchema`. */
const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+$/;

/**
 * Zaproszenie instruktora do konta (#74): adres, dla którego zaproszenie zadziała. Wysyłka
 * tworzy link do skopiowania — aplikacja niczego nie wysyła instruktorowi.
 */
export default function InviteForm({ instructorId, instructorName, defaultEmail = "" }: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState<string | undefined>();
  const fieldId = `invite-email-${String(instructorId)}`;

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    // Komunikat musi brzmieć tak samo jak INVITE_EMAIL_MESSAGE w `inviteInstructorSchema`.
    if (!LOOKS_LIKE_EMAIL.test(email.trim())) {
      setError("Podaj poprawny adres e-mail instruktora");
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/instructors/invite" className="space-y-3" onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="instructorId" value={instructorId} />
      <FormField
        id={fieldId}
        name="email"
        type="email"
        label={`Adres e-mail — ${instructorName}`}
        value={email}
        onChange={(v) => {
          setEmail(v);
          if (error) setError(undefined);
        }}
        placeholder="np. ania@example.com"
        error={error}
        hint={<p className="text-muted-foreground text-[12.5px]">Link zadziała tylko dla tego adresu, przez 7 dni.</p>}
        icon={<Mail className="size-4" />}
      />
      <SubmitButton pendingText="Tworzenie linku..." icon={<Link className="size-4" />}>
        Utwórz link zaproszenia
      </SubmitButton>
    </form>
  );
}
