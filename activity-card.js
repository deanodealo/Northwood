/* ═══════════════════════════════════════════════════════════
   ACTIVITY CARD — the "What's On" card markup, shared by the
   homepage (index.html) and the live preview in Manage Activities
   (manage-activities.html), so staff see exactly what goes live.

   Layout (as supplied by Northwood): photo on the left; on the right
   a coloured panel with the activity's logo (or its name if there's
   no logo), a "when" line, a short description and a button.

   Colours:
   - panel     — the card's main colour (the activity's colour scheme
                 in Manage Activities; also used for its booking tab).
   - highlight — optional second colour for the outline, "when" line
                 and button (e.g. Funetics pink on Funetics purple).
                 Without one, the card has a white button as before.
   ═══════════════════════════════════════════════════════════ */
(function () {
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function isHex(h) { return /^#[0-9A-Fa-f]{6}$/.test(String(h || "")); }
  // Only https links (Firebase Storage) or our own images/ folder.
  function safeImg(url) {
    const u = String(url || "");
    return /^https:\/\//i.test(u) || /^images\/[A-Za-z0-9_.\-\/]+$/.test(u) || /^blob:/i.test(u) ? u : "";
  }
  function luminance(hex) {
    const c = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  // White text unless the button colour is light, then near-black.
  function inkOn(hex) { return 1.05 / (luminance(hex) + 0.05) >= 3 ? "#FFFFFF" : "#1A1818"; }

  /* card = { title, href, buttonLabel, panel, highlight, imageUrl,
              imagePosition, logoUrl, schedule, body } */
  function html(card) {
    const panel = isHex(card.panel) ? card.panel : "#1A1818";
    const hl = isHex(card.highlight) ? card.highlight : "";
    const vars = [`--accent:${panel}`];
    if (hl) vars.push(`--hl:${hl}`, `--btn-bg:${hl}`, `--btn-ink:${inkOn(hl)}`);

    const img = safeImg(card.imageUrl);
    const pos = /^[0-9]{1,3}% [0-9]{1,3}%$|^(center|top|bottom|left|right)( (center|top|bottom|left|right))?$/.test(card.imagePosition || "")
      ? ` style="object-position:${card.imagePosition}"` : "";
    const media = img ? `<img src="${esc(img)}" alt="${esc(card.title)}" loading="lazy"${pos}>` : "";

    const logo = safeImg(card.logoUrl);
    const heading = logo
      ? `<h3 class="activity-feature-title has-logo"><img class="activity-feature-logo" src="${esc(logo)}" alt="${esc(card.title)}"></h3>`
      : `<h3 class="activity-feature-title">${esc(card.title)}</h3>`;

    const when = card.schedule ? `<p class="activity-feature-when">${esc(card.schedule)}</p>` : "";
    const body = card.body ? `<p class="activity-feature-body">${esc(card.body)}</p>` : "";

    return `
          <article class="activity-feature${hl ? " has-highlight" : ""}${img ? "" : " no-media"}" style="${vars.join("; ")}">
            <div class="activity-feature-media">${media}</div>
            <div class="activity-feature-content">
              ${heading}
              ${when}
              ${body}
              <a href="${esc(card.href)}" class="activity-feature-link">${esc(card.buttonLabel)}</a>
            </div>
          </article>`;
  }

  window.ActivityCard = { html, esc, isHex };
})();
