// CatanBoard.tsx
// -----------------------------------------------------------------------------
// Vizuelna tabla (SVG) za Catan:
// - Renderuje 19 hex pločica (flat-top) i čvorove za naselja.
// - Koristi "axial" koordinate iz board-presets i pretvara ih u pixele.
// - Prikazuje broj na pločici (number token), lokaciju lopova i vlasništvo
//   nad čvorovima. Omogućava klik na pločicu (za lopova) i klik na čvor
//   (za postavljanje naselja).
// -----------------------------------------------------------------------------

import { useMemo } from 'react';
import { axialByTileId, hexCornerOffset, axialToPixel } from '../board-presets';
import type { PublicGameView, TileId, NodeId } from '../catan-core-types';

type CatanBoardProps = {
  view: PublicGameView; // "read-only" snapshot stanja iz engine-a
  size?: number; // poluprečnik hexa u px (kontroliše skalu)
  highlightNodes?: NodeId[]; // lista legalnih čvorova
  onNodeClick?: (nodeId: NodeId) => void; // handler za klik na čvor
  onTileClick?: (tileId: TileId) => void; // handler za klik na pločicu (robber)
};

// Boje po tipu resursa
const resourceFill: Record<string, string> = {
  Brick: '#B55239',
  Lumber: '#2F7D32',
  Wool: '#6BAA40',
  Grain: '#D4AF37',
  Ore: '#7A7A7A',
  Desert: '#D9C69F',
};

// Paleta boja igrača
const playerColors = [
  '#FCDE07',
  '#6CC5F5',
  '#EF6C00',
  '#C792EA',
  '#66BB6A',
  '#F06292',
];

export default function CatanBoard({
  view,
  size = 40, // default skala hexa
  highlightNodes = [], // default: nema highlight-a
  onNodeClick,
  onTileClick,
}: CatanBoardProps) {
  // ---------------------------------------------------------------------------
  // 1) Izračunavanje pločica (centar + 6 temena) iz axial koordinata:
  //
  // - U "flat-top" konfiguraciji, centar hexa (q,r) pretvaramo u pixel:
  //     x = size * (3/2) * q
  //     y = size * sqrt(3) * (r + q/2)
  //   (vidi axialToPixel u board-presets)
  //
  // - Svako teme je pomak od centra vektorom:
  //     dx = size * cos(θ),  dy = size * sin(θ)
  //   gde je θ = 0°, 60°, 120°, ... (hexCornerOffset)
  // ---------------------------------------------------------------------------
  const tiles = useMemo(() => {
    return view.tiles.map((t) => {
      // dohvatimo axial centar iz mape (board-presets ga izračunava)
      const axial = axialByTileId[t.id];
      // projekcija u pixele za zadati poluprečnik "size"
      const center = axialToPixel(axial.q, axial.r, size);
      // 6 temena: idemo po uglovima 0..5, svaki je 60° korak (flat-top)
      const corners = Array.from({ length: 6 }, (_, i) => {
        const { dx, dy } = hexCornerOffset(size, i);
        return { x: center.x + dx, y: center.y + dy };
      });
      return {
        id: t.id,
        resource: t.resource,
        numberToken: t.numberToken, // null za pustinju
        center, // {x,y} centra pločice
        corners, // 6 tačaka temena za <polygon />
      };
    });
  }, [view.tiles, size]);

  // ---------------------------------------------------------------------------
  // 2) Pozicije čvorova (node-ova, tj. temena gde mogu da se postave naselja):
  //
  //   view.nodeAnchors: za svaki node imamo "anchorTileId" i "cornerIndex".
  //   Time dobijamo tačnu pixel poziciju: centar anchor pločice + offset ugla.
  //   (Isto kao gore: axial -> pixel centar, pa corner offset.)
  // --------------------------------------------------------------------------
  const nodePos = useMemo(() => {
    const dict: Record<NodeId, { x: number; y: number }> = {};
    for (const [nodeId, anchor] of Object.entries(view.nodeAnchors)) {
      const axial = axialByTileId[anchor.tileId];
      const center = axialToPixel(axial.q, axial.r, size);
      const { dx, dy } = hexCornerOffset(size, anchor.cornerIndex);
      dict[nodeId as NodeId] = { x: center.x + dx, y: center.y + dy };
    }
    return dict;
  }, [view.nodeAnchors, size]);

  // ---------------------------------------------------------------------------
  // 3) Dinamički viewBox (granice SVG-a):
  //
  //   Da bi SVG lepo "obuhvatio" celu tablu, gradimo bounding box od svih
  //   temena pločica. Dodamo pad (size * 1.2) da elementi ne budu "zalepljeni".
  //
  //   Rezultat koristimo u <svg viewBox="minX minY width height">
  // ---------------------------------------------------------------------------
  const bounds = useMemo(() => {
    const xs = tiles.flatMap((t) => t.corners.map((c) => c.x));
    const ys = tiles.flatMap((t) => t.corners.map((c) => c.y));
    const pad = size * 1.2;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [tiles, size]);

  // ID pločice na kojoj je lopov (robber)
  const robberTile = view.robberOn;
  // Skup čvorova koji su trenutno legalni (highlight)
  const highlightSet = useMemo(() => new Set(highlightNodes), [highlightNodes]);

  // Mapa: playerId -> boja (za kružić na legendi i bojenje node-a u vlasništvu)
  const playerColorById = useMemo(() => {
    const map: Record<string, string> = {};
    view.players.forEach(
      (p, idx) => (map[p.id] = playerColors[idx % playerColors.length])
    );
    return map;
  }, [view.players]);

  return (
    <div className='w-full overflow-x-auto rounded-xl bg-white/5 p-2'>
      <svg
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
        className='mx-auto h-[520px] w-full'
      >
        {/* ------------------------ PLOČICE (HEX) ------------------------ */}
        {tiles.map((t) => {
          const points = t.corners.map((c) => `${c.x},${c.y}`).join(' ');
          const isRobber = t.id === robberTile;
          return (
            <g key={t.id}>
              <polygon
                points={points}
                fill={resourceFill[t.resource] ?? '#ccc'} // boja po resursu
                stroke='rgba(255,255,255,0.3)' // ivica
                strokeWidth={1.5}
                onClick={() => onTileClick?.(t.id)} // klik za lopova
                style={{ cursor: onTileClick ? 'pointer' : 'default' }}
              />
              {/* "Number token" krug na sredini (nije za pustinju) */}
              {t.numberToken !== null && (
                <g transform={`translate(${t.center.x}, ${t.center.y})`}>
                  {/* svetli krug kao pločica za broj */}
                  <circle r={size * 0.35} fill='rgba(255,255,255,0.9)' />
                  <text
                    textAnchor='middle'
                    dominantBaseline='central'
                    fontWeight={700}
                    fontSize={size * 0.45}
                    fill='#222'
                  >
                    {t.numberToken}
                  </text>
                </g>
              )}
              {/* Prsten ako je ovde lopov */}
              {isRobber && (
                <g transform={`translate(${t.center.x}, ${t.center.y})`}>
                  <circle
                    r={size * 0.55}
                    fill='none'
                    stroke='#FCDE07'
                    strokeWidth={3}
                  />
                </g>
              )}
            </g>
          );
        })}

        {/* ---------------------- ČVOROVI (NODE-ovi) ---------------------- */}
        {Object.entries(nodePos).map(([nid, p]) => {
          // vlasništvo nad čvorom (null = slobodno)
          const ownerId = view.nodeOwnership[nid as NodeId];
          const owned = !!ownerId;
          const ownerColor = owned ? playerColorById[ownerId!] : 'white';
          // da li je node u highlight setu (legalno mesto)
          const isLegal = highlightSet.has(nid as NodeId);

          return (
            <g key={nid} transform={`translate(${p.x}, ${p.y})`}>
              {/* žuti prsten oko legalnog, ne-zauzetog čvora (vizuelni hint) */}
              {isLegal && !owned && (
                <circle
                  r={size * 0.34}
                  fill='none'
                  stroke='#FCDE07'
                  strokeWidth={2.5}
                />
              )}
              {/* sam čvor kao kružić; pun ako je u vlasništvu nekog igrača */}
              <circle
                r={size * 0.25}
                fill={owned ? ownerColor : 'rgba(255,255,255,0.85)'}
                stroke={owned ? 'white' : 'rgba(0,0,0,0.4)'}
                strokeWidth={1.5}
                style={{
                  // pointer samo ako postoji handler i čvor nije već zauzet
                  cursor: onNodeClick && !owned ? 'pointer' : 'default',
                }}
                onClick={() => !owned && onNodeClick?.(nid as NodeId)}
              />
            </g>
          );
        })}
      </svg>

      {/* Legenda igrača (boja ↔ ime) */}
      <div className='mt-2 flex flex-wrap items-center gap-3 text-sm text-white/70'>
        {view.players.map((p) => (
          <span key={p.id} className='inline-flex items-center gap-2'>
            <span
              className='inline-block h-3 w-3 rounded-full'
              style={{ background: playerColorById[p.id] }}
            />
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}
