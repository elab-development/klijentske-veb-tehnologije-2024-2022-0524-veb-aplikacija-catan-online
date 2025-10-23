// catan-core-types.ts
// ------------------------------------------------------------
// Ovaj fajl definiše *domen* (model podataka) za Catan aplikaciju.
// Sve ostalo (engine, store, UI) koristi ove tipove i interfejse.
// ------------------------------------------------------------

/**
 * ResourceType — skup dozvoljenih string literala (union type).
 */
export type ResourceType =
  | 'Brick'
  | 'Lumber'
  | 'Wool'
  | 'Grain'
  | 'Ore'
  | 'Desert';

export const ResourceType = {
  Brick: 'Brick' as ResourceType,
  Lumber: 'Lumber' as ResourceType,
  Wool: 'Wool' as ResourceType,
  Grain: 'Grain' as ResourceType,
  Ore: 'Ore' as ResourceType,
  Desert: 'Desert' as ResourceType,
};

/**
 * ResourceBundle — mapa resurs → količina.
 *  - Korišćen je Partial<Record<ResourceType, number>> umesto punog Record-a,
 *    tako da "nepostojeći ključ" znači 0 (nema potrebe da svuda držimo nule).
 *  - Primer: { Brick: 2, Grain: 1 } implicira da je ostalo 0.
 */
export type ResourceBundle = Partial<Record<ResourceType, number>>;

/**
 * TileId i NodeId su aliasi za string:
 *  - TileId identifikuje heks pločicu (npr. "T7").
 *  - NodeId identifikuje temena (čvorove) između pločica (npr. "N23"),
 *    gde igrači postavljaju naselja.
 */
export type TileId = string;
export type NodeId = string;

/**
 * Tile — opis jedne heks pločice na mapi.
 *  - id: jedinstveni identifikator pločice
 *  - resource: tip resursa koji ta pločica proizvodi
 *  - numberToken: broj žetona (2–12) koji aktivira proizvodnju; za pustinju je null.
 */
export interface Tile {
  id: TileId;
  resource: ResourceType;
  numberToken: number | null;
}

/**
 * PlayerState — interni model stanja igrača u engine-u.
 *  - id
 *  - name: prikazno ime igrača u UI-ju.
 *  - resources: ResourceBundle sa trenutnim kartama resursa.
 *  - settlements: Set<NodeId> — skup čvorova gde igrač ima naselje.
 *  - victoryPoints: zbir VP
 */
export interface PlayerState {
  id: string;
  name: string;
  resources: ResourceBundle;
  settlements: Set<NodeId>;
  victoryPoints: number;
}

/**
 * TurnPhase — stanja kroz koja prolazi potez.
 *  - 'setupPlacement': inicijalna dva kruga postavljanja naselja (snake order).
 *  - 'awaitingRoll': redovni potez — čekamo bacanje kockica.
 *  - 'awaitingActions': posle bacanja ≠ 7 — igrač može da gradi
 *  - 'awaitingRobberMove': ako je pao 7 — prvo rešavamo lopova, pa tek onda akcije.
 */
export type TurnPhase =
  | 'setupPlacement'
  | 'awaitingRoll'
  | 'awaitingActions'
  | 'awaitingRobberMove';

/**
 * PublicGameView — pogled na stanje za UI.
 * Polja:
 *  - players: lista igrača ali samo { id, name, victoryPoints } (Pick<...>)
 *  - robberOn: TileId pločice na kojoj stoji lopov
 *  - bank: stanje banke (ResourceBundle)
 *  - tiles: pločice sa resursima i brojevima
 *  - currentPlayerId: id igrača na potezu (null pre starta)
 *  - turn: tekući broj poteza
 *  - phase: trenutna faza poteza (TurnPhase).
 *
 * Geometrija za render i pravila:
 *  - nodeOwnership: mapa NodeId → playerId ili null (ko drži koje teme).
 *  - nodeAdjacentTiles: NodeId → lista TileId koji dodiruju to teme (1–3 kom).
 *    sa kojih pločica to teme skuplja resurse
 *  - nodeAnchors: NodeId → { tileId, cornerIndex } — "sidro" za pozicioniranje
 *    u SVG-u: od koje pločice i kog ugla (0..5) računamo pixel koordinate.
 */
export interface PublicGameView {
  players: Array<Pick<PlayerState, 'id' | 'name' | 'victoryPoints'>>;
  robberOn: TileId;
  bank: ResourceBundle;
  tiles: Tile[];
  currentPlayerId: string | null;
  turn: number;
  phase: TurnPhase;

  nodeOwnership: Record<NodeId, string | null>;
  nodeAdjacentTiles: Record<NodeId, TileId[]>;
  nodeAnchors: Record<NodeId, { tileId: TileId; cornerIndex: number }>;
}
