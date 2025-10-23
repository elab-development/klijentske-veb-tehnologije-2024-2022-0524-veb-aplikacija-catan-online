// board-presets.ts
// ------------------------------------------------------------
// Generiše standardnu Catan tablu sa 19 hex pločica
// i svih 54 čvora (temena) gde se postavljaju naselja.
// Čvorovi se postavljaju po pixel koordinatama uglova hexa da
// bismo dobili ispravne susede i pravilo razdaljine.
// ------------------------------------------------------------
import { ResourceType, type Tile, type TileId } from './catan-core-types';

/**
 * NodeId — identifikator teme (čvora) na kom se gradi naselje.
 * NodeDef — kompletna definicija jednog čvora:
 *  - adjacentTiles: koje pločice dodiruju ovo teme (1..3 kom)
 *  - neighborNodes: čvorovi na koje se ide jednom ivicom — koristi se za pravilo razdaljine
 *  - anchorTileId + cornerIndex: “sidro” za računanje pixel pozicije u SVG-u
 */
export type NodeId = string;
export interface NodeDef {
  id: NodeId;
  adjacentTiles: TileId[];
  neighborNodes: NodeId[];
  anchorTileId: TileId;
  cornerIndex: number;
}

/**
 * Axial koordinate (q, r) — standardni sistem za hex mape
 * Koristimo "flat-top" orijentaciju
 */
type Axial = { q: number; r: number };

// ====== Pomoćne funkcije za pixel geometriju ======
const SQRT3 = Math.sqrt(3);

/**
 * axialToPixel — konverzija axial (q,r) u piksel (x,y) za dati "radius" heksa (size).
 * Formula za flat-top:
 *   x = size * (3/2) * q
 *   y = size * (sqrt(3) * (r + q/2))
 * Ovo daje centar heksa u pikselima.
 */
export function axialToPixel(q: number, r: number, size: number) {
  const x = size * (3 / 2) * q;
  const y = size * (SQRT3 * (r + q / 2));
  return { x, y };
}

/**
 * hexCornerOffset — pomera se od centra do određenog ugla hexa (0..5).
 * Za flat-top, ugao i = 60° * i.
 * Vraća delta (dx, dy) koju sabiramo sa pozicijom centra.
 */
export function hexCornerOffset(size: number, cornerIndex: number) {
  const angle = (Math.PI / 180) * (60 * cornerIndex);
  return { dx: size * Math.cos(angle), dy: size * Math.sin(angle) };
}

// ====== 19 pločica (hex mreža radijusa 2) ======

/**
 * generateAxialCenters(radius=2) — generiše axial koordinate
 * centara hexova za “disk” radijusa 2 (ukupno 19 polja).
 */
const generateAxialCenters = (radius = 2): Axial[] => {
  const out: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) out.push({ q, r });
  }
  out.sort((a, b) => a.r - b.r || a.q - b.q);
  return out;
};

// ====== Osnovni “pool-ovi” (resursi i brojevi) ======

/**
 * BASE_RESOURCE_POOL — raspored resursa kao u osnovnoj Catan igri
 * (3 Brick, 4 Lumber, 4 Wool, 4 Grain, 3 Ore, 1 Desert).
 * Koristimo kao bazu za tablu.
 */
export const BASE_RESOURCE_POOL = [
  ResourceType.Brick,
  ResourceType.Brick,
  ResourceType.Brick,
  ResourceType.Lumber,
  ResourceType.Lumber,
  ResourceType.Lumber,
  ResourceType.Lumber,
  ResourceType.Wool,
  ResourceType.Wool,
  ResourceType.Wool,
  ResourceType.Wool,
  ResourceType.Grain,
  ResourceType.Grain,
  ResourceType.Grain,
  ResourceType.Grain,
  ResourceType.Ore,
  ResourceType.Ore,
  ResourceType.Ore,
  ResourceType.Desert,
] as const;

/**
 * BASE_NUMBER_TOKENS — standardna lista brojeva-žetona bez 7
 * (7 ne ide na pločicu; on aktivira lopova)
 * Ova lista se u determinističkom buildu dodeljuje redom,
 * a u randomizovanom — meša se.
 */
export const BASE_NUMBER_TOKENS: number[] = [
  5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11,
];

// ====== Deterministički standard (fallback) =====

/**
 * Ovo je “stabilna” tabla bez pravog randoma: sve osim centra je non-Desert,
 * centar je Desert. Brojevi idu redom iz BASE_NUMBER_TOKENS.
 * Korisno kao fallback kada nema seeda/random API-ja.
 */
const _nonDesert = BASE_RESOURCE_POOL.filter((r) => r !== ResourceType.Desert);
let _ndIdx = 0;
const nextNonDesert = () => _nonDesert[_ndIdx++ % _nonDesert.length];

/**
 * buildStandard19Tiles():
 *  - pravi 19 hexova sa ID T1..T19,
 *  - određuje koordinate (axialById),
 *  - stavlja Desert u centru (0,0),
 *  - dodeljuje brojeve (Desert nema broj — null).
 */
function buildStandard19Tiles(): {
  tiles: Tile[];
  axialById: Record<TileId, Axial>;
} {
  const centers = generateAxialCenters(2);
  const axialById: Record<TileId, Axial> = {};
  const tiles: Tile[] = [];
  let nIdx = 0;

  for (let i = 0; i < centers.length; i++) {
    const id = `T${i + 1}`;
    const isCenter = centers[i].q === 0 && centers[i].r === 0;
    const resource = isCenter ? ResourceType.Desert : nextNonDesert();
    const numberToken = isCenter ? null : BASE_NUMBER_TOKENS[nIdx++];
    tiles.push({ id, resource, numberToken });
    axialById[id] = centers[i];
  }

  return { tiles, axialById };
}

/**
 * buildNodesFromTiles():
 *  - prolazi kroz svaku pločicu, računa njenih 6 uglova u pikselima,
 *  - popunjavaju se temena (ako dva heksa dele ugao → isti NodeId),
 *  - za svaku pločicu povezuju se susedni uglovi (ring) kao neighborNodes,
 *  - prave se liste adjacentTiles po čvoru.
 * Ovo nam daje tačne veze i pravilo razdaljine
 */
function buildNodesFromTiles(
  tiles: Tile[],
  axialById: Record<TileId, Axial>
): NodeDef[] {
  // SIZE je arbitrarno za postavljanje
  const SIZE = 100;
  // PREC = koliko precizno zaokružujemo pixel koordinate
  const PREC = 1000;
  const cornerKey = (x: number, y: number) =>
    `${Math.round(x * PREC)},${Math.round(y * PREC)}`;

  // Mapa: "x,y" → Node info (id + sidro)
  const cornerToNode = new Map<
    string,
    { id: NodeId; anchorTileId: TileId; cornerIndex: number }
  >();
  let nodeSeq = 1;

  // Skup pločica koje dodiruju node, i skup suseda node-a
  const nodeTiles = new Map<NodeId, Set<TileId>>();
  const nodeNeighbors = new Map<NodeId, Set<NodeId>>();

  for (const tile of tiles) {
    const axial = axialById[tile.id];
    const center = axialToPixel(axial.q, axial.r, SIZE);

    // Skupljamo node-ove (temena) ove pločice
    const cornerNodes: NodeId[] = [];
    for (let ci = 0; ci < 6; ci++) {
      const { dx, dy } = hexCornerOffset(SIZE, ci);
      const x = center.x + dx;
      const y = center.y + dy;
      const key = cornerKey(x, y);

      // Ako node za ove koordinate ne postoji, kreiraj ga
      let info = cornerToNode.get(key);
      if (!info) {
        info = { id: `N${nodeSeq++}`, anchorTileId: tile.id, cornerIndex: ci };
        cornerToNode.set(key, info);
        nodeTiles.set(info.id, new Set());
        nodeNeighbors.set(info.id, new Set());
      }

      // Poveži ovaj node sa trenutnom pločicom
      nodeTiles.get(info.id)!.add(tile.id);
      cornerNodes.push(info.id);
    }

    // Poveži susedne uglove (ring od 6 ivica) — ovo formira neighborNodes
    for (let i = 0; i < 6; i++) {
      const a = cornerNodes[i];
      const b = cornerNodes[(i + 1) % 6];
      nodeNeighbors.get(a)!.add(b);
      nodeNeighbors.get(b)!.add(a);
    }
  }

  // Sortiraj node-ove po brojčanom delu ID-a (N1, N2, ...)
  const infos = [...cornerToNode.values()].sort(
    (A, B) => Number(A.id.slice(1)) - Number(B.id.slice(1))
  );

  // Pretvori interne strukture u NodeDef
  return infos.map((info) => ({
    id: info.id,
    adjacentTiles: [...(nodeTiles.get(info.id) ?? new Set())],
    neighborNodes: [...(nodeNeighbors.get(info.id) ?? new Set())].sort(
      (A, B) => Number(A.slice(1)) - Number(B.slice(1))
    ),
    anchorTileId: info.anchorTileId,
    cornerIndex: info.cornerIndex,
  }));
}

// ====== Kreiramo determinističku tablu jednom (fallback) ======
const built = buildStandard19Tiles();
export const standard19Tiles: Tile[] = built.tiles;
export const axialByTileId: Record<TileId, Axial> = built.axialById;
export const standard19Nodes: NodeDef[] = buildNodesFromTiles(
  standard19Tiles,
  axialByTileId
);

// ====== Randomizovana tabla (seeded PRNG) ======

/**
 * mulberry32 — mali, brz PRNG za 32-bitni seed
 * Vraća funkciju rand() koja daje [0,1) pseudo-random vrednosti.
 */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * seededShuffle — Fisher–Yates shuffle uz dati rand().
 * Ne menja original; vraća novu izmešanu kopiju niza.
 */
function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * randomizedStandard19Tiles(seed):
 *  - meša raspored RESURSA i BROJEVA istim seedom
 *  - zadržava ISTE pozicije centara (T1..T19) kao standard19Tiles,
 *  - Desert dobija numberToken = null, ostali uzimaju brojeve iz izmešanog pool-a.
 * Koristi se u init() store-a da svaka partija ima drugačiji raspored.
 */
export function randomizedStandard19Tiles(seed: number): Tile[] {
  const rand = mulberry32(seed >>> 0); // >>> 0 osigurava ne-negativno uint32

  const resources = seededShuffle([...BASE_RESOURCE_POOL], rand);
  const numbers = seededShuffle([...BASE_NUMBER_TOKENS], rand);

  const out: Tile[] = [];
  let nIdx = 0;
  for (let i = 0; i < standard19Tiles.length; i++) {
    const id = standard19Tiles[i].id;
    const resource = resources[i];
    const numberToken =
      resource === ResourceType.Desert ? null : numbers[nIdx++];
    out.push({ id, resource, numberToken });
  }
  return out;
}
