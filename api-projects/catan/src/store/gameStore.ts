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

type RollInfo = { total: number; source: 'api' | 'local' };
type DeltaMap = Record<string, ResourceBundle>; // playerId -> bundle

const SAVE_KEY = 'catan-save-v1';

type GameState = {
  engine: CatanEngine | null;
  view: PublicGameView | null;
  started: boolean;
  lastRoll: RollInfo | null;
  messages: string[];

  // NEW: per-turn delta overlays and a version to force resource re-render
  lastGains: DeltaMap;
  lastLosses: DeltaMap;
  resVersion: number;

  hasSaved: boolean;

  // lifecycle
  init(): void;
  reset(): void;
  addPlayer(name: string): void;
  startGame(firstPlayerId?: string): void;

  // save/continue
  checkSaved(): void;
  continueSaved(): void;
  clearSaved(): void;

  // placement
  getAvailableSettlementSpots(): NodeId[];
  placeInitialSettlement(nodeId: NodeId): void;

  // gameplay
  roll(): Promise<void>;
  nextPlayer(): void;
  moveRobber(tileId: string, stealFromPlayerId?: string): void;
  buildSettlementAt(playerId: string, nodeId: NodeId): void;

  // info
  getPlayerResources(playerId: string): ResourceBundle;
};

const emptyDelta = (): DeltaMap => ({});

function loadFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const useGameStore = create<GameState>((set, get) => ({
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
  // call this after any mutation to persist
  // (we keep it declared inline so it can access get/set)
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
    } catch {
      // ignore quota errors
    }
  },

  checkSaved() {
    const has = !!loadFromStorage(SAVE_KEY);
    set({ hasSaved: has });
  },

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
      resVersion: get().resVersion + 1,
      hasSaved: true,
    });
  },

  clearSaved() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}
    set({ hasSaved: false });
  },

  // fire-and-forget init: fetch drand seed and build randomized tiles
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

  reset() {
    get().init();
    set((s) => ({ messages: [...s.messages, 'Game reset.'] }));
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}
    set({ hasSaved: false });
  },

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
        // no deltas during setup
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
  async roll() {
    const { engine } = get();
    if (!engine) return;
    try {
      // clear old overlays for this new roll
      set({ lastGains: emptyDelta(), lastLosses: emptyDelta() });

      const res = await engine.rollAndDistribute();

      // convert optional maps coming back
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
        lastLosses: discards, // when 7, show immediate losses
        resVersion: get().resVersion + 1, // force PlayerCard to recompute resources now
      });
      (get() as any)._saveNow();
    } catch (e: any) {
      set((s) => ({
        messages: [...s.messages, e?.message || 'Cannot roll now.'],
      }));
    }
  },

  nextPlayer() {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.nextPlayer();
      set({
        view: engine.getPublicState(),
        messages: [...get().messages, 'Next player.'],
        // keep lastGains/lastLosses visible until next roll; do NOT clear
        resVersion: get().resVersion + 1,
      });
      (get() as any)._saveNow();
    } catch (e: any) {
      set((s) => ({
        messages: [...s.messages, e?.message || 'Cannot end turn now.'],
      }));
    }
  },

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

      // If a steal occurred, overlay +1 / -1 deltas
      if (result && (result as any).theft) {
        const { from, to, resource } = (result as any).theft!;
        updatedGains[to] = {
          ...(updatedGains[to] ?? {}),
          [resource as ResourceType]:
            (updatedGains[to]?.[resource as ResourceType] ?? 0) + 1,
        };
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
  getPlayerResources(playerId) {
    const { engine } = get();
    return engine ? engine.getPlayerResources(playerId) : {};
  },
}));
