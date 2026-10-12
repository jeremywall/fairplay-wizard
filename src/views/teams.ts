import { html } from "hono/html";
import type { TeamSummary } from "../db/teams";
import { firstDir, MAX_YEAR, MIN_YEAR, SEASON_LABELS, SEASONS, sortTeams } from "../domain/team-season";
import type { Season, TeamSort, TeamSortKey } from "../domain/team-season";
import type { SessionUser } from "../types";
import { busyLabel, inputText, nav, textLink } from "./ui";

const fieldClass = `rounded-md border border-slate-600 px-3 py-2 ${inputText}`;

/** Year and season inputs, shared by the new team form and team settings. */
export function yearSeasonFields(year: number, season: Season | "") {
  return html`<label class="text-sm font-medium">Year
      <input class="${fieldClass} mt-1 block w-24" type="number" inputmode="numeric" name="year" min="${MIN_YEAR}" max="${MAX_YEAR}"
        value="${Number.isFinite(year) ? year : ""}" required>
    </label>
    <label class="text-sm font-medium">Season
      <select class="${fieldClass} mt-1 block min-h-11 bg-slate-950" name="season" required>
        ${SEASONS.map((s) => html`<option value="${s}" ${s === season ? "selected" : ""}>${SEASON_LABELS[s]}</option>`)}
      </select>
    </label>`;
}

const COLUMNS: { key: TeamSortKey; label: string; class: string }[] = [
  { key: "name", label: "Team", class: "w-full" },
  { key: "year", label: "Year", class: "" },
  { key: "season", label: "Season", class: "" },
  { key: "role", label: "Role", class: "" },
];

function sortHeader(column: (typeof COLUMNS)[number], sort: TeamSort) {
  const active = column.key === sort.key;
  const dir = active ? (sort.dir === "asc" ? "desc" : "asc") : firstDir(column.key);
  const query = `?sort=${column.key}&dir=${dir}`;
  return html`<th class="${column.class} p-0 text-left" scope="col" aria-sort="${active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}">
    <button class="flex min-h-11 w-full items-center gap-1 px-3 text-xs font-semibold uppercase tracking-wide ${active ? "text-slate-100" : "text-slate-400"} hover:text-slate-100"
      hx-get="/app/teams${query}" hx-replace-url="/${query}" hx-target="#team-table" hx-swap="outerHTML">
      ${column.label}<span aria-hidden="true" class="${active ? "" : "invisible"}">${sort.dir === "asc" || !active ? "▲" : "▼"}</span>
    </button>
  </th>`;
}

/** The coach's teams as a table sortable by any column. */
export function teamTable(teams: TeamSummary[], sort: TeamSort) {
  return html`<section id="team-table">
    <div id="team-sort" hidden>
      <input type="hidden" name="sort" value="${sort.key}">
      <input type="hidden" name="dir" value="${sort.dir}">
    </div>
    ${teams.length === 0
      ? html`<p class="rounded-md border border-dashed border-slate-600 px-4 py-6 text-center text-slate-400">No teams yet. Add one above.</p>`
      : html`<table class="w-full overflow-hidden rounded-md border border-slate-700 bg-slate-900 text-sm">
          <thead class="border-b border-slate-700"><tr>${COLUMNS.map((column) => sortHeader(column, sort))}</tr></thead>
          <tbody class="divide-y divide-slate-700">
            ${sortTeams(teams, sort).map(
              (team) => html`<tr class="hover:bg-slate-800">
                <td class="p-0">
                  <button class="min-h-12 w-full px-3 py-2 text-left text-base font-medium text-emerald-400" ${nav(`/teams/${team.id}`)}>${team.name}</button>
                </td>
                <td class="px-3 py-2 tabular-nums text-slate-300">${team.year}</td>
                <td class="px-3 py-2 text-slate-300">${SEASON_LABELS[team.season]}</td>
                <td class="px-3 py-2 text-slate-400">${team.role === "head" ? "Head" : "Assistant"}</td>
              </tr>`,
            )}
          </tbody>
        </table>`}
  </section>`;
}

export interface TeamsPageOptions {
  /** Present when Google sign-in is configured. */
  google?: { linked: boolean };
  notice?: { error?: boolean; text: string };
}

export function teamsPage(user: SessionUser, teams: TeamSummary[], sort: TeamSort, defaults: { year: number; season: Season }, opts: TeamsPageOptions = {}) {
  return html`<section class="mx-auto max-w-xl space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">${user.name}'s teams</h2>
      <button class="${textLink} px-2" hx-post="/auth/logout" hx-swap="none" hx-disabled-elt="this">Sign out</button>
    </div>
    ${opts.notice
      ? html`<p class="rounded-md px-3 py-2 text-sm ${opts.notice.error ? "bg-red-950 text-red-300" : "bg-emerald-950 text-emerald-200"}" role="status">${opts.notice.text}</p>`
      : ""}
    ${opts.google && !opts.google.linked
      ? html`<div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3">
          <p class="text-sm text-slate-400">Sign in with Google next time instead of your password.</p>
          <button class="min-h-11 rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-60"
            hx-post="/auth/google/link" hx-swap="none" hx-disabled-elt="this">${busyLabel("Connect Google", "Opening Google…")}</button>
        </div>`
      : ""}
    <form class="space-y-3 rounded-lg bg-slate-900 p-4 shadow-sm" hx-post="/app/teams" hx-target="#team-table" hx-swap="outerHTML"
      hx-include="#team-sort" hx-disabled-elt="find button" data-error-target="new-team-error"
      hx-on::after-request="if (event.detail.successful) this.reset()">
      <h3 class="font-semibold">New team</h3>
      <label class="block text-sm font-medium">Team name
        <input class="${fieldClass} mt-1 block w-full" type="text" name="name" placeholder="Team name" maxlength="80"
          autocapitalize="words" autocomplete="off" enterkeyhint="done" required>
      </label>
      <div class="flex flex-wrap items-end gap-4">
        ${yearSeasonFields(defaults.year, defaults.season)}
        <button class="min-h-11 rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-600 disabled:opacity-60" type="submit">${busyLabel("Add team", "Adding…")}</button>
      </div>
      <p class="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300" id="new-team-error" role="alert" hidden></p>
    </form>
    ${teamTable(teams, sort)}
  </section>`;
}
