// Defensive positions and which ones are fielded for a given attendance
// (docs/rules.md §2, HR-7). Everything else reads positions from here.

export type Category = "infield" | "outfield" | "bench";

export const POSITIONS = {
  P: { name: "Pitcher", category: "infield" },
  C: { name: "Catcher", category: "infield" },
  "1B": { name: "First base", category: "infield" },
  "2B": { name: "Second base", category: "infield" },
  "3B": { name: "Third base", category: "infield" },
  SS: { name: "Shortstop", category: "infield" },
  LF: { name: "Left field", category: "outfield" },
  CF: { name: "Center field", category: "outfield" },
  RF: { name: "Right field", category: "outfield" },
  LC: { name: "Left-center", category: "outfield" },
  RC: { name: "Right-center", category: "outfield" },
} as const satisfies Record<string, { name: string; category: Category }>;

export type PositionId = keyof typeof POSITIONS;
export type Slot = PositionId | "BN";
export type AlignmentMode = 9 | 10;

export const MIN_PLAYERS = 7;

export function categoryOf(slot: Slot): Category {
  return slot === "BN" ? "bench" : POSITIONS[slot].category;
}

/** Fielded positions for the number of players present (HR-7). Empty if fewer than 7. */
export function fieldedPositions(present: number, mode: AlignmentMode): PositionId[] {
  if (present < MIN_PLAYERS) return [];
  if (present === 7) return ["P", "1B", "2B", "3B", "SS", "LC", "RC"];
  if (present === 8) return ["P", "C", "1B", "2B", "3B", "SS", "LC", "RC"];
  if (present === 9 || mode === 9) return ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
  return ["P", "C", "1B", "2B", "3B", "SS", "LF", "LC", "RC", "RF"];
}

/** Alignment mode implied by attendance: 10 positions only when 10 or more are present. */
export function defaultAlignmentMode(present: number): AlignmentMode {
  return present >= 10 ? 10 : 9;
}
