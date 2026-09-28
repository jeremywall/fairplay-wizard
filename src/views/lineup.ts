import { html } from "hono/html";
import type { Player } from "../db/players";
import type { TeamDetails } from "../db/teams";
import type { FairnessReport } from "../domain/fairness";
import { type GameOptions, type Lineup, MAX_INNINGS, MIN_INNINGS, playerTotals, slotsOf } from "../domain/lineup";
import { categoryOf, fieldedPositions, MIN_PLAYERS, type Slot } from "../domain/positions";
import type { Violation } from "../domain/rules";

export interface SetupState {
  selected: Set<string>;
  innings: number;
  pitcherInningLimit: GameOptions["pitcherInningLimit"];
  error?: string;
}

const radioLabel = "flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2";
export const primaryButton =
  "min-h-11 rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton = "min-h-11 rounded-md border border-slate-300 bg-white px-4 py-2 font-medium hover:bg-slate-50";

export function backToTeam(teamId: string) {
  return html`<button class="text-sm text-slate-600 hover:underline" hx-get="/app/teams/${teamId}" hx-target="#main" hx-swap="innerHTML">← Back to team</button>`;
}

export function setupForm(team: TeamDetails, roster: Player[], state: SetupState) {
  const inningChoices = Array.from({ length: MAX_INNINGS - MIN_INNINGS + 1 }, (_, i) => MIN_INNINGS + i);
  return html`<section class="mx-auto max-w-xl space-y-6" id="lineup-panel">
    <div>
      ${backToTeam(team.id)}
      <h2 class="mt-2 text-2xl font-semibold">Plan a game: ${team.name}</h2>
    </div>
    <form class="space-y-6" id="lineup-setup" hx-post="/app/teams/${team.id}/lineup" hx-target="#lineup-panel" hx-swap="outerHTML">
      ${state.error ? html`<p class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">${state.error}</p>` : ""}
      <fieldset class="space-y-2">
        <div class="flex items-center justify-between">
          <legend class="font-semibold">Who's here? <span class="font-normal text-slate-600">(<span data-present-count>${state.selected.size}</span> present)</span></legend>
          <button class="${secondaryButton}" type="button" data-all-present>All present</button>
        </div>
        ${roster.length === 0
          ? html`<p class="text-slate-500">Add players to the roster first.</p>`
          : html`<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              ${roster.map(
                (p) => html`<label class="${radioLabel}">
                  <input class="size-5 accent-emerald-700" type="checkbox" name="player" value="${p.id}" data-attendance ${state.selected.has(p.id) ? "checked" : ""}>
                  <span>${p.name}${p.jerseyNumber ? html` <span class="text-sm text-slate-500">#${p.jerseyNumber}</span>` : ""}</span>
                </label>`,
              )}
            </div>`}
      </fieldset>

      <label class="block font-semibold">Innings
        <select class="mt-1 block min-h-11 w-28 rounded-md border border-slate-300 bg-white px-3 py-2 font-normal" name="innings">
          ${inningChoices.map((n) => html`<option value="${n}" ${n === state.innings ? "selected" : ""}>${n}</option>`)}
        </select>
      </label>

      <p class="text-sm text-slate-600">With 10 or more players this team plays a <span class="font-medium text-slate-900">${team.alignmentMode}-player defense</span>. Change it in the team's game settings.</p>

      <fieldset class="space-y-2">
        <legend class="font-semibold">Pitcher limit</legend>
        <label class="${radioLabel}"><input class="size-5 accent-emerald-700" type="radio" name="pitcherInningLimit" value="1" ${state.pitcherInningLimit === 1 ? "checked" : ""}> 1 inning per pitcher</label>
        <label class="${radioLabel}"><input class="size-5 accent-emerald-700" type="radio" name="pitcherInningLimit" value="2" ${state.pitcherInningLimit === 2 ? "checked" : ""}> Up to 2 innings per pitcher</label>
      </fieldset>

      <div>
        <button class="${primaryButton} w-full" type="submit" data-generate ${state.selected.size < MIN_PLAYERS ? "disabled" : ""}>Generate lineup</button>
        <p class="mt-2 text-center text-sm text-slate-500">Needs at least ${MIN_PLAYERS} players.</p>
      </div>
    </form>
  </section>`;
}

const slotClass: Record<"infield" | "outfield" | "bench", string> = {
  infield: "bg-emerald-50 text-emerald-900",
  outfield: "bg-sky-50 text-sky-900",
  bench: "bg-slate-100 text-slate-500",
};

function slotCell(slot: Slot) {
  const emphasis = slot === "P" || slot === "C" ? " font-bold" : "";
  return html`<td class="px-2 py-2 text-center tabular-nums ${slotClass[categoryOf(slot)]}${emphasis}">${slot}</td>`;
}

const fairnessClass: Record<FairnessReport["label"], string> = {
  Excellent: "bg-emerald-100 text-emerald-900",
  Good: "bg-amber-100 text-amber-900",
  Uneven: "bg-red-100 text-red-900",
};

/** Summary line: players, fielders, innings and pitcher limit. */
export function lineupDescription(lineup: Lineup) {
  const { options, players } = lineup;
  return `${players.length} players · ${fieldedPositions(players.length, options.alignmentMode).length} fielders · ${options.innings} innings · pitchers up to ${options.pitcherInningLimit} inning${options.pitcherInningLimit === 1 ? "" : "s"}`;
}

/** Position by inning, one row per player. */
export function lineupGrid(lineup: Lineup) {
  const inningNumbers = lineup.innings.map((_, i) => i + 1);
  return html`<div class="overflow-x-auto rounded-md border border-slate-200 bg-white">
    <table class="min-w-full text-sm">
      <caption class="px-3 py-2 text-left font-semibold">Positions by inning</caption>
      <thead class="bg-slate-50 text-slate-600">
        <tr>
          <th class="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium" scope="col">Player</th>
          ${inningNumbers.map((n) => html`<th class="px-2 py-2 text-center font-medium" scope="col">${n}</th>`)}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        ${lineup.players.map(
          (player, p) => html`<tr>
            <th class="sticky left-0 whitespace-nowrap bg-white px-3 py-2 text-left font-medium" scope="row">${player.name}</th>
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
  return html`<div class="space-y-3 rounded-lg bg-white p-4 shadow-sm">
    <div class="flex flex-wrap items-center gap-3">
      <h3 class="font-semibold">Fairness</h3>
      <span class="rounded-full px-3 py-1 text-sm font-medium ${fairnessClass[report.label]}">${report.label}</span>
      <span class="text-sm text-slate-600">bench ±${report.spreads.bench}, infield ±${report.spreads.infield}, outfield ±${report.spreads.outfield}</span>
    </div>
    <h3 class="font-semibold">Rule check</h3>
    ${violations.length === 0
      ? html`<p class="text-sm text-emerald-800">Every rule is met.</p>`
      : html`<ul class="space-y-1 text-sm">
          ${errors.map((v) => html`<li class="rounded-md bg-red-50 px-3 py-2 text-red-800"><span class="font-semibold">${v.ruleId}</span> ${v.message}</li>`)}
          ${notices.map((v) => html`<li class="rounded-md bg-amber-50 px-3 py-2 text-amber-900"><span class="font-semibold">${v.ruleId}</span> ${v.message}</li>`)}
        </ul>`}
    ${errors.length > 0
      ? html`<p class="text-sm text-slate-600">Some rules can't all be met with this attendance and these options. Try Regenerate, or change the options.</p>`
      : ""}
  </div>`;
}

/** Innings per player at P, C, IF (1B–SS), OF and bench. */
export function summaryTable(lineup: Lineup) {
  return html`<div class="overflow-x-auto rounded-md border border-slate-200 bg-white">
    <table class="min-w-full text-sm">
      <caption class="px-3 py-2 text-left font-semibold">Innings by player</caption>
      <thead class="bg-slate-50 text-slate-600">
        <tr>
          <th class="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium" scope="col">Player</th>
          <th class="px-2 py-2 text-center font-medium" scope="col">P</th>
          <th class="px-2 py-2 text-center font-medium" scope="col">C</th>
          <th class="px-2 py-2 text-center font-medium" scope="col" title="1B, 2B, 3B, SS">IF</th>
          <th class="px-2 py-2 text-center font-medium" scope="col">OF</th>
          <th class="px-2 py-2 text-center font-medium" scope="col">Bench</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        ${lineup.players.map((player, p) => {
          const t = playerTotals(slotsOf(lineup, p));
          return html`<tr>
            <th class="sticky left-0 whitespace-nowrap bg-white px-3 py-2 text-left font-medium" scope="row">${player.name}</th>
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

/** A freshly generated lineup, with Regenerate and Save. */
export function lineupResult(teamId: string, lineup: Lineup, violations: Violation[], report: FairnessReport, today: string) {
  const { options, players } = lineup;
  const optionInputs = html`${players.map((p) => html`<input type="hidden" name="player" value="${p.id}">`)}
    <input type="hidden" name="innings" value="${options.innings}">
    <input type="hidden" name="pitcherInningLimit" value="${options.pitcherInningLimit}">`;
  const saved = JSON.stringify({ players: players.map((p) => p.id), innings: lineup.innings });

  return html`<section class="space-y-6" id="lineup-panel">
    <div>
      ${backToTeam(teamId)}
      <h2 class="mt-2 text-2xl font-semibold">Lineup</h2>
      <p class="text-sm text-slate-600">${lineupDescription(lineup)}</p>
    </div>

    <form class="flex flex-wrap gap-2" hx-post="/app/teams/${teamId}/lineup" hx-target="#lineup-panel" hx-swap="outerHTML">
      ${optionInputs}
      <button class="${primaryButton}" type="submit">Regenerate</button>
      <button class="${secondaryButton}" type="button" hx-post="/app/teams/${teamId}/lineup/setup" hx-target="#lineup-panel" hx-swap="outerHTML">Change players or options</button>
    </form>

    ${lineupGrid(lineup)}
    ${ruleCheckPanel(violations, report)}
    ${summaryTable(lineup)}

    <form class="space-y-3 rounded-lg bg-white p-4 shadow-sm" hx-post="/app/teams/${teamId}/games" hx-target="#main" hx-swap="innerHTML">
      <h3 class="font-semibold">Save this lineup</h3>
      <p class="text-sm text-slate-600">Saved games appear on the team page. After the game, finalize it so it counts toward season stats.</p>
      <input type="hidden" name="lineup" value="${saved}">
      <input type="hidden" name="innings" value="${options.innings}">
      <input type="hidden" name="pitcherInningLimit" value="${options.pitcherInningLimit}">
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-sm font-medium">Date
          <input class="mt-1 block min-h-11 rounded-md border border-slate-300 px-3 py-2" type="date" name="date" value="${today}" required>
        </label>
        <label class="text-sm font-medium">Opponent (optional)
          <input class="mt-1 block min-h-11 rounded-md border border-slate-300 px-3 py-2" type="text" name="opponent" maxlength="60">
        </label>
        <button class="${primaryButton}" type="submit">Save game</button>
      </div>
    </form>
  </section>`;
}
