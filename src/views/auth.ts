import { html } from "hono/html";
import { busyLabel, inputText } from "./ui";

const inputClass = `mt-1 block w-full rounded-md border border-slate-600 px-3 py-2 ${inputText} focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500`;
const buttonClass = "min-h-11 w-full rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-600 disabled:opacity-60";
const switchLink = "inline-flex min-h-11 items-center px-1 font-medium text-emerald-400 hover:underline";

function errorMessage(error?: string) {
  return error ? html`<p class="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300" role="alert">${error}</p>` : "";
}

export function loginForm(opts: { error?: string; email?: string } = {}) {
  return html`<section class="mx-auto max-w-sm rounded-lg bg-slate-900 p-6 shadow" id="auth-card">
    <h2 class="text-xl font-semibold">Coach sign in</h2>
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

export function signupForm(opts: { error?: string; name?: string; email?: string } = {}) {
  return html`<section class="mx-auto max-w-sm rounded-lg bg-slate-900 p-6 shadow" id="auth-card">
    <h2 class="text-xl font-semibold">Create a coach account</h2>
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
