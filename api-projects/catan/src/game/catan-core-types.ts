// Core types shared across engine, store, and UI

export type ResourceType =
  | 'Brick'
  | 'Lumber'
  | 'Wool'
  | 'Grain'
  | 'Ore'
  | 'Desert';

export const ResourceType = {
  Brick: 'Brick' as ResourceType,
  Lumber: 'Lumber' as ResourceType,
  Wool: 'Wool' as ResourceType,
  Grain: 'Grain' as ResourceType,
  Ore: 'Ore' as ResourceType,
  Desert: 'Desert' as ResourceType,
};

export type ResourceBundle = Partial<Record<ResourceType, number>>;

export type TileId = string;
export type NodeId = string; // settlement/city spot
export type EdgeId = string; // (reserved for roads later)

export interface Tile {
  id: TileId;
  resource: ResourceType;
  numberToken: number | null; // null for Desert
}

export interface PlayerState {
  id: string;
  name: string;
  resources: ResourceBundle;
  roads: Set<EdgeId>;
  settlements: Set<NodeId>;
  cities: Set<NodeId>;
  victoryPoints: number;
}

export type TurnPhase =
  | 'setupPlacement'
  | 'awaitingRoll'
  | 'awaitingActions'
  | 'awaitingRobberMove';

export interface PublicGameView {
  players: Array<Pick<PlayerState, 'id' | 'name' | 'victoryPoints'>>;
  robberOn: TileId;
  bank: ResourceBundle;
  tiles: Tile[];
  currentPlayerId: string | null;
  turn: number;
  phase: TurnPhase;

  // geometry / ownership for UI
  nodeOwnership: Record<NodeId, string | null>;
  nodeAdjacentTiles: Record<NodeId, TileId[]>;
  nodeAnchors: Record<NodeId, { tileId: TileId; cornerIndex: number }>;
}
