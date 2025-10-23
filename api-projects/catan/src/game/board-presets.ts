// Generates the standard 19-tile Catan-like board (flat-top hex layout)
// + all 54 settlement nodes (corners), including neighbors and an anchor
// (tile + corner index) for deterministic screen coordinates.

import { ResourceType, type Tile, type TileId } from './catan-core-types';

export type NodeId = string;
export interface NodeDef {
  id: NodeId;
  adjacentTiles: TileId[]; // tiles touching this corner (1..3)
  neighborNodes: NodeId[]; // corners one edge away (distance rule)
  anchorTileId: TileId; // for rendering position
  cornerIndex: number; // 0..5 (which corner of the anchor tile)
}

type Axial = { q: number; r: number };
type Cube = { x: number; y: number; z: number };

// ----- axial/cube helpers (flat-top) -----
const axialToCube = ({ q, r }: Axial): Cube => {
  const x = q,
    z = r,
    y = -x - z;
  return { x, y, z };
};

// Integer-scaled 6 corner offsets for identity keys (not for pixels)
const CORNERS: ReadonlyArray<[number, number, number]> = [
  [2, -1, -1], // 0
  [1, 1, -2], // 1
  [-1, 2, -1], // 2
  [-2, 1, 1], // 3
  [-1, -1, 2], // 4
  [1, -2, 1], // 5
];
const cornerKeyForCenter = (c: Cube, cornerIndex: number): string => {
  const o = CORNERS[cornerIndex];
  const cx = 2 * c.x + o[0];
  const cy = 2 * c.y + o[1];
  const cz = 2 * c.z + o[2];
  return `${cx},${cy},${cz}`;
};

// ----- 19 tiles (radius 2) -----
const generateAxialCenters = (radius = 2): Axial[] => {
  const out: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) out.push({ q, r });
  }
  // Sort row-wise: r asc, then q asc -> rows 3/4/5/4/3
  out.sort((a, b) => a.r - b.r || a.q - b.q);
  return out;
};

const RESOURCE_POOL: ResourceType[] = [
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
];
const NUMBER_TOKENS: number[] = [
  5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11,
];

const _nonDesert = RESOURCE_POOL.filter((r) => r !== ResourceType.Desert);
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
    let resource: ResourceType;
    let numberToken: number | null;

    if (isCenter) {
      resource = ResourceType.Desert;
      numberToken = null;
    } else {
      resource = nextNonDesert();
      numberToken = NUMBER_TOKENS[nIdx++];
    }
    tiles.push({ id, resource, numberToken });
    axialById[id] = centers[i];
  }

  return { tiles, axialById };
}

function buildNodesFromTiles(
  tiles: Tile[],
  axialById: Record<TileId, Axial>
): NodeDef[] {
  const cubeCenters = Object.fromEntries(
    tiles.map((t) => [t.id, axialToCube(axialById[t.id])])
  );

  const cornerToNode = new Map<
    string,
    { id: string; anchorTileId: TileId; cornerIndex: number }
  >();
  let nodeSeq = 1;

  const nodeTiles = new Map<string, Set<TileId>>();
  const nodeNeighbors = new Map<string, Set<string>>();

  for (const tile of tiles) {
    const c = cubeCenters[tile.id];
    const nodeIdsForCorners: string[] = [];

    for (let ci = 0; ci < 6; ci++) {
      const key = cornerKeyForCenter(c, ci);
      let nodeInfo = cornerToNode.get(key);
      if (!nodeInfo) {
        nodeInfo = {
          id: `N${nodeSeq++}`,
          anchorTileId: tile.id,
          cornerIndex: ci,
        };
        cornerToNode.set(key, nodeInfo);
        nodeTiles.set(nodeInfo.id, new Set());
        nodeNeighbors.set(nodeInfo.id, new Set());
      }
      nodeTiles.get(nodeInfo.id)!.add(tile.id);
      nodeIdsForCorners.push(nodeInfo.id);
    }

    // connect neighbors around this hex
    for (let ci = 0; ci < 6; ci++) {
      const a = nodeIdsForCorners[ci];
      const b = nodeIdsForCorners[(ci + 1) % 6];
      nodeNeighbors.get(a)!.add(b);
      nodeNeighbors.get(b)!.add(a);
    }
  }

  // Emit stable list
  const nodeInfos = [...cornerToNode.values()].sort(
    (A, B) => Number(A.id.slice(1)) - Number(B.id.slice(1))
  );

  const nodeDefs: NodeDef[] = nodeInfos.map((info) => {
    const neighbors = [...(nodeNeighbors.get(info.id) ?? new Set())].sort(
      (A, B) => Number(A.slice(1)) - Number(B.slice(1))
    );
    const tilesSet = nodeTiles.get(info.id) ?? new Set<TileId>();
    return {
      id: info.id,
      adjacentTiles: [...tilesSet],
      neighborNodes: neighbors,
      anchorTileId: info.anchorTileId,
      cornerIndex: info.cornerIndex,
    };
  });

  return nodeDefs;
}

// Build once (deterministic)
const built = buildStandard19Tiles();
export const standard19Tiles: Tile[] = built.tiles;
export const axialByTileId: Record<TileId, Axial> = built.axialById;
export const standard19Nodes: NodeDef[] = buildNodesFromTiles(
  standard19Tiles,
  axialByTileId
);

// ----- Pixel helpers for rendering (flat-top hex) -----
const SQRT3 = Math.sqrt(3);
export function axialToPixel(q: number, r: number, size: number) {
  const x = size * (3 / 2) * q;
  const y = size * (SQRT3 * (r + q / 2));
  return { x, y };
}

export function hexCornerOffset(size: number, cornerIndex: number) {
  const angle = (Math.PI / 180) * (60 * cornerIndex); // 0°, 60°, 120°...
  return { dx: size * Math.cos(angle), dy: size * Math.sin(angle) };
}
