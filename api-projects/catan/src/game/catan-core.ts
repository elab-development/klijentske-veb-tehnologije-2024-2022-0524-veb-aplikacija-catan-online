// catan-core.ts
// ------------------------------------------------------------
// Core engine za Catan logiku (bez UI). Ovde su pravila igre:
// - bacanje kockica (preko IRandomService)
// - inicijalno postavljanje naselja sa "snake" redosledom (setup phase)
// - raspodela resursa po broju žetona
// - lopov (discard na 7, pomeranje i krađa 1 karte)
// - plaćena gradnja naselja tokom poteza
// - trgovina 4:1 sa bankom (ITradingService)
// - snapshot/import radi localStorage persistence
// ------------------------------------------------------------

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

/**
 * IRandomService — apstrakcija za bacanje dve kockice (2d6).
 * Vraća i meta-informaciju 'source' (api/local) da UI može da prikaže izvor.
 */
export interface IRandomService {
  rollDice(): Promise<{
    dice1: number;
    dice2: number;
    total: number;
    source: 'api' | 'local';
  }>;
}

/**
 * ITradingService — apstrakcija pravila trgovine
 * hasResources: čista validacija da li igrač ima dovoljno resursa
 * tradeWithBank: mutira PlayerState i bank u skladu sa pravilom
 */
export interface ITradingService {
  tradeWithBank(
    player: PlayerState,
    bank: ResourceBundle,
    give: ResourceBundle,
    receive: ResourceBundle
  ): boolean;

  hasResources(player: PlayerState, bundle: ResourceBundle): boolean;
}

/**
 * DiceApiRandomService — client za bacanje kockica.
 * U dev-u koristimo Vite proxy (vite.config.ts) da izbegnemo CORS:
 *   '/qrand' -> 'https://qrandom.io'
 * Endpoint ispod koristi taj proxy.
 */
export class DiceApiRandomService implements IRandomService {
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

      // Očekujemo { dice: [d1, d2] } sa integerima 1..6
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
      // Fallback (offline / API ne radi): lokalno bacanje kockica
      const dice1 = 1 + Math.floor(Math.random() * 6);
      const dice2 = 1 + Math.floor(Math.random() * 6);
      return { dice1, dice2, total: dice1 + dice2, source: 'local' };
    }
  }
}

/**
 * EMPTY_BUNDLE — helper za kreiranje praznih početnih mapa resursa.
 * Držimo i Desert: 0 radi uniformnosti sabiranja/oduzimanja (iako se ne koristi kao karta).
 */
const EMPTY_BUNDLE = (): ResourceBundle => ({
  [ResourceType.Brick]: 0,
  [ResourceType.Lumber]: 0,
  [ResourceType.Wool]: 0,
  [ResourceType.Grain]: 0,
  [ResourceType.Ore]: 0,
  [ResourceType.Desert]: 0,
});

/** addBundles — sabira `delta` u `target` (ignoriše Desert) */
function addBundles(target: ResourceBundle, delta: ResourceBundle) {
  for (const key of Object.values(ResourceType)) {
    if (key === ResourceType.Desert) continue;
    target[key] = (target[key] ?? 0) + (delta[key] ?? 0);
  }
}

/** subBundles — oduzima `delta` iz `target` */
function subBundles(target: ResourceBundle, delta: ResourceBundle) {
  for (const key of Object.values(ResourceType)) {
    if (key === ResourceType.Desert) continue;
    target[key] = (target[key] ?? 0) - (delta[key] ?? 0);
  }
}
/** inc — poveća jednu stavku u bundle-u */
function inc(bundle: ResourceBundle, res: ResourceType, by = 1) {
  if (res === ResourceType.Desert) return;
  bundle[res] = (bundle[res] ?? 0) + by;
}

/** bundleCount — zbir svih karata */
function bundleCount(bundle: ResourceBundle): number {
  let sum = 0;
  for (const [k, v] of Object.entries(bundle)) {
    if (k === ResourceType.Desert) continue;
    sum += v ?? 0;
  }
  return sum;
}

/**
 * EngineSnapshot — serializable prikaz engine-a za localStorage.
 * - Set/Map se prevode u plain array/objekat forme.
 * - Dovoljno da se kasnije 1:1 obnovi engine preko importState().
 */
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
  order: string[]; // redosled igrača
  idx: number; // index tekućeg igrača u `order`
  robberOn: TileId;
  turn: number;
  phase: TurnPhase;
  nodeOwnership: Record<NodeId, string | null>;
  setupRound: number; // 1 ili 2
  setupDirection: 1 | -1; // 1 napred, -1 unazad
};

/**
 * CatanEngine - pravila igre.
 * Interno koristi Map/Set i pomoćne mape za geometriju (čvorovi i veze).
 * Spolja daje PublicGameView + spec. metode za akcije.
 */
export class CatanEngine {
  // stanje "table" i banke
  private tiles: Tile[];
  private bank: ResourceBundle;
  private players: Map<string, PlayerState>;

  // stanje poteza
  private currentPlayerOrder: string[] = [];
  private currentIdx = 0;
  private robberOn: TileId;
  private turn = 0;
  private phase: TurnPhase = 'setupPlacement';

  // stanje postavljanja (runda 1 napred, runda 2 nazad)
  private setupRound = 1; // 1 then 2
  private setupDirection: 1 | -1 = 1; // forward then reverse

  // geometrija & vlasništvo čvorova
  private nodeOwnership = new Map<NodeId, string | null>();
  private nodeAdjacentTiles = new Map<NodeId, TileId[]>();
  private nodeNeighbors = new Map<NodeId, NodeId[]>();
  private nodeAnchors = new Map<
    NodeId,
    { tileId: TileId; cornerIndex: number }
  >();
  private tileToNodes = new Map<TileId, NodeId[]>(); // obrnuti indeks: pločica -> njena temena

  constructor(
    private readonly rng: IRandomService, // izvor bacanja kockica
    private readonly trader: ITradingService, // 4:1 pravila
    config?: { tiles?: Tile[]; initialBank?: ResourceBundle }
  ) {
    // pločice: iz config-a ili standardnih 19
    this.tiles = config?.tiles ?? standard19Tiles;

    // lopov se postavlja na pustinji (ako nema, onda prva pločica)
    this.robberOn =
      this.tiles.find((t) => t.resource === ResourceType.Desert)?.id ??
      this.tiles[0].id;

    // inicijalna banka (osnovna igra ima po 19 za svaku kartu resursa)
    this.bank = config?.initialBank ?? {
      [ResourceType.Brick]: 19,
      [ResourceType.Lumber]: 19,
      [ResourceType.Wool]: 19,
      [ResourceType.Grain]: 19,
      [ResourceType.Ore]: 19,
      [ResourceType.Desert]: 0,
    };
    this.players = new Map();

    // --- seeding geometrije iz standard19Nodes ---
    for (const n of standard19Nodes) {
      this.nodeOwnership.set(n.id, null);
      this.nodeAdjacentTiles.set(n.id, [...n.adjacentTiles]);
      this.nodeNeighbors.set(n.id, [...n.neighborNodes]);
      this.nodeAnchors.set(n.id, {
        tileId: n.anchorTileId,
        cornerIndex: n.cornerIndex,
      });
    }

    // obrnuti indeks: za svaku pločicu znamo koja temena je dodiruju
    for (const [nodeId, tiles] of this.nodeAdjacentTiles.entries()) {
      for (const tid of tiles) {
        if (!this.tileToNodes.has(tid)) this.tileToNodes.set(tid, []);
        this.tileToNodes.get(tid)!.push(nodeId);
      }
    }
  }

  // ----- lifecycle -----

  /**
   * addPlayer — ubacuje novog igrača. ID mora biti jedinstven.
   * Puni resurse praznim bundle-om; VP = 0; skup naselja prazan.
   */
  addPlayer(id: string, name: string) {
    if (this.players.has(id)) throw new Error('Player id exists.');
    this.players.set(id, {
      id,
      name,
      resources: EMPTY_BUNDLE(),
      settlements: new Set<NodeId>(),
      victoryPoints: 0,
    });
    // svaki put kad se izmeni skup igrača, regeneriši redosled
    this.currentPlayerOrder = Array.from(this.players.keys());
  }

  /**
   * startGame — validira da imamo >=2 igrača
   * Setup kreće u 'setupPlacement'
   */
  startGame(firstPlayerId?: string) {
    if (this.players.size < 2) throw new Error('Need at least 2 players.');
    if (firstPlayerId && !this.players.has(firstPlayerId)) {
      throw new Error('Unknown first player.');
    }

    // ako je zadat prvi igrač -> rotiraj redosled da on počinje
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

  /** currentPlayer — helper za lak pristup igracu na potezu */
  get currentPlayer(): PlayerState | null {
    if (this.currentPlayerOrder.length === 0) return null;
    const id = this.currentPlayerOrder[this.currentIdx];
    return this.players.get(id) ?? null;
  }

  /**
   * getAvailableSettlementSpots — računa sva legalna temena za naselje
   * tokom setup-a (i kasnije UI može da ih highlight-uje).
   * Pravilo razdaljine: nijedan susedni node ne sme biti zauzet.
   */
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

  /**
   * placeInitialSettlement — postavljanje naselja u setup fazi.
   * - Validira fazu, vlasništvo i pravilo razdaljine.
   * - Upisuje vlasništvo i +1 VP.
   * - Pomera redosled i po završetku 2. runde prelazi u awaitingRoll.
   */
  placeInitialSettlement(playerId: string, nodeId: NodeId) {
    if (this.phase !== 'setupPlacement') throw new Error('Not in setup phase.');
    const p = this.players.get(playerId);
    if (!p) throw new Error('Unknown player.');
    if ((this.nodeOwnership.get(nodeId) ?? null) !== null)
      throw new Error('Spot occupied.');

    // pravilo razdaljine: nijedan susedni node ne sme biti zauzet
    const neighbors = this.nodeNeighbors.get(nodeId) ?? [];
    if (neighbors.some((n) => (this.nodeOwnership.get(n) ?? null) !== null)) {
      throw new Error('Too close to another settlement.');
    }

    // upiši vlasništvo + VP
    this.nodeOwnership.set(nodeId, playerId);
    p.settlements.add(nodeId);
    p.victoryPoints += 1;

    // "zmijica" (r1 napred, r2 nazad), pa prelazak u normalne poteze
    const lastIndex = this.currentPlayerOrder.length - 1;
    if (this.setupRound === 1) {
      if (this.currentIdx === lastIndex) {
        this.setupRound = 2;
        this.setupDirection = -1;
      } else {
        this.currentIdx++;
      }
    } else {
      // runda 2 (nazad)
      if (this.currentIdx === 0) {
        this.phase = 'awaitingRoll'; // runda 2 (nazad)
        this.currentIdx = 0;
      } else {
        this.currentIdx--;
      }
    }
  }

  /**
   * rollAndDistribute — baca kockice i odmah vraća "per-player" delte:
   * - ako je 7 → handleRobberSeven() vraća discards po igračima; faza => awaitingRobberMove
   * - inače → distributeFor(n) vraća gains po igračima; faza => awaitingActions
   * UI to koristi da odmah prikaže +1/-1 pored resursa.
   */
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
      // svi sa >=8 karata odbacuju polovinu (zaokruženo nadole)
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
      // raspodela resursa
      const gains = this.distributeFor(roll.total);
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

  /**
   * nextPlayer — završava potez, ide na sledećeg, i prelazi u awaitingRoll.
   * Dozvoljeno samo u 'awaitingActions' (posle roll-a/robbera).
   */
  nextPlayer() {
    if (this.phase !== 'awaitingActions')
      throw new Error('Finish actions first.');
    this.currentIdx = (this.currentIdx + 1) % this.currentPlayerOrder.length;
    this.turn += 1;
    this.phase = 'awaitingRoll';
  }

  /**
   * moveRobber — pomera lopova na zadatu pločicu.
   * Ako smo bili u 'awaitingRobberMove', prelazimo u 'awaitingActions'.
   */
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
        // napravi multiset žrtvinih karata pa odaberi nasumičnu
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

  /**
   * distributeFor(n) — iterira pločice sa brojem n gde ne stoji lopov,
   * potom za svako teme uz te pločice dodeljuje +1 resurs vlasniku (naselja).
   * Vraća Map<playerId, ResourceBundle> za UI overlay (+1/+2 ...).
   */
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

        const gain = 1; // samo naselja (gradovi uklonjeni iz scope-a)
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

  /**
   * handleRobberSeven — svi sa >=8 karata odbacuju floor(total/2).
   * Vraća Map<playerId, ResourceBundle> šta je ko izgubio (za -x overlay).
   */
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

  /**
   * discardEvenly — kružno odbacivanje po vrstama resursa dok ne odbacimo `toDiscard`.
   * Istovremeno vraća bundle onoga što je konkretan igrač izgubio (za UI).
   */
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

  /**
   * buildSettlementAt — plaćena gradnja naselja tokom poteza.
   * Validira fazu, prazno teme i pravilo razdaljine, traži 1:1:1:1 (Brick,Lumber,Wool,Grain).
   * Ako prođe validaciju: troši resurse, vraća ih u banku i upisuje vlasništvo + VP.
   */
  buildSettlementAt(playerId: string, nodeId: NodeId): boolean {
    if (this.phase !== 'awaitingActions') throw new Error('Cannot build now.');
    const p = this.players.get(playerId);
    if (!p) return false;
    if ((this.nodeOwnership.get(nodeId) ?? null) !== null) return false;

    // pravilo razdaljine
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

  /**
   * maritimeTrade — proxy ka ITradingService
   */
  maritimeTrade(
    playerId: string,
    give: ResourceBundle,
    receive: ResourceBundle
  ): boolean {
    const p = this.players.get(playerId);
    if (!p) return false;
    return this.trader.tradeWithBank(p, this.bank, give, receive);
  }

  /**
   * getPublicState — sklapa PublicGameView iz internih Map/Set struktura.
   * UI koristi isključivo ovo da crta tablu i prikazuje osnovne podatke.
   */
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

  /** getPlayerResources — kopija resursa za PlayerCard/UI. */
  getPlayerResources(playerId: string): ResourceBundle {
    const p = this.players.get(playerId);
    return p ? { ...p.resources } : {};
  }

  /**
   * exportState — pravi EngineSnapshot (JSON-serializable) za localStorage.
   * Konvertuje Set/Map u plain forme.
   */
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

  /**
   * importState — rekonstruiše engine iz prethodnog snapshot-a.
   */
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

/**
 * FourToOneTradingService — daš 4 iste karte, dobiješ 1 traženu (ako ih banka ima)
 */
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
    // Provera: moraš davati samo JEDNU vrstu resursa (>0)
    const entries = Object.entries(give).filter(
      ([_, v]) => (v ?? 0) > 0
    ) as Array<[ResourceType, number]>;
    if (entries.length !== 1) return false;

    const [giveType, giveQty] = entries[0];
    if (giveType === ResourceType.Desert) return false;
    if (giveQty % 4 !== 0) return false;

    // Provera: primaš samo JEDNU vrstu resursa, u količini giveQty/4
    const recvEntries = Object.entries(receive).filter(
      ([_, v]) => (v ?? 0) > 0
    ) as Array<[ResourceType, number]>;
    if (recvEntries.length !== 1) return false;
    const [recvType, recvQty] = recvEntries[0];
    if (recvType === ResourceType.Desert) return false;
    if (recvQty !== giveQty / 4) return false;

    // Validiraj da igrač ima, a banka može da isporuči
    if (!this.hasResources(player, give)) return false;
    if ((bank[recvType] ?? 0) < recvQty) return false;

    // Mutacije: uzmi od igrača, dodaj u banku; uzmi iz banke, daj igraču
    subBundles(player.resources, give);
    addBundles(bank, give);
    bank[recvType]! -= recvQty;
    player.resources[recvType] = (player.resources[recvType] ?? 0) + recvQty;
    return true;
  }
}
