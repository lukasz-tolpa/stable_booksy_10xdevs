/**
 * Stajnia — ikona roli „Ośrodek".
 *
 * Wcześniej stał tu `Building2` z lucide, czyli biurowiec. Przy stadninie koni
 * czytał się jak firma, a nie jak miejsce, w którym stoją konie.
 *
 * Ta sama technika co w `HorseHead`: rysunek pochodzi z generatora obrazów, więc
 * źródłem jest raster. Bitmapa jest MASKĄ, a widać przez nią `currentColor`, dzięki
 * czemu ikona przyjmuje kolor pigułki roli — zielony w pasku, ciemny na kartach.
 * Zwykły `<img>` by tego nie potrafił.
 *
 * Rysunek jest celowo ubogi: sam dach, dwie ściany i jedne wrota, grubą linią.
 * Pierwsza wersja miała okno na strychu i krzyżowe wrota — przy 14 px zlewały się
 * w plamę i trzeba było się wpatrywać, żeby rozpoznać budynek.
 *
 * Maska ma 72 px przy ikonie rysowanej w 14–16 px, więc zostaje ostra także przy
 * potrójnej gęstości pikseli. Waży 2,2 kB i siedzi tutaj jako data URI.
 *
 * Uwaga przy odświeżaniu maski: sharp nie wykonuje operacji w kolejności wywołań,
 * więc `negate()` potrafi trafić PO `resize()` i wtedy czarne wypełnienie marginesu
 * wychodzi białe, czyli w pełni widoczne — ikona dostaje paski na górze i na dole.
 * Maskę trzeba budować w dwóch przebiegach: najpierw trim i negacja do bufora,
 * dopiero z niego skalowanie.
 */

const MASKA =
  "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAMAAABiM0N1AAAB+FBMVEVMaXEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgZs0dAAAAp3RSTlMAAwX9/gQCAfz7goG9x5WXv7XAvoP62ZaU7PnrerTuIoSKvO0d79IVdPgl296JNdcz8cYH6hQGDyQhe33IceeYnIA/8lFDQp7wF98RLQnF2IXl9CgNuRwLn88Yc164FveT1Hg24St/4KmbeeLLj0SORwg8WUzJ0WZLSYa6U8FlrBsmKeYewiojWzpVDE6nzTBtaejjrUUZLgpypnYTxPYvkWBhtw5o9VHMSFgAAAAJcEhZcwAAA+gAAAPoAbV7UmsAAAXySURBVHja3Vj1e9w4EH1e27KdbXrtJZt2kybbUJM0Ze6VmfHaXpnhCsfMzMzMoH/zZiTZlmxvv9yvVbL7ObbneebNmxk5wL27osKC/vIirHmkp9nXHB6mT1+z2VzRt2DzErogtAlZ6l9jUQFFV8IIYwt3y0A6K5ATu96ji8K1YbwIxgFzCdobgY82vCX9xA/cFfty6cI9fAObpO5nkeQYahFM+H6PDBKffNA+BalrfhzIjWeOceS5DVwgc0Z4wOPrJT+c7BJn8akgCeTk2RqE55hmhyY0vrxoZiDjWD1eFpZGJ68+fT6C55WTZI4gBOafbPCtgfLp9uFbD8yZM4c/9HX9kALRT3jpA0QClUDkD84PbtM3M0MDHSsRWTrBsfEvCZ+v0kOSTx6E5/iRHXlYsoBoMTde2PQ2ZbqWrbBGmjg9uNQ8iO7Y/TGZpKRYTAu0vpINc1P82n6jPdiJiNDa1auggiCRo/vhlTziiL+WDUPmK1tBZMJSCDKoJf0mGYkcCnNRZh6F+EImJDrfl/NeFpzeCiLB+cCjndLn/MXycuoSMjEIvNvkkgjk3ueecGEKgFQh4VM9kuUqj17JgsseJo7TE+jyghGIsJxR+wxxt+cQI8Vy2QG4QB7GGSfw5XasihyRVq1VeDrwA0Z6EZ5VIvTHom0cWCLvyxOBvJpLmB4u0s2cu51knNcvlh/UgS1eCVHBMkohYt88Do4ys09bqM7k4bAKLAheQBi1jyhDIXFgZxKkMSjdK5wdDX3yMQ7MaSttffKwUKrSlh8iTFvZ6me1m6dWO4HZSiu5KfDQM4RE6bk6wlZg4qbrwHq3wmuT8ahc6B6enAhU5h5WQAixXfoqsG5DEKqximdDrFPBxfJVOqZaPbFXi+vgAVQYtadeYPk7KhTZRx2Ffn7Ufx1dpANDphtUx2Tx/dlS7uexPE7FjD8N+RvYvyiaukdc6J+rkRXLW8D8jTpjR0ZSsd+F5pK+X7+hq/ffK9jMUufjjd/Ai6a0UscFdhzRQ5QzN2nmKVH2JqWxulKrskD+vLEiM76NO7LhqzHTKwfhVZsUCiRjaJCMVEttyHn4h4PU7g0h+j8LOCfN6ONUYfzGcOcdyUnsSgsEU0PENK4ReWp98+plHh6rWyTRJGCg6i1OOyFgiIASuQ6tvwmGeAnRoYBmMNm2dPNvEYkKj7pkHHBleZEelctRJ2AGciogLBeFJ6wpp4DIsI5VQiehZoDutzcXIqrc3wmbbO1RR9aPQgYKXCDaTmzuXNbprGXrT863G5Yiu0FAnhFNLQtN5E3/28lUF/beb/J0llnyaJoKrQO1yAWyPOLx1BuXVq/8CaETmg2EGmfNBQp116ROmu8g1bifpaz0piPzKDQehhmQyIFmy9KGzQGKTGgNSn/NiDgFygUJBUQ+XBgeGB2gNTo68KvUw6cGh2zbozS0GTmR2qNYXhxb02qtXbu2teb878rK8ijK049URw5HUGTPVqe2qOmnBuJ1OqE8yjtL5lEp/ZHLUczxex4JWvDDYhuoHBoTUjccCTdrsZpQRg8dlkdmOHQVgHIdtQfih7keiXJoYVVoOZDep2ELlREDhW76razZykaJIy9lv17maKhtaJaOShzVFUezpkK2U2sljjrc9JeAYIcmiumfm866uwLVCh5V6Gium/6GC9TVpo2Yng0ra3PTppVy1C402GRXpD/1CI4g013cNNOzjY5Q8KgNUD0t2rbVH+XV73CU2ByFJrTplUDqxR1FZaOCbIS2jkwkFf2o7vajPDR9k+qi9XI/yjiqVrZumrPUqe68H22pUnZylykCV9k1oVatWGsohRYpshuBTbapNdp8Le4xazG/zhU8GmojyK5izw6KA7KCowZxVAYqhMZzLVt6rk23x9FQaa79IRvJhLyJ7F8eIc5UT9ofssZG/N+UE0mvPJsJkt5POgl7xXf5q67A2KXy7PflJet9zsNvfWT2y/fqlH73wM/1c5uumXuUSgVGBmf2zzSrn4766XvwhPufi2ub/uoeS1/87tn1H19odXb3bWKCAAAAAElFTkSuQmCC)";

interface Props {
  /** Klasy Tailwinda, zwykle `size-4` albo `size-3.5`. */
  className?: string;
}

export function StableBarn({ className }: Props) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: "inline-block",
        backgroundColor: "currentColor",
        maskImage: MASKA,
        WebkitMaskImage: MASKA,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
