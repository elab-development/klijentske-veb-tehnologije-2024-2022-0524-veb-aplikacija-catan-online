import { create } from 'zustand';
import {
  CatanEngine,
  DiceApiRandomService,
  FourToOneTradingService,
  type IRandomService,
  type ITradingService,
} from '../game/catan-core';
import type {
  PublicGameView,
  ResourceBundle,
  NodeId,
} from '../game/catan-core-types';

type RollInfo = { total: number; source: 'api' | 'local' };

type GameState = {
  engine: CatanEngine | null;
  view: PublicGameView | null;
  started: boolean;
  lastRoll: RollInfo | null;
  messages: string[];
  playerSeq: number;

  // lifecycle
  init(): void;
  reset(): void;
  addPlayer(name: string): void;
  startGame(firstPlayerId?: string): void;

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

export const useGameStore = create<GameState>((set, get) => ({
  engine: null,
  view: null,
  started: false,
  lastRoll: null,
  messages: [],
  playerSeq: 1,

  init() {
    const rng: IRandomService = new DiceApiRandomService();
    const trader: ITradingService = new FourToOneTradingService();
    const engine = new CatanEngine(rng, trader);
    set({
      engine,
      view: engine.getPublicState(),
      started: false,
      lastRoll: null,
      messages: ['Game initialized.'],
      playerSeq: 1,
    });
  },

  reset() {
    get().init();
    set((s) => ({ messages: [...s.messages, 'Game reset.'] }));
  },

  addPlayer(name: string) {
    const { engine } = get();
    if (!engine) return;
    const seq = get().playerSeq;
    const id = `p${seq}`;
    engine.addPlayer(id, name.trim() || `Player ${seq}`);
    set({
      view: engine.getPublicState(),
      playerSeq: seq + 1,
    });
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
        'Setup: each player must place 2 settlements (distance rule applies).',
      ],
    });
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
      });
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
      const res = await engine.rollAndDistribute();
      set({
        lastRoll: res,
        view: engine.getPublicState(),
        messages: [
          ...get().messages,
          res.total === 7
            ? `Rolled 7 — discard if 8+ cards, then move the robber.`
            : `Rolled ${res.total} (${res.source}). Resources distributed.`,
        ],
      });
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
      });
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
      engine.moveRobber(tileId, stealFromPlayerId);
      set({
        view: engine.getPublicState(),
        messages: [...get().messages, `Robber moved to ${tileId}.`],
      });
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
      });
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
