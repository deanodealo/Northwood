/* ==========================================================================
   "TOURNAMENT LIVE NOW" BANNER  (homepage + Youth Club page)

   Shows a small floating banner linking to tournament.html, but ONLY while
   a youth club tournament is running: set up in tournaments-admin.html,
   shown on the website, not yet finished, and dated today (so one that
   staff forgot to press Finish on doesn't hang around for days).

   Uses Firestore's plain web API (one small request) rather than loading
   the whole Firebase library, so it adds almost nothing to page weight.
   Re-checks every 2 minutes, so it appears and disappears on its own.
   Visitors can close it; it stays closed for that tournament until they
   close the tab.

   To add to a page:  <script src="tournament-live.js" defer></script>
   ========================================================================== */
(function () {
  "use strict";

  var PROJECT = "northwood-stadium";
  var KEY = "AIzaSyDGSOa02_oHzRARoisN-gA3zzsTTC9U9QQ";
  var URL_ = "https://firestore.googleapis.com/v1/projects/" + PROJECT +
    "/databases/(default)/documents:runQuery?key=" + KEY;
  var CHECK_EVERY = 2 * 60 * 1000;

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function closedId() { try { return sessionStorage.getItem("nwTourneyClosed"); } catch (e) { return null; } }
  function rememberClosed(id) { try { sessionStorage.setItem("nwTourneyClosed", id); } catch (e) { /* fine */ } }

  var css = document.createElement("style");
  css.textContent =
    ".tn-live-pill{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translate(-50%,0);z-index:140;" +
      "display:flex;align-items:center;gap:4px;max-width:calc(100% - 32px);background:#1A1818;color:#fff;border-radius:999px;" +
      "box-shadow:0 10px 30px rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.14);font-family:'DM Sans',system-ui,sans-serif;" +
      "animation:tn-pill-in .35s ease-out}" +
    ".tn-live-pill a.tn-live-go{display:flex;align-items:center;gap:12px;padding:10px 6px 10px 12px;color:#fff;text-decoration:none;font-weight:700;font-size:15px;line-height:1.2;min-height:44px}" +
    ".tn-live-tag{display:inline-flex;align-items:center;gap:6px;background:#C42F29;border-radius:999px;padding:4px 10px 4px 8px;" +
      "font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:14px;letter-spacing:1px;text-transform:uppercase;flex:none}" +
    ".tn-live-tag::before{content:'';width:7px;height:7px;border-radius:50%;background:#fff;animation:tn-pill-pulse 1.6s infinite}" +
    ".tn-live-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".tn-live-text span{color:#F2726C;margin-left:6px}" +
    ".tn-live-pill a.tn-live-go:hover .tn-live-text span,.tn-live-pill a.tn-live-go:focus-visible .tn-live-text span{text-decoration:underline}" +
    ".tn-live-close{flex:none;width:40px;height:40px;margin-right:4px;border:0;border-radius:50%;background:transparent;color:rgba(255,255,255,.75);font-size:22px;line-height:1;cursor:pointer}" +
    ".tn-live-close:hover{background:rgba(255,255,255,.1);color:#fff}" +
    ".tn-live-pill :focus-visible{outline:3px solid #fff;outline-offset:2px;border-radius:999px}" +
    "body:has(#aths-backdrop) .tn-live-pill{display:none}" +
    "@keyframes tn-pill-in{from{opacity:0;transform:translate(-50%,16px)}}" +
    "@keyframes tn-pill-pulse{50%{opacity:.25}}" +
    "@media (prefers-reduced-motion:reduce){.tn-live-pill,.tn-live-tag::before{animation:none}}" +
    "@media print{.tn-live-pill{display:none}}";
  document.head.appendChild(css);

  var pill = null;

  function show(t) {
    if (closedId() === t.id) { hide(); return; }
    if (!pill) {
      pill = document.createElement("div");
      pill.className = "tn-live-pill";
      pill.setAttribute("role", "region");
      pill.setAttribute("aria-label", "Tournament live now");
      pill.innerHTML =
        '<a class="tn-live-go" href="tournament.html"><span class="tn-live-tag">Live</span>' +
        '<span class="tn-live-text"></span></a>' +
        '<button type="button" class="tn-live-close" aria-label="Close">&times;</button>';
      pill.querySelector(".tn-live-close").addEventListener("click", function () {
        rememberClosed(pill.getAttribute("data-id")); hide();
      });
      document.body.appendChild(pill);
    }
    pill.setAttribute("data-id", t.id);
    var text = pill.querySelector(".tn-live-text");
    text.textContent = t.name || "Youth Club Tournament";
    var more = document.createElement("span");
    more.textContent = "Scores →";
    text.appendChild(more);
  }

  function hide() { if (pill) { pill.remove(); pill = null; } }

  function check() {
    fetch(URL_, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: "tournaments" }],
        select: { fields: [{ fieldPath: "name" }, { fieldPath: "date" }, { fieldPath: "status" }, { fieldPath: "public" }] },
        orderBy: [{ field: { fieldPath: "date" }, direction: "DESCENDING" }],
        limit: 5
      } })
    }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      var day = today(), live = null;
      (rows || []).forEach(function (row) {
        var d = row.document; if (!d || live) return;
        var f = d.fields || {};
        var val = function (k) { return f[k] && (f[k].stringValue !== undefined ? f[k].stringValue : f[k].booleanValue); };
        if (val("status") === "live" && val("public") !== false && val("date") === day) {
          live = { id: d.name.split("/").pop(), name: val("name") };
        }
      });
      if (live) show(live); else hide();
    }).catch(function () { /* offline etc. - just don't show it */ });
  }

  function start() { check(); setInterval(check, CHECK_EVERY); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
