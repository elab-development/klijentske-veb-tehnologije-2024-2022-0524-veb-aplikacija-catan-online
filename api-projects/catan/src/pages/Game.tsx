import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';

export default function Game() {
  const {
    init,
    reset,
    addPlayer,
    startGame,
    roll,
    nextPlayer,
    moveRobber,
    buildSettlement,
    upgradeCity,
    view,
    started,
    lastRoll,
    messages,
  } = useGameStore();

  const [name, setName] = useState('');

  useEffect(() => {
    init();
  }, [init]);

  const canStart = (view?.players.length ?? 0) >= 2;

  const currentPlayer = useMemo(() => {
    if (!view) return null;
    return view.players.find((p) => p.id === view.currentPlayerId) ?? null;
  }, [view]);

  const phase = view?.phase ?? 'awaitingRoll';
  const canRoll = phase === 'awaitingRoll';
  const canAct = phase === 'awaitingActions';
  const needsRobber = phase === 'awaitingRobberMove';

  return (
    <div className='min-h-[calc(100vh-56px)] bg-[#08151F] text-white'>
      <div className='mx-auto max-w-6xl px-4 py-4'>
        <h1 className='trajanpro-bold text-2xl'>CATAN — Local Tabletop</h1>
        <p className='text-white/70'>
          Build, roll, and trade — all on one device. (No save data.)
        </p>
      </div>

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

      {started && view && (
        <div className='mx-auto max-w-6xl px-4 pb-8'>
          {/* Top bar */}
          <div className='mb-4 grid grid-cols-1 gap-3 md:grid-cols-4'>
            <div className='rounded-xl bg-white/5 p-4'>
              <div className='text-white/70 text-sm'>Turn</div>
              <div className='trajanpro-bold text-2xl'>{view.turn}</div>
            </div>

            <div className='rounded-xl bg-white/5 p-4'>
              <div className='text-white/70 text-sm'>Current Player</div>
              <div className='trajanpro-bold text-xl'>
                {currentPlayer?.name ?? '—'}
              </div>
            </div>

            <div className='rounded-xl bg-white/5 p-4'>
              <div className='text-white/70 text-sm'>Phase</div>
              <div className='text-xl capitalize'>
                {phase.replace('awaiting', '').replace(/([A-Z])/g, ' $1')}
              </div>
            </div>

            <div className='rounded-xl bg-white/5 p-4'>
              <div className='text-white/70 text-sm'>Last Roll</div>
              <div className='text-xl'>
                {lastRoll ? (
                  <>
                    <span className='trajanpro-bold'>{lastRoll.total}</span>{' '}
                    <span className='text-white/60'>({lastRoll.source})</span>
                  </>
                ) : (
                  '—'
                )}
              </div>
            </div>
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

            {currentPlayer && (
              <>
                <button
                  onClick={() => buildSettlement(currentPlayer.id)}
                  disabled={!canAct}
                  className={`rounded-md px-4 py-2 ${
                    canAct
                      ? 'bg-[#96251D] hover:opacity-90'
                      : 'bg-white/10 cursor-not-allowed'
                  }`}
                >
                  Build Settlement (demo)
                </button>
                <button
                  onClick={() => upgradeCity(currentPlayer.id)}
                  disabled={!canAct}
                  className={`rounded-md px-4 py-2 ${
                    canAct
                      ? 'border border-white/20 hover:bg-white/10'
                      : 'bg-white/10 cursor-not-allowed'
                  }`}
                >
                  Upgrade to City (demo)
                </button>
              </>
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
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6'>
              {view.tiles.map((t) => {
                const isRobber = view.robberOn === t.id;
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
                  <PlayerResources playerId={p.id} />
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

function KeyValueRow({ label, value }: { label: string; value: number }) {
  return (
    <div className='flex items-center justify-between border-b border-white/10 py-1 text-white/80'>
      <span>{label}</span>
      <span className='trajanpro-bold'>{value}</span>
    </div>
  );
}

function PlayerResources({ playerId }: { playerId: string }) {
  useGameStore();
  const engine: any = useGameStore.getState().engine;
  const internal = engine?.players?.get?.(playerId);
  const res = internal?.resources ?? {};
  const rows = ['Brick', 'Lumber', 'Wool', 'Grain', 'Ore'] as const;

  return (
    <div className='mt-2 grid grid-cols-2 gap-2'>
      {rows.map((r) => (
        <div
          key={r}
          className='flex items-center justify-between rounded-md bg-white/5 px-3 py-2'
        >
          <span className='text-white/70'>{r}</span>
          <span className='trajanpro-bold'>{res[r] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}
