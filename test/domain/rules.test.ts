import { describe, expect, it } from "vitest";
import { checkLineup, RULES } from "../../src/domain/rules";
import { lineupOf } from "./lineup-fixtures";

function rule(id: string) {
  const found = RULES.find((r) => r.id === id);
  if (!found) throw new Error(`No rule ${id}`);
  return found;
}

const messages = (id: string, rows: string[], options = {}) =>
  rule(id)
    .validate(lineupOf(rows, options))
    .map((v) => v.message);

describe("HR-1: catching more than 3 innings rules out pitching", () => {
  it("allows 3 innings catching plus pitching", () => {
    expect(messages("HR-1", ["Ava: C C C P 1B LF"])).toEqual([]);
  });
  it("flags 4 innings catching plus pitching", () => {
    expect(messages("HR-1", ["Ava: C C C C P LF"])).toEqual(["Ava catches 4 innings and also pitches."]);
  });
});

describe("HR-2: at least 1 infield and 1 outfield inning", () => {
  it("passes when both are played", () => {
    expect(messages("HR-2", ["Ava: P LF BN"])).toEqual([]);
  });
  it("flags a missing category", () => {
    expect(messages("HR-2", ["Ava: LF RF BN", "Ben: 1B SS C"])).toEqual([
      "Ava has no infield innings.",
      "Ben has no outfield innings.",
    ]);
  });
});

describe("HR-3: no 3 consecutive outfield innings", () => {
  it("allows two in a row broken by infield", () => {
    expect(messages("HR-3", ["Ava: LF RF 1B CF LF"])).toEqual([]);
  });
  it("doesn't let the bench break a streak", () => {
    expect(messages("HR-3", ["Ava: LF RF BN CF"])).toHaveLength(1);
  });
});

describe("HR-4: round-robin bench", () => {
  it("passes a full rotation before repeats", () => {
    expect(messages("HR-4", ["Ava: BN 1B 2B BN", "Ben: 1B BN SS 1B", "Cal: SS SS BN SS"])).toEqual([]);
  });
  it("allows a player to start the next round in the same inning the last one finishes", () => {
    expect(messages("HR-4", ["Ava: BN 1B BN", "Ben: 1B BN BN", "Cal: SS SS BN"])).toEqual([]);
  });
  it("flags a second sit while someone hasn't sat", () => {
    expect(messages("HR-4", ["Ava: BN 1B BN", "Ben: 1B BN 1B", "Cal: SS SS SS"])).toEqual([
      "Ava sits again in inning 3 before Cal has sat as often.",
    ]);
  });
});

describe("HR-5: infield within the first 3 innings", () => {
  it("passes with infield in inning 3", () => {
    expect(messages("HR-5", ["Ava: LF BN SS LF"])).toEqual([]);
  });
  it("flags no early infield", () => {
    expect(messages("HR-5", ["Ava: LF BN RF SS"])).toHaveLength(1);
  });
});

describe("HR-6: at least 2 infield innings", () => {
  it("counts pitcher and catcher as infield", () => {
    expect(messages("HR-6", ["Ava: P C LF RF"])).toEqual([]);
  });
  it("flags one infield inning", () => {
    expect(messages("HR-6", ["Ava: P LF RF BN"])).toEqual(["Ava has 1 infield inning (minimum 2)."]);
  });
});

describe("HR-7: attendance and fielded positions", () => {
  const seven = ["A: P", "B: 1B", "C: 2B", "D: 3B", "E: SS", "F: LC", "G: RC"];
  it("accepts the 7-player alignment", () => {
    expect(messages("HR-7", seven)).toEqual([]);
  });
  it("flags fewer than 7 players", () => {
    expect(messages("HR-7", seven.slice(0, 6))).toEqual(["A game needs at least 7 players; 6 are present."]);
  });
  it("flags missing, doubled and unused positions", () => {
    const rows = ["A: P", "B: 1B", "C: 1B", "D: 3B", "E: SS", "F: LF", "G: RC"];
    expect(messages("HR-7", rows)).toEqual([
      "Inning 1: 2 players are at 1B.",
      "Inning 1: nobody is at 2B.",
      "Inning 1: nobody is at LC.",
      "Inning 1: LF isn't used with 7 players.",
    ]);
  });
});

describe("HR-8: minimum defensive innings", () => {
  it("uses the team minimum in whole innings", () => {
    expect(messages("HR-8", ["Ava: P BN BN"], { minDefensiveOuts: 4 })).toEqual([
      "Ava plays 1 inning in the field (minimum 2).",
    ]);
    expect(messages("HR-8", ["Ava: P 1B BN"], { minDefensiveOuts: 4 })).toEqual([]);
  });
});

describe("HR-9: pitcher inning limit", () => {
  it("reads the limit from the game options", () => {
    expect(messages("HR-9", ["Ava: P P LF"], { pitcherInningLimit: 2 })).toEqual([]);
    expect(messages("HR-9", ["Ava: P P LF"], { pitcherInningLimit: 1 })).toEqual(["Ava pitches 2 innings (limit 1)."]);
  });
});

describe("HR-10: one pitching stint", () => {
  it("flags returning to the mound", () => {
    expect(messages("HR-10", ["Ava: P P LF"])).toEqual([]);
    expect(messages("HR-10", ["Ava: P LF P"])).toEqual(["Ava pitches in innings 1 and 3, which isn't one stint."]);
  });
});

describe("HR-11: no consecutive bench innings", () => {
  it("flags back-to-back sits", () => {
    expect(messages("HR-11", ["Ava: BN 1B BN"])).toEqual([]);
    expect(messages("HR-11", ["Ava: 1B BN BN"])).toEqual(["Ava sits in innings 2 and 3."]);
  });
});

describe("SR-1: position variety", () => {
  const base = ["B: 1B", "C: 2B", "D: 3B", "E: SS", "F: LC", "G: RC"].map((row) => `${row} ${row.split(": ")[1]}`);
  it("notes an avoidable repeat", () => {
    const lineup = rule("SR-1").validate(lineupOf(["A: P P", ...base]));
    expect(lineup.map((v) => v.message)).toContain("B plays 1B more than once.");
    expect(lineup.every((v) => v.severity === "notice")).toBe(true);
  });
  it("treats a pitching stint as one turn at pitcher", () => {
    const messages = rule("SR-1")
      .validate(lineupOf(["A: P P", ...base]))
      .map((v) => v.message);
    expect(messages.some((m) => m.startsWith("A "))).toBe(false);
  });
});

describe("SR-2: infield/outfield balance", () => {
  it("allows a difference of 2 and notes more", () => {
    expect(messages("SR-2", ["Ava: P 1B 2B 3B LF LF"])).toEqual([]);
    expect(messages("SR-2", ["Ava: P 1B 2B 3B SS LF"])).toEqual(["Ava has 5 infield and 1 outfield innings."]);
  });
});

describe("checkLineup", () => {
  it("lists errors before notices", () => {
    const severities = checkLineup(lineupOf(["Ava: P P P P P P"])).map((v) => v.severity);
    expect(severities.indexOf("notice")).toBeGreaterThan(severities.lastIndexOf("error"));
  });
});
