import { html } from "hono/html";
import type { Player } from "../db/players";
import type { TeamDetails } from "../db/teams";
import type { FairnessReport } from "../domain/fairness";
import { type GameOptions, type Lineup, MAX_INNINGS, MIN_INNINGS, playerTotals, slotsOf } from "../domain/lineup";
import { categoryOf, fieldedPositions, MIN_PLAYERS, type Slot } from "../domain/positions";
import type { Violation } from "../domain/rules";
import { addGame, type SeasonTotals } from "../domain/season";
import { busyLabel, inputText, nav, textLink } from "./ui";

export interface SetupState {
  selected: Set<string>;
  innings: number;
  pitcherInningLimit: GameOptions["pitcherInningLimit"];
  error?: string;
}

const radioLabel = "flex min-h-11 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2";
export const primaryButton =
  "min-h-11 rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton = "min-h-11 rounded-md border border-slate-600 bg-slate-900 px-4 py-2 font-medium hover:bg-slate-800";

export function backToTeam(teamId: string) {
  return html`<button class="${textLink}" ${nav(`/teams/${teamId}`)}>← Back to team</button>`;
}

export function setupForm(team: TeamDetails, roster: Player[], state: SetupState) {
  const inningChoices = Array.from({ length: MAX_INNINGS - MIN_INNINGS + 1 }, (_, i) => MIN_INNINGS + i);
  return html`<section class="mx-auto max-w-xl space-y-6" id="lineup-panel">
    <div>
      ${backToTeam(team.id)}
      <h2 class="text-2xl font-semibold">Plan a game: ${team.name}</h2>
    </div>
    <form class="space-y-6" id="lineup-setup" hx-post="/app/teams/${team.id}/lineup" hx-target="#lineup-panel" hx-swap="outerHTML show:window:top"
      hx-disabled-elt="find button[type='submit']">
      ${state.error ? html`<p class="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300" role="alert">${state.error}</p>` : ""}
      <fieldset class="space-y-2">
        <div class="flex items-center justify-between">
          <legend class="font-semibold">Who's here? <span class="font-normal text-slate-400">(<span data-present-count>${state.selected.size}</span> present)</span></legend>
          <button class="${secondaryButton}" type="button" data-all-present>All present</button>
        </div>
        ${roster.length === 0
          ? html`<p class="text-slate-400">Add players to the roster first.</p>`
          : html`<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              ${roster.map(
                (p) => html`<label class="${radioLabel}">
                  <input class="size-5 accent-emerald-500" type="checkbox" name="player" value="${p.id}" data-attendance ${state.selected.has(p.id) ? "checked" : ""}>
                  <span>${p.name}${p.jerseyNumber ? html` <span class="text-sm text-slate-400">#${p.jerseyNumber}</span>` : ""}</span>
                </label>`,
              )}
            </div>`}
      </fieldset>

      <label class="block font-semibold">Innings
        <select class="mt-1 block min-h-11 w-28 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 font-normal ${inputText}" name="innings">
          ${inningChoices.map((n) => html`<option value="${n}" ${n === state.innings ? "selected" : ""}>${n}</option>`)}
        </select>
      </label>

      <p class="text-sm text-slate-400">With 10 or more players this team plays a <span class="font-medium text-slate-100">${team.alignmentMode}-player defense</span>. Change it in the team's game settings.</p>

      <fieldset class="space-y-2">
        <legend class="font-semibold">Pitcher limit</legend>
        <label class="${radioLabel}"><input class="size-5 accent-emerald-500" type="radio" name="pitcherInningLimit" value="1" ${state.pitcherInningLimit === 1 ? "checked" : ""}> 1 inning per pitcher</label>
        <label class="${radioLabel}"><input class="size-5 accent-emerald-500" type="radio" name="pitcherInningLimit" value="2" ${state.pitcherInningLimit === 2 ? "checked" : ""}> Up to 2 innings per pitcher</label>
      </fieldset>

      <div>
        <button class="${primaryButton} w-full" type="submit" data-generate ${state.selected.size < MIN_PLAYERS ? "disabled" : ""}>${busyLabel("Generate lineup", "Generating…")}</button>
        <p class="mt-2 text-center text-sm text-slate-400">Needs at least ${MIN_PLAYERS} players.</p>
      </div>
    </form>
  </section>`;
}

const slotClass: Record<"infield" | "outfield" | "bench", string> = {
  infield: "bg-emerald-950 text-emerald-200",
  outfield: "bg-sky-950 text-sky-200",
  bench: "bg-slate-800 text-slate-400",
};

// Pitcher and catcher count as infield, but get their own colors so they stand out.
const batteryClass: Partial<Record<Slot, string>> = {
  P: "bg-amber-950 text-amber-200 font-bold",
  C: "bg-violet-950 text-violet-200 font-bold",
};

function slotCell(slot: Slot) {
  return html`<td class="px-2 py-2 text-center tabular-nums ${batteryClass[slot] ?? slotClass[categoryOf(slot)]}">${slot}</td>`;
}

const fairnessClass: Record<FairnessReport["label"], string> = {
  Excellent: "bg-emerald-900 text-emerald-100",
  Good: "bg-amber-900 text-amber-100",
  Uneven: "bg-red-900 text-red-100",
};

/** Summary line: players, fielders, innings and pitcher limit. */
export function lineupDescription(lineup: Lineup) {
  const { options, players } = lineup;
  return `${players.length} players · ${fieldedPositions(players.length, options.alignmentMode).length} fielders · ${options.innings} innings · pitchers up to ${options.pitcherInningLimit} inning${options.pitcherInningLimit === 1 ? "" : "s"}`;
}

/** Position by inning, one row per player. */
export function lineupGrid(lineup: Lineup) {
  const inningNumbers = lineup.innings.map((_, i) => i + 1);
  return html`<div class="overflow-x-auto rounded-md border border-slate-700 bg-slate-900">
    <table class="min-w-full text-sm">
      <caption class="px-3 py-2 text-left font-semibold">Positions by inning</caption>
      <thead class="bg-slate-800 text-slate-400">
        <tr>
          <th class="sticky left-0 bg-slate-800 px-3 py-2 text-left font-medium" scope="col">Player</th>
          ${inningNumbers.map((n) => html`<th class="px-2 py-2 text-center font-medium" scope="col">${n}</th>`)}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-800">
        ${lineup.players.map(
          (player, p) => html`<tr>
            <th class="sticky left-0 whitespace-nowrap bg-slate-900 px-3 py-2 text-left font-medium" scope="row">${player.name}</th>
            ${lineup.innings.map((inning) => slotCell(inning[p]))}
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

/** Fairness readout and rule check. */
export function ruleCheckPanel(violations: Violation[], report: FairnessReport) {
  const errors = violations.filter((v) => v.severity === "error");
  const notices = violations.filter((v) => v.severity === "notice");
  return html`<div class="space-y-3 rounded-lg bg-slate-900 p-4 shadow-sm">
    <div class="flex flex-wrap items-center gap-3">
      <h3 class="font-semibold">Fairness</h3>
      <span class="rounded-full px-3 py-1 text-sm font-medium ${fairnessClass[report.label]}">${report.label}</span>
      <span class="text-sm text-slate-400">bench ±${report.spreads.bench}, infield ±${report.spreads.infield}, outfield ±${report.spreads.outfield}</span>
    </div>
    <h3 class="font-semibold">Rule check</h3>
    ${violations.length === 0
      ? html`<p class="text-sm text-emerald-400">Every rule is met.</p>`
      : html`<ul class="space-y-1 text-sm">
          ${errors.map((v) => html`<li class="rounded-md bg-red-950 px-3 py-2 text-red-200"><span class="font-semibold">${v.ruleId}</span> ${v.message}</li>`)}
          ${notices.map((v) => html`<li class="rounded-md bg-amber-950 px-3 py-2 text-amber-200"><span class="font-semibold">${v.ruleId}</span> ${v.message}</li>`)}
        </ul>`}
    ${errors.length > 0
      ? html`<p class="text-sm text-slate-400">Some rules can't all be met with this attendance and these options. Try Regenerate, or change the options.</p>`
      : ""}
  </div>`;
}

/** Innings per player at P, C, IF (1B–SS), OF and bench. */
export function summaryTable(lineup: Lineup) {
  return html`<div class="overflow-x-auto rounded-md border border-slate-700 bg-slate-900">
    <table class="min-w-full text-sm">
      <caption class="px-3 py-2 text-left font-semibold">Innings by player</caption>
      <thead class="bg-slate-800 text-slate-400">
        <tr>
          <th class="sticky left-0 bg-slate-800 px-3 py-2 text-left font-medium" scope="col">Player</th>
          <th class="px-2 py-2 text-center font-medium" scope="col">P</th>
          <th class="px-2 py-2 text-center font-medium" scope="col">C</th>
          <th class="px-2 py-2 text-center font-medium" scope="col" title="1B, 2B, 3B, SS">IF</th>
          <th class="px-2 py-2 text-center font-medium" scope="col">OF</th>
          <th class="px-2 py-2 text-center font-medium" scope="col">Bench</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-800">
        ${lineup.players.map((player, p) => {
          const t = playerTotals(slotsOf(lineup, p));
          return html`<tr>
            <th class="sticky left-0 whitespace-nowrap bg-slate-900 px-3 py-2 text-left font-medium" scope="row">${player.name}</th>
            <td class="px-2 py-2 text-center tabular-nums">${t.pitcher}</td>
            <td class="px-2 py-2 text-center tabular-nums">${t.catcher}</td>
            <td class="px-2 py-2 text-center tabular-nums">${t.infield - t.pitcher - t.catcher}</td>
            <td class="px-2 py-2 text-center tabular-nums">${t.outfield}</td>
            <td class="px-2 py-2 text-center tabular-nums">${t.bench}</td>
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;
}

/**
 * Season totals from finalized games plus this lineup, at P, C, IF (1B–SS), OF
 * and bench. Each cell shows the new total and, when this game adds to it, "+n".
 */
export function seasonWithLineupTable(lineup: Lineup, season: ReadonlyMap<string, SeasonTotals>) {
  const cell = (total: number, added: number) =>
    html`<td class="px-2 py-2 text-center tabular-nums">${total}${added > 0
      ? html`<span class="block text-xs text-emerald-400">+${added}</span>`
      : ""}</td>`;
  const head = "px-2 py-2 text-center font-medium";
  return html`<div class="overflow-x-auto rounded-md border border-slate-700 bg-slate-900">
    <table class="min-w-full text-sm">
      <caption class="px-3 py-2 text-left font-semibold">
        Season totals with this lineup
        <span class="block text-xs font-normal text-slate-400">Finalized games so far plus this game (+ this game's innings).</span>
      </caption>
      <thead class="bg-slate-800 text-slate-400">
        <tr>
          <th class="sticky left-0 bg-slate-800 px-3 py-2 text-left font-medium" scope="col">Player</th>
          <th class="${head}" scope="col" title="Games">G</th>
          <th class="${head}" scope="col">P</th>
          <th class="${head}" scope="col">C</th>
          <th class="${head}" scope="col" title="1B, 2B, 3B, SS">IF</th>
          <th class="${head}" scope="col">OF</th>
          <th class="${head}" scope="col">Bench</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-800">
        ${lineup.players.map((player, p) => {
          const slots = slotsOf(lineup, p);
          const game = playerTotals(slots);
          const after = addGame(season.get(player.id), slots);
          return html`<tr>
            <th class="sticky left-0 whitespace-nowrap bg-slate-900 px-3 py-2 text-left font-medium" scope="row">${player.name}</th>
            <td class="px-2 py-2 text-center tabular-nums">${after.games}</td>
            ${cell(after.pitcher, game.pitcher)}
            ${cell(after.catcher, game.catcher)}
            ${cell(after.infield - after.pitcher - after.catcher, game.infield - game.pitcher - game.catcher)}
            ${cell(after.outfield, game.outfield)}
            ${cell(after.bench, game.bench)}
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;
}

/** A freshly generated lineup, with Regenerate and Save. */
export function lineupResult(
  teamId: string,
  lineup: Lineup,
  violations: Violation[],
  report: FairnessReport,
  season: ReadonlyMap<string, SeasonTotals>,
  today: string,
) {
  const { options, players } = lineup;
  const optionInputs = html`${players.map((p) => html`<input type="hidden" name="player" value="${p.id}">`)}
    <input type="hidden" name="innings" value="${options.innings}">
    <input type="hidden" name="pitcherInningLimit" value="${options.pitcherInningLimit}">`;
  const saved = JSON.stringify({ players: players.map((p) => p.id), innings: lineup.innings });

  return html`<section class="space-y-6" id="lineup-panel">
    <div>
      ${backToTeam(teamId)}
      <h2 class="text-2xl font-semibold">Lineup</h2>
      <p class="text-sm text-slate-400">${lineupDescription(lineup)}</p>
    </div>

    <form class="flex flex-wrap gap-2" hx-post="/app/teams/${teamId}/lineup" hx-target="#lineup-panel" hx-swap="outerHTML show:window:top"
      hx-disabled-elt="find button[type='submit']">
      ${optionInputs}
      <button class="${primaryButton}" type="submit">${busyLabel("Regenerate", "Generating…")}</button>
      <button class="${secondaryButton}" type="button" hx-post="/app/teams/${teamId}/lineup/setup" hx-target="#lineup-panel"
        hx-swap="outerHTML show:window:top" hx-disabled-elt="this">Change players or options</button>
    </form>

    ${lineupGrid(lineup)}
    ${ruleCheckPanel(violations, report)}
    ${summaryTable(lineup)}
    ${seasonWithLineupTable(lineup, season)}

    <form class="space-y-3 rounded-lg bg-slate-900 p-4 shadow-sm" hx-post="/app/teams/${teamId}/games" hx-target="#main"
      hx-swap="innerHTML show:window:top" hx-disabled-elt="find button[type='submit']">
      <h3 class="font-semibold">Save this lineup</h3>
      <p class="text-sm text-slate-400">Saved games appear on the team page. After the game, finalize it so it counts toward season stats.</p>
      <input type="hidden" name="lineup" value="${saved}">
      <input type="hidden" name="innings" value="${options.innings}">
      <input type="hidden" name="pitcherInningLimit" value="${options.pitcherInningLimit}">
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-sm font-medium">Date
          <input class="mt-1 block min-h-11 rounded-md border border-slate-600 px-3 py-2 ${inputText}" type="date" name="date" value="${today}" required>
        </label>
        <label class="text-sm font-medium">Opponent (optional)
          <input class="mt-1 block min-h-11 rounded-md border border-slate-600 px-3 py-2 ${inputText}" type="text" name="opponent" maxlength="60"
            autocapitalize="words" autocomplete="off" enterkeyhint="done">
        </label>
        <button class="${primaryButton}" type="submit">${busyLabel("Save game", "Saving…")}</button>
      </div>
    </form>
  </section>`;
}
