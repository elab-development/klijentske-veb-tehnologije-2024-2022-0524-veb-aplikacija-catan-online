// Game.tsx
// -----------------------------------------------------------------------------
// Glavna stranica "Game":
// - Orkestrira stanje preko Zustand store-a (useGameStore).
// - Rukuje inicijalizacijom igre, dodavanjem igrača, startovanjem,
//   bacanjem kockica, prelaskom poteza, postavljanjem naselja (setup + akcije),
//   kao i radom sa lokalnim snimanjem (Continue / Clear Save).
// - Prikazuje tablu (CatanBoard), traku sa informacijama (turn, phase, last roll),
//   listu igrača sa resursima i deltama (+/-), banku i log poruke.
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import CatanBoard from '../game/ui/CatanBoard';
import type { NodeId, TileId, ResourceBundle } from '../game/catan-core-types';

export default function Game() {
  //-----------------------------------------------------------------------
  // Selektovanje delova stanja iz Zustand-a. Svaki selektor menja komponentu
  // samo kada se ta vrednost promeni. Ovo je efikasnije nego (s) => s
  // jer izbegavamo re-render-e na svaku promenu nebitnog dela store-a.
  // ---------------------------------------------------------------------------
  const view = useGameStore((s) => s.view);
  const started = useGameStore((s) => s.started);
  const lastRoll = useGameStore((s) => s.lastRoll);
  const messages = useGameStore((s) => s.messages);
  const lastGains = useGameStore((s) => s.lastGains); // per-turn +deltas po igraču
  const lastLosses = useGameStore((s) => s.lastLosses); // per-turn -deltas po igraču
  const resVersion = useGameStore((s) => s.resVersion); // bump za force re-calc resursa
  const hasSaved = useGameStore((s) => s.hasSaved); // da li postoji save u localStorage

  // Akcije iz store-a: inicijalizacija, reset, upravljanje igračima i potezima itd.
  const init = useGameStore((s) => s.init);
  const reset = useGameStore((s) => s.reset);
  const addPlayer = useGameStore((s) => s.addPlayer);
  const startGame = useGameStore((s) => s.startGame);
  const continueSaved = useGameStore((s) => s.continueSaved);
  const clearSaved = useGameStore((s) => s.clearSaved);
  const roll = useGameStore((s) => s.roll);
  const nextPlayer = useGameStore((s) => s.nextPlayer);
  const moveRobber = useGameStore((s) => s.moveRobber);
  const buildSettlementAt = useGameStore((s) => s.buildSettlementAt);
  const placeInitialSettlement = useGameStore((s) => s.placeInitialSettlement);
  const getAvailableSettlementSpots = useGameStore(
    (s) => s.getAvailableSettlementSpots
  );
  const checkSaved = useGameStore((s) => s.checkSaved);

  // Stabilna referenca na funkciju koja vraća resurse igrača u trenutnom engine-u.
  // useRef čuva istu referencu kroz render-e (ne menja se).
  const getPlayerResourcesFn = useRef(
    useGameStore.getState().getPlayerResources
  );

  // Lokalne UI state promenljive
  const [name, setName] = useState(''); // input za dodavanje igrača
  const [availableSpots, setAvailableSpots] = useState<NodeId[]>([]); // highlight čvorova

  // ---------------------------------------------------------------------------
  // Jednokratna inicijalizacija:
  // - checkSaved() da saznamo da li u localStorage postoji sačuvana igra (za Continue).
  // - init() da pokrenemo engine (random board uz drand seed ili fallback).
  // didInit ref služi da spreči ponovnu init logiku ako se ovaj effect ponovo pozove
  // ---------------------------------------------------------------------------
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    checkSaved();
    init();
  }, [init, checkSaved]);

  // ---------------------------------------------------------------------------
  // Kad god se stanje relevantno promeni (faza, current player, ownership itd.),
  // izračunamo legalne čvorove za postavljanje naselja (setup & akcije).
  // Ako igra nije startovana ili ne postoji view, praznimo listu.
  // ---------------------------------------------------------------------------
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

  const canStart = (view?.players.length ?? 0) >= 2; // minimalno 2 igrača
  const phase = view?.phase ?? 'setupPlacement';
  const inSetup = phase === 'setupPlacement'; // početna snake postavka
  const canRoll = phase === 'awaitingRoll'; // bacanje kockica dozvoljeno
  const canAct = phase === 'awaitingActions'; // posle roll-a (≠7)
  const needsRobber = phase === 'awaitingRobberMove'; // posle roll=7

  // Trenutni igrač (po id-u iz view.currentPlayerId)
  const currentPlayer = useMemo(() => {
    if (!view) return null;
    return view.players.find((p) => p.id === view.currentPlayerId) ?? null;
  }, [view]);

  return (
    <div className='min-h-[calc(100vh-56px)] bg-[#08151F] text-white'>
      {/* Header */}
      <div className='mx-auto max-w-6xl px-4 py-4'>
        <h1 className='trajanpro-bold text-2xl'>CATAN — Local Tabletop</h1>
        <p className='text-white/70'>
          Build, roll, and trade — all on one device.
        </p>
      </div>

      {/* -----------------------------------------------------------------------
         PRE-GAME (setup) panel:
         - Dodavanje igrača (input + Add player)
         - Start game dugme (disabled dok nema >= 2 igrača)
         - Ako postoji local save: Continue i Clear Save dugmad
         - Reset uvek dostupan (resetuje aktuelni session i briše save)
      ----------------------------------------------------------------------- */}
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

            {/* Prikaz trenutne liste igrača (imena) */}
            <div className='text-sm text-white/80'>
              Current players:{' '}
              {view?.players.length
                ? view.players.map((p) => p.name).join(', ')
                : '—'}
            </div>

            {/* Kontrole za start/continue/clear/reset */}
            <div className='flex items-center flex-wrap gap-2'>
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

              {hasSaved && !view?.players.length && (
                <>
                  <button
                    onClick={continueSaved}
                    className='rounded-md bg-[#2e7d32] px-4 py-2 hover:opacity-90'
                  >
                    Continue
                  </button>
                  <button
                    onClick={clearSaved}
                    className='rounded-md border border-white/20 px-4 py-2 hover:bg-white/10'
                    title='Remove saved game from this browser'
                  >
                    Clear Save
                  </button>
                </>
              )}

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

      {/* -----------------------------------------------------------------------
         IN-GAME panel:
         - Top info bar (Turn, Current Player, Phase, Last Roll)
         - CatanBoard (SVG tabla) sa highlight-ovanim legalnim čvorovima
         - Actions: Roll / Next Player (zavisno od faze)
         - Lista igrača + resursi (sa +/− deltama nakon roll/robber)
         - Bank prikaz
         - Log (istorija poruka)
      ----------------------------------------------------------------------- */}
      {started && view && (
        <div className='mx-auto max-w-6xl px-4 pb-8'>
          {/* Gornja info traka */}
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

          {/* Tabla (SVG). Klik na node: setup→placeInitial, actions→buildSettlement.
             Klik na tile: samo kada treba pomeriti lopova (needsRobber). */}
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

          {/* Akcije poteza – roll (samo na početku poteza) i end turn (posle akcija) */}
          <div className='mb-6 flex flex-wrap items-center gap-2'>
            <button
              onClick={roll}
              disabled={!canRoll}
              className={`rounded-md px-4 py-2 ${
                canRoll
                  ? 'bg-[#215B85] hover:opacity-90 cursor-pointer'
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
                  ? 'border border-white/20 hover:bg-white/10 cursor-pointer'
                  : 'bg-white/10 cursor-not-allowed'
              }`}
              title={
                !canAct ? 'Finish your roll/robber before ending turn' : ''
              }
            >
              Next Player
            </button>
          </div>

          {/* Igrači + resursi sa prikazom +/− delti nakon roll-a/robbera.
             resVersion je "bump" koji tera PlayerCard da recompute-uje resurse odmah. */}
          <div className='mb-6'>
            <h2 className='trajanpro-bold mb-2 text-xl'>Players</h2>
            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              {view.players.map((p) => (
                <PlayerCard
                  key={p.id}
                  playerId={p.id}
                  name={p.name}
                  victoryPoints={p.victoryPoints}
                  resVersion={resVersion} // recompute odmah posle promene
                  getRes={getPlayerResourcesFn}
                  gains={lastGains[p.id] ?? {}}
                  losses={lastLosses[p.id] ?? {}}
                />
              ))}
            </div>
          </div>

          {/* Bank - resursi koji su ostali u banci */}
          <div className='mb-6 rounded-xl bg-white/5 p-4'>
            <h2 className='trajanpro-bold mb-2 text-xl'>Bank</h2>
            <KeyValueRow label='Brick' value={view.bank.Brick ?? 0} />
            <KeyValueRow label='Lumber' value={view.bank.Lumber ?? 0} />
            <KeyValueRow label='Wool' value={view.bank.Wool ?? 0} />
            <KeyValueRow label='Grain' value={view.bank.Grain ?? 0} />
            <KeyValueRow label='Ore' value={view.bank.Ore ?? 0} />
          </div>

          {/* Log - istorija poruka iz store-a */}
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

// -----------------------------------------------------------------------------
// InfoCard – mali info blok (label + value), koristi se u gornjoj traci.
// -----------------------------------------------------------------------------
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

// Jednostavan red "label: value" – koristi se za banku
function KeyValueRow({ label, value }: { label: string; value: number }) {
  return (
    <div className='flex items-center justify-between border-b border-white/10 py-1 text-white/80'>
      <span>{label}</span>
      <span className='trajanpro-bold'>{value}</span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// PlayerCard – prikaz pojedinačnog igrača:
// - Ime, VP
// - Resursi iz engine-a (getRes.current(playerId)) – "resVersion" kao dep.
// - Prikaz +/− delti (gains/losses) pored svake vrste resursa.
// -----------------------------------------------------------------------------
function PlayerCard({
  playerId,
  name,
  victoryPoints,
  resVersion,
  getRes,
  gains,
  losses,
}: {
  playerId: string;
  name: string;
  victoryPoints: number;
  resVersion: number; // bump za preračun
  getRes: React.MutableRefObject<(pid: string) => any>;
  gains: ResourceBundle; // +deltas za ovaj turn
  losses: ResourceBundle; // -deltas za ovaj turn
}) {
  // Kad se promeni resVersion ili playerId (ili referenca getRes),
  // ponovo čitamo aktuelne resurse iz engine-a (read-only snapshot).
  const res = useMemo(
    () => getRes.current(playerId),
    [playerId, resVersion, getRes]
  );

  // Redosled prikaza resursa
  const rows = ['Brick', 'Lumber', 'Wool', 'Grain', 'Ore'] as const;

  return (
    <div className='rounded-xl bg-white/5 p-4'>
      <div className='flex items-center justify-between'>
        <div className='trajanpro-bold text-lg'>{name}</div>
        <div className='text-white/80'>VP: {victoryPoints}</div>
      </div>
      <div className='mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2'>
        {rows.map((r) => {
          // Trenutna količina i delte iz store-a
          const base = (res as any)[r] ?? 0;
          const plus = (gains as any)[r] ?? 0;
          const minus = (losses as any)[r] ?? 0;
          return (
            <div
              key={r}
              className='flex items-center justify-between rounded-md bg-white/5 px-3 py-2'
            >
              <span className='text-white/70'>{r}</span>
              <span className='trajanpro-bold inline-flex items-center gap-2'>
                <span>{base}</span>
                {plus > 0 && (
                  <span className='text-green-400 text-sm font-normal'>
                    +{plus}
                  </span>
                )}
                {minus > 0 && (
                  <span className='text-red-400 text-sm font-normal'>
                    -{minus}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
