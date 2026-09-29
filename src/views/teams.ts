import { html } from "hono/html";
import type { TeamSummary } from "../db/teams";
import type { SessionUser } from "../types";
import { busyLabel, inputText, nav, textLink } from "./ui";

export function teamItem(team: TeamSummary) {
  return html`<li>
    <button class="flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-900 px-4 py-3 text-left hover:bg-slate-800" ${nav(`/teams/${team.id}`)}>
      <span class="font-medium text-emerald-400">${team.name}</span>
      <span class="text-xs uppercase tracking-wide text-slate-400">${team.role === "head" ? "Head coach" : "Assistant"}</span>
    </button>
  </li>`;
}

export interface TeamsPageOptions {
  /** Present when Google sign-in is configured. */
  google?: { linked: boolean };
  notice?: { error?: boolean; text: string };
}

export function teamsPage(user: SessionUser, teams: TeamSummary[], opts: TeamsPageOptions = {}) {
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
    <form class="flex gap-2" hx-post="/app/teams" hx-target="#team-list" hx-swap="beforeend" hx-disabled-elt="find button"
      hx-on::after-request="if (event.detail.successful) this.reset()">
      <input class="min-w-0 flex-1 rounded-md border border-slate-600 px-3 py-2 ${inputText}" type="text" name="name" placeholder="New team name" maxlength="80"
        autocapitalize="words" autocomplete="off" enterkeyhint="done" required>
      <button class="min-h-11 rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-600 disabled:opacity-60" type="submit">${busyLabel("Add team", "Adding…")}</button>
    </form>
    <ul class="space-y-2" id="team-list">
      ${teams.map(teamItem)}
    </ul>
  </section>`;
}
