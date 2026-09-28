import type { Lineup } from "../lineup";
import { hr1 } from "./hr1";
import { hr10 } from "./hr10";
import { hr11 } from "./hr11";
import { hr2 } from "./hr2";
import { hr3 } from "./hr3";
import { hr4 } from "./hr4";
import { hr5 } from "./hr5";
import { hr6 } from "./hr6";
import { hr7 } from "./hr7";
import { hr8 } from "./hr8";
import { hr9 } from "./hr9";
import { sr1 } from "./sr1";
import { sr2 } from "./sr2";
import type { Rule, Violation } from "./types";

export type { Rule, Severity, Violation } from "./types";

/** Every rule in docs/rules.md §4, in document order. */
export const RULES: Rule[] = [hr1, hr2, hr3, hr4, hr5, hr6, hr7, hr8, hr9, hr10, hr11, sr1, sr2];

/** Runs every rule. Errors come before notices; otherwise rules keep document order. */
export function checkLineup(lineup: Lineup): Violation[] {
  const violations = RULES.flatMap((rule) => rule.validate(lineup));
  return [...violations.filter((v) => v.severity === "error"), ...violations.filter((v) => v.severity === "notice")];
}
