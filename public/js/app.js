// Small UI glue: load the screen for the current address, and the lineup setup
// form's live attendance count and "All present" toggle.
// The server applies the same rules, so the setup form still works without this.

// The Worker serves this shell for every page address (e.g. /teams/abc), and
// each screen's HTML is served at /app + that address (/app/home for /).
function fragmentFor(path) {
  return path === "/" ? "/app/home" : "/app" + path;
}

document.addEventListener("DOMContentLoaded", () => {
  htmx.ajax("GET", fragmentFor(location.pathname), { target: "#main", swap: "innerHTML" });
});

// A screen that no longer exists (for example a deleted game): say so instead
// of leaving "Loading…" on screen.
document.addEventListener("htmx:responseError", (event) => {
  if (event.detail.xhr.status !== 404 || event.detail.target?.id !== "main") return;
  event.detail.target.innerHTML =
    '<p class="text-center text-slate-400">That page wasn\'t found. <a class="text-emerald-400 underline" href="/">Go to your teams</a></p>';
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
