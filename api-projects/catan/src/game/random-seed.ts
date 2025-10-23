// random-seed.ts
// ------------------------------------------------------------
// Dohvata 32-bitni seed iz DRAND-a.
// U Vite proxy-ju imamo mapiranje:
//   '/drand' -> 'https://api.drand.sh'
// pa ovaj kod poziva '/drand/public/latest' bez CORS problema.
//
// Napomena:
// - DRAND vraća heksadecimalni string "randomness" (~32 bajta).
// - Mi "presavijamo" prvih 8 bajtova (16 hex karaktera) u jedan uint32
//   pomoću shift + XOR. Ovo je dovoljno za deterministički shuffle pločica.
// - Ovo NIJE kriptografski seed za sigurnosne svrhe — već praktičan,
//   javan izvor entropije da dobijemo stabilnu randomizaciju po pozivu.
// ------------------------------------------------------------

/**
 * fetchDrandSeed32
 * - radi GET na /drand/public/latest (preko Vite proxy-ja),
 * - čita polje `randomness` (hex string),
 * - uzima prvih 16 hex karaktera (8 bajtova),
 * - presavija u 32-bitni broj (`>>> 0` osigurava uint32),
 * - vraća taj broj kao seed.
 */
export async function fetchDrandSeed32(): Promise<number> {
  // `cache: 'no-store'` — uvek dovuci svež odgovor (bez keširanja),
  // pošto DRAND ima novi "round" na ~12 sekundi.
  const res = await fetch('/drand/public/latest', { cache: 'no-store' });
  if (!res.ok) throw new Error('drand HTTP ' + res.status);

  // Odgovor sadrži polje `randomness` (hex string).
  const j = (await res.json()) as { randomness?: string };

  // Ako polje ne postoji ili je prekratko, prekidamo sa greškom.
  // 16 hex karaktera = 8 bajtova, dovoljno za 32-bitni seed
  const hex = j.randomness ?? '';
  if (hex.length < 16) throw new Error('drand: insufficient randomness');

  // "Presavijamo" prvih 8 bajtova u 32-bitni integer.
  // uzimamo po jedan bajt, i kombinujemo ga u `seed`
  // pomeranjem ulevo za 8 bita i XOR-ovanjem.
  let seed = 0;

  // Svaka 2 hex karaktera predstavljaju 1 bajt (0..255).
  // Petlja: i = 0,2,4,...,14 -> ukupno 8 bajtova.
  for (let i = 0; i < 16; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    // (seed << 8) — pomeri postojeće bajtove ulevo (pravimo mesta),
    // ^ (byte & 0xff) — XOR sa novim bajtom (maskiran radi sigurnosti),
    // >>> 0 — forsira unsigned 32-bit (uklanja znak).
    seed = ((seed << 8) ^ (byte & 0xff)) >>> 0;
  }

  // Za svaki slučaj, još jednom forsiramo uint32.
  return seed >>> 0;
}

/*
Dodatne napomene:

1) Vite proxy (vite.config.ts):
   server: {
     proxy: {
       '/drand': {
         target: 'https://api.drand.sh',
         changeOrigin: true,
         secure: true,
         rewrite: (p) => p.replace(/^\/drand/, ''),
       },
     },
   }

2) Šta ako fetch padne (offline / CORS / drand nedostupan)?
   - Ovaj helper trenutno baca grešku; u `init()` store-a hvataš tu grešku
     i padaš na deterministički fallback (npr. standard board ili Math.random()).

3) Zašto uzimamo samo 8 bajtova a ne ceo string?
   - Dovoljno je za 32-bitni seed koji koristimo uz PRNG (mulberry32)
     za deterministički shuffle. Može i više, ali ovde je dovoljno 8.
*/
