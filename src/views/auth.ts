import { html } from "hono/html";
import { busyLabel, inputText } from "./ui";

const inputClass = `mt-1 block w-full rounded-md border border-slate-600 px-3 py-2 ${inputText} focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500`;
const buttonClass = "min-h-11 w-full rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-600 disabled:opacity-60";
const switchLink = "inline-flex min-h-11 items-center px-1 font-medium text-emerald-400 hover:underline";

// Google's "G" mark, as recommended for sign-in buttons.
const googleMark = html`<svg class="size-5" viewBox="0 0 48 48" aria-hidden="true">
  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
</svg>`;

/** "Continue with Google" and an "or" divider, when Google sign-in is configured. */
function googleOption(enabled: boolean | undefined) {
  if (!enabled) return "";
  return html`<button class="mt-4 flex min-h-11 w-full items-center justify-center gap-3 rounded-md border border-slate-600 bg-slate-800 px-4 py-2 font-medium hover:bg-slate-700 disabled:opacity-60"
      hx-post="/auth/google" hx-target="#auth-card" hx-swap="outerHTML" hx-disabled-elt="this">
      ${googleMark} ${busyLabel("Continue with Google", "Opening Google…")}
    </button>
    <p class="mt-4 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400"><span class="h-px flex-1 bg-slate-700"></span>or<span class="h-px flex-1 bg-slate-700"></span></p>`;
}

function errorMessage(error?: string) {
  return error ? html`<p class="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300" role="alert">${error}</p>` : "";
}

export function loginForm(opts: { error?: string; email?: string; google?: boolean } = {}) {
  return html`<section class="mx-auto max-w-sm rounded-lg bg-slate-900 p-6 shadow" id="auth-card">
    <h2 class="text-xl font-semibold">Coach sign in</h2>
    ${googleOption(opts.google)}
    <form class="mt-4 space-y-4" hx-post="/auth/login" hx-target="#auth-card" hx-swap="outerHTML" hx-disabled-elt="find button">
      ${errorMessage(opts.error)}
      <label class="block text-sm font-medium">Email
        <input class="${inputClass}" type="email" name="email" value="${opts.email ?? ""}" autocomplete="email" autocapitalize="none" spellcheck="false" enterkeyhint="next" required>
      </label>
      <label class="block text-sm font-medium">Password
        <input class="${inputClass}" type="password" name="password" autocomplete="current-password" enterkeyhint="go" required>
      </label>
      <button class="${buttonClass}" type="submit">${busyLabel("Sign in", "Signing in…")}</button>
    </form>
    <p class="mt-4 text-center text-sm text-slate-400">
      New coach?
      <button class="${switchLink}" hx-get="/auth/signup" hx-target="#auth-card" hx-swap="outerHTML">Create an account</button>
    </p>
  </section>`;
}

export function signupForm(opts: { error?: string; name?: string; email?: string; google?: boolean } = {}) {
  return html`<section class="mx-auto max-w-sm rounded-lg bg-slate-900 p-6 shadow" id="auth-card">
    <h2 class="text-xl font-semibold">Create a coach account</h2>
    ${googleOption(opts.google)}
    <form class="mt-4 space-y-4" hx-post="/auth/signup" hx-target="#auth-card" hx-swap="outerHTML" hx-disabled-elt="find button">
      ${errorMessage(opts.error)}
      <label class="block text-sm font-medium">Name
        <input class="${inputClass}" type="text" name="name" value="${opts.name ?? ""}" autocomplete="name" autocapitalize="words" enterkeyhint="next" required>
      </label>
      <label class="block text-sm font-medium">Email
        <input class="${inputClass}" type="email" name="email" value="${opts.email ?? ""}" autocomplete="email" autocapitalize="none" spellcheck="false" enterkeyhint="next" required>
      </label>
      <label class="block text-sm font-medium">Password
        <input class="${inputClass}" type="password" name="password" autocomplete="new-password" minlength="8" enterkeyhint="go" required>
      </label>
      <button class="${buttonClass}" type="submit">${busyLabel("Create account", "Creating account…")}</button>
    </form>
    <p class="mt-4 text-center text-sm text-slate-400">
      Already have an account?
      <button class="${switchLink}" hx-get="/auth/login" hx-target="#auth-card" hx-swap="outerHTML">Sign in</button>
    </p>
  </section>`;
}
