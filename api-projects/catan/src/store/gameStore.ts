import { create } from 'zustand';
import {
  CatanEngine,
  DiceApiRandomService,
  FourToOneTradingService,
  type PublicGameView,
} from '../game/catan-core';

type RollInfo = { total: number; source: 'api' | 'local' };

type GameState = {
  engine: CatanEngine | null;
  view: PublicGameView | null;
  started: boolean;
  lastRoll: RollInfo | null;
  messages: string[];

  init(): void;
  reset(): void;
  addPlayer(name: string): void;
  startGame(firstPlayerId?: string): void;

  roll(): Promise<void>;
  nextPlayer(): void;
  moveRobber(tileId: string, stealFromPlayerId?: string): void;

  buildSettlement(playerId: string): void;
  upgradeCity(playerId: string): void;
};

export const useGameStore = create<GameState>((set, get) => ({
  engine: null,
  view: null,
  started: false,
  lastRoll: null,
  messages: [],

  init() {
    const engine = new CatanEngine(
      new DiceApiRandomService(),
      new FourToOneTradingService()
    );
    set({
      engine,
      view: engine.getPublicState(),
      started: false,
      lastRoll: null,
      messages: ['Game initialized.'],
    });
  },

  reset() {
    get().init();
    set((s) => ({ messages: [...s.messages, 'Game reset.'] }));
  },

  addPlayer(name: string) {
    const { engine } = get();
    if (!engine) return;
    const id = `p${
      (engine as any)._idInc
        ? (engine as any)._idInc++
        : ((engine as any)._idInc = 1)
    }`;
    engine.addPlayer(id, name.trim() || `Player ${id}`);
    set({ view: engine.getPublicState() });
  },

  startGame(firstPlayerId) {
    const { engine } = get();
    if (!engine) return;
    engine.startGame(firstPlayerId);
    set({
      started: true,
      view: engine.getPublicState(),
      messages: [
        'Game started! Everyone received 1 settlement and a starter pack.',
      ],
    });
  },

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

  buildSettlement(playerId) {
    const { engine } = get();
    if (!engine) return;
    try {
      const nodeId = `N${Math.floor(Math.random() * 999)}`;
      const ok = engine.buildSettlement(playerId, nodeId);
      set({
        view: engine.getPublicState(),
        messages: [
          ...get().messages,
          ok ? `Settlement built at ${nodeId}.` : 'Not enough resources.',
        ],
      });
    } catch (e: any) {
      set((s) => ({
        messages: [...s.messages, e?.message || 'Cannot build now.'],
      }));
    }
  },

  upgradeCity(playerId) {
    const { engine } = get();
    if (!engine) return;
    try {
      const internal = (engine as any).players?.get?.(playerId);
      const firstSettlement: string | undefined = internal
        ? (Array.from(internal.settlements)[0] as string | undefined)
        : undefined;
      if (!firstSettlement) {
        set((s) => ({
          messages: [...s.messages, 'No settlement to upgrade.'],
        }));
        return;
      }
      const ok = engine.upgradeToCity(playerId, firstSettlement);
      set({
        view: engine.getPublicState(),
        messages: [
          ...get().messages,
          ok ? `Upgraded ${firstSettlement} to City.` : 'Not enough resources.',
        ],
      });
    } catch (e: any) {
      set((s) => ({
        messages: [...s.messages, e?.message || 'Cannot upgrade now.'],
      }));
    }
  },
}));
