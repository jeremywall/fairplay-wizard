import { html } from "hono/html";
import type { Player } from "../db/players";
import type { TeamDetails } from "../db/teams";

const inputClass = "rounded-md border border-slate-300 px-3 py-2";
const iconButton = "rounded px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent";

function alert(message?: string) {
  return message ? html`<p class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">${message}</p>` : "";
}

export function teamPage(team: TeamDetails, players: Player[]) {
  return html`<section class="mx-auto max-w-xl space-y-8">
    <div>
      <button class="text-sm text-slate-600 hover:underline" hx-get="/app/home" hx-target="#main" hx-swap="innerHTML">← All teams</button>
      <h2 class="mt-2 text-2xl font-semibold">${team.name}</h2>
    </div>
    ${teamSettings(team)}
    ${roster(team.id, players)}
  </section>`;
}

export function teamSettings(team: TeamDetails, opts: { error?: string; saved?: boolean } = {}) {
  return html`<form class="space-y-3 rounded-lg bg-white p-4 shadow-sm" id="team-settings"
      hx-post="/app/teams/${team.id}/settings" hx-target="#team-settings" hx-swap="outerHTML">
    <h3 class="font-semibold">Game settings</h3>
    ${alert(opts.error)}
    <div class="flex flex-wrap items-end gap-4">
      <label class="text-sm font-medium">Innings per game
        <input class="${inputClass} mt-1 block w-24" type="number" name="inningsPerGame" min="1" max="9" value="${team.inningsPerGame}" required>
      </label>
      <label class="text-sm font-medium">Minimum defensive outs per player
        <input class="${inputClass} mt-1 block w-24" type="number" name="minDefensiveOuts" min="0" max="27" value="${team.minDefensiveOuts}" required>
      </label>
      <button class="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800" type="submit">Save</button>
      ${opts.saved ? html`<span class="text-sm text-emerald-700">Saved</span>` : ""}
    </div>
  </form>`;
}

export function roster(teamId: string, players: Player[], opts: { error?: string } = {}) {
  const base = `/app/teams/${teamId}/players`;
  return html`<section class="space-y-3" id="roster">
    <h3 class="font-semibold">Roster and batting order</h3>
    <p class="text-sm text-slate-600">Every player bats. Each game picks up where the last one left off in this order.</p>
    <form class="flex gap-2" hx-post="${base}" hx-target="#roster" hx-swap="outerHTML">
      <input class="${inputClass} flex-1" type="text" name="name" placeholder="Player name" maxlength="60" required>
      <input class="${inputClass} w-20" type="text" name="jerseyNumber" placeholder="#" maxlength="3" inputmode="numeric" pattern="[0-9]*">
      <button class="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800" type="submit">Add</button>
    </form>
    ${alert(opts.error)}
    ${players.length === 0
      ? html`<p class="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500">No players yet.</p>`
      : html`<ol class="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
          ${players.map(
            (p, i) => html`<li class="flex items-center gap-3 px-3 py-2">
              <span class="w-6 text-right text-sm tabular-nums text-slate-500">${i + 1}.</span>
              <span class="flex-1">${p.name}${p.jerseyNumber ? html` <span class="text-sm text-slate-500">#${p.jerseyNumber}</span>` : ""}</span>
              <button class="${iconButton}" aria-label="Move ${p.name} up" ${i === 0 ? "disabled" : ""}
                hx-post="${base}/${p.id}/move?direction=up" hx-target="#roster" hx-swap="outerHTML">↑</button>
              <button class="${iconButton}" aria-label="Move ${p.name} down" ${i === players.length - 1 ? "disabled" : ""}
                hx-post="${base}/${p.id}/move?direction=down" hx-target="#roster" hx-swap="outerHTML">↓</button>
              <button class="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50"
                hx-delete="${base}/${p.id}" hx-target="#roster" hx-swap="outerHTML"
                hx-confirm="Remove ${p.name} from the roster?">Remove</button>
            </li>`,
          )}
        </ol>`}
  </section>`;
}
