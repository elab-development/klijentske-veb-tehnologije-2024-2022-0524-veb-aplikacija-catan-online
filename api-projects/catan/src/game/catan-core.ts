import {
  ResourceType,
  type ResourceBundle,
  type Tile,
  type TileId,
  type NodeId,
  type EdgeId,
  type PlayerState,
  type TurnPhase,
  type PublicGameView,
} from './catan-core-types';
import { miniTiles, miniNodes } from './board-presets';

// ---------- Interfaces ----------
export interface IRandomService {
  rollDice(): Promise<{
    dice1: number;
    dice2: number;
    total: number;
    source: 'api' | 'local';
  }>;
}
export interface ITradingService {
  tradeWithBank(
    player: PlayerState,
    bank: ResourceBundle,
    give: ResourceBundle,
    receive: ResourceBundle
  ): boolean;
  hasResources(player: PlayerState, bundle: ResourceBundle): boolean;
}

// ---------- Dice API client ----------
export class DiceApiRandomService implements IRandomService {
  private endpoint = 'https://roll.diceapi.com/json/2d6';
  async rollDice() {
    try {
      const res = await fetch(this.endpoint, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Dice API HTTP ${res.status}`);
      const data = (await res.json()) as {
        dice: Array<{ value: number }>;
        total: number;
      };
      const d1 = data.dice?.[0]?.value ?? 1;
      const d2 = data.dice?.[1]?.value ?? 1;
      const total = typeof data.total === 'number' ? data.total : d1 + d2;
      if (
        ![d1, d2, total].every((n) => Number.isInteger(n) && n >= 1 && n <= 12)
      ) {
        throw new Error('Dice API payload invalid');
      }
      return { dice1: d1, dice2: d2, total, source: 'api' as const };
    } catch {
      const d1 = 1 + Math.floor(Math.random() * 6);
      const d2 = 1 + Math.floor(Math.random() * 6);
      return { dice1: d1, dice2: d2, total: d1 + d2, source: 'local' as const };
    }
  }
}

// ---------- Helpers ----------
const EMPTY_BUNDLE = (): ResourceBundle => ({
  [ResourceType.Brick]: 0,
  [ResourceType.Lumber]: 0,
  [ResourceType.Wool]: 0,
  [ResourceType.Grain]: 0,
  [ResourceType.Ore]: 0,
  [ResourceType.Desert]: 0,
});
const addBundles = (a: ResourceBundle, b: ResourceBundle) => {
  for (const k of Object.values(ResourceType))
    if (k !== ResourceType.Desert) a[k] = (a[k] ?? 0) + (b[k] ?? 0);
};
const subBundles = (a: ResourceBundle, b: ResourceBundle) => {
  for (const k of Object.values(ResourceType))
    if (k !== ResourceType.Desert) a[k] = (a[k] ?? 0) - (b[k] ?? 0);
};
const bundleCount = (b: ResourceBundle) =>
  Object.entries(b)
    .filter(([k, v]) => k !== ResourceType.Desert && typeof v === 'number')
    .reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0);

// ---------- Engine ----------
export class CatanEngine {
  private tiles: Tile[];
  private players: Map<string, PlayerState> = new Map();
  private bank: ResourceBundle;
  private currentPlayerOrder: string[] = [];
  private currentIdx = 0;
  private robberOn: TileId;
  private turn = 0;
  private phase: TurnPhase = 'setupPlacement';

  // Geometry state
  private nodeOwnership: Map<NodeId, string | null> = new Map();
  private nodeAdjacentTiles: Map<NodeId, TileId[]> = new Map();
  private nodeNeighbors: Map<NodeId, NodeId[]> = new Map();
  private initialPlacementsDone: Map<string, number> = new Map(); // playerId -> count (0..2)

  constructor(
    private readonly rng: IRandomService,
    private readonly trader: ITradingService,
    config?: { tiles?: Tile[]; initialBank?: ResourceBundle }
  ) {
    this.tiles = config?.tiles ?? miniTiles;
    this.robberOn =
      this.tiles.find((t) => t.resource === ResourceType.Desert)?.id ??
      this.tiles[0].id;
    this.bank = config?.initialBank ?? {
      [ResourceType.Brick]: 19,
      [ResourceType.Lumber]: 19,
      [ResourceType.Wool]: 19,
      [ResourceType.Grain]: 19,
      [ResourceType.Ore]: 19,
      [ResourceType.Desert]: 0,
    };

    // Seed geometry maps
    for (const n of miniNodes) {
      this.nodeOwnership.set(n.id, null);
      this.nodeAdjacentTiles.set(n.id, [...n.adjacentTiles]);
      this.nodeNeighbors.set(n.id, [...n.neighborNodes]);
    }
  }

  // ----- Setup -----
  addPlayer(id: string, name: string) {
    if (this.players.has(id)) throw new Error('Player id exists.');
    this.players.set(id, {
      id,
      name,
      resources: EMPTY_BUNDLE(),
      roads: new Set<EdgeId>(),
      settlements: new Set<NodeId>(),
      cities: new Set<NodeId>(),
      victoryPoints: 0,
    });
    this.currentPlayerOrder = Array.from(this.players.keys());
    this.initialPlacementsDone.set(id, 0);
  }

  startGame(firstPlayerId?: string) {
    if (this.players.size < 2) throw new Error('Need at least 2 players.');
    if (firstPlayerId && !this.players.has(firstPlayerId))
      throw new Error('Unknown first player.');

    if (firstPlayerId) {
      const order = Array.from(this.players.keys());
      const idx = order.indexOf(firstPlayerId);
      this.currentPlayerOrder = order.slice(idx).concat(order.slice(0, idx));
    }
    this.turn = 1;
    this.currentIdx = 0;
    this.phase = 'setupPlacement'; // everyone must place 2 settlements
  }

  get currentPlayer(): PlayerState | null {
    if (!this.currentPlayerOrder.length) return null;
    return this.players.get(this.currentPlayerOrder[this.currentIdx]) ?? null;
  }
  get currentPhase(): TurnPhase {
    return this.phase;
  }

  // ----- Placement helpers -----
  /** Distance rule: empty node & no adjacent node with a settlement/city */
  getAvailableSettlementSpots(): NodeId[] {
    const results: NodeId[] = [];
    for (const [nodeId, owner] of this.nodeOwnership.entries()) {
      if (owner) continue;
      const neighbors = this.nodeNeighbors.get(nodeId) ?? [];
      const blocked = neighbors.some((n) => !!this.nodeOwnership.get(n));
      if (!blocked) results.push(nodeId);
    }
    return results;
  }

  /** Setup placement (free). Each player places 2, then game moves to awaitingRoll. */
  placeInitialSettlement(playerId: string, nodeId: NodeId) {
    if (this.phase !== 'setupPlacement')
      throw new Error('Not in setup placement.');
    const player = this.players.get(playerId);
    if (!player) throw new Error('Unknown player');

    this.ensureSettlementSpot(nodeId); // throws if invalid
    this.nodeOwnership.set(nodeId, playerId);
    player.settlements.add(nodeId);
    player.victoryPoints += 1;

    const placed = (this.initialPlacementsDone.get(playerId) ?? 0) + 1;
    this.initialPlacementsDone.set(playerId, placed);

    // After all players have placed two, start normal turns
    const allDone = Array.from(this.initialPlacementsDone.values()).every(
      (c) => c >= 2
    );
    if (allDone) {
      this.phase = 'awaitingRoll';
    } else {
      // simple round robin (no snake to keep it lightweight)
      this.currentIdx = (this.currentIdx + 1) % this.currentPlayerOrder.length;
    }
  }

  /** Paid build during Actions phase */
  buildSettlementAt(playerId: string, nodeId: NodeId): boolean {
    this.assertActionsPhase();
    const p = this.players.get(playerId);
    if (!p) return false;
    if (!this.ensureSettlementSpot(nodeId, false)) return false;

    const cost: ResourceBundle = {
      [ResourceType.Brick]: 1,
      [ResourceType.Lumber]: 1,
      [ResourceType.Wool]: 1,
      [ResourceType.Grain]: 1,
    };
    if (!this.trader.hasResources(p, cost)) return false;

    subBundles(p.resources, cost);
    addBundles(this.bank, cost);

    this.nodeOwnership.set(nodeId, playerId);
    p.settlements.add(nodeId);
    p.victoryPoints += 1;
    return true;
  }

  upgradeToCity(playerId: string, nodeId: NodeId): boolean {
    this.assertActionsPhase();
    const p = this.players.get(playerId);
    if (!p || !p.settlements.has(nodeId)) return false;

    const cost: ResourceBundle = {
      [ResourceType.Grain]: 2,
      [ResourceType.Ore]: 3,
    };
    if (!this.trader.hasResources(p, cost)) return false;

    subBundles(p.resources, cost);
    addBundles(this.bank, cost);

    p.settlements.delete(nodeId);
    p.cities.add(nodeId);
    p.victoryPoints += 1; // settlement(1) -> city(2): net +1
    this.nodeOwnership.set(nodeId, playerId); // stays owned by same player
    return true;
  }

  // ----- Turn flow -----
  async rollAndDistribute(): Promise<{
    total: number;
    source: 'api' | 'local';
  }> {
    if (this.phase !== 'awaitingRoll') throw new Error('Cannot roll now.');
    const roll = await this.rng.rollDice();

    if (roll.total === 7) {
      this.handleRobberSeven();
      this.phase = 'awaitingRobberMove';
    } else {
      this.distributeFor(roll.total);
      this.phase = 'awaitingActions';
    }
    return { total: roll.total, source: roll.source };
  }

  moveRobber(toTile: TileId, stealFromPlayerId?: string) {
    if (this.phase !== 'awaitingRobberMove')
      throw new Error('You can only move the robber now.');
    if (!this.tiles.find((t) => t.id === toTile))
      throw new Error('Unknown tile.');
    this.robberOn = toTile;

    if (stealFromPlayerId) {
      const victim = this.players.get(stealFromPlayerId);
      const thief = this.currentPlayer;
      if (victim && thief) {
        const victimCards: Array<ResourceType> = [];
        for (const [res, qty] of Object.entries(victim.resources) as Array<
          [ResourceType, number]
        >) {
          for (let i = 0; i < (qty ?? 0); i++) victimCards.push(res);
        }
        if (victimCards.length > 0) {
          const idx = Math.floor(Math.random() * victimCards.length);
          const res = victimCards[idx];
          victim.resources[res]! -= 1;
          thief.resources[res] = (thief.resources[res] ?? 0) + 1;
        }
      }
    }
    this.phase = 'awaitingActions';
  }

  maritimeTrade(
    playerId: string,
    give: ResourceBundle,
    receive: ResourceBundle
  ): boolean {
    this.assertActionsPhase();
    const p = this.players.get(playerId);
    if (!p) return false;
    return this.trader.tradeWithBank(p, this.bank, give, receive);
  }

  nextPlayer() {
    if (this.phase !== 'awaitingActions')
      throw new Error('Finish your roll/robber before ending turn.');
    this.currentIdx = (this.currentIdx + 1) % this.currentPlayerOrder.length;
    this.turn += 1;
    this.phase = 'awaitingRoll';
  }

  // ----- Production using node adjacency -----
  private distributeFor(numberToken: number) {
    const hitTiles = this.tiles.filter(
      (t) => t.numberToken === numberToken && t.id !== this.robberOn
    );
    if (hitTiles.length === 0) return;

    const hitSet = new Set(hitTiles.map((t) => t.id));

    // For each owned node, pay for each adjacent hit tile
    for (const p of this.players.values()) {
      // settlements: +1 per hit adjacent tile
      for (const nodeId of p.settlements) {
        const tileIds = this.nodeAdjacentTiles.get(nodeId) ?? [];
        for (const tId of tileIds) {
          if (!hitSet.has(tId)) continue;
          const tile = this.tiles.find((t) => t.id === tId)!;
          if (tile.resource === ResourceType.Desert) continue;
          if ((this.bank[tile.resource] ?? 0) > 0) {
            p.resources[tile.resource] = (p.resources[tile.resource] ?? 0) + 1;
            this.bank[tile.resource]! -= 1;
          }
        }
      }
      // cities: +2 per hit adjacent tile
      for (const nodeId of p.cities) {
        const tileIds = this.nodeAdjacentTiles.get(nodeId) ?? [];
        for (const tId of tileIds) {
          if (!hitSet.has(tId)) continue;
          const tile = this.tiles.find((t) => t.id === tId)!;
          if (tile.resource === ResourceType.Desert) continue;
          const can = Math.min(2, this.bank[tile.resource] ?? 0);
          if (can > 0) {
            p.resources[tile.resource] =
              (p.resources[tile.resource] ?? 0) + can;
            this.bank[tile.resource]! -= can;
          }
        }
      }
    }
  }

  private handleRobberSeven() {
    for (const p of this.players.values()) {
      const total = bundleCount(p.resources);
      if (total >= 8) {
        const toDiscard = Math.floor(total / 2);
        this.discardEvenly(p, toDiscard);
      }
    }
  }

  // ----- Views -----
  getPublicState(): PublicGameView {
    const nodeOwnership: Record<NodeId, string | null> = {};
    const nodeAdjacentTiles: Record<NodeId, TileId[]> = {};
    for (const [n, owner] of this.nodeOwnership.entries())
      nodeOwnership[n] = owner;
    for (const [n, tiles] of this.nodeAdjacentTiles.entries())
      nodeAdjacentTiles[n] = tiles;

    return {
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        victoryPoints: p.victoryPoints,
      })),
      robberOn: this.robberOn,
      bank: { ...this.bank },
      tiles: [...this.tiles],
      currentPlayerId: this.currentPlayer?.id ?? null,
      turn: this.turn,
      phase: this.phase,
      nodeOwnership,
      nodeAdjacentTiles,
    };
  }

  /** Safe accessor for UI (avoids peeking internals) */
  getPlayerResources(playerId: string): ResourceBundle {
    const p = this.players.get(playerId);
    return p ? { ...p.resources } : {};
  }

  // ----- Internals -----
  private assertActionsPhase() {
    if (this.phase !== 'awaitingActions')
      throw new Error('You can only do that in the Actions phase.');
  }

  /** Validates node is empty & passes distance rule. Throws (setup) or returns boolean (actions). */
  private ensureSettlementSpot(
    nodeId: NodeId,
    throwOnFail: boolean = true
  ): boolean {
    if (!this.nodeOwnership.has(nodeId)) {
      if (throwOnFail) throw new Error('Unknown node.');
      return false;
    }
    if (this.nodeOwnership.get(nodeId)) {
      if (throwOnFail) throw new Error('Spot already taken.');
      return false;
    }
    const neighbors = this.nodeNeighbors.get(nodeId) ?? [];
    const blocked = neighbors.some((n) => !!this.nodeOwnership.get(n));
    if (blocked) {
      if (throwOnFail)
        throw new Error('Too close to another settlement (distance rule).');
      return false;
    }
    return true;
  }

  private discardEvenly(p: PlayerState, toDiscard: number) {
    const order: ResourceType[] = [
      ResourceType.Brick,
      ResourceType.Lumber,
      ResourceType.Wool,
      ResourceType.Grain,
      ResourceType.Ore,
    ];
    let remaining = toDiscard;
    while (remaining > 0) {
      let did = false;
      for (const res of order) {
        if ((p.resources[res] ?? 0) > 0 && remaining > 0) {
          p.resources[res]! -= 1;
          this.bank[res]! += 1;
          remaining -= 1;
          did = true;
        }
      }
      if (!did) break;
    }
  }
}

// ---------- Trading (4:1) ----------
export class FourToOneTradingService implements ITradingService {
  hasResources(player: PlayerState, bundle: ResourceBundle): boolean {
    for (const [res, qty] of Object.entries(bundle) as Array<
      [ResourceType, number]
    >) {
      if ((player.resources[res] ?? 0) < (qty ?? 0)) return false;
    }
    return true;
  }

  tradeWithBank(
    player: PlayerState,
    bank: ResourceBundle,
    give: ResourceBundle,
    receive: ResourceBundle
  ): boolean {
    const g = Object.entries(give).filter(
      ([_, v]) => typeof v === 'number' && v > 0
    ) as Array<[ResourceType, number]>;
    if (g.length !== 1) return false;
    const [giveType, giveQty] = g[0];
    if (giveType === ResourceType.Desert || giveQty % 4 !== 0) return false;

    const r = Object.entries(receive).filter(
      ([_, v]) => typeof v === 'number' && v > 0
    ) as Array<[ResourceType, number]>;
    if (r.length !== 1) return false;
    const [recvType, recvQty] = r[0];
    if (recvType === ResourceType.Desert || recvQty !== giveQty / 4)
      return false;

    if (!this.hasResources(player, give)) return false;
    if ((bank[recvType] ?? 0) < recvQty) return false;

    // execute
    for (const [res, qty] of g)
      player.resources[res] = (player.resources[res] ?? 0) - qty;
    for (const [res, qty] of g) bank[res] = (bank[res] ?? 0) + qty;

    bank[recvType]! -= recvQty;
    player.resources[recvType] = (player.resources[recvType] ?? 0) + recvQty;
    return true;
  }
}
