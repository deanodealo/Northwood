/* ==========================================================================
   BREADCRUMBS + SMART BACK LINK  (every public subpage, not the homepage)

   Shows e.g.   ← Back  |  Home › Facilities › Gym   just under the header.

   - Breadcrumb: where the page sits in the site, the same however you got
     here. Each part is a link except the current page.
   - "← Back": if the previous page was on this site, it goes back to that
     exact page (like the browser's back button - handy in the iPhone
     home-screen app, which has no back button). If someone arrived from
     Google, Facebook, a shared link etc., it goes up one level instead,
     so it never takes them off the site.
   - Also adds Google's BreadcrumbList data, so search results can show
     "Northwood Stadium › Facilities › Gym".

   To add a page: add it to PAGES below and add
     <script src="crumbs.js" defer></script>
   to that page. Pages not listed here show nothing.
   ========================================================================== */
(function () {
  "use strict";

  var HOME = ["Home", "index.html"];
  var FACILITIES = ["Facilities", "facilities.html"];
  var WHATS_ON = ["What's On", "index.html#activities"];
  var EVENTS = ["Events & Venue Hire", "venue-hire.html"];

  // file name -> { trail: parent crumbs (Home first), name: this page,
  //                tone: "dark" over a photo/dark hero, "light" on a light page }
  var PAGES = {
    "facilities.html":         { trail: [HOME], name: "Facilities", tone: "light" },
    "gym.html":                { trail: [HOME, FACILITIES], name: "Gym", tone: "dark" },
    "track.html":              { trail: [HOME, FACILITIES], name: "Athletics Track", tone: "dark" },
    "sportshall.html":         { trail: [HOME, FACILITIES], name: "Sports Hall", tone: "dark" },
    "team-bookings.html":      { trail: [HOME, FACILITIES], name: "Team & Club 3G Bookings", tone: "dark" },
    "wnf.html":                { trail: [HOME, WHATS_ON], name: "Wednesday Night Football", tone: "dark" },
    "funetics.html":           { trail: [HOME, WHATS_ON], name: "Funetics", tone: "dark" },
    "tracksocial.html":        { trail: [HOME, WHATS_ON], name: "Track Social", tone: "dark" },
    "youthclub.html":          { trail: [HOME, WHATS_ON], name: "Youth Club", tone: "dark" },
    "tournament.html":         { trail: [HOME, WHATS_ON, ["Youth Club", "youthclub.html"]], name: "Tournament", tone: "dark" },
    "venue-hire.html":         { trail: [HOME], name: "Events & Venue Hire", tone: "dark" },
    "events.html":             { trail: [HOME, EVENTS], name: "Event & School Bookings", tone: "dark" },
    "sponsorship.html":        { trail: [HOME], name: "Sponsorship", tone: "dark" },
    "activitybooking.html":    { trail: [HOME], name: "Book an Activity", tone: "light", inline: ".ab-heading" },
    "faq.html":                { trail: [HOME], name: "FAQs", tone: "light" },
    "terms.html":              { trail: [HOME], name: "Terms & Conditions", tone: "light" },
    "privacy.html":            { trail: [HOME], name: "Privacy Policy", tone: "light" },
    "conditions-of-hire.html": { trail: [HOME], name: "Conditions of Hire", tone: "dark" }
  };

  var SITE = "https://northwoodstadium.co.uk/";

  var path = location.pathname;
  var file = (path.split("/").pop() || "index.html").toLowerCase();
  var page = PAGES[file];
  if (!page) return;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Was the previous page part of this site? (Same origin AND same folder,
  // because on github.io other sites share the origin.)
  var base = path.slice(0, path.lastIndexOf("/") + 1);
  var cameFromSite = false;
  try {
    if (document.referrer) {
      var ref = new URL(document.referrer);
      cameFromSite = ref.origin === location.origin &&
        ref.pathname.indexOf(base) === 0 &&
        ref.pathname !== path &&
        history.length > 1;
    }
  } catch (e) { /* bad referrer - just use the parent page */ }

  var parent = page.trail[page.trail.length - 1];

  var crumbs = page.trail.map(function (c) {
    return '<li><a href="' + esc(c[1]) + '">' + esc(c[0]) + "</a></li>";
  }).join("") + '<li aria-current="page">' + esc(page.name) + "</li>";

  var nav = document.createElement("nav");
  nav.className = "crumbs crumbs--" + page.tone + (page.inline ? " crumbs--inline" : "");
  nav.setAttribute("aria-label", "Breadcrumb");
  nav.innerHTML =
    '<div class="crumbs-inner">' +
      '<a class="crumbs-back" href="' + esc(parent[1]) + '">' +
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        "Back</a>" +
      '<ol class="crumbs-list">' + crumbs + "</ol>" +
    "</div>";

  // Back to the exact previous page when it was on this site.
  nav.querySelector(".crumbs-back").addEventListener("click", function (e) {
    if (cameFromSite) { e.preventDefault(); history.back(); }
  });

  var spot = page.inline && document.querySelector(page.inline);
  if (spot) {
    spot.insertBefore(nav, spot.firstChild);
  } else {
    var header = document.querySelector(".site-header");
    if (!header) return;
    header.parentNode.insertBefore(nav, header.nextSibling);
    document.body.classList.add("has-crumbs");
    makeRoom(nav);
  }

  // The bar sits over the top padding of the page's first section. Pages
  // leave different amounts of space under the header (and less on phones),
  // so if the bar would touch the first heading, add just enough padding to
  // clear it. Re-checked on resize because the space changes at breakpoints.
  function makeRoom(bar) {
    var main = document.querySelector("main");
    if (!main) return;
    var first = null;
    for (var el = main.firstElementChild; el; el = el.nextElementSibling) {
      if (!/^(SCRIPT|STYLE|TEMPLATE|LINK)$/.test(el.tagName) && el.offsetHeight > 0) { first = el; break; }
    }
    if (!first) return;
    var GAP = 18;
    // Top of the first real content (text or a logo image) in the section,
    // ignoring background photos, scrims and decorative graphics.
    function contentTop() {
      var top = Infinity;
      var all = first.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.closest("[aria-hidden='true']")) continue;
        var hasText = false;
        for (var n = el.firstChild; n; n = n.nextSibling) {
          if (n.nodeType === 3 && n.nodeValue.trim()) { hasText = true; break; }
        }
        if (!hasText && el.tagName !== "IMG") continue;
        if (el.tagName === "IMG" && el.alt === "") continue; // background/decoration
        var r = el.getBoundingClientRect();
        if (r.height > 0 && r.top < top) top = r.top;
      }
      return top;
    }
    function fit() {
      first.style.paddingTop = "";
      var short = bar.getBoundingClientRect().bottom + GAP - contentTop();
      if (!(short > 0) || !isFinite(short)) return;
      var before = contentTop();
      first.style.paddingTop = (parseFloat(getComputedStyle(first).paddingTop) + short) + "px";
      // If the padding didn't move the content (e.g. a full-height hero with
      // its text pinned to the bottom), take it off again.
      if (contentTop() - before < 1) first.style.paddingTop = "";
    }
    fit();
    var t;
    window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(fit, 120); });
    // Web fonts can change the bar's height once they load.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  }

  // Google breadcrumb data (always uses the real domain).
  var items = page.trail.concat([[page.name, file]]).map(function (c, i) {
    var url = c[1] === "index.html" ? SITE : SITE + c[1].replace(/^index\.html/, "");
    return { "@type": "ListItem", "position": i + 1, "name": c[0], "item": url };
  });
  var ld = document.createElement("script");
  ld.type = "application/ld+json";
  ld.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items });
  document.head.appendChild(ld);
})();
