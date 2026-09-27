// Small UI glue for the lineup setup form: live attendance count and the
// "All present" toggle.
// The server applies the same rules, so the page still works without this.

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
