import { ResourceType, type Tile, type TileId } from './catan-core-types';

/**
 * Mini Catan board (7 tiles: 1 center + 6 around it)
 * Tiles: T1..T7
 * Nodes: N1..N18
 *
 * Enough to demonstrate:
 * - Initial settlement placement with distance rule
 * - Adjacency-based production (nodes touch up to 3 tiles)
 * - Robber blocking
 */

export const miniTiles: Tile[] = [
  { id: 'T1', resource: ResourceType.Grain, numberToken: 8 },
  { id: 'T2', resource: ResourceType.Brick, numberToken: 5 },
  { id: 'T3', resource: ResourceType.Lumber, numberToken: 6 },
  { id: 'T4', resource: ResourceType.Wool, numberToken: 9 },
  { id: 'T5', resource: ResourceType.Ore, numberToken: 4 },
  { id: 'T6', resource: ResourceType.Grain, numberToken: 10 },
  { id: 'T7', resource: ResourceType.Desert, numberToken: null }, // robber starts here
];

export type NodeId = string;
export interface NodeDef {
  id: NodeId;
  adjacentTiles: TileId[]; // up to 3
  neighborNodes: NodeId[]; // 1-edge away (for distance rule)
}

export const miniNodes: NodeDef[] = [
  // Around T1 (center): 6 inner nodes shared with ring tiles
  { id: 'N1', adjacentTiles: ['T1', 'T2'], neighborNodes: ['N2', 'N6', 'N7'] },
  { id: 'N2', adjacentTiles: ['T1', 'T3'], neighborNodes: ['N1', 'N3', 'N8'] },
  { id: 'N3', adjacentTiles: ['T1', 'T4'], neighborNodes: ['N2', 'N4', 'N9'] },
  { id: 'N4', adjacentTiles: ['T1', 'T5'], neighborNodes: ['N3', 'N5', 'N10'] },
  { id: 'N5', adjacentTiles: ['T1', 'T6'], neighborNodes: ['N4', 'N6', 'N11'] },
  { id: 'N6', adjacentTiles: ['T1', 'T7'], neighborNodes: ['N5', 'N1', 'N12'] },

  // Outer exclusive corners for ring tiles (2 each)
  { id: 'N7', adjacentTiles: ['T2'], neighborNodes: ['N1', 'N13'] },
  { id: 'N8', adjacentTiles: ['T3'], neighborNodes: ['N2', 'N14'] },
  { id: 'N9', adjacentTiles: ['T4'], neighborNodes: ['N3', 'N15'] },
  { id: 'N10', adjacentTiles: ['T5'], neighborNodes: ['N4', 'N16'] },
  { id: 'N11', adjacentTiles: ['T6'], neighborNodes: ['N5', 'N17'] },
  { id: 'N12', adjacentTiles: ['T7'], neighborNodes: ['N6', 'N18'] },

  // Outer-most “shared-ish” nodes to enforce spacing
  { id: 'N13', adjacentTiles: ['T2', 'T3'], neighborNodes: ['N7', 'N14'] },
  {
    id: 'N14',
    adjacentTiles: ['T3', 'T4'],
    neighborNodes: ['N8', 'N13', 'N15'],
  },
  {
    id: 'N15',
    adjacentTiles: ['T4', 'T5'],
    neighborNodes: ['N9', 'N14', 'N16'],
  },
  {
    id: 'N16',
    adjacentTiles: ['T5', 'T6'],
    neighborNodes: ['N10', 'N15', 'N17'],
  },
  {
    id: 'N17',
    adjacentTiles: ['T6', 'T7'],
    neighborNodes: ['N11', 'N16', 'N18'],
  },
  { id: 'N18', adjacentTiles: ['T7', 'T2'], neighborNodes: ['N12', 'N17'] },
];
