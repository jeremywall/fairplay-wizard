import { describe, expect, it } from "vitest";
import { battingOrderForGame, lastBatterOfGame } from "../../src/domain/batting-order";

const order = ["a", "b", "c", "d", "e"];
const everyone = new Set(order);

describe("battingOrderForGame", () => {
  it("starts at the top for the first game", () => {
    expect(battingOrderForGame(order, everyone, null)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("resumes with the player after the last batter", () => {
    expect(battingOrderForGame(order, everyone, "c")).toEqual(["d", "e", "a", "b", "c"]);
  });

  it("wraps to the top when the last batter was at the end of the order", () => {
    expect(battingOrderForGame(order, everyone, "e")).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("skips absent players, including the next scheduled batter", () => {
    expect(battingOrderForGame(order, new Set(["a", "b", "c", "e"]), "c")).toEqual(["e", "a", "b", "c"]);
  });

  it("resumes after the last batter even if that player is absent this game", () => {
    expect(battingOrderForGame(order, new Set(["a", "b", "d", "e"]), "c")).toEqual(["d", "e", "a", "b"]);
  });

  it("starts at the top if the last batter has left the roster", () => {
    expect(battingOrderForGame(order, everyone, "zz")).toEqual(order);
  });

  it("handles an empty roster", () => {
    expect(battingOrderForGame([], new Set(), null)).toEqual([]);
  });
});

describe("lastBatterOfGame", () => {
  it("returns the batter who took the final plate appearance, wrapping through the order", () => {
    expect(lastBatterOfGame(["d", "e", "a"], 2)).toBe("e");
    expect(lastBatterOfGame(["d", "e", "a"], 7)).toBe("d");
  });

  it("returns null when nobody batted", () => {
    expect(lastBatterOfGame(["a", "b"], 0)).toBeNull();
    expect(lastBatterOfGame([], 3)).toBeNull();
  });
});
