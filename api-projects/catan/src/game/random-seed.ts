// Fetch a 32-bit seed from drand's latest public randomness.
// Uses Vite dev proxy: '/drand/public/latest' -> https://api.drand.sh/public/latest
export async function fetchDrandSeed32(): Promise<number> {
  const res = await fetch('/drand/public/latest', { cache: 'no-store' });
  if (!res.ok) throw new Error('drand HTTP ' + res.status);
  const j = (await res.json()) as { randomness?: string };
  const hex = j.randomness ?? '';
  if (hex.length < 16) throw new Error('drand: insufficient randomness');
  let seed = 0;
  // fold first 8 bytes (16 hex chars) into 32-bit seed
  for (let i = 0; i < 16; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    seed = ((seed << 8) ^ (byte & 0xff)) >>> 0;
  }
  return seed >>> 0;
}
