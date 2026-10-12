import { type Context, Hono } from "hono";
import { finalGameRecords } from "../db/games";
import { listPlayers, type Player } from "../db/players";
import { getTeam, type TeamDetails } from "../db/teams";
import { fairness } from "../domain/fairness";
import { generateLineup } from "../domain/generator";
import { type GameOptions, type Lineup, MAX_INNINGS, MIN_INNINGS } from "../domain/lineup";
import { MIN_PLAYERS } from "../domain/positions";
import { checkLineup } from "../domain/rules";
import { seasonTotals } from "../domain/season";
import type { AppEnv } from "../types";
import { editorUpdate, lineupResult, ruleCheckFooter, type SetupState, setupForm } from "../views/lineup";
import { readLineup, readOptions } from "./lineup-form";

// Mounted at /app/teams/:teamId/lineup. Team access is checked by the parent router.
export const lineupRoutes = new Hono<AppEnv>();

async function loadTeam(c: Context<AppEnv>) {
  const teamId = c.req.param("teamId")!;
  const [team, roster] = await Promise.all([getTeam(c.env.DB, teamId), listPlayers(c.env.DB, teamId)]);
  return { team, roster };
}

/** Reads the setup form. Only active players on this team count as present. */
async function readSetup(c: Context<AppEnv>, team: TeamDetails, roster: Player[]): Promise<SetupState> {
  const body = await c.req.parseBody({ all: true });
  const ids = new Set([body.player].flat().filter((v) => typeof v === "string"));
  const selected = new Set(roster.filter((p) => ids.has(p.id)).map((p) => p.id));
  const innings = Number(body.innings);
  return {
    selected,
    innings: Number.isInteger(innings) && innings >= MIN_INNINGS && innings <= MAX_INNINGS ? innings : team.inningsPerGame,
    pitcherInningLimit: body.pitcherInningLimit === "2" ? 2 : 1,
  };
}

lineupRoutes.get("/", async (c) => {
  const { team, roster } = await loadTeam(c);
  return c.html(
    setupForm(team, roster, { selected: new Set(), innings: team.inningsPerGame, pitcherInningLimit: 1 }),
  );
});

// Back to the setup form with the current choices filled in.
lineupRoutes.post("/setup", async (c) => {
  const { team, roster } = await loadTeam(c);
  const state = await readSetup(c, team, roster);
  return c.html(setupForm(team, roster, state));
});

// A manual edit in the lineup editor: apply it and re-run the rule check.
lineupRoutes.post("/check", async (c) => {
  const { team, roster } = await loadTeam(c);
  const body = await c.req.parseBody();
  const options = readOptions(body, team);
  const posted = options && readLineup(body, options.innings, new Set(roster.map((p) => p.id)));
  if (!options || !posted) return c.text("Couldn't read this lineup. Generate it again and retry.", 422);

  const names = new Map(roster.map((p) => [p.id, p.name]));
  const lineup: Lineup = {
    players: posted.players.map((id) => ({ id, name: names.get(id)! })),
    options,
    innings: posted.innings,
  };
  const season = seasonTotals(await finalGameRecords(c.env.DB, team.id));
  return c.html(
    editorUpdate({ lineup, violations: checkLineup(lineup), report: fairness(lineup), season, footer: ruleCheckFooter.edited }),
  );
});

// Generate (and Regenerate) a lineup.
lineupRoutes.post("/", async (c) => {
  const { team, roster } = await loadTeam(c);
  const state = await readSetup(c, team, roster);
  if (state.selected.size < MIN_PLAYERS) {
    const error = `Check at least ${MIN_PLAYERS} players as present (${state.selected.size} checked).`;
    return c.html(setupForm(team, roster, { ...state, error }));
  }

  const records = await finalGameRecords(c.env.DB, team.id);
  const players = roster.filter((p) => state.selected.has(p.id)).map(({ id, name }) => ({ id, name }));
  const options: GameOptions = {
    innings: state.innings,
    alignmentMode: team.alignmentMode,
    pitcherInningLimit: state.pitcherInningLimit,
    minDefensiveOuts: team.minDefensiveOuts,
    minInfieldInnings: team.minInfieldInnings,
  };
  const season = seasonTotals(records);
  const { lineup } = generateLineup(players, options, { season });
  const today = new Date().toISOString().slice(0, 10);
  return c.html(lineupResult(team.id, lineup, checkLineup(lineup), fairness(lineup), season, today));
});
