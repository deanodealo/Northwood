/* ==========================================================================
   NORTHWOOD — SHARED SCRIPT FOR INNER PAGES
   Used by events.html, team-bookings.html and conditions-of-hire.html.
   1. Mobile nav toggle
   2. Call Now popup
   3. Booking forms: show/hide sections, validation, sending to Formspree
   ========================================================================== */
(function () {
  "use strict";

  // ── 1. Mobile nav toggle ──────────────────────────────────────
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("mainNav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }));
  }

  // ── 2. Call Now popup ─────────────────────────────────────────
  const callBtn = document.getElementById("callNowBtn");
  const callModal = document.getElementById("callModal");
  const callCancel = document.getElementById("callModalCancel");
  if (callBtn && callModal) {
    const open = () => { callModal.hidden = false; callModal.querySelector(".call-modal-go").focus(); };
    const close = () => { callModal.hidden = true; callBtn.focus(); };
    callBtn.addEventListener("click", open);
    callCancel.addEventListener("click", close);
    callModal.addEventListener("click", e => { if (e.target === callModal) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !callModal.hidden) close(); });
  }

  // ── 3. Booking forms ──────────────────────────────────────────
  // Any <form class="booking-form" action="https://formspree.io/f/..."> is
  // handled here. Each form needs its own Formspree form ID in its action.
  document.querySelectorAll("form.booking-form").forEach(setupForm);

  function setupForm(form) {
    form.setAttribute("novalidate", "");

    // Show/hide blocks marked data-show-when="Field name=Value 1|Value 2".
    // Hidden blocks have their inputs disabled, so they're neither required
    // nor sent with the form.
    const conditionals = [...form.querySelectorAll("[data-show-when]")];
    function currentValues(name) {
      const els = [...form.elements].filter(el => el.name === name);
      return els
        .filter(el => (el.type === "checkbox" || el.type === "radio") ? el.checked : true)
        .map(el => el.value);
    }
    function refreshConditionals() {
      conditionals.forEach(block => {
        const [name, wanted] = block.dataset.showWhen.split("=");
        const options = wanted.split("|");
        const show = currentValues(name).some(v => options.includes(v));
        block.hidden = !show;
        block.querySelectorAll("input, select, textarea").forEach(el => { el.disabled = !show; });
      });
    }
    form.addEventListener("change", refreshConditionals);
    refreshConditionals();

    // Clear an error as soon as the person fixes it.
    form.addEventListener("input", e => clearError(e.target));
    form.addEventListener("change", e => clearError(e.target));

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const summary = form.querySelector(".form-error-summary");
      const firstBad = validate(form);
      if (firstBad) {
        if (summary) { summary.textContent = "Please complete the highlighted fields."; summary.classList.add("show"); }
        firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
        const focusable = firstBad.matches("input, select, textarea") ? firstBad : firstBad.querySelector("input, select, textarea");
        if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 350);
        return;
      }
      if (summary) summary.classList.remove("show");

      if (form.action.includes("YOUR_FORM_ID")) {
        // Placeholder still in place — see the comment above the form.
        if (summary) { summary.textContent = "This form isn't connected yet. Please email info@northwoodstadium.co.uk instead."; summary.classList.add("show"); }
        return;
      }

      const btn = form.querySelector("[type=submit]");
      const btnText = btn ? btn.textContent : "";
      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

      try {
        const res = await fetch(form.action, {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(collect(form))
        });
        if (!res.ok) throw new Error("Formspree returned " + res.status);
        showSuccess(form);
      } catch (err) {
        console.error(err);
        if (summary) {
          summary.textContent = "Sorry — that didn't send. Please try again, or email info@northwoodstadium.co.uk.";
          summary.classList.add("show");
        }
        if (btn) { btn.disabled = false; btn.textContent = btnText; }
      }
    });
  }

  // Returns the first invalid element (or null when everything is fine).
  function validate(form) {
    let first = null;
    const mark = el => { if (!first) first = el; };

    // Ordinary fields (text, email, date, select, textarea)
    form.querySelectorAll("input:not([type=checkbox]):not([type=radio]), select, textarea").forEach(el => {
      if (el.disabled || el.closest(".hp-field")) return;
      if (!el.checkValidity() || (el.required && !el.value.trim())) {
        el.closest(".field")?.classList.add("invalid");
        mark(el);
      }
    });

    // Groups that need at least one tick / one choice
    form.querySelectorAll("[data-require-one]").forEach(group => {
      const inputs = [...group.querySelectorAll("input")].filter(i => !i.disabled);
      if (inputs.length && !inputs.some(i => i.checked)) {
        group.classList.add("invalid");
        mark(group);
      }
    });

    // Single required tick boxes (declarations)
    form.querySelectorAll(".agree input[required]").forEach(cb => {
      if (!cb.disabled && !cb.checked) { cb.closest(".agree").classList.add("invalid"); mark(cb); }
    });

    return first;
  }

  function clearError(el) {
    if (!el || !el.closest) return;
    el.closest(".field")?.classList.remove("invalid");
    el.closest("[data-require-one]")?.classList.remove("invalid");
    if (el.closest(".agree") && el.checked) el.closest(".agree").classList.remove("invalid");
  }

  // Builds a tidy object for the email: ticked boxes with the same name are
  // joined into one line, empty optional fields are left out.
  function collect(form) {
    const data = {};
    [...form.elements].forEach(el => {
      if (!el.name || el.disabled) return;
      if ((el.type === "checkbox" || el.type === "radio") && !el.checked) return;
      if (el.type === "submit" || el.type === "button") return;
      let value = el.value.trim();
      // Dates read better in the email as 03/11/2026 than 2026-11-03.
      if (el.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) value = value.split("-").reverse().join("/");
      if (!value && !el.name.startsWith("_")) return;
      data[el.name] = data[el.name] ? data[el.name] + ", " + value : value;
    });
    data["Submitted on"] = new Date().toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" });
    return data;
  }

  function showSuccess(form) {
    const tpl = form.parentElement.querySelector("template.form-success-template");
    const panel = document.createElement("div");
    panel.className = "form-success";
    panel.setAttribute("role", "status");
    panel.innerHTML = tpl ? tpl.innerHTML : "<h3>Thank you</h3><p>We've received your request and will be in touch soon.</p>";
    form.replaceWith(panel);
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
  }
})();