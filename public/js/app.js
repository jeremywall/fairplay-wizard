// Small UI glue: load the screen for the current address, show turned-down
// requests' messages, and the lineup setup form's live attendance count and
// "All present" toggle.
// The server applies the same rules, so the setup form still works without this.

// The Worker serves this shell for every page address (e.g. /teams/abc), and
// each screen's HTML is served at /app + that address (/app/home for /).
function fragmentFor(path) {
  return path === "/" ? "/app/home" : "/app" + path;
}

document.addEventListener("DOMContentLoaded", () => {
  htmx.ajax("GET", fragmentFor(location.pathname) + location.search, { target: "#main", swap: "innerHTML" });
});

// A screen that no longer exists (for example a deleted game): say so instead
// of leaving "Loading…" on screen.
document.addEventListener("htmx:responseError", (event) => {
  if (event.detail.xhr.status !== 404 || event.detail.target?.id !== "main") return;
  event.detail.target.innerHTML =
    '<p class="text-center text-slate-400">That page wasn\'t found. <a class="text-emerald-400 underline" href="/">Go to your teams</a></p>';
});

// A request the server turned down (for example editing a game that was just
// finalized) isn't swapped in, so show its message in the slot named by
// data-error-target on the requesting element or an ancestor (errorSlot in
// src/views/lineup.ts). The next request from there hides it again.
function errorSlotFor(elt) {
  const id = elt?.closest?.("[data-error-target]")?.dataset.errorTarget;
  return id ? document.getElementById(id) : null;
}

function showRequestError(event, message) {
  const slot = errorSlotFor(event.detail.elt);
  if (!slot) return;
  slot.textContent = message;
  slot.hidden = false;
}

document.addEventListener("htmx:beforeRequest", (event) => {
  const slot = errorSlotFor(event.detail.elt);
  if (slot) slot.hidden = true;
});

document.addEventListener("htmx:responseError", (event) => {
  const { xhr } = event.detail;
  const plain = xhr.status < 500 && (xhr.getResponseHeader("Content-Type") ?? "").startsWith("text/plain");
  showRequestError(event, plain && xhr.responseText ? xhr.responseText : "Something went wrong. Try again.");
});

document.addEventListener("htmx:sendError", (event) => {
  showRequestError(event, "Couldn't reach the server. Check your connection and try again.");
});

function updateSetup(form) {
  const count = form.querySelectorAll("[data-attendance]:checked").length;
  const counter = form.querySelector("[data-present-count]");
  if (counter) counter.textContent = String(count);
  const generate = form.querySelector("[data-generate]");
  if (generate) generate.disabled = count < 7;
}

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-attendance]")) updateSetup(event.target.form);
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-all-present]");
  if (!button) return;
  const boxes = [...button.form.querySelectorAll("[data-attendance]")];
  const allChecked = boxes.every((box) => box.checked);
  for (const box of boxes) box.checked = !allChecked;
  updateSetup(button.form);
});
