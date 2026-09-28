import { html } from "hono/html";

// Shared view helpers for navigation and request feedback.

/**
 * Attributes for a link to another screen. `pageUrl` is the address shown in
 * the browser (e.g. `/teams/abc`); its fragment is served at `/app` + pageUrl
 * (`/app/home` for `/`). Pushing the page URL makes back, refresh and
 * bookmarks work: the Worker serves the shell for any page URL, and
 * public/js/app.js loads the matching fragment.
 */
export function nav(pageUrl: string) {
  const fragment = pageUrl === "/" ? "/app/home" : `/app${pageUrl}`;
  return html`hx-get="${fragment}" hx-push-url="${pageUrl}" hx-target="#main" hx-swap="innerHTML show:window:top"`;
}

/** Button text that switches to `busy` while the button's request is in flight. */
export function busyLabel(idle: string, busy: string) {
  return html`<span class="busy:hidden">${idle}</span><span class="hidden busy:inline">${busy}</span>`;
}

/** Small text link styled for a comfortable tap target (at least 44px tall). */
export const textLink = "inline-flex min-h-11 items-center text-sm text-slate-400 hover:underline";

/** Text for inputs: 16px, so iPhones don't zoom in when the field is focused. */
export const inputText = "text-base";
