/* ==========================================================================
   NORTHWOOD — LIVE PAGE CONTENT
   Used by tracksocial.html, gym.html, wnf.html and funetics.html
   (each has <body data-live-page="...">).

   - Track Social "Our Next Track Social" block and Register buttons, and
     the Gym fitness class timetable, come from the "pageContent"
     collection, edited by staff on page-content.html.
   - WNF and Funetics dates and prices come straight from their activities
     in Manage Activities (any active activity whose "More info page" is
     wnf.html / funetics.html), so the page always matches what the
     booking page sells and charges.

   Reads go through Firestore's REST API rather than the full Firebase
   SDK, to keep these public pages light. If anything fails to load, the
   text already in the page is left exactly as it is.
   ========================================================================== */
(function () {
  "use strict";

  var PROJECT = "northwood-stadium";
  var API_KEY = "AIzaSyDGSOa02_oHzRARoisN-gA3zzsTTC9U9QQ";
  var BASE = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents/";
  var page = document.body.getAttribute("data-live-page");
  if (!page) return;

  /* ── Firestore REST helpers ─────────────────────────────────── */
  function decodeValue(v) {
    if (v == null) return null;
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return Number(v.doubleValue);
    if ("booleanValue" in v) return v.booleanValue;
    if ("nullValue" in v) return null;
    if ("timestampValue" in v) return v.timestampValue;
    if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
    return null;
  }
  function decodeFields(fields) {
    var out = {};
    Object.keys(fields).forEach(function (k) { out[k] = decodeValue(fields[k]); });
    return out;
  }
  function decodeDoc(d) {
    var o = decodeFields(d.fields || {});
    o.id = d.name.split("/").pop();
    return o;
  }
  // One document, or null if it doesn't exist yet. Throws on any other error.
  function getDoc(path) {
    return fetch(BASE + path + "?key=" + API_KEY).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Firestore " + res.status);
      return res.json().then(decodeDoc);
    });
  }
  // Every document in a collection (follows paging).
  function listCollection(name) {
    var all = [];
    function next(token) {
      var url = BASE + name + "?pageSize=300&key=" + API_KEY + (token ? "&pageToken=" + encodeURIComponent(token) : "");
      return fetch(url).then(function (res) {
        if (!res.ok) throw new Error("Firestore " + res.status);
        return res.json();
      }).then(function (data) {
        (data.documents || []).forEach(function (d) { all.push(decodeDoc(d)); });
        return data.nextPageToken ? next(data.nextPageToken) : all;
      });
    }
    return next(null);
  }

  /* ── Formatting helpers ─────────────────────────────────────── */
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parseIso(iso) { var p = iso.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function dayName(iso) { return DAYS[parseIso(iso).getDay()]; }
  function dayMonth(iso) { var d = parseIso(iso); return d.getDate() + " " + MONTHS[d.getMonth()]; }        // 4 November
  function shortDayMonth(iso) { var d = parseIso(iso); return d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3); } // 4 Nov
  function money(n) { n = Number(n); return "£" + (Number.isInteger(n) ? n : n.toFixed(2)); }   // £6, £6.50
  function plural(word, n) { return n === 1 ? word : word + "s"; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // "18:00","19:00" → "6:00–7:00pm"; "11:00","12:30" → "11:00am–12:30pm"
  function to12(t) {
    var p = String(t || "").split(":"), h = Number(p[0]), m = p[1] || "00";
    return { text: ((h % 12) || 12) + ":" + m, suffix: h < 12 ? "am" : "pm" };
  }
  function timeRange(start, end) {
    if (!start) return "";
    var a = to12(start);
    if (!end) return a.text + a.suffix;
    var b = to12(end);
    return a.suffix === b.suffix ? a.text + "–" + b.text + b.suffix : a.text + a.suffix + "–" + b.text + b.suffix;
  }
  function set(key, html) {
    document.querySelectorAll('[data-live="' + key + '"]').forEach(function (el) { el.innerHTML = html; });
  }

  /* ── Activities (WNF + Funetics) ────────────────────────────── */
  function pageOf(a) {
    return String(a.infoPage || "").toLowerCase().replace(/#.*$/, "");
  }
  function hasBlockPrice(a) {
    return a.blockPrice != null && a.blockPrice !== "" && Number(a.blockPrice) >= 0 && Number(a.blockPrice) < Number(a.price);
  }
  // Summary of every active activity that uses this page.
  function summarise(activities, file) {
    var today = todayIso();
    var groups = activities.filter(function (a) { return a.status === "active" && pageOf(a) === file; });
    var prices = groups.map(function (a) { return Number(a.price); }).filter(function (n) { return isFinite(n); });
    var blockGroups = groups.filter(hasBlockPrice);
    var dates = {};       // every upcoming date, across all groups
    var byDay = {};       // dow → sorted upcoming dates
    var maxCount = 0;     // most upcoming sessions in any one group (= one block)
    groups.forEach(function (a) {
      var up = (a.sessions || []).filter(function (s) { return s && s.date >= today; });
      maxCount = Math.max(maxCount, up.length);
      up.forEach(function (s) { dates[s.date] = true; });
    });
    var sorted = Object.keys(dates).sort();
    sorted.forEach(function (iso) { var dn = dayName(iso); (byDay[dn] = byDay[dn] || []).push(iso); });
    var dayList = Object.keys(byDay);
    return {
      groups: groups,
      price: prices.length ? Math.min.apply(null, prices) : null,
      blockPrice: blockGroups.length ? Math.min.apply(null, blockGroups.map(function (a) { return Number(a.blockPrice); })) : null,
      count: maxCount,
      first: sorted[0] || null,
      last: sorted[sorted.length - 1] || null,
      byDay: byDay,
      singleDay: dayList.length === 1 ? dayList[0] : null
    };
  }

  function initWnf(activities) {
    var s = summarise(activities, "wnf.html");
    var hasDates = !!s.first;
    var block = hasDates && s.blockPrice != null && s.count >= 2;
    var days = s.singleDay ? plural(s.singleDay, s.count) : plural("session", s.count);
    var singles = s.singleDay ? s.singleDay + "s" : "sessions";
    var blockTotal = block ? s.blockPrice * s.count : null;
    var range = hasDates ? (s.first === s.last ? dayMonth(s.first) : dayMonth(s.first) + " to " + dayMonth(s.last)) : "";

    // Hero stat
    if (block) set("wnfStat", "<b>From " + money(s.blockPrice) + "</b><span>A session when you book the " + s.count + "-week block</span>");
    else if (s.price != null) set("wnfStat", "<b>" + money(s.price) + "</b><span>A session, booked online</span>");

    // How it works: step 3
    if (block) set("wnfChoose", "Book the full " + s.count + "-week block for " + money(blockTotal) + " (" + money(s.blockPrice) +
      " a session), or single " + singles + " at " + money(s.price) + ".");
    else if (hasDates && s.price != null) set("wnfChoose", "Book the " + singles + " you want, at " + money(s.price) + " each.");
    else set("wnfChoose", "Book the sessions you want once the next block's dates are published.");

    // Key details
    set("wnfNext", hasDates ? s.count + " " + days + ", " + range : "Dates coming soon");
    if (s.price != null) set("wnfPrice", money(s.price) + " per session" + (block
      ? "<br><b>" + money(blockTotal) + " for the " + s.count + "-week block</b> (works out at " + money(s.blockPrice) + " a session)" : ""));

    // FAQ
    var faq = "No. ";
    if (s.price != null) faq += "You can book single sessions at " + money(s.price) + (block
      ? ", or book all " + s.count + " weeks of the block for " + money(blockTotal) + ", which works out at " + money(s.blockPrice) + " a session" : "") + ". ";
    faq += hasDates
      ? "The next block runs every " + (s.singleDay || "week") + " from " + range + "."
      : "Dates for the next block will be published here soon.";
    set("wnfFaq", faq);

    // Final call to action
    if (block) set("wnfCta", "Book the " + s.count + "-week block from " + dayMonth(s.first) + ", or a single session,");
    else if (hasDates) set("wnfCta", "Book your sessions from " + dayMonth(s.first) + ",");
    else set("wnfCta", "Dates for the next block are coming soon. Once they're live you can book");
  }

  function initFunetics(activities) {
    var s = summarise(activities, "funetics.html");
    var hasDates = !!s.first;
    if (s.price != null) set("fnPrice", money(s.price));

    var ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    var perDay = Object.keys(s.byDay).sort(function (a, b) {
      return ORDER.indexOf(a) - ORDER.indexOf(b);   // Tuesdays before Saturdays, as the page reads
    }).map(function (d) {
      var list = s.byDay[d];
      return list.length === 1 ? d + " " + dayMonth(list[0])
        : d + "s " + dayMonth(list[0]) + " to " + dayMonth(list[list.length - 1]);
    });

    if (hasDates) {
      set("fnFact", "<b>" + (s.first === s.last ? shortDayMonth(s.first) : shortDayMonth(s.first) + " – " + shortDayMonth(s.last)) +
        "</b><span>This term's dates, book online</span>");
      set("fnTerm", "This term runs from " + dayName(s.first) + " " + dayMonth(s.first) + " to " + dayName(s.last) + " " + dayMonth(s.last) + ".");
      set("fnTermNote", "<b>This term:</b> " + perDay.join(", and ") + ". Live dates and spaces are shown on the booking page.");
      set("fnLast", "This term's last session is " + dayName(s.last) + " " + dayMonth(s.last) + ".");
      set("fnCtaDates", "from " + dayMonth(s.first) + " to " + dayMonth(s.last) + ".");
    } else {
      set("fnFact", "<b>Dates soon</b><span>Next term's dates coming soon</span>");
      set("fnTerm", "Next term's dates will be published here soon.");
      set("fnTermNote", "<b>Next term:</b> dates coming soon. Live dates and spaces are shown on the booking page.");
      set("fnLast", "Next term's dates will be published here soon.");
      set("fnCtaDates", "in term time. Next term's dates are coming soon.");
    }
  }

  /* ── Track Social: next event (pageContent/trackSocial) ─────── */
  function londonOffset(iso) {
    // "+01:00" in summer time, "+00:00" in winter, for the event's date
    var noon = new Date(iso + "T12:00:00Z");
    var h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(noon));
    var off = h - 12;
    return (off >= 0 ? "+" : "-") + String(Math.abs(off)).padStart(2, "0") + ":00";
  }
  function initTrackSocial(doc) {
    if (!doc) return; // nothing saved yet: keep the page as it is
    var upcoming = doc.date && doc.date >= todayIso();
    var block = document.querySelector("#next .ts-next");
    if (!block) return;

    var times = doc.startTime ? doc.startTime + (doc.endTime ? " – " + doc.endTime : "") : "";
    var dateEl = block.querySelector(".ts-date");
    var title = block.querySelector(".ts-next-body h3");
    var rows = {
      guest: block.querySelector('[data-live="tsGuest"]'),
      activities: block.querySelector('[data-live="tsActivities"]'),
      partners: block.querySelector('[data-live="tsPartners"]')
    };
    function row(el, value) {
      if (!el) return;
      var wrap = el.closest("div");
      if (value) { el.textContent = value; wrap.hidden = false; } else { wrap.hidden = true; }
    }

    if (upcoming) {
      var d = parseIso(doc.date);
      dateEl.innerHTML =
        '<span class="ts-date-day">' + dayName(doc.date) + "</span>" +
        '<span class="ts-date-num">' + d.getDate() + "</span>" +
        '<span class="ts-date-month">' + MONTHS[d.getMonth()] + " " + d.getFullYear() + "</span>" +
        (times ? '<span class="ts-date-time">' + esc(times) + "</span>" : "");
      title.textContent = MONTHS[d.getMonth()] + " Track Social";
      row(rows.guest, doc.guestClub);
      row(rows.activities, doc.activities);
      row(rows.partners, doc.partners);

      // Keep Google's event details in step with the page
      var ld = document.querySelector('script[type="application/ld+json"]');
      if (ld && doc.startTime) {
        try {
          var data = JSON.parse(ld.textContent);
          var off = londonOffset(doc.date);
          data.startDate = doc.date + "T" + doc.startTime + ":00" + off;
          if (doc.endTime) data.endDate = doc.date + "T" + doc.endTime + ":00" + off;
          ld.textContent = JSON.stringify(data);
        } catch (e) { /* leave it as it was */ }
      }
    } else {
      // The saved event has been and gone: don't advertise an old date.
      dateEl.innerHTML =
        '<span class="ts-date-day">Every</span><span class="ts-date-num">Last</span>' +
        '<span class="ts-date-month">Monday of the month</span>';
      title.textContent = "Next date coming soon";
      row(rows.guest, ""); row(rows.activities, ""); row(rows.partners, "");
    }

    // Register buttons: hero, next event and Get Involved
    var url = upcoming && /^https?:\/\//i.test(doc.registerUrl || "") ? doc.registerUrl : "";
    document.querySelectorAll("[data-ts-register]").forEach(function (a) {
      var where = a.getAttribute("data-ts-register");
      if (url) {
        a.href = url; a.target = "_blank"; a.rel = "noopener"; a.hidden = false;
      } else if (where === "next") {
        a.hidden = true;             // nothing to register for yet
      } else {
        a.href = "#next"; a.removeAttribute("target");
      }
    });
  }

  /* ── Gym: fitness class timetable (pageContent/gymClasses) ──── */
  function initGym(doc) {
    var box = document.querySelector('[data-live="gymClasses"]');
    if (!box || !doc || !Array.isArray(doc.classes)) return;
    var classes = doc.classes.filter(function (c) { return c && c.name; });
    if (!classes.length) {
      box.innerHTML = '<div class="gm-timetable"><div><b>Class timetable coming soon</b>' +
        "<span>Ask at reception for the latest classes.</span></div></div>";
      return;
    }
    box.innerHTML = classes.map(function (c) {
      var name = esc(c.name) + (c.instructor ? " with " + esc(c.instructor) : "");
      var bits = [timeRange(c.startTime, c.endTime), esc(c.room || "")].filter(Boolean).join(" · ");
      return '<div class="gm-timetable">' +
        (c.days ? '<span class="gm-tt-day">' + esc(c.days) + "</span>" : "") +
        "<div><b>" + name + "</b>" + (bits ? "<span>" + bits + "</span>" : "") + "</div></div>";
    }).join("");
  }

  /* ── Run the right one for this page ────────────────────────── */
  var job =
    page === "wnf" ? listCollection("activities").then(initWnf) :
    page === "funetics" ? listCollection("activities").then(initFunetics) :
    page === "tracksocial" ? getDoc("pageContent/trackSocial").then(initTrackSocial) :
    page === "gym" ? getDoc("pageContent/gymClasses").then(initGym) : null;
  if (job) job.catch(function (err) { console.warn("Live content not loaded, showing saved text:", err); });
})();
