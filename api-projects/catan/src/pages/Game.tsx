import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import CatanBoard from '../game/ui/CatanBoard';
import type { NodeId, TileId } from '../game/catan-core-types';

export default function Game() {
  // read slices separately to avoid unnecessary rerenders
  const view = useGameStore((s) => s.view);
  const started = useGameStore((s) => s.started);
  const lastRoll = useGameStore((s) => s.lastRoll);
  const messages = useGameStore((s) => s.messages);

  // actions
  const init = useGameStore((s) => s.init);
  const reset = useGameStore((s) => s.reset);
  const addPlayer = useGameStore((s) => s.addPlayer);
  const startGame = useGameStore((s) => s.startGame);
  const roll = useGameStore((s) => s.roll);
  const nextPlayer = useGameStore((s) => s.nextPlayer);
  const moveRobber = useGameStore((s) => s.moveRobber);
  const buildSettlementAt = useGameStore((s) => s.buildSettlementAt);
  const upgradeCity = useGameStore((s) => s.upgradeCity);
  const placeInitialSettlement = useGameStore((s) => s.placeInitialSettlement);
  const getAvailableSettlementSpots = useGameStore(
    (s) => s.getAvailableSettlementSpots
  );

  const [name, setName] = useState('');
  const [selectedNode, setSelectedNode] = useState<NodeId | null>(null);
  const [availableSpots, setAvailableSpots] = useState<NodeId[]>([]);

  // init once (handles StrictMode dev double-invoke)
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    init();
  }, [init]);

  // recompute legal nodes when relevant parts of view change
  useEffect(() => {
    if (started && view) setAvailableSpots(getAvailableSettlementSpots());
    else setAvailableSpots([]);
  }, [
    started,
    view?.phase,
    view?.currentPlayerId,
    view?.robberOn,
    view?.tiles,
    view?.players,
    view?.bank,
    view?.turn,
    view?.nodeOwnership,
    getAvailableSettlementSpots,
  ]);

  const canStart = (view?.players.length ?? 0) >= 2;
  const phase = view?.phase ?? 'setupPlacement';
  const inSetup = phase === 'setupPlacement';
  const canRoll = phase === 'awaitingRoll';
  const canAct = phase === 'awaitingActions';
  const needsRobber = phase === 'awaitingRobberMove';

  const currentPlayer = useMemo(() => {
    if (!view) return null;
    return view.players.find((p) => p.id === view.currentPlayerId) ?? null;
  }, [view]);

  const buildPaid = () => {
    if (!selectedNode || !currentPlayer) return;
    buildSettlementAt(currentPlayer.id, selectedNode);
    setSelectedNode(null);
  };

  return (
    <div className='min-h-[calc(100vh-56px)] bg-[#08151F] text-white'>
      {/* Header */}
      <div className='mx-auto max-w-6xl px-4 py-4'>
        <h1 className='trajanpro-bold text-2xl'>CATAN — Local Tabletop</h1>
        <p className='text-white/70'>
          Build, roll, and trade — all on one device. (No save data.)
        </p>
      </div>

      {/* Setup controls */}
      {!started && (
        <div className='mx-auto max-w-6xl px-4 py-3'>
          <div className='flex flex-col gap-3 rounded-xl bg-white/5 p-4'>
            <div className='flex flex-col gap-2 sm:flex-row'>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='Player name'
                className='w-full rounded-md border border-white/20 bg-transparent px-3 py-2 outline-none placeholder:text-white/50'
              />
              <button
                onClick={() => {
                  if (!name.trim()) return;
                  addPlayer(name.trim());
                  setName('');
                }}
                className='rounded-md bg-[#215B85] px-4 py-2 hover:opacity-90'
              >
                Add player
              </button>
            </div>

            <div className='text-sm text-white/80'>
              Current players:{' '}
              {view?.players.length
                ? view.players.map((p) => p.name).join(', ')
                : '—'}
            </div>

            <div className='flex items-center gap-2'>
              <button
                disabled={!canStart}
                onClick={() => startGame(view?.players[0]?.id)}
                className={`rounded-md px-4 py-2 ${
                  canStart
                    ? 'bg-[#96251D] hover:opacity-90'
                    : 'bg-white/10 cursor-not-allowed'
                }`}
                title={canStart ? '' : 'Add at least 2 players'}
              >
                Start game
              </button>
              <button
                onClick={reset}
                className='rounded-md border border-white/20 px-4 py-2 hover:bg-white/10'
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-game panel */}
      {started && view && (
        <div className='mx-auto max-w-6xl px-4 pb-8'>
          {/* Top bar */}
          <div className='mb-4 grid grid-cols-1 gap-3 md:grid-cols-4'>
            <InfoCard label='Turn' value={String(view.turn)} strong />
            <InfoCard
              label='Current Player'
              value={currentPlayer?.name ?? '—'}
            />
            <InfoCard
              label='Phase'
              value={view.phase
                .replace('awaiting', '▶ ')
                .replace('setupPlacement', 'Setup Placement')}
            />
            <InfoCard
              label='Last Roll'
              value={lastRoll ? `${lastRoll.total} (${lastRoll.source})` : '—'}
            />
          </div>

          {/* SVG Board */}
          <div className='mb-6'>
            <CatanBoard
              view={view}
              highlightNodes={availableSpots}
              onNodeClick={(nid: NodeId) => {
                if (inSetup) {
                  placeInitialSettlement(nid);
                } else if (canAct && currentPlayer) {
                  buildSettlementAt(currentPlayer.id, nid);
                }
              }}
              onTileClick={(tid: TileId) => {
                if (needsRobber) moveRobber(tid);
              }}
            />
          </div>

          {/* Actions */}
          <div className='mb-6 flex flex-wrap items-center gap-2'>
            <button
              onClick={roll}
              disabled={!canRoll}
              className={`rounded-md px-4 py-2 ${
                canRoll
                  ? 'bg-[#215B85] hover:opacity-90'
                  : 'bg-white/10 cursor-not-allowed'
              }`}
              title={
                !canRoll ? 'You can only roll at the start of your turn' : ''
              }
            >
              Roll Dice
            </button>

            <button
              onClick={nextPlayer}
              disabled={!canAct}
              className={`rounded-md px-4 py-2 ${
                canAct
                  ? 'border border-white/20 hover:bg-white/10'
                  : 'bg-white/10 cursor-not-allowed'
              }`}
              title={
                !canAct ? 'Finish your roll/robber before ending turn' : ''
              }
            >
              Next Player
            </button>
          </div>

          {/* Bank */}
          <div className='mb-6 rounded-xl bg-white/5 p-4'>
            <h2 className='trajanpro-bold mb-2 text-xl'>Bank</h2>
            <KeyValueRow label='Brick' value={view.bank.Brick ?? 0} />
            <KeyValueRow label='Lumber' value={view.bank.Lumber ?? 0} />
            <KeyValueRow label='Wool' value={view.bank.Wool ?? 0} />
            <KeyValueRow label='Grain' value={view.bank.Grain ?? 0} />
            <KeyValueRow label='Ore' value={view.bank.Ore ?? 0} />
          </div>

          {/* Log */}
          <div className='rounded-xl bg-white/5 p-4'>
            <h2 className='trajanpro-bold mb-2 text-xl'>Log</h2>
            <ul className='list-disc pl-5 text-white/80'>
              {messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className='rounded-xl bg-white/5 p-4'>
      <div className='text-white/70 text-sm'>{label}</div>
      <div className={strong ? 'trajanpro-bold text-2xl' : 'text-xl'}>
        {value}
      </div>
    </div>
  );
}

function KeyValueRow({ label, value }: { label: string; value: number }) {
  return (
    <div className='flex items-center justify-between border-b border-white/10 py-1 text-white/80'>
      <span>{label}</span>
      <span className='trajanpro-bold'>{value}</span>
    </div>
  );
}
