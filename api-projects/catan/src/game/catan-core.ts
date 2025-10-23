// ---------- Types & Enums ----------
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
export type EdgeId = string; // road spot

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
  | 'awaitingRoll'
  | 'awaitingRobberMove'
  | 'awaitingActions';

export interface PublicGameView {
  players: Array<Pick<PlayerState, 'id' | 'name' | 'victoryPoints'>>;
  robberOn: TileId;
  bank: ResourceBundle;
  tiles: Tile[];
  currentPlayerId: string | null;
  turn: number;
  phase: TurnPhase;
}

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

  async rollDice(): Promise<{
    dice1: number;
    dice2: number;
    total: number;
    source: 'api' | 'local';
  }> {
    try {
      const res = await fetch(this.endpoint, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Dice API HTTP ${res.status}`);

      const data = (await res.json()) as {
        dice: Array<{ value: number }>;
        total: number;
      };

      const [dice1, dice2] = [
        data.dice?.[0]?.value ?? 1,
        data.dice?.[1]?.value ?? 1,
      ];
      const total = typeof data.total === 'number' ? data.total : dice1 + dice2;

      if (
        ![dice1, dice2, total].every(
          (n) => Number.isInteger(n) && n >= 1 && n <= 12
        )
      ) {
        throw new Error('Dice API returned unexpected payload.');
      }
      return { dice1, dice2, total, source: 'api' };
    } catch {
      const dice1 = 1 + Math.floor(Math.random() * 6);
      const dice2 = 1 + Math.floor(Math.random() * 6);
      return { dice1, dice2, total: dice1 + dice2, source: 'local' };
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

function addBundles(a: ResourceBundle, b: ResourceBundle) {
  for (const key of Object.values(ResourceType)) {
    if (key === ResourceType.Desert) continue;
    a[key] = (a[key] ?? 0) + (b[key] ?? 0);
  }
}
function subBundles(a: ResourceBundle, b: ResourceBundle) {
  for (const key of Object.values(ResourceType)) {
    if (key === ResourceType.Desert) continue;
    a[key] = (a[key] ?? 0) - (b[key] ?? 0);
  }
}
function bundleCount(b: ResourceBundle): number {
  return Object.entries(b)
    .filter(([k]) => k !== ResourceType.Desert)
    .reduce((sum, [, v]) => sum + (v ?? 0), 0);
}

// ---------- Core Catan Engine ----------
export class CatanEngine {
  private tiles: Tile[];
  private bank: ResourceBundle;
  private players: Map<string, PlayerState>;
  private currentPlayerOrder: string[] = [];
  private currentIdx = 0;
  private robberOn: TileId;
  private turn = 0;
  private phase: TurnPhase = 'awaitingRoll';

  constructor(
    private readonly rng: IRandomService,
    private readonly trader: ITradingService,
    config?: { tiles?: Tile[]; initialBank?: ResourceBundle }
  ) {
    this.tiles = config?.tiles ?? createStandardLikeTileSet();
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
    this.phase = 'awaitingRoll';

    // --- SIMPLE STARTER SETUP ---
    // Give each player 1 free settlement and a small starter resource pack
    for (const p of this.players.values()) {
      const nodeId = `S-${p.id}-1`;
      p.settlements.add(nodeId);
      // starter pack so they can actually build/trade early (demo-friendly)
      addBundles(p.resources, {
        [ResourceType.Brick]: 1,
        [ResourceType.Lumber]: 1,
        [ResourceType.Wool]: 1,
        [ResourceType.Grain]: 1,
        [ResourceType.Ore]: 1,
      });
      // bank takes the opposite of what players received
      subBundles(this.bank, {
        [ResourceType.Brick]: 1,
        [ResourceType.Lumber]: 1,
        [ResourceType.Wool]: 1,
        [ResourceType.Grain]: 1,
        [ResourceType.Ore]: 1,
      });
    }
  }

  // ----- Turn Info -----
  get currentPlayer(): PlayerState | null {
    if (this.currentPlayerOrder.length === 0) return null;
    const id = this.currentPlayerOrder[this.currentIdx];
    return this.players.get(id) ?? null;
  }
  get currentPhase(): TurnPhase {
    return this.phase;
  }

  // ----- Dice & Distribution -----
  async rollAndDistribute(): Promise<{
    total: number;
    source: 'api' | 'local';
  }> {
    if (this.phase !== 'awaitingRoll') {
      throw new Error('Cannot roll right now. (Phase mismatch)');
    }
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

  private distributeFor(numberToken: number) {
    const tiles = this.tiles.filter(
      (t) => t.numberToken === numberToken && t.id !== this.robberOn
    );
    for (const tile of tiles) {
      if (tile.resource === ResourceType.Desert) continue;

      for (const player of this.players.values()) {
        // Simplified: total gains = settlements + 2*cities (no geometry)
        const settlementsCount = player.settlements.size;
        const citiesCount = player.cities.size;
        const gain = settlementsCount + 2 * citiesCount;

        if (gain <= 0) continue;

        const canBankGive = (this.bank[tile.resource] ?? 0) >= gain;
        const actual = canBankGive
          ? gain
          : Math.max(0, this.bank[tile.resource] ?? 0);

        if (actual > 0) {
          player.resources[tile.resource] =
            (player.resources[tile.resource] ?? 0) + actual;
          this.bank[tile.resource]! -= actual;
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

  moveRobber(toTile: TileId, stealFromPlayerId?: string) {
    if (this.phase !== 'awaitingRobberMove') {
      throw new Error('You can only move the robber now.');
    }
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
    // after moving robber, continue normal actions
    this.phase = 'awaitingActions';
  }

  // ----- Build (Actions phase only) -----
  private assertActionsPhase() {
    if (this.phase !== 'awaitingActions') {
      throw new Error('You can only do that after rolling (Actions phase).');
    }
  }

  buildRoad(playerId: string, edge: EdgeId): boolean {
    this.assertActionsPhase();
    const p = this.players.get(playerId);
    if (!p) return false;

    const cost: ResourceBundle = {
      [ResourceType.Brick]: 1,
      [ResourceType.Lumber]: 1,
    };
    if (!this.trader.hasResources(p, cost)) return false;
    subBundles(p.resources, cost);
    addBundles(this.bank, cost);
    p.roads.add(edge);
    return true;
  }

  buildSettlement(playerId: string, node: NodeId): boolean {
    this.assertActionsPhase();
    const p = this.players.get(playerId);
    if (!p) return false;

    const cost: ResourceBundle = {
      [ResourceType.Brick]: 1,
      [ResourceType.Lumber]: 1,
      [ResourceType.Wool]: 1,
      [ResourceType.Grain]: 1,
    };
    if (!this.trader.hasResources(p, cost)) return false;
    subBundles(p.resources, cost);
    addBundles(this.bank, cost);
    p.settlements.add(node);
    p.victoryPoints += 1;
    return true;
  }

  upgradeToCity(playerId: string, node: NodeId): boolean {
    this.assertActionsPhase();
    const p = this.players.get(playerId);
    if (!p || !p.settlements.has(node)) return false;

    const cost: ResourceBundle = {
      [ResourceType.Grain]: 2,
      [ResourceType.Ore]: 3,
    };
    if (!this.trader.hasResources(p, cost)) return false;
    subBundles(p.resources, cost);
    addBundles(this.bank, cost);
    p.settlements.delete(node);
    p.cities.add(node);
    p.victoryPoints += 1; // settlement(1) -> city(2): net +1
    return true;
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

  // ----- End Turn -----
  nextPlayer() {
    if (this.phase !== 'awaitingActions') {
      throw new Error('You must finish the roll (and robber, if any) first.');
    }
    this.currentIdx = (this.currentIdx + 1) % this.currentPlayerOrder.length;
    this.turn += 1;
    this.phase = 'awaitingRoll';
  }

  // ----- Views -----
  getPublicState(): PublicGameView {
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
    };
  }

  // ----- Internals -----
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

// ---------- Minimal board factory ----------
function createStandardLikeTileSet(): Tile[] {
  const ids = Array.from({ length: 19 }, (_, i) => `T${i + 1}`);
  const resources: ResourceType[] = [
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

  const numbers = [
    5,
    2,
    6,
    3,
    8,
    10,
    9,
    12,
    11,
    4,
    8,
    10,
    9,
    4,
    5,
    6,
    3,
    11,
    null,
  ] as Array<number | null>;

  return ids.map((id, idx) => ({
    id,
    resource: resources[idx],
    numberToken:
      resources[idx] === ResourceType.Desert ? null : (numbers[idx] as number),
  }));
}
