// gameStore.ts
// ---------------------------------------------------------------------
// Zustand store = "global" stanje igre.
// - Drži CatanEngine instancu i PublicGameView (za UI render).
// - Omogućava lifecycle operacije (init/reset/addPlayer/startGame).
// - Sadrži game flow akcije (roll/nextPlayer/moveRobber/...).
// - Čuva per-turn delte (lastGains/lastLosses) da UI prikaže +1 / -1 overlay.
// - Persistence: snima EngineSnapshot + UI meta u localStorage i nudi Continue.
// ---------------------------------------------------------------------

import { create } from 'zustand';
import {
  CatanEngine,
  DiceApiRandomService,
  FourToOneTradingService,
  type IRandomService,
  type ITradingService,
  type EngineSnapshot,
} from '../game/catan-core';
import type {
  PublicGameView,
  ResourceBundle,
  NodeId,
  ResourceType,
} from '../game/catan-core-types';
import { randomizedStandard19Tiles } from '../game/board-presets';
import { fetchDrandSeed32 } from '../game/random-seed';

// Info o poslednjem bacanju (za UI header)
type RollInfo = { total: number; source: 'api' | 'local' };
// DeltaMap: per-player bundle (npr. { playerId: { Brick: +1, Grain: +2 } })
type DeltaMap = Record<string, ResourceBundle>;

// ključ u localStorage-u
const SAVE_KEY = 'catan-save-v1';

// Centralni tip Zustand store-a
type GameState = {
  engine: CatanEngine | null; // core engine (pravila)
  view: PublicGameView | null; // core engine (pravila)
  started: boolean; // da li je igra startovana (posle setupa igrača)
  lastRoll: RollInfo | null; // info o poslednjem roll-u
  messages: string[]; // log poruke

  // per-turn delta overlays (UI prikazuje +1/-1 pored resursa)
  lastGains: DeltaMap; // ko je šta dobio na ovom roll-u
  lastLosses: DeltaMap; // ko je šta izgubio (7/discard ili theft)
  resVersion: number; // samo brojač da natera re-render PlayerCard resursa

  hasSaved: boolean;

  // lifecycle
  init(): void; // kreira engine i tablu (random preko drand seed-a)
  reset(): void; // potpuno resetuje igru (i briše save)
  addPlayer(name: string): void; // dodaje igrača (dok nije startovano)
  startGame(firstPlayerId?: string): void; // prelaz u setup fazu

  // save/continue
  checkSaved(): void; // proveri ima li save (UI: pokaži "Continue")
  continueSaved(): void; // učitaj i nastavi iz save-a
  clearSaved(): void; // opcija da se očisti save

  // placement
  getAvailableSettlementSpots(): NodeId[]; // legalni čvorovi za naselje
  placeInitialSettlement(nodeId: NodeId): void; // klik na node tokom setup-a

  // gameplay
  roll(): Promise<void>; // bacanje kockica
  nextPlayer(): void; // kraj poteza
  moveRobber(tileId: string, stealFromPlayerId?: string): void; // pomeri lopova
  buildSettlementAt(playerId: string, nodeId: NodeId): void; // gradnja naselja

  // info
  getPlayerResources(playerId: string): ResourceBundle;
};

// helper da napravimo "prazne" delte
const emptyDelta = (): DeltaMap => ({});

// helper za čitanje JSON-a iz localStorage-a
function loadFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Glavni Zustand store
export const useGameStore = create<GameState>((set, get) => ({
  // ---- osnovno stanje ----
  engine: null,
  view: null,
  started: false,
  lastRoll: null,
  messages: [],
  lastGains: emptyDelta(),
  lastLosses: emptyDelta(),
  resVersion: 0,

  hasSaved: false,

  // ---- persistence helpers (internal) ----
  // privatna funkcija (ostaje unutar store-a) koja upisuje sve u localStorage.
  // Pozivamo je posle svih mutacija da sačuvamo progres
  // @ts-ignore - keep local to store
  _saveNow: () => {
    const { engine, started, lastRoll, messages, lastGains, lastLosses } =
      get();
    if (!engine) return;
    const snapshot: EngineSnapshot = engine.exportState();
    const payload = {
      snapshot,
      started,
      lastRoll,
      messages,
      lastGains,
      lastLosses,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      set({ hasSaved: true });
    } catch {}
  },

  // samo setuje flag hasSaved na osnovu postojanja ključa
  checkSaved() {
    const has = !!loadFromStorage(SAVE_KEY);
    set({ hasSaved: has });
  },

  // učitaj iz localStorage-a i rekonstruiši engine preko importState()
  continueSaved() {
    const data = loadFromStorage<{
      snapshot: EngineSnapshot;
      started: boolean;
      lastRoll: RollInfo | null;
      messages: string[];
      lastGains: DeltaMap;
      lastLosses: DeltaMap;
    }>(SAVE_KEY);
    if (!data) return;

    // moramo ponovo obezbediti servise (dice + trading)
    const rng: IRandomService = new DiceApiRandomService();
    const trader: ITradingService = new FourToOneTradingService();
    const engine = CatanEngine.importState(data.snapshot, rng, trader);

    set({
      engine,
      view: engine.getPublicState(),
      started: data.started,
      lastRoll: data.lastRoll,
      messages: data.messages ?? [],
      lastGains: data.lastGains ?? emptyDelta(),
      lastLosses: data.lastLosses ?? emptyDelta(),
      resVersion: get().resVersion + 1, // nateraj PlayerCard da pročita nove resurse
      hasSaved: true,
    });
  },

  // brisanje save-a iz UI-a
  clearSaved() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}
    set({ hasSaved: false });
  },

  // init: asinhrono — dovlači drand seed, generiše random tablu, pravi engine.
  // U fallback-u (ako drand padne) koristi standardnu determinističku tablu.
  init() {
    (async () => {
      try {
        const has = !!loadFromStorage(SAVE_KEY);
        const seed = await fetchDrandSeed32();
        const tiles = randomizedStandard19Tiles(seed);
        const rng: IRandomService = new DiceApiRandomService();
        const trader: ITradingService = new FourToOneTradingService();
        const engine = new CatanEngine(rng, trader, { tiles });
        set({
          engine,
          view: engine.getPublicState(),
          started: false,
          lastRoll: null,
          messages: [`Game initialized with randomized board (seed=${seed}).`],
          lastGains: emptyDelta(),
          lastLosses: emptyDelta(),
          resVersion: 0,
          hasSaved: has,
        });
      } catch {
        // fallback: nema drand/greška — koristi standardnu tablu
        const has = !!loadFromStorage(SAVE_KEY);
        const rng: IRandomService = new DiceApiRandomService();
        const trader: ITradingService = new FourToOneTradingService();
        const engine = new CatanEngine(rng, trader);
        set({
          engine,
          view: engine.getPublicState(),
          started: false,
          lastRoll: null,
          messages: ['Game initialized (fallback board).'],
          lastGains: emptyDelta(),
          lastLosses: emptyDelta(),
          resVersion: 0,
          hasSaved: has,
        });
      }
    })();
  },

  // resetuje sve; ponovo poziva init(); briše save
  reset() {
    get().init();
    set((s) => ({ messages: [...s.messages, 'Game reset.'] }));
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}
    set({ hasSaved: false });
  },

  // dodaj igrača. Koristimo crypto.randomUUID() za identifikatore
  addPlayer(name: string) {
    const { engine } = get();
    if (!engine) return;
    const id = crypto.randomUUID
      ? crypto.randomUUID()
      : `p_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    engine.addPlayer(id, name.trim() || `Player`);
    set({ view: engine.getPublicState() });
    (get() as any)._saveNow();
  },

  // startGame postavlja setup fazu i šalje info poruku.
  startGame(firstPlayerId) {
    const { engine } = get();
    if (!engine) return;
    engine.startGame(firstPlayerId);
    set({
      started: true,
      view: engine.getPublicState(),
      messages: [
        ...get().messages,
        'Setup: each player must place 2 settlements (snake order).',
      ],
      lastGains: emptyDelta(),
      lastLosses: emptyDelta(),
      resVersion: get().resVersion + 1,
    });
    (get() as any)._saveNow();
  },

  // ----- Placement -----
  getAvailableSettlementSpots() {
    const { engine } = get();
    if (!engine) return [];
    return engine.getAvailableSettlementSpots();
  },

  // klik na node tokom setup-a
  placeInitialSettlement(nodeId) {
    const { engine } = get();
    if (!engine) return;
    const currentId = engine.getPublicState().currentPlayerId!;
    try {
      engine.placeInitialSettlement(currentId, nodeId);
      set({
        view: engine.getPublicState(),
        messages: [
          ...get().messages,
          `Placed initial settlement on ${nodeId}.`,
        ],
        // tokom setup-a nema delta overlay-a (dobitak tek na prvi roll)
        resVersion: get().resVersion + 1,
      });
      (get() as any)._saveNow();
    } catch (e: any) {
      set((s) => ({
        messages: [...s.messages, e?.message || 'Cannot place there.'],
      }));
    }
  },

  // ----- Gameplay -----

  // roll: čisti stare delte, zove engine.rollAndDistribute(),
  // update-uje view + lastGains/lastLosses tako da UI prikaže odmah +x/-x.
  async roll() {
    const { engine } = get();
    if (!engine) return;
    try {
      // novi roll ⇒ očisti prethodne overlay-e
      set({ lastGains: emptyDelta(), lastLosses: emptyDelta() });

      const res = await engine.rollAndDistribute();

      // engine vraća opcione map-e: gains ili discards (za 7)
      const gains = (res as any).gains ?? {};
      const discards = (res as any).discards ?? {};

      // Build message line(s)
      const baseMsg =
        res.total === 7
          ? `Rolled 7 — discard if 8+ cards, then move the robber.`
          : `Rolled ${res.total} (${res.source}). Resources distributed.`;

      set({
        lastRoll: { total: res.total, source: res.source },
        view: engine.getPublicState(),
        messages: [...get().messages, baseMsg],
        lastGains: gains,
        lastLosses: discards, // kod 7 odmah pokaži šta je ko odbacio
        resVersion: get().resVersion + 1, // nateraj PlayerCard da pročita nova stanja
      });
      (get() as any)._saveNow();
    } catch (e: any) {
      set((s) => ({
        messages: [...s.messages, e?.message || 'Cannot roll now.'],
      }));
    }
  },

  // Next Player: završava potez (dozvoljeno samo u awaitingActions).
  // lastGains/lastLosses ostaju vidljivi do sledećeg roll-a.
  nextPlayer() {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.nextPlayer();
      set({
        view: engine.getPublicState(),
        messages: [...get().messages, 'Next player.'],
        resVersion: get().resVersion + 1,
      });
      (get() as any)._saveNow();
    } catch (e: any) {
      set((s) => ({
        messages: [...s.messages, e?.message || 'Cannot end turn now.'],
      }));
    }
  },

  // Pomeri lopova; opcionalno ukradi 1 nasumičnu kartu victim-u.
  // Ako je došlo do krađe, overlay-uj +1 za kradljivca i -1 za žrtvu.
  moveRobber(tileId, stealFromPlayerId) {
    const { engine } = get();
    if (!engine) return;
    try {
      const result = engine.moveRobber(tileId, stealFromPlayerId) as {
        theft?: { from: string; to: string; resource: ResourceType };
      } | void;

      const msg = `Robber moved to ${tileId}.`;
      let updatedGains = { ...get().lastGains };
      let updatedLosses = { ...get().lastLosses };

      if (result && (result as any).theft) {
        const { from, to, resource } = (result as any).theft!;
        // +1 za lopova
        updatedGains[to] = {
          ...(updatedGains[to] ?? {}),
          [resource as ResourceType]:
            (updatedGains[to]?.[resource as ResourceType] ?? 0) + 1,
        };
        // -1 (kao "loss") za žrtvu — prikazujemo u lastLosses
        updatedLosses[from] = {
          ...(updatedLosses[from] ?? {}),
          [resource as ResourceType]:
            (updatedLosses[from]?.[resource as ResourceType] ?? 0) + 1,
        };
        set({
          view: engine.getPublicState(),
          messages: [
            ...get().messages,
            `${msg} Stole 1 ${resource} from victim.`,
          ],
          lastGains: updatedGains,
          lastLosses: updatedLosses,
          resVersion: get().resVersion + 1,
        });
      } else {
        set({
          view: engine.getPublicState(),
          messages: [...get().messages, msg],
          resVersion: get().resVersion + 1,
        });
      }
      (get() as any)._saveNow();
    } catch (e: any) {
      set((s) => ({
        messages: [...s.messages, e?.message || 'Cannot move robber now.'],
      }));
    }
  },

  // Plaćena gradnja naselja tokom poteza (awaitingActions).
  buildSettlementAt(playerId, nodeId) {
    const { engine } = get();
    if (!engine) return;
    try {
      const ok = engine.buildSettlementAt(playerId, nodeId);
      set({
        view: engine.getPublicState(),
        messages: [
          ...get().messages,
          ok
            ? `Built settlement on ${nodeId}.`
            : 'Not enough resources / invalid spot.',
        ],
        resVersion: get().resVersion + 1,
      });
      (get() as any)._saveNow();
    } catch (e: any) {
      set((s) => ({
        messages: [...s.messages, e?.message || 'Cannot build now.'],
      }));
    }
  },

  // ----- Info -----

  // PlayerCard koristi ovo da dobije "snapshot" resursa igrača.
  getPlayerResources(playerId) {
    const { engine } = get();
    return engine ? engine.getPlayerResources(playerId) : {};
  },
}));
