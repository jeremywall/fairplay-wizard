import { assignSlot } from "../domain/edit";
import { MIN_PLAYERS, POSITIONS, type Slot } from "../domain/positions";
import { cellName } from "../views/lineup";

// Reads the lineup posted by the lineup editor (src/views/lineup.ts) for
// checking an edit or saving a game.

const VALID_SLOTS = new Set<string>([...Object.keys(POSITIONS), "BN"]);

export interface PostedLineup {
  players: string[];
  innings: Slot[][];
}

/**
 * Parses the `lineup` JSON field. Returns null unless every player is one of
 * `allowedIds` and the grid has the right shape.
 */
export function parseLineup(raw: unknown, innings: number, allowedIds: Set<string>): PostedLineup | null {
  if (typeof raw !== "string") return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const { players, innings: grid } = (data ?? {}) as { players?: unknown; innings?: unknown };
  if (!Array.isArray(players) || !Array.isArray(grid)) return null;
  if (players.length < MIN_PLAYERS || new Set(players).size !== players.length) return null;
  if (!players.every((id) => typeof id === "string" && allowedIds.has(id))) return null;
  if (grid.length !== innings) return null;
  const validRow = (row: unknown) =>
    Array.isArray(row) && row.length === players.length && row.every((slot) => typeof slot === "string" && VALID_SLOTS.has(slot));
  if (!grid.every(validRow)) return null;
  return { players: players as string[], innings: grid as Slot[][] };
}

/**
 * The editor's lineup: the grid it last rendered (`lineup`), with each
 * position dropdown that differs from it applied as a swap (HR-7 stays met).
 */
export function readLineup(body: Record<string, unknown>, innings: number, allowedIds: Set<string>): PostedLineup | null {
  const base = parseLineup(body.lineup, innings, allowedIds);
  if (!base) return null;
  let grid = base.innings;
  base.innings.forEach((row, i) =>
    row.forEach((before, p) => {
      // Compare with the rendered grid, not the running result: a teammate's
      // dropdown still shows the slot they had before a swap moved them.
      const posted = body[cellName(i, p)];
      if (typeof posted === "string" && VALID_SLOTS.has(posted) && posted !== before) {
        grid = assignSlot(grid, i, p, posted as Slot);
      }
    }),
  );
  return { players: base.players, innings: grid };
}
