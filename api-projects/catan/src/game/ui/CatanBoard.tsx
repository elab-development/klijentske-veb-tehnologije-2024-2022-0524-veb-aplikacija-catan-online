import { useMemo } from 'react';
import { axialByTileId, hexCornerOffset, axialToPixel } from '../board-presets';
import type { PublicGameView, TileId, NodeId } from '../catan-core-types';

type Props = {
  view: PublicGameView;
  size?: number; // hex radius (px)
  highlightNodes?: NodeId[];
  onNodeClick?: (nodeId: NodeId) => void;
  onTileClick?: (tileId: TileId) => void;
};

const resourceFill: Record<string, string> = {
  Brick: '#B55239',
  Lumber: '#2F7D32',
  Wool: '#6BAA40',
  Grain: '#D4AF37',
  Ore: '#7A7A7A',
  Desert: '#D9C69F',
};

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
  size = 40,
  highlightNodes = [],
  onNodeClick,
  onTileClick,
}: Props) {
  // Tile polygons
  const tiles = useMemo(() => {
    return view.tiles.map((t) => {
      const axial = axialByTileId[t.id];
      const center = axialToPixel(axial.q, axial.r, size);
      const corners = Array.from({ length: 6 }, (_, i) => {
        const { dx, dy } = hexCornerOffset(size, i);
        return { x: center.x + dx, y: center.y + dy };
      });
      return {
        id: t.id,
        resource: t.resource,
        numberToken: t.numberToken,
        center,
        corners,
      };
    });
  }, [view.tiles, size]);

  // Node positions (anchor tile + corner)
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

  // Board bounds
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

  const robberTile = view.robberOn;
  const highlightSet = useMemo(() => new Set(highlightNodes), [highlightNodes]);

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
        {/* Tiles */}
        {tiles.map((t) => {
          const points = t.corners.map((c) => `${c.x},${c.y}`).join(' ');
          const isRobber = t.id === robberTile;
          return (
            <g key={t.id}>
              <polygon
                points={points}
                fill={resourceFill[t.resource] ?? '#ccc'}
                stroke='rgba(255,255,255,0.3)'
                strokeWidth={1.5}
                onClick={() => onTileClick?.(t.id)}
                style={{ cursor: onTileClick ? 'pointer' : 'default' }}
              />
              {/* number token */}
              {t.numberToken !== null && (
                <g transform={`translate(${t.center.x}, ${t.center.y})`}>
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
              {/* robber ring */}
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

        {/* Settlement nodes */}
        {Object.entries(nodePos).map(([nid, p]) => {
          const ownerId = view.nodeOwnership[nid as NodeId];
          const owned = !!ownerId;
          const ownerColor = owned ? playerColorById[ownerId!] : 'white';
          const isLegal = highlightSet.has(nid as NodeId);

          return (
            <g key={nid} transform={`translate(${p.x}, ${p.y})`}>
              {isLegal && !owned && (
                <circle
                  r={size * 0.34}
                  fill='none'
                  stroke='#FCDE07'
                  strokeWidth={2.5}
                />
              )}
              <circle
                r={size * 0.25}
                fill={owned ? ownerColor : 'rgba(255,255,255,0.85)'}
                stroke={owned ? 'white' : 'rgba(0,0,0,0.4)'}
                strokeWidth={1.5}
                style={{
                  cursor: onNodeClick && !owned ? 'pointer' : 'default',
                }}
                onClick={() => !owned && onNodeClick?.(nid as NodeId)}
              />
            </g>
          );
        })}
      </svg>

      {/* Player legend */}
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
