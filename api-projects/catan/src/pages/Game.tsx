import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { NodeId } from '../game/catan-core-types';

export default function Game() {
  // Pull ONLY what you need so renders are cheaper and more predictable
  const view = useGameStore((s) => s.view);
  const started = useGameStore((s) => s.started);
  const lastRoll = useGameStore((s) => s.lastRoll);
  const messages = useGameStore((s) => s.messages);

  // actions (stable references from zustand)
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
  const getPlayerResourcesFn = useRef(
    useGameStore.getState().getPlayerResources
  );

  const [name, setName] = useState('');
  const [selectedNode, setSelectedNode] = useState<NodeId | null>(null);
  const [availableSpots, setAvailableSpots] = useState<NodeId[]>([]);

  // INIT — ensure this only runs once (guards StrictMode double-invoke in dev)
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    init();
  }, [init]);

  // Recompute available spots when the *view* changes (not on every render)
  useEffect(() => {
    if (started && view) setAvailableSpots(getAvailableSettlementSpots());
    else setAvailableSpots([]);
    // Depend on the specific fields that actually affect legality
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

  const currentPlayer = useMemo(() => {
    if (!view) return null;
    return view.players.find((p) => p.id === view.currentPlayerId) ?? null;
  }, [view]);

  const canRoll = phase === 'awaitingRoll';
  const canAct = phase === 'awaitingActions';
  const needsRobber = phase === 'awaitingRobberMove';
  const inSetup = phase === 'setupPlacement';

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
              value={phase
                .replace('awaiting', '▶ ')
                .replace('setupPlacement', 'Setup Placement')}
            />
            <InfoCard
              label='Last Roll'
              value={lastRoll ? `${lastRoll.total} (${lastRoll.source})` : '—'}
            />
          </div>

          {/* Setup Placement */}
          {inSetup && (
            <div className='mb-4 rounded-xl bg-white/5 p-4'>
              <div className='mb-2 trajanpro-bold'>Initial Placement</div>
              <div className='text-white/70 mb-2'>
                Current:{' '}
                <span className='trajanpro-bold'>{currentPlayer?.name}</span>.
                Choose a legal node:
              </div>
              <div className='flex flex-wrap gap-2'>
                {availableSpots.map((n) => (
                  <button
                    key={n}
                    onClick={() => placeInitialSettlement(n)}
                    className='rounded-md border border-white/20 px-3 py-1 hover:bg-white/10'
                  >
                    {n}
                  </button>
                ))}
                {!availableSpots.length && (
                  <span className='text-white/60'>
                    No legal spots available.
                  </span>
                )}
              </div>
              <div className='mt-2 text-sm text-white/60'>
                Distance rule enforced: no adjacent settlements.
              </div>
            </div>
          )}

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

            {canAct && currentPlayer && (
              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-white/70'>Build Settlement at:</span>
                {availableSpots.map((n) => (
                  <button
                    key={n}
                    onClick={() => setSelectedNode(n)}
                    className={`rounded-md px-3 py-1 border ${
                      selectedNode === n
                        ? 'bg-[#96251D] border-[#96251D]'
                        : 'border-white/20 hover:bg-white/10'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  disabled={!selectedNode}
                  onClick={buildPaid}
                  className={`rounded-md px-4 py-2 ${
                    selectedNode
                      ? 'bg-[#96251D] hover:opacity-90'
                      : 'bg-white/10 cursor-not-allowed'
                  }`}
                >
                  Build {selectedNode ? `on ${selectedNode}` : ''}
                </button>
              </div>
            )}

            {needsRobber && (
              <span className='text-[#FCDE07]'>
                Move the robber to continue.
              </span>
            )}
          </div>

          {/* Tiles + Robber */}
          <div className='mb-6'>
            <h2 className='trajanpro-bold mb-2 text-xl'>Tiles</h2>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-7'>
              {view.tiles.map((t) => {
                const isRobber = view.robberOn === t.id;
                const nodeIds = Object.entries(view.nodeAdjacentTiles)
                  .filter(([, tiles]) => tiles.includes(t.id))
                  .map(([nid]) => nid as NodeId);

                return (
                  <button
                    key={t.id}
                    onClick={() => moveRobber(t.id)}
                    disabled={!needsRobber}
                    className={`rounded-lg p-3 text-left transition ${
                      isRobber
                        ? 'ring-2 ring-[#FCDE07]'
                        : 'ring-1 ring-white/10'
                    } ${
                      needsRobber
                        ? 'bg-white/5 hover:bg-white/10'
                        : 'bg-white/5 opacity-60 cursor-not-allowed'
                    }`}
                    title={
                      needsRobber
                        ? 'Click to move robber here'
                        : 'Robber can be moved only after rolling 7'
                    }
                  >
                    <div className='text-sm text-white/70'>{t.id}</div>
                    <div className='trajanpro-bold'>{t.resource}</div>
                    <div className='text-white/70'>
                      {t.numberToken ?? '—'}
                      {isRobber && (
                        <span className='ml-2 text-[#FCDE07]'>Robber</span>
                      )}
                    </div>
                    <div className='mt-2 text-sm text-white/70'>
                      Nodes:{' '}
                      {nodeIds.map((nid) => {
                        const ownerId = view.nodeOwnership[nid];
                        const ownerName =
                          view.players.find((p) => p.id === ownerId)?.name ??
                          null;
                        return (
                          <span key={nid} className='mr-2'>
                            {nid}
                            {ownerName && (
                              <span className='ml-1 text-[#FCDE07]'>
                                ({ownerName})
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Players */}
          <div className='mb-6'>
            <h2 className='trajanpro-bold mb-2 text-xl'>Players</h2>
            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              {view.players.map((p) => (
                <div key={p.id} className='rounded-xl bg-white/5 p-4'>
                  <div className='flex items-center justify-between'>
                    <div className='trajanpro-bold text-lg'>{p.name}</div>
                    <div className='text-white/80'>VP: {p.victoryPoints}</div>
                  </div>
                  <PlayerResources
                    playerId={p.id}
                    getPlayerResourcesFnRef={getPlayerResourcesFn}
                    viewVersion={view.turn}
                  />
                  <div className='mt-2 text-sm text-white/70'>
                    Nodes:{' '}
                    {Object.entries(view.nodeOwnership)
                      .filter(([, owner]) => owner === p.id)
                      .map(([nid]) => nid)
                      .join(', ') || '—'}
                  </div>
                </div>
              ))}
            </div>
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

/**
 * IMPORTANT: don’t subscribe to the store with a selector that RETURNS A NEW OBJECT EVERY TIME.
 * Instead, read via a ref to the action, and memoize on a stable dependency (e.g., view.turn).
 */
function PlayerResources({
  playerId,
  getPlayerResourcesFnRef,
  viewVersion,
}: {
  playerId: string;
  getPlayerResourcesFnRef: React.MutableRefObject<(pid: string) => any>;
  viewVersion: number; // bump when view changes (turn is fine)
}) {
  const res = useMemo(() => {
    return getPlayerResourcesFnRef.current(playerId);
    // recompute when the game view advances; using view.turn is a simple stable signal
  }, [playerId, viewVersion]);

  const rows = ['Brick', 'Lumber', 'Wool', 'Grain', 'Ore'] as const;
  return (
    <div className='mt-2 grid grid-cols-2 gap-2'>
      {rows.map((r) => (
        <div
          key={r}
          className='flex items-center justify-between rounded-md bg-white/5 px-3 py-2'
        >
          <span className='text-white/70'>{r}</span>
          <span className='trajanpro-bold'>{(res as any)[r] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}
