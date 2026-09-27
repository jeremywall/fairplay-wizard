// Saved games. Callers must check requireTeamAccess first; every query is also
// scoped by team_id so a game id from another team never matches.

import type { GameOptions } from "../domain/lineup";
import type { AlignmentMode, Slot } from "../domain/positions";
import type { GameRecord } from "../domain/season";
import { TeamAccessError } from "./teams";

export type GameStatus = "planned" | "final";

export interface GameSummary {
  id: string;
  date: string;
  opponent: string | null;
  status: GameStatus;
  playerCount: number;
}

export interface GameDetail {
  id: string;
  date: string;
  opponent: string | null;
  status: GameStatus;
  options: GameOptions;
  /** Players present, in this game's batting order. */
  players: { id: string; name: string }[];
  /** `innings[i][k]` is the slot of `players[k]` in inning i + 1. */
  innings: Slot[][];
  plateAppearances: number | null;
  lastBatterId: string | null;
}

export interface NewGame {
  date: string;
  opponent: string | null;
  options: GameOptions;
  battingOrder: string[];
  innings: Slot[][];
}

export async function saveGame(db: D1Database, teamId: string, game: NewGame): Promise<string> {
  const id = crypto.randomUUID();
  const { options } = game;
  const statements = [
    db
      .prepare(
        `INSERT INTO game (id, team_id, game_date, opponent, innings, alignment_mode, pitcher_inning_limit, min_defensive_outs)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, teamId, game.date, game.opponent, options.innings, options.alignmentMode, options.pitcherInningLimit, options.minDefensiveOuts),
    ...game.battingOrder.map((playerId, k) =>
      db.prepare(`INSERT INTO game_player (game_id, player_id, batting_position) VALUES (?, ?, ?)`).bind(id, playerId, k + 1),
    ),
    ...game.innings.flatMap((inning, i) =>
      inning.map((slot, k) =>
        db
          .prepare(`INSERT INTO game_assignment (game_id, player_id, inning, slot) VALUES (?, ?, ?, ?)`)
          .bind(id, game.battingOrder[k], i + 1, slot),
      ),
    ),
  ];
  await db.batch(statements);
  return id;
}

export async function listGames(db: D1Database, teamId: string): Promise<GameSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id, g.game_date AS date, g.opponent, g.status,
              (SELECT COUNT(*) FROM game_player gp WHERE gp.game_id = g.id) AS playerCount
         FROM game g
        WHERE g.team_id = ?
        ORDER BY g.game_date DESC, g.created_at DESC`,
    )
    .bind(teamId)
    .all<GameSummary>();
  return results;
}

interface GameRow {
  id: string;
  date: string;
  opponent: string | null;
  status: GameStatus;
  innings: number;
  alignmentMode: AlignmentMode;
  pitcherInningLimit: 1 | 2;
  minDefensiveOuts: number;
  plateAppearances: number | null;
  lastBatterId: string | null;
}

/** Loads a game, or throws TeamAccessError if it isn't one of this team's games. */
export async function getGame(db: D1Database, teamId: string, gameId: string): Promise<GameDetail> {
  const [gameResult, playersResult, slotsResult] = await db.batch([
    db
      .prepare(
        `SELECT id, game_date AS date, opponent, status, innings, alignment_mode AS alignmentMode,
                pitcher_inning_limit AS pitcherInningLimit, min_defensive_outs AS minDefensiveOuts,
                plate_appearances AS plateAppearances, last_batter_player_id AS lastBatterId
           FROM game WHERE id = ? AND team_id = ?`,
      )
      .bind(gameId, teamId),
    db
      .prepare(
        `SELECT p.id, p.name
           FROM game_player gp JOIN player p ON p.id = gp.player_id
          WHERE gp.game_id = ? AND p.team_id = ?
          ORDER BY gp.batting_position`,
      )
      .bind(gameId, teamId),
    db
      .prepare(
        `SELECT ga.player_id AS playerId, ga.inning, ga.slot
           FROM game_assignment ga JOIN game g ON g.id = ga.game_id
          WHERE ga.game_id = ? AND g.team_id = ?`,
      )
      .bind(gameId, teamId),
  ]);
  const row = (gameResult.results as GameRow[])[0];
  if (!row) throw new TeamAccessError();
  const players = playersResult.results as { id: string; name: string }[];
  const index = new Map(players.map((p, k) => [p.id, k]));
  const innings: Slot[][] = Array.from({ length: row.innings }, () => new Array<Slot>(players.length).fill("BN"));
  for (const { playerId, inning, slot } of slotsResult.results as { playerId: string; inning: number; slot: Slot }[]) {
    const k = index.get(playerId);
    if (k !== undefined) innings[inning - 1][k] = slot;
  }
  return {
    id: row.id,
    date: row.date,
    opponent: row.opponent,
    status: row.status,
    options: {
      innings: row.innings,
      alignmentMode: row.alignmentMode,
      pitcherInningLimit: row.pitcherInningLimit,
      minDefensiveOuts: row.minDefensiveOuts,
    },
    players,
    innings,
    plateAppearances: row.plateAppearances,
    lastBatterId: row.lastBatterId,
  };
}

export async function finalizeGame(
  db: D1Database,
  teamId: string,
  gameId: string,
  result: { plateAppearances: number; lastBatterId: string | null },
): Promise<void> {
  await db
    .prepare(
      `UPDATE game SET status = 'final', plate_appearances = ?, last_batter_player_id = ?, finalized_at = datetime('now')
        WHERE id = ? AND team_id = ?`,
    )
    .bind(result.plateAppearances, result.lastBatterId, gameId, teamId)
    .run();
}

export async function reopenGame(db: D1Database, teamId: string, gameId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE game SET status = 'planned', plate_appearances = NULL, last_batter_player_id = NULL, finalized_at = NULL
        WHERE id = ? AND team_id = ?`,
    )
    .bind(gameId, teamId)
    .run();
}

export async function deleteGame(db: D1Database, teamId: string, gameId: string): Promise<void> {
  await db.prepare(`DELETE FROM game WHERE id = ? AND team_id = ?`).bind(gameId, teamId).run();
}

/**
 * The batting-order pointer (BO-3, BO-6): the last player who batted in the
 * most recent finalized game in which anyone batted.
 */
export async function lastBatterPointer(db: D1Database, teamId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT last_batter_player_id AS id FROM game
        WHERE team_id = ? AND status = 'final' AND last_batter_player_id IS NOT NULL
        ORDER BY game_date DESC, finalized_at DESC
        LIMIT 1`,
    )
    .bind(teamId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/** Finalized games as records for season totals. */
export async function finalGameRecords(db: D1Database, teamId: string): Promise<GameRecord[]> {
  const [gamesResult, playersResult, slotsResult] = await db.batch([
    db
      .prepare(`SELECT id, innings, plate_appearances AS plateAppearances FROM game WHERE team_id = ? AND status = 'final'`)
      .bind(teamId),
    db
      .prepare(
        `SELECT gp.game_id AS gameId, gp.player_id AS playerId
           FROM game_player gp JOIN game g ON g.id = gp.game_id
          WHERE g.team_id = ? AND g.status = 'final'
          ORDER BY gp.game_id, gp.batting_position`,
      )
      .bind(teamId),
    db
      .prepare(
        `SELECT ga.game_id AS gameId, ga.player_id AS playerId, ga.inning, ga.slot
           FROM game_assignment ga JOIN game g ON g.id = ga.game_id
          WHERE g.team_id = ? AND g.status = 'final'`,
      )
      .bind(teamId),
  ]);

  const records = new Map<string, GameRecord & { index: Map<string, number> }>();
  for (const g of gamesResult.results as { id: string; innings: number; plateAppearances: number | null }[]) {
    records.set(g.id, { battingOrder: [], innings: Array.from({ length: g.innings }, () => []), plateAppearances: g.plateAppearances, index: new Map() });
  }
  for (const { gameId, playerId } of playersResult.results as { gameId: string; playerId: string }[]) {
    const record = records.get(gameId);
    if (!record) continue;
    record.index.set(playerId, record.battingOrder.length);
    record.battingOrder.push(playerId);
  }
  for (const record of records.values()) {
    for (const inning of record.innings) inning.push(...new Array<Slot>(record.battingOrder.length).fill("BN"));
  }
  for (const { gameId, playerId, inning, slot } of slotsResult.results as { gameId: string; playerId: string; inning: number; slot: Slot }[]) {
    const record = records.get(gameId);
    const k = record?.index.get(playerId);
    if (record && k !== undefined) record.innings[inning - 1][k] = slot;
  }
  return [...records.values()].map(({ battingOrder, innings, plateAppearances }) => ({ battingOrder, innings, plateAppearances }));
}
