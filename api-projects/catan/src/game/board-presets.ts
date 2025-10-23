// Generates the standard 19-tile board (flat-top hex) plus 54 settlement nodes.
// Nodes are deduped by pixel corner position to ensure correct neighbor links.

import { ResourceType, type Tile, type TileId } from './catan-core-types';

export type NodeId = string;
export interface NodeDef {
  id: NodeId;
  adjacentTiles: TileId[]; // tiles touching this corner (1..3)
  neighborNodes: NodeId[]; // corners one edge away (distance rule)
  anchorTileId: TileId; // for rendering position
  cornerIndex: number; // 0..5 (which corner of anchor tile)
}

type Axial = { q: number; r: number };

// ----- Pixel helpers for rendering (flat-top hex) -----
const SQRT3 = Math.sqrt(3);
export function axialToPixel(q: number, r: number, size: number) {
  const x = size * (3 / 2) * q;
  const y = size * (SQRT3 * (r + q / 2));
  return { x, y };
}
export function hexCornerOffset(size: number, cornerIndex: number) {
  const angle = (Math.PI / 180) * (60 * cornerIndex);
  return { dx: size * Math.cos(angle), dy: size * Math.sin(angle) };
}

// ----- 19 tiles (radius 2) -----
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

// ---- Base pools (exported for randomized builder) ----
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

export const BASE_NUMBER_TOKENS: number[] = [
  5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11,
];

// ---- Deterministic standard board (kept as a stable fallback) ----
const _nonDesert = BASE_RESOURCE_POOL.filter((r) => r !== ResourceType.Desert);
let _ndIdx = 0;
const nextNonDesert = () => _nonDesert[_ndIdx++ % _nonDesert.length];

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

// Dedup corners using pixel coordinates
function buildNodesFromTiles(
  tiles: Tile[],
  axialById: Record<TileId, Axial>
): NodeDef[] {
  const SIZE = 100;
  const PREC = 1000;
  const cornerKey = (x: number, y: number) =>
    `${Math.round(x * PREC)},${Math.round(y * PREC)}`;

  const cornerToNode = new Map<
    string,
    { id: NodeId; anchorTileId: TileId; cornerIndex: number }
  >();
  let nodeSeq = 1;

  const nodeTiles = new Map<NodeId, Set<TileId>>();
  const nodeNeighbors = new Map<NodeId, Set<NodeId>>();

  for (const tile of tiles) {
    const axial = axialById[tile.id];
    const center = axialToPixel(axial.q, axial.r, SIZE);

    const cornerNodes: NodeId[] = [];
    for (let ci = 0; ci < 6; ci++) {
      const { dx, dy } = hexCornerOffset(SIZE, ci);
      const x = center.x + dx;
      const y = center.y + dy;
      const key = cornerKey(x, y);

      let info = cornerToNode.get(key);
      if (!info) {
        info = { id: `N${nodeSeq++}`, anchorTileId: tile.id, cornerIndex: ci };
        cornerToNode.set(key, info);
        nodeTiles.set(info.id, new Set());
        nodeNeighbors.set(info.id, new Set());
      }
      nodeTiles.get(info.id)!.add(tile.id);
      cornerNodes.push(info.id);
    }

    // connect ring neighbors around this tile (edges)
    for (let i = 0; i < 6; i++) {
      const a = cornerNodes[i];
      const b = cornerNodes[(i + 1) % 6];
      nodeNeighbors.get(a)!.add(b);
      nodeNeighbors.get(b)!.add(a);
    }
  }

  const infos = [...cornerToNode.values()].sort(
    (A, B) => Number(A.id.slice(1)) - Number(B.id.slice(1))
  );

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

// Build once (deterministic fallback)
const built = buildStandard19Tiles();
export const standard19Tiles: Tile[] = built.tiles;
export const axialByTileId: Record<TileId, Axial> = built.axialById;
export const standard19Nodes: NodeDef[] = buildNodesFromTiles(
  standard19Tiles,
  axialByTileId
);

// ---------- Randomized board (seeded) ----------
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build a randomized copy of the standard 19 tiles using a 32-bit seed. */
export function randomizedStandard19Tiles(seed: number): Tile[] {
  const rand = mulberry32(seed >>> 0);

  const resources = seededShuffle([...BASE_RESOURCE_POOL], rand);
  const numbers = seededShuffle([...BASE_NUMBER_TOKENS], rand);

  const out: Tile[] = [];
  let nIdx = 0;
  for (let i = 0; i < standard19Tiles.length; i++) {
    const id = standard19Tiles[i].id; // keep positions
    const resource = resources[i];
    const numberToken =
      resource === ResourceType.Desert ? null : numbers[nIdx++];
    out.push({ id, resource, numberToken });
  }
  return out;
}
