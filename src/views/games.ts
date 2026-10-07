import { html } from "hono/html";
import type { GameDetail, GameSummary } from "../db/games";
import type { Player } from "../db/players";
import type { FairnessReport } from "../domain/fairness";
import type { Lineup } from "../domain/lineup";
import type { Violation } from "../domain/rules";
import type { SeasonTotals } from "../domain/season";
import {
  backToTeam,
  lineupDescription,
  lineupGrid,
  primaryButton,
  ruleCheckPanel,
  secondaryButton,
  summaryTable,
} from "./lineup";
import { busyLabel, nav } from "./ui";

const statusBadge = {
  planned: html`<span class="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-200">Planned</span>`,
  final: html`<span class="rounded-full bg-emerald-900 px-2 py-0.5 text-xs font-medium text-emerald-100">Final</span>`,
};

/** "Sat, Oct 4" style label for a YYYY-MM-DD date. */
export function formatDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function gameTitle(game: { date: string; opponent: string | null }) {
  return game.opponent ? html`${formatDate(game.date)} vs ${game.opponent}` : html`${formatDate(game.date)}`;
}

export function gamesList(teamId: string, games: GameSummary[]) {
  return html`<section class="space-y-3">
    <h3 class="font-semibold">Games</h3>
    ${games.length === 0
      ? html`<p class="rounded-md border border-dashed border-slate-600 px-4 py-6 text-center text-slate-400">No saved games yet. Plan a game and save its lineup.</p>`
      : html`<ul class="divide-y divide-slate-700 rounded-md border border-slate-700 bg-slate-900">
          ${games.map(
            (g) => html`<li>
              <button class="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-800"
                ${nav(`/teams/${teamId}/games/${g.id}`)}>
                <span class="font-medium">${gameTitle(g)}</span>
                <span class="flex items-center gap-2 text-sm text-slate-400">${g.playerCount} players ${statusBadge[g.status]}</span>
              </button>
            </li>`,
          )}
        </ul>`}
  </section>`;
}

export function seasonStats(roster: Player[], totals: Map<string, SeasonTotals>) {
  const cell = "px-2 py-2 text-center tabular-nums";
  const head = "px-2 py-2 text-center font-medium";
  return html`<section class="space-y-3">
    <h3 class="font-semibold">Season stats</h3>
    <p class="text-sm text-slate-400">Totals from finalized games. IF is 1B, 2B, 3B and SS; pitching and catching are counted in P and C.</p>
    <div class="overflow-x-auto rounded-md border border-slate-700 bg-slate-900">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-800 text-slate-400">
          <tr>
            <th class="sticky left-0 bg-slate-800 px-3 py-2 text-left font-medium" scope="col">Player</th>
            <th class="${head}" scope="col" title="Games played">G</th>
            <th class="${head}" scope="col" title="Innings in the field">Innings</th>
            <th class="${head}" scope="col">Bench</th>
            <th class="${head}" scope="col" title="1B, 2B, 3B, SS">IF</th>
            <th class="${head}" scope="col" title="Outfield innings">OF</th>
            <th class="${head}" scope="col" title="Innings pitched">P</th>
            <th class="${head}" scope="col" title="Innings caught">C</th>
            <th class="${head}" scope="col" title="Different positions played">Positions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">
          ${roster.map((player) => {
            const t = totals.get(player.id);
            return html`<tr>
              <th class="sticky left-0 whitespace-nowrap bg-slate-900 px-3 py-2 text-left font-medium" scope="row">${player.name}</th>
              <td class="${cell}">${t?.games ?? 0}</td>
              <td class="${cell}">${t?.field ?? 0}</td>
              <td class="${cell}">${t?.bench ?? 0}</td>
              <td class="${cell}">${t ? t.infield - t.pitcher - t.catcher : 0}</td>
              <td class="${cell}">${t?.outfield ?? 0}</td>
              <td class="${cell}">${t?.pitcher ?? 0}</td>
              <td class="${cell}">${t?.catcher ?? 0}</td>
              <td class="${cell}">${t ? Object.keys(t.positions).length : 0}</td>
            </tr>`;
          })}
        </tbody>
      </table>
    </div>
  </section>`;
}

export function gamePage(
  teamId: string,
  game: GameDetail,
  lineup: Lineup,
  violations: Violation[],
  report: FairnessReport,
) {
  const base = `/app/teams/${teamId}/games/${game.id}`;
  return html`<section class="space-y-6">
    <div>
      ${backToTeam(teamId)}
      <h2 class="flex flex-wrap items-center gap-2 text-2xl font-semibold">${gameTitle(game)} ${statusBadge[game.status]}</h2>
      <p class="text-sm text-slate-400">${lineupDescription(lineup)}</p>
    </div>

    ${game.status === "final"
      ? html`<div class="space-y-2 rounded-lg bg-slate-900 p-4 shadow-sm">
          <p>This game is final and counts toward season stats.</p>
          <button class="${secondaryButton}" hx-post="${base}/reopen" hx-target="#main" hx-swap="innerHTML" hx-disabled-elt="this"
            hx-confirm="Reopen this game? It will stop counting toward season stats until you finalize it again.">${busyLabel("Reopen game", "Reopening…")}</button>
        </div>`
      : html`<div class="space-y-3 rounded-lg bg-slate-900 p-4 shadow-sm">
          <h3 class="font-semibold">Finalize after the game</h3>
          <p class="text-sm text-slate-400">Finalizing adds this game to season stats, which the generator uses to even out playing time across the season.</p>
          <button class="${primaryButton}" hx-post="${base}/finalize" hx-target="#main" hx-swap="innerHTML" hx-disabled-elt="this">${busyLabel("Finalize game", "Finalizing…")}</button>
        </div>`}

    ${lineupGrid(lineup)}
    ${ruleCheckPanel(violations, report)}
    ${summaryTable(lineup)}

    ${game.status === "planned"
      ? html`<button class="inline-flex min-h-11 items-center px-1 text-sm text-red-300 hover:underline disabled:opacity-60" hx-delete="${base}"
          hx-target="#main" hx-swap="innerHTML show:window:top" hx-disabled-elt="this" hx-confirm="Delete this game?">${busyLabel("Delete game", "Deleting…")}</button>`
      : ""}
  </section>`;
}
