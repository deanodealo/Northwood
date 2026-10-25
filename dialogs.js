/* ==========================================================================
   POPUP KEYBOARD ACCESS  (accessibility - WCAG 2.1.2 / 2.4.3)

   Gives the site's popups the standard keyboard behaviour, without
   changing how each page opens or closes them:
     - when a popup opens, focus moves into it
     - Tab / Shift+Tab stay inside the popup while it's open
     - Escape closes it (by pressing its own Close / Cancel button)
     - when it closes, focus goes back to the button that opened it
   It also marks each popup as a dialog for screen readers.

   It watches the popups listed in POPUP_IDS, so the existing open/close
   code (style.display, .is-open, hidden, aria-hidden) keeps working as-is.
   To cover a new popup, add its id here and load this file on that page.
   ========================================================================== */
(function () {
  "use strict";

  var POPUP_IDS = [
    "partnerContactModal",   // homepage "Get In Touch"
    "accountModalOverlay",   // My Account log in / register
    "familyModalOverlay",    // Manage Family
    "confirmModalOverlay",   // booking confirmation
    "myBookingsOverlay",     // My Bookings
    "staffModalOverlay",     // staff log in
    "callModal"              // Call Us
  ];
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
                  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  var popups = POPUP_IDS.map(function (id) { return document.getElementById(id); }).filter(Boolean);
  if (!popups.length) return;

  function isOpen(el) {
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
    var s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden";
  }
  function focusables(el) {
    return Array.prototype.filter.call(el.querySelectorAll(FOCUSABLE), function (n) {
      return n.getClientRects().length > 0 && getComputedStyle(n).visibility !== "hidden";
    });
  }
  // The popup's box (what screen readers should treat as the dialog).
  function dialogBox(el) {
    if (el.getAttribute("role") === "dialog") return el;
    return el.querySelector('[role="dialog"]') || el.firstElementChild || el;
  }

  // Label each popup as a dialog if its markup doesn't already.
  popups.forEach(function (el, i) {
    var box = dialogBox(el);
    if (!box.getAttribute("role")) box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    if (!box.getAttribute("aria-labelledby") && !box.getAttribute("aria-label")) {
      var h = box.querySelector("h1, h2, h3, h4");
      if (h) {
        if (!h.id) h.id = "dlg-title-" + i;
        box.setAttribute("aria-labelledby", h.id);
      }
    }
  });

  // Remember the last control the user used outside a popup, so focus can
  // go back to it. (Safari doesn't focus buttons on click, so pointerdown
  // is tracked as well as focus.)
  var lastControl = null;
  function track(e) {
    var t = e.target && e.target.closest && e.target.closest(FOCUSABLE);
    if (t && !popups.some(function (p) { return p.contains(t); })) lastControl = t;
  }
  document.addEventListener("focusin", track, true);
  document.addEventListener("pointerdown", track, true);

  var stack = []; // open popups, most recent last

  function onOpen(el) {
    if (stack.some(function (s) { return s.el === el; })) return;
    stack.push({ el: el, opener: lastControl });
    // Let the page finish showing it, then move focus in (unless the page
    // already did, e.g. into a form field).
    setTimeout(function () {
      if (!isOpen(el) || el.contains(document.activeElement)) return;
      var f = focusables(el);
      var first = el.querySelector("[autofocus]") ||
                  f.filter(function (n) { return /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName); })[0] ||
                  f[0];
      if (first) first.focus();
      else { var box = dialogBox(el); box.setAttribute("tabindex", "-1"); box.focus(); }
    }, 60);
  }
  function onClose(el) {
    var i = -1;
    stack.forEach(function (s, n) { if (s.el === el) i = n; });
    if (i < 0) return;
    var item = stack.splice(i, 1)[0];
    // Only move focus back if it was inside the popup (or lost to <body>).
    var a = document.activeElement;
    if (item.opener && document.contains(item.opener) && (!a || a === document.body || el.contains(a))) {
      setTimeout(function () { item.opener.focus(); }, 0);
    }
  }

  popups.forEach(function (el) {
    var was = isOpen(el);
    if (was) onOpen(el);
    new MutationObserver(function () {
      var now = isOpen(el);
      if (now === was) return;
      was = now;
      if (now) onOpen(el); else onClose(el);
    }).observe(el, { attributes: true, attributeFilter: ["style", "class", "hidden", "aria-hidden"] });
  });

  function closeControl(el) {
    return el.querySelector("[data-close-modal]:not(.contact-modal-backdrop)") ||
           el.querySelector('[id$="Cancel"], [id$="Close"], [aria-label="Close"]') ||
           Array.prototype.filter.call(el.querySelectorAll("button"), function (b) {
             return /^(close|cancel|×|x)$/i.test(b.textContent.trim());
           })[0];
  }

  document.addEventListener("keydown", function (e) {
    var top = stack.length && stack[stack.length - 1].el;
    if (!top || !isOpen(top)) return;

    if (e.key === "Escape") {
      var c = closeControl(top);
      if (c) { e.preventDefault(); c.click(); }
      return;
    }
    if (e.key !== "Tab") return;
    var f = focusables(top);
    if (!f.length) { e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (!top.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  });
})();
