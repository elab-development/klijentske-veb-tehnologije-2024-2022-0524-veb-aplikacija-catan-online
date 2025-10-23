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
export type NodeId = string;

export interface Tile {
  id: TileId;
  resource: ResourceType;
  numberToken: number | null;
}

export interface PlayerState {
  id: string;
  name: string;
  resources: ResourceBundle;
  settlements: Set<NodeId>;
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

  nodeOwnership: Record<NodeId, string | null>;
  nodeAdjacentTiles: Record<NodeId, TileId[]>;
  nodeAnchors: Record<NodeId, { tileId: TileId; cornerIndex: number }>;
}
