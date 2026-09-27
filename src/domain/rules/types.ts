import type { Lineup } from "../lineup";

export type Severity = "error" | "notice";

export interface Violation {
  ruleId: string;
  severity: Severity;
  message: string;
}

export interface Rule {
  id: string;
  label: string;
  severity: Severity;
  validate(lineup: Lineup): Violation[];
}

/** Builds a rule from a check that returns one message per violation. */
export function defineRule(
  meta: { id: string; label: string; severity: Severity },
  check: (lineup: Lineup) => string[],
): Rule {
  return {
    ...meta,
    validate: (lineup) => check(lineup).map((message) => ({ ruleId: meta.id, severity: meta.severity, message })),
  };
}

/** Formats 0-based inning indexes as "1, 3 and 4". */
export function inningList(indexes: number[]): string {
  const labels = indexes.map((i) => String(i + 1));
  return labels.length <= 1 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}
