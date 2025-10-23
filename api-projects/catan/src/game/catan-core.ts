import {
  ResourceType,
  type ResourceBundle,
  type Tile,
  type TileId,
  type NodeId,
  type PlayerState,
  type TurnPhase,
  type PublicGameView,
} from './catan-core-types';

import { standard19Tiles, standard19Nodes } from './board-presets';

// ---------- Interfaces (with methods) ----------
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

// ---------- Dice API client implementing IRandomService ----------
export class DiceApiRandomService implements IRandomService {
  // Use Vite proxy to avoid CORS in dev (vite.config.ts has /qrand proxy)
  private endpoint = '/qrand/api/random/dice?n=2';

  async rollDice(): Promise<{
    dice1: number;
    dice2: number;
    total: number;
    source: 'api' | 'local';
  }> {
    try {
      const res = await fetch(this.endpoint, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Dice API HTTP ${res.status}`);
      const data = (await res.json()) as { dice?: number[] };
      if (!Array.isArray(data.dice) || data.dice.length < 2) {
        throw new Error('Malformed payload (missing dice array).');
      }
      const [dice1, dice2] = data.dice;
      if (
        ![dice1, dice2].every((n) => Number.isInteger(n) && n >= 1 && n <= 6)
      ) {
        throw new Error('Dice out of range.');
      }
      return { dice1, dice2, total: dice1 + dice2, source: 'api' };
    } catch {
      const dice1 = 1 + Math.floor(Math.random() * 6);
      const dice2 = 1 + Math.floor(Math.random() * 6);
      return { dice1, dice2, total: dice1 + dice2, source: 'local' };
    }
  }
}

// ---------- utils ----------
const EMPTY_BUNDLE = (): ResourceBundle => ({
  [ResourceType.Brick]: 0,
  [ResourceType.Lumber]: 0,
  [ResourceType.Wool]: 0,
  [ResourceType.Grain]: 0,
  [ResourceType.Ore]: 0,
  [ResourceType.Desert]: 0,
});

function addBundles(target: ResourceBundle, delta: ResourceBundle) {
  for (const key of Object.values(ResourceType)) {
    if (key === ResourceType.Desert) continue;
    target[key] = (target[key] ?? 0) + (delta[key] ?? 0);
  }
}
function subBundles(target: ResourceBundle, delta: ResourceBundle) {
  for (const key of Object.values(ResourceType)) {
    if (key === ResourceType.Desert) continue;
    target[key] = (target[key] ?? 0) - (delta[key] ?? 0);
  }
}
function inc(bundle: ResourceBundle, res: ResourceType, by = 1) {
  if (res === ResourceType.Desert) return;
  bundle[res] = (bundle[res] ?? 0) + by;
}
function bundleCount(bundle: ResourceBundle): number {
  let sum = 0;
  for (const [k, v] of Object.entries(bundle)) {
    if (k === ResourceType.Desert) continue;
    sum += v ?? 0;
  }
  return sum;
}

// ---------- Engine Snapshot ----------
export type EngineSnapshot = {
  tiles: Tile[];
  bank: ResourceBundle;
  players: Array<{
    id: string;
    name: string;
    resources: ResourceBundle;
    settlements: NodeId[];
    victoryPoints: number;
  }>;
  order: string[];
  idx: number;
  robberOn: TileId;
  turn: number;
  phase: TurnPhase;
  nodeOwnership: Record<NodeId, string | null>;
  setupRound: number;
  setupDirection: 1 | -1;
};

// ---------- Core Catan Engine ----------
export class CatanEngine {
  private tiles: Tile[];
  private bank: ResourceBundle;
  private players: Map<string, PlayerState>;

  private currentPlayerOrder: string[] = [];
  private currentIdx = 0;
  private robberOn: TileId;
  private turn = 0;
  private phase: TurnPhase = 'setupPlacement';

  // setup placement snake
  private setupRound = 1; // 1 then 2
  private setupDirection: 1 | -1 = 1; // forward then reverse

  // geometry & ownership
  private nodeOwnership = new Map<NodeId, string | null>();
  private nodeAdjacentTiles = new Map<NodeId, TileId[]>();
  private nodeNeighbors = new Map<NodeId, NodeId[]>();
  private nodeAnchors = new Map<
    NodeId,
    { tileId: TileId; cornerIndex: number }
  >();
  private tileToNodes = new Map<TileId, NodeId[]>();

  constructor(
    private readonly rng: IRandomService,
    private readonly trader: ITradingService,
    config?: { tiles?: Tile[]; initialBank?: ResourceBundle }
  ) {
    this.tiles = config?.tiles ?? standard19Tiles;
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
    this.players = new Map();

    // seed geometry
    for (const n of standard19Nodes) {
      this.nodeOwnership.set(n.id, null);
      this.nodeAdjacentTiles.set(n.id, [...n.adjacentTiles]);
      this.nodeNeighbors.set(n.id, [...n.neighborNodes]);
      this.nodeAnchors.set(n.id, {
        tileId: n.anchorTileId,
        cornerIndex: n.cornerIndex,
      });
    }
    // reverse index: tile -> nodes touching it
    for (const [nodeId, tiles] of this.nodeAdjacentTiles.entries()) {
      for (const tid of tiles) {
        if (!this.tileToNodes.has(tid)) this.tileToNodes.set(tid, []);
        this.tileToNodes.get(tid)!.push(nodeId);
      }
    }
  }

  // ----- lifecycle -----
  addPlayer(id: string, name: string) {
    if (this.players.has(id)) throw new Error('Player id exists.');
    this.players.set(id, {
      id,
      name,
      resources: EMPTY_BUNDLE(),
      settlements: new Set<NodeId>(),
      victoryPoints: 0,
    });
    this.currentPlayerOrder = Array.from(this.players.keys());
  }

  startGame(firstPlayerId?: string) {
    if (this.players.size < 2) throw new Error('Need at least 2 players.');
    if (firstPlayerId && !this.players.has(firstPlayerId)) {
      throw new Error('Unknown first player.');
    }

    if (firstPlayerId) {
      const order = Array.from(this.players.keys());
      const idx = order.indexOf(firstPlayerId);
      this.currentPlayerOrder = order.slice(idx).concat(order.slice(0, idx));
    }

    this.turn = 1;
    this.currentIdx = 0;
    this.phase = 'setupPlacement';
    this.setupRound = 1;
    this.setupDirection = 1;
  }

  get currentPlayer(): PlayerState | null {
    if (this.currentPlayerOrder.length === 0) return null;
    const id = this.currentPlayerOrder[this.currentIdx];
    return this.players.get(id) ?? null;
  }

  // ----- setup placement -----
  getAvailableSettlementSpots(): NodeId[] {
    const spots: NodeId[] = [];
    for (const [nid, owner] of this.nodeOwnership.entries()) {
      if (owner) continue; // occupied
      // distance rule: no adjacent owned nodes
      const neighbors = this.nodeNeighbors.get(nid) ?? [];
      const blocked = neighbors.some(
        (n) => (this.nodeOwnership.get(n) ?? null) !== null
      );
      if (blocked) continue;
      spots.push(nid);
    }
    return spots;
  }

  placeInitialSettlement(playerId: string, nodeId: NodeId) {
    if (this.phase !== 'setupPlacement') throw new Error('Not in setup phase.');
    const p = this.players.get(playerId);
    if (!p) throw new Error('Unknown player.');
    if ((this.nodeOwnership.get(nodeId) ?? null) !== null)
      throw new Error('Spot occupied.');
    // enforce distance rule
    const neighbors = this.nodeNeighbors.get(nodeId) ?? [];
    if (neighbors.some((n) => (this.nodeOwnership.get(n) ?? null) !== null)) {
      throw new Error('Too close to another settlement.');
    }

    // place
    this.nodeOwnership.set(nodeId, playerId);
    p.settlements.add(nodeId);
    p.victoryPoints += 1;

    // advance snake order
    const lastIndex = this.currentPlayerOrder.length - 1;
    if (this.setupRound === 1) {
      if (this.currentIdx === lastIndex) {
        this.setupRound = 2;
        this.setupDirection = -1;
      } else {
        this.currentIdx++;
      }
    } else {
      // round 2
      if (this.currentIdx === 0) {
        // setup complete -> start normal turns from player 0
        this.phase = 'awaitingRoll';
        this.currentIdx = 0;
      } else {
        this.currentIdx--;
      }
    }
  }

  // ----- gameplay flow -----
  async rollAndDistribute(): Promise<{
    dice1: number;
    dice2: number;
    total: number;
    source: 'api' | 'local';
    gains?: Record<string, ResourceBundle>;
    discards?: Record<string, ResourceBundle>;
  }> {
    if (this.phase !== 'awaitingRoll') throw new Error('Cannot roll now.');
    const roll = await this.rng.rollDice();

    if (roll.total === 7) {
      // collect who discarded what
      const discards = this.handleRobberSeven();
      this.phase = 'awaitingRobberMove';
      return {
        dice1: roll.dice1,
        dice2: roll.dice2,
        total: roll.total,
        source: roll.source,
        discards: Object.fromEntries(discards.entries()),
      };
    } else {
      const gains = this.distributeFor(roll.total); // per-player resource gains
      this.phase = 'awaitingActions';
      return {
        dice1: roll.dice1,
        dice2: roll.dice2,
        total: roll.total,
        source: roll.source,
        gains: Object.fromEntries(gains.entries()),
      };
    }
  }

  nextPlayer() {
    if (this.phase !== 'awaitingActions')
      throw new Error('Finish actions first.');
    this.currentIdx = (this.currentIdx + 1) % this.currentPlayerOrder.length;
    this.turn += 1;
    this.phase = 'awaitingRoll';
  }

  moveRobber(
    toTile: TileId,
    stealFromPlayerId?: string
  ): { theft?: { from: string; to: string; resource: ResourceType } } | void {
    if (!this.tiles.find((t) => t.id === toTile))
      throw new Error('Unknown tile.');
    const wasAwaitingRobber = this.phase === 'awaitingRobberMove';

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
          if (wasAwaitingRobber) this.phase = 'awaitingActions';
          return { theft: { from: victim.id, to: thief.id, resource: res } };
        }
      }
    }

    if (wasAwaitingRobber) this.phase = 'awaitingActions';
  }

  // ----- internals producing per-player deltas -----
  private distributeFor(numberToken: number): Map<string, ResourceBundle> {
    const perPlayer = new Map<string, ResourceBundle>();

    const tiles = this.tiles.filter(
      (t) => t.numberToken === numberToken && t.id !== this.robberOn
    );

    for (const tile of tiles) {
      const nodes = this.tileToNodes.get(tile.id) ?? [];
      for (const nid of nodes) {
        const ownerId = this.nodeOwnership.get(nid);
        if (!ownerId) continue;
        const player = this.players.get(ownerId)!;

        const gain = 1; // settlements only (cities removed from your brief)
        const available = this.bank[tile.resource] ?? 0;
        if (available <= 0) continue;

        const actual = Math.min(gain, available);
        player.resources[tile.resource] =
          (player.resources[tile.resource] ?? 0) + actual;
        this.bank[tile.resource]! -= actual;

        const bundle = perPlayer.get(ownerId) ?? EMPTY_BUNDLE();
        inc(bundle, tile.resource, actual);
        perPlayer.set(ownerId, bundle);
      }
    }
    return perPlayer;
  }

  private handleRobberSeven(): Map<string, ResourceBundle> {
    const perPlayerLosses = new Map<string, ResourceBundle>();
    for (const p of this.players.values()) {
      const total = bundleCount(p.resources);
      if (total >= 8) {
        const toDiscard = Math.floor(total / 2);
        const lost = this.discardEvenly(p, toDiscard);
        if (bundleCount(lost) > 0) perPlayerLosses.set(p.id, lost);
      }
    }
    return perPlayerLosses;
  }

  private discardEvenly(p: PlayerState, toDiscard: number): ResourceBundle {
    const order: (keyof ResourceBundle)[] = [
      ResourceType.Brick,
      ResourceType.Lumber,
      ResourceType.Wool,
      ResourceType.Grain,
      ResourceType.Ore,
    ];
    const lost = EMPTY_BUNDLE();
    let remaining = toDiscard;
    while (remaining > 0) {
      let did = false;
      for (const res of order) {
        if ((p.resources[res] ?? 0) > 0 && remaining > 0) {
          p.resources[res]! -= 1;
          this.bank[res]! += 1;
          inc(lost, res, 1);
          remaining -= 1;
          did = true;
        }
      }
      if (!did) break;
    }
    return lost;
  }

  // ----- building settlements (paid during actions) -----
  buildSettlementAt(playerId: string, nodeId: NodeId): boolean {
    if (this.phase !== 'awaitingActions') throw new Error('Cannot build now.');
    const p = this.players.get(playerId);
    if (!p) return false;
    if ((this.nodeOwnership.get(nodeId) ?? null) !== null) return false;

    // distance rule
    const neighbors = this.nodeNeighbors.get(nodeId) ?? [];
    if (neighbors.some((n) => (this.nodeOwnership.get(n) ?? null) !== null))
      return false;

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

  maritimeTrade(
    playerId: string,
    give: ResourceBundle,
    receive: ResourceBundle
  ): boolean {
    const p = this.players.get(playerId);
    if (!p) return false;
    return this.trader.tradeWithBank(p, this.bank, give, receive);
  }

  // ----- info -----
  getPublicState(): PublicGameView {
    const nodeOwnership: Record<NodeId, string | null> = {};
    const nodeAdjacentTiles: Record<NodeId, TileId[]> = {};
    const nodeAnchors: Record<NodeId, { tileId: TileId; cornerIndex: number }> =
      {};

    for (const [nid, owner] of this.nodeOwnership.entries())
      nodeOwnership[nid] = owner ?? null;
    for (const [nid, tiles] of this.nodeAdjacentTiles.entries())
      nodeAdjacentTiles[nid] = [...tiles];
    for (const [nid, anchor] of this.nodeAnchors.entries())
      nodeAnchors[nid] = {
        tileId: anchor.tileId,
        cornerIndex: anchor.cornerIndex,
      };

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
      nodeAnchors,
    };
  }

  getPlayerResources(playerId: string): ResourceBundle {
    const p = this.players.get(playerId);
    return p ? { ...p.resources } : {};
  }

  exportState(): EngineSnapshot {
    const players = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      resources: { ...p.resources },
      settlements: Array.from(p.settlements),
      victoryPoints: p.victoryPoints,
    }));

    const nodeOwnership: Record<NodeId, string | null> = {};
    for (const [nid, owner] of this.nodeOwnership.entries()) {
      nodeOwnership[nid] = owner ?? null;
    }

    return {
      tiles: [...this.tiles],
      bank: { ...this.bank },
      players,
      order: [...this.currentPlayerOrder],
      idx: this.currentIdx,
      robberOn: this.robberOn,
      turn: this.turn,
      phase: this.phase,
      nodeOwnership,
      setupRound: this.setupRound,
      setupDirection: this.setupDirection,
    };
  }

  static importState(
    snapshot: EngineSnapshot,
    rng: IRandomService,
    trader: ITradingService
  ): CatanEngine {
    const eng = new CatanEngine(rng, trader, {
      tiles: snapshot.tiles,
      initialBank: snapshot.bank,
    });

    // rebuild players
    eng.players.clear();
    for (const p of snapshot.players) {
      eng.players.set(p.id, {
        id: p.id,
        name: p.name,
        resources: { ...p.resources },
        settlements: new Set<NodeId>(p.settlements),
        victoryPoints: p.victoryPoints,
      } as PlayerState);
    }

    // order/index/turn/phase/robber
    eng.currentPlayerOrder = [...snapshot.order];
    eng.currentIdx = snapshot.idx;
    eng.turn = snapshot.turn;
    eng.phase = snapshot.phase;
    eng.robberOn = snapshot.robberOn;

    // node ownership
    eng.nodeOwnership.clear();
    for (const [nid, owner] of Object.entries(snapshot.nodeOwnership)) {
      eng.nodeOwnership.set(nid as NodeId, owner);
    }

    // setup snake
    eng.setupRound = snapshot.setupRound;
    eng.setupDirection = snapshot.setupDirection;

    return eng;
  }
}

// ---------- Trading 4:1 ----------
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
    const entries = Object.entries(give).filter(
      ([_, v]) => (v ?? 0) > 0
    ) as Array<[ResourceType, number]>;
    if (entries.length !== 1) return false;

    const [giveType, giveQty] = entries[0];
    if (giveType === ResourceType.Desert) return false;
    if (giveQty % 4 !== 0) return false;

    const recvEntries = Object.entries(receive).filter(
      ([_, v]) => (v ?? 0) > 0
    ) as Array<[ResourceType, number]>;
    if (recvEntries.length !== 1) return false;
    const [recvType, recvQty] = recvEntries[0];
    if (recvType === ResourceType.Desert) return false;
    if (recvQty !== giveQty / 4) return false;

    if (!this.hasResources(player, give)) return false;
    if ((bank[recvType] ?? 0) < recvQty) return false;

    subBundles(player.resources, give);
    addBundles(bank, give);
    bank[recvType]! -= recvQty;
    player.resources[recvType] = (player.resources[recvType] ?? 0) + recvQty;
    return true;
  }
}
