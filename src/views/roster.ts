import { html } from "hono/html";
import type { GameSummary } from "../db/games";
import type { Player } from "../db/players";
import type { TeamDetails } from "../db/teams";
import type { SeasonTotals } from "../domain/season";
import { gamesList, seasonStats } from "./games";
import { busyLabel, inputText, nav, textLink } from "./ui";

const inputClass = `rounded-md border border-slate-600 px-3 py-2 ${inputText}`;
const saveButton = "min-h-11 rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-600 disabled:opacity-60";

function alert(message?: string) {
  return message ? html`<p class="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300" role="alert">${message}</p>` : "";
}

export function teamPage(team: TeamDetails, players: Player[], games: GameSummary[], totals: Map<string, SeasonTotals>) {
  return html`<section class="mx-auto max-w-xl space-y-8">
    <div>
      <button class="${textLink}" ${nav("/")}>← All teams</button>
      <h2 class="text-2xl font-semibold">${team.name}</h2>
    </div>
    <button class="min-h-12 w-full rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-600" ${nav(`/teams/${team.id}/lineup`)}>Plan a game</button>
    ${gamesList(team.id, games)}
    ${seasonStats(players, totals)}
    ${teamSettings(team)}
    ${roster(team.id, players)}
  </section>`;
}

export function teamSettings(team: TeamDetails, opts: { error?: string; saved?: boolean } = {}) {
  const numberInput = `${inputClass} mt-1 block w-24`;
  return html`<form class="space-y-3 rounded-lg bg-slate-900 p-4 shadow-sm" id="team-settings"
      hx-post="/app/teams/${team.id}/settings" hx-target="#team-settings" hx-swap="outerHTML" hx-disabled-elt="find button">
    <h3 class="font-semibold">Game settings</h3>
    ${alert(opts.error)}
    <div class="flex flex-wrap items-end gap-4">
      <label class="text-sm font-medium">Innings per game
        <input class="${numberInput}" type="number" inputmode="numeric" name="inningsPerGame" min="3" max="9" value="${team.inningsPerGame}" required>
      </label>
      <label class="text-sm font-medium">Minimum defensive outs per player
        <input class="${numberInput}" type="number" inputmode="numeric" name="minDefensiveOuts" min="0" max="27" value="${team.minDefensiveOuts}" required>
      </label>
      <label class="text-sm font-medium">Minimum infield innings per player
        <input class="${numberInput}" type="number" inputmode="numeric" name="minInfieldInnings" min="0" max="9" value="${team.minInfieldInnings}" required>
      </label>
    </div>
    <fieldset class="space-y-2">
      <legend class="text-sm font-medium">Defense with 10 or more players</legend>
      <p class="text-sm text-slate-400">With 9 or fewer players, the standard alignment for that number is always used.</p>
      <div class="flex flex-wrap gap-2">
        <label class="flex min-h-11 items-center gap-2 rounded-md border border-slate-700 px-3 py-2"><input class="size-5 accent-emerald-500" type="radio" name="alignmentMode" value="9" ${team.alignmentMode === 9 ? "checked" : ""}> 9 players (3 outfielders)</label>
        <label class="flex min-h-11 items-center gap-2 rounded-md border border-slate-700 px-3 py-2"><input class="size-5 accent-emerald-500" type="radio" name="alignmentMode" value="10" ${team.alignmentMode === 10 ? "checked" : ""}> 10 players (4 outfielders)</label>
      </div>
    </fieldset>
    <div class="flex items-center gap-3">
      <button class="${saveButton}" type="submit">${busyLabel("Save", "Saving…")}</button>
      ${opts.saved ? html`<span class="text-sm text-emerald-400">Saved</span>` : ""}
    </div>
  </form>`;
}

export function roster(teamId: string, players: Player[], opts: { error?: string } = {}) {
  const base = `/app/teams/${teamId}/players`;
  return html`<section class="space-y-3" id="roster">
    <h3 class="font-semibold">Roster</h3>
    <form class="flex gap-2" hx-post="${base}" hx-target="#roster" hx-swap="outerHTML" hx-disabled-elt="find button">
      <input class="${inputClass} min-w-0 flex-1" type="text" name="name" placeholder="Player name" maxlength="60"
        autocapitalize="words" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="next" required>
      <input class="${inputClass} w-16" type="text" name="jerseyNumber" placeholder="#" maxlength="3" inputmode="numeric" pattern="[0-9]*"
        autocomplete="off" enterkeyhint="done">
      <button class="${saveButton}" type="submit">${busyLabel("Add", "Adding…")}</button>
    </form>
    ${alert(opts.error)}
    ${players.length === 0
      ? html`<p class="rounded-md border border-dashed border-slate-600 px-4 py-6 text-center text-slate-400">No players yet.</p>`
      : html`<ul class="divide-y divide-slate-700 rounded-md border border-slate-700 bg-slate-900">
          ${players.map(
            (p) => html`<li class="flex items-center gap-3 py-1 pl-3 pr-1">
              <span class="flex-1">${p.name}${p.jerseyNumber ? html` <span class="text-sm text-slate-400">#${p.jerseyNumber}</span>` : ""}</span>
              <button class="min-h-11 rounded px-3 text-sm text-red-300 hover:bg-red-950 disabled:opacity-60"
                hx-delete="${base}/${p.id}" hx-target="#roster" hx-swap="outerHTML" hx-disabled-elt="this"
                hx-confirm="Remove ${p.name} from the roster?">Remove</button>
            </li>`,
          )}
        </ul>`}
  </section>`;
}
