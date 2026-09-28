import { html } from "hono/html";

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600";
const buttonClass = "w-full rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800";

function errorMessage(error?: string) {
  return error ? html`<p class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">${error}</p>` : "";
}

export function loginForm(opts: { error?: string; email?: string } = {}) {
  return html`<section class="mx-auto max-w-sm rounded-lg bg-white p-6 shadow" id="auth-card">
    <h2 class="text-xl font-semibold">Coach sign in</h2>
    <form class="mt-4 space-y-4" hx-post="/auth/login" hx-target="#auth-card" hx-swap="outerHTML">
      ${errorMessage(opts.error)}
      <label class="block text-sm font-medium">Email
        <input class="${inputClass}" type="email" name="email" value="${opts.email ?? ""}" autocomplete="email" required>
      </label>
      <label class="block text-sm font-medium">Password
        <input class="${inputClass}" type="password" name="password" autocomplete="current-password" required>
      </label>
      <button class="${buttonClass}" type="submit">Sign in</button>
    </form>
    <p class="mt-4 text-center text-sm text-slate-600">
      New coach?
      <button class="font-medium text-emerald-700 hover:underline" hx-get="/auth/signup" hx-target="#auth-card" hx-swap="outerHTML">Create an account</button>
    </p>
  </section>`;
}

export function signupForm(opts: { error?: string; name?: string; email?: string } = {}) {
  return html`<section class="mx-auto max-w-sm rounded-lg bg-white p-6 shadow" id="auth-card">
    <h2 class="text-xl font-semibold">Create a coach account</h2>
    <form class="mt-4 space-y-4" hx-post="/auth/signup" hx-target="#auth-card" hx-swap="outerHTML">
      ${errorMessage(opts.error)}
      <label class="block text-sm font-medium">Name
        <input class="${inputClass}" type="text" name="name" value="${opts.name ?? ""}" autocomplete="name" required>
      </label>
      <label class="block text-sm font-medium">Email
        <input class="${inputClass}" type="email" name="email" value="${opts.email ?? ""}" autocomplete="email" required>
      </label>
      <label class="block text-sm font-medium">Password
        <input class="${inputClass}" type="password" name="password" autocomplete="new-password" minlength="8" required>
      </label>
      <button class="${buttonClass}" type="submit">Create account</button>
    </form>
    <p class="mt-4 text-center text-sm text-slate-600">
      Already have an account?
      <button class="font-medium text-emerald-700 hover:underline" hx-get="/auth/login" hx-target="#auth-card" hx-swap="outerHTML">Sign in</button>
    </p>
  </section>`;
}
