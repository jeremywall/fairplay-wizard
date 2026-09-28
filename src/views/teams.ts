import { html } from "hono/html";
import type { TeamSummary } from "../db/teams";
import type { SessionUser } from "../types";

export function teamItem(team: TeamSummary) {
  return html`<li class="flex items-center justify-between rounded-md border border-slate-700 bg-slate-900 px-4 py-3">
    <button class="font-medium text-emerald-400 hover:underline" hx-get="/app/teams/${team.id}" hx-target="#main" hx-swap="innerHTML">${team.name}</button>
    <span class="text-xs uppercase tracking-wide text-slate-400">${team.role === "head" ? "Head coach" : "Assistant"}</span>
  </li>`;
}

export function teamsPage(user: SessionUser, teams: TeamSummary[]) {
  return html`<section class="mx-auto max-w-xl space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">${user.name}'s teams</h2>
      <button class="text-sm text-slate-400 hover:underline" hx-post="/auth/logout" hx-swap="none">Sign out</button>
    </div>
    <form class="flex gap-2" hx-post="/app/teams" hx-target="#team-list" hx-swap="beforeend" hx-on::after-request="if (event.detail.successful) this.reset()">
      <input class="flex-1 rounded-md border border-slate-600 px-3 py-2" type="text" name="name" placeholder="New team name" maxlength="80" required>
      <button class="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-600" type="submit">Add team</button>
    </form>
    <ul class="space-y-2" id="team-list">
      ${teams.map(teamItem)}
    </ul>
  </section>`;
}
