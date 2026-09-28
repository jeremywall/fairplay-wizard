# Fairplay rules and lineup design

This is the source of truth for **what** makes a lineup valid and fair. The code in `src/domain` enforces it. When a rule changes, update this document first, then the rule module and its tests.

The hard and soft rules come from the earlier planner project ([baseball-softball-defense `docs/plan.md`](https://github.com/jeremywall/baseball-softball-defense/blob/main/docs/plan.md)). Their numbers (HR-1…HR-10, SR-1, SR-2) are kept so the two can be cross-referenced. Rules added in this project start at HR-11 and SR-3.

## 1. Coach workflow

1. **Before the game:** check off who is present, and confirm the game options (§3).
2. **Generate:** tap **Generate lineup**. The generator (§6) produces the whole game at once: fielding positions for every inning.
3. **Review:** the coach sees the lineup grid, a player summary, a fairness readout (§7), and a rule check listing any hard-rule violations and soft-rule notices.
4. **Adjust if needed:**
   - **Regenerate** produces a different random lineup with the same attendance and options. This is the fast path.
   - **Manual edits** let the coach change a player's position in a given inning (for example, by swapping two players). After every edit, the rule check re-runs and shows any violations. A hard-rule violation is shown prominently as an error, but it **does not block** saving. The coach has the final say.
5. **Save** the lineup as a game (date and optional opponent). Saved games are listed on the team page.
6. **Finalize** the game after it's played. Finalizing makes the game count toward season stats (§9) and SR-3. A finalized game can be **reopened** (it stops counting until finalized again), and a planned game can be deleted.

## 2. Positions

Positions are defined in one config module. Everything else (rules, generator, views) reads from it, and nothing hardcodes position counts or labels.

| Position | Abbrev. | Category |
|---|---|---|
| Pitcher | P | infield |
| Catcher | C | infield |
| First base | 1B | infield |
| Second base | 2B | infield |
| Third base | 3B | infield |
| Shortstop | SS | infield |
| Left field | LF | outfield |
| Center field | CF | outfield |
| Right field | RF | outfield |
| Left-center | LC | outfield |
| Right-center | RC | outfield |
| Bench | BN | bench |

- By league convention, **pitcher and catcher count as infield** for the infield/outfield rules (HR-2, HR-5, HR-6).
- Rules also track each **specific position**, not just its category. HR-1, HR-9, HR-10 and SR-1 depend on this.

### Fielded positions by attendance (HR-7)

| Present | Fielded positions | Outfielders |
|---|---|---|
| < 7 | Game can't be generated | — |
| 7 | P, 1B, 2B, 3B, SS, **LC, RC** (no catcher) | 2 |
| 8 | P, C, 1B, 2B, 3B, SS, **LC, RC** | 2 |
| 9 | P, C, 1B, 2B, 3B, SS, LF, CF, RF | 3 |
| 10+ (team plays a 9-player defense) | P, C, 1B, 2B, 3B, SS, LF, CF, RF | 3 |
| 10+ (team plays a 10-player defense) | P, C, 1B, 2B, 3B, SS, LF, LC, RC, RF | 4 |

- A two-outfielder alignment always uses **LC/RC**, never LF/CF.
- **Alignment mode** (a 9-player or 10-player defense) is a **team setting**, chosen once in the team's game settings (default: 10). It only applies when 10 or more players are present. A 9-player defense means 3 outfielders and more bench time. With 9 or fewer present, the attendance table above always applies.
- With 7 present, the catcher isn't fielded, so "infield" means P, 1B, 2B, 3B and SS.

## 3. Game options

| Option | Source | Notes |
|---|---|---|
| Attendance | Per game | Checklist of the active roster, with "All present" toggle. Defaults to nobody checked. At least 7 are required. |
| Innings | Per game, defaulting to the team's **innings per game** setting | 3–9. |
| Alignment mode | Team setting (default 10) | 9-player or 10-player defense, used with 10 or more present (§2). |
| Pitcher inning limit | Per game (default 1) | 1 or 2 innings per pitcher (HR-9). |
| Minimum defensive outs | Team setting (default 6) | HR-8 threshold. The generator works in whole innings, so the minimum in innings is `ceil(minDefensiveOuts / 3)`. |
| Minimum infield innings | Team setting (default 2) | HR-6 threshold, 0 up to the innings per game. Short games usually need 1: with 10 players over 3 innings there are only 18 infield slots, not the 20 that a minimum of 2 needs. |

Each saved game stores the team settings it was planned with, so changing a setting later doesn't change past games' rule checks.

With very short games or unusual attendance, some hard rules may be impossible to satisfy together, for example in a 3-inning game with players on the bench and a minimum of 2 infield innings: HR-2 and HR-6 together need 3 field innings from every player, so nobody could sit. The generator then returns its best lineup, and the rule check lists the rules it couldn't meet. It never fails silently.

## 4. Fielding rules

### 4.1 Hard rules

A valid lineup satisfies every hard rule. Violations are shown as errors in the rule check (they don't block saving, see §1).

| # | Rule |
|---|---|
| HR-1 | A player who catches for **more than 3 innings** in a game cannot also pitch in that game. |
| HR-2 | Every present player plays **at least 1 infield inning and at least 1 outfield inning** each game. |
| HR-3 | No player plays outfield for **3 consecutive innings**. Bench innings are skipped when counting "consecutive", so they don't break a streak: OF → OF → BN → OF counts as 3 consecutive outfield innings and is not allowed. |
| HR-4 | No player is benched for a second inning until **every present player has been benched at least once** in that game. Bench turns go round-robin. |
| HR-5 | Every present player plays **at least 1 infield inning within the first 3 innings**. |
| HR-6 | Every present player plays at least the team's **minimum infield innings** each game (team setting, default 2; see §3). |
| HR-7 | A game needs **at least 7 present players**. Fielded positions follow the attendance table in §2. |
| HR-8 | Every present player plays in the field (not bench) for at least the team's **minimum defensive outs**, counted in whole innings as `ceil(minDefensiveOuts / 3)`. The default is 6 outs, or 2 innings. |
| HR-9 | A player pitches **at most 1 or 2 innings** per game, depending on the game's pitcher inning limit option. |
| HR-10 | A pitcher's innings are **one uninterrupted stint**. Once moved off the mound, a player can't pitch again that game. |
| HR-11 | No player sits on the bench for **two consecutive innings**. |

**Out of scope:** pitch counts, rest days between games, and pitcher/catcher eligibility lists. Pitching rules are per-game only.

### 4.2 Soft rules

Soft rules are preferences the generator optimizes for. Violations appear as informational notices, never as errors.

| # | Preference |
|---|---|
| SR-1 | A player shouldn't play the **same position twice** in a game unless that's unavoidable given attendance and the hard rules. The generator maximizes position variety before repeating. A pitching stint counts as one turn at pitcher (its length is governed by HR-9/HR-10), and a repeat is only flagged when the player has no more field innings than there are fielded positions. |
| SR-2 | Each player's field innings should be **balanced between infield and outfield**, not just meet the HR-2/HR-6 minimums. A notice is shown when the difference is more than 2 innings. |
| SR-3 | Fairness **evens out across the season**, using finalized games only. Within the hard rules and the in-game preferences: players who have sat **less** than others take the bench turns; players who have pitched or caught less get the mound or the catcher's gear; players whose innings lean outfield are pulled toward the infield; and positions a player has played often are less likely. Comparisons use **per-game rates**, so a player who missed games isn't owed extra time. Players with no finalized games count as average. |

## 5. Batting order

Not tracked. The app plans fielding only; the coach manages the batting order outside the app.

## 6. Generator

Implemented in `src/domain/generator.ts`. Each attempt plans a round-robin bench schedule, then pitching stints, then fills the other positions inning by inning with a minimum-cost assignment whose costs steer toward the rules. Attempts are scored with the rule check. The generator stops after 8 rule-compliant lineups (keeping the best by soft-rule cost), or after 30 attempts with none, which only happens when the rules can't all be met. This keeps a request to a few milliseconds of CPU.


- The generator takes attendance, game options, the team's rules settings and season-to-date stats (SR-3), and returns a complete lineup: one position per present player per inning.
- It must meet every hard rule when that's feasible, and score well on the soft rules.
- **Randomized:** each run shuffles its internal ordering (who is first in line for bench, pitcher, infield, and so on) with no fixed seed. The same inputs can produce a different lineup on Regenerate. Randomization only chooses between compliant lineups and never trades away hard-rule compliance. This is a property to keep through any future generator change.
- The generator reads position categories and limits from the same config and rule definitions the rule check uses. It doesn't hardcode league numbers.

## 7. Fairness readout

This is a read-only summary shown above the rule check. It is not a rule, and it doesn't feed back into the generator.

- For the present players, compute the **spread** (max − min) of bench innings, infield innings and outfield innings. Infield here uses the rule category, so it includes pitcher and catcher.
- The label comes from the largest spread: **Excellent** (≤ 1), **Good** (≤ 2), **Uneven** (> 2).
- Show the three raw spreads next to the label (for example, "bench ±1, infield ±2, outfield ±1"). Don't use a composite 0–100 score.

The **player summary** table shows each player's innings at Pitcher, Catcher, Infield (1B/2B/3B/SS), Outfield and Bench. These five columns don't overlap and add up to the game's innings. In this table, pitcher and catcher are shown separately, even though they count as infield for the rules.

## 8. Rule engine structure

- Each rule is one module in `src/domain/rules/` with `id` (for example `"HR-3"`), `label`, `severity` (`"error"` for hard, `"notice"` for soft), and a pure `validate(game) => Violation[]`.
- Rules are registered in one list (`src/domain/rules/index.ts`). Adding a rule means adding a row here, one module, one registration line and its tests.
- Each rule gets unit tests for passing and failing cases. The generator gets tests that its output satisfies all hard rules across attendance from 7 to 13+, innings from 3 to 9, and both pitcher limits. It also gets tests that repeated runs with the same inputs don't all produce the same lineup. Don't assert a single exact random output.

## 9. Season stats

Shown on the team page for active players, from finalized games only: games played, field innings, bench innings, infield innings (including pitcher and catcher), outfield innings, innings pitched, innings caught, and number of different positions played.
