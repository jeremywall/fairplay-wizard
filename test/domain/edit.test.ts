import { describe, expect, it } from "vitest";
import { assignSlot } from "../../src/domain/edit";
import type { Slot } from "../../src/domain/positions";

describe("assignSlot (manual edits)", () => {
  const grid: Slot[][] = [
    ["P", "C", "1B", "2B", "BN"],
    ["C", "P", "BN", "1B", "2B"],
  ];

  it("swaps with the teammate who had that position in that inning", () => {
    const next = assignSlot(grid, 0, 0, "2B");
    expect(next[0]).toEqual(["2B", "C", "1B", "P", "BN"]);
    expect(next[1]).toEqual(grid[1]);
  });

  it("swaps a benched player into the field", () => {
    expect(assignSlot(grid, 0, 4, "1B")[0]).toEqual(["P", "C", "BN", "2B", "1B"]);
  });

  it("moves a player to the bench without displacing anyone", () => {
    expect(assignSlot(grid, 1, 0, "BN")[1]).toEqual(["BN", "P", "BN", "1B", "2B"]);
  });

  it("fills an open position without a swap", () => {
    expect(assignSlot(grid, 0, 4, "SS")[0]).toEqual(["P", "C", "1B", "2B", "SS"]);
  });

  it("leaves the input grid unchanged", () => {
    const copy = grid.map((row) => [...row]);
    assignSlot(grid, 0, 0, "C");
    expect(grid).toEqual(copy);
  });
});
