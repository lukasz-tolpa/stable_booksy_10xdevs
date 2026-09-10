# Follow-up: slot zajęty przez innego jeźdźca

**Status:** świadomie poza zakresem zmiany `ui-redesign` (2026-09-10).

## Co jest w prototypie, a czego nie ma w aplikacji

`context/changes/ui-redesign/design/jezdziec-sloty.html` ma w legendzie **trzy** stany
slotu, aplikacja renderuje dwa:

| Stan prototypu                | Klasa              | W aplikacji                              |
| ----------------------------- | ------------------ | ---------------------------------------- |
| wolny                         | `.slot.slot-free`  | tak, jako `<button>` w formularzu zapisu |
| własny zapis                  | `.slot.slot-mine`  | tak, jako `<span>` w kasztanie           |
| **zajęty przez kogoś innego** | `.slot.slot-taken` | **nie renderowany wcale**                |

W prototypie zajęty slot to wyszarzona pigułka `--surface-3` / `--muted`
z `aria-disabled="true"`, a nie wyłączony przycisk:

```html
<span class="slot slot-taken" aria-disabled="true">Kasztan</span>
```

Dziś taki koń po prostu znika z danej godziny. Jeśli wszystkie konie w godzinie są
zajęte, znika cała godzina, a gdy zajęte są wszystkie godziny — strona pokazuje
„Brak wolnych slotów tego dnia.".

## Dlaczego nie teraz

Zmiana `ui-redesign` jest z definicji wizualna: „No changes under `src/lib/**`".
Dorobienie trzeciego stanu wymaga zmiany logiki i danych, nie stylu, więc trafiłoby
poza zadeklarowany zakres i poza to, co przeglądał `/10x-plan-review`.

## Co trzeba by zmienić

1. **`src/lib/bookings/slots.ts`**
   - `SlotStatus` rozszerzyć o `"taken"`: `type SlotStatus = "free" | "mine" | "taken"`.
   - W pętli `computeSlotSections` gałąź `else if (!taken.has(key))` zastąpić pełnym
     rozgałęzieniem, tak żeby zajęty koń trafiał do wyniku ze statusem `"taken"`
     zamiast być pomijany. Kolejność sprawdzeń zostaje: `mine` przed `taken`, bo
     własny zapis występuje również w zajętości.
   - Uwaga na warunek `if (horses.length > 0)` niżej: po zmianie godzina z samymi
     zajętymi slotami przestanie znikać, więc trzeba świadomie zdecydować, czy ma
     się pokazywać, czy nadal być pomijana.

2. **`src/lib/bookings/slots.test.ts`** (24 testy) — dotknięte są przypadki, które
   dziś asertują nieobecność zajętego konia. Trzeba dopisać test na to, że zajęty
   slot pojawia się ze statusem `"taken"`, oraz przejrzeć testy pustej godziny.

3. **`src/pages/jezdziec/osrodki/[id].astro`** — trzecia gałąź w mapowaniu
   `section.horses.map(...)`, renderująca `<span class="slot slot--taken" aria-disabled="true">`
   z samą nazwą konia. Style: `background: var(--surface-3)`, `color: var(--muted)`,
   bez cienia, `cursor: default`.

4. **`e2e/rider-loop.spec.ts`** — scenariusz asertuje dziś, że po zajęciu slotu
   przycisk **znika** (`toHaveCount(0)` na `bookButton`). Po zmianie przycisk nadal
   znika, ale w wierszu pojawia się nowy element z nazwą konia, więc trzeba
   sprawdzić, czy `hourSection(...).getByText(...)` nie zacznie trafiać w dwa
   elementy naraz. To jest realne ryzyko, nie teoretyczne — dokładnie ta klasa
   pułapki wywróciła sprawdzenie stanów błędu w fazie 3.

## Czy w ogóle to robić

Argument za: jeździec widzi, że godzina istnieje, ale koń jest zajęty, zamiast
domyślać się z pustego miejsca. To pełniejszy obraz dnia w ośrodku.

Argument przeciw: PRD nie wymaga pokazywania cudzej zajętości, a RLS celowo nie
wydaje tożsamości innego jeźdźca — RPC `get_taken_slots` zwraca tylko `(horse_id, hour)`.
Pokazanie samego „zajęte" niczego nie ujawnia, więc bariera prywatności nie jest
przeszkodą, ale i korzyść jest umiarkowana. Decyzja należy do właściciela produktu.
