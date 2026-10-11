// Manual lineup edits (docs/rules.md §1, step 4). Pure: no I/O.

import type { Slot } from "./positions";

/**
 * Puts player `p` at `slot` in inning `i` (0-based) and returns a new grid.
 * A teammate who already held that position in that inning takes p's old slot,
 * so an edit is a swap and every position stays filled. Bench isn't a
 * position, so moving to the bench never displaces anyone.
 */
export function assignSlot(innings: Slot[][], i: number, p: number, slot: Slot): Slot[][] {
  const next = innings.map((row) => [...row]);
  const row = next[i];
  const old = row[p];
  if (old === slot) return next;
  if (slot !== "BN") {
    const other = row.findIndex((s, k) => k !== p && s === slot);
    if (other !== -1) row[other] = old;
  }
  row[p] = slot;
  return next;
}
