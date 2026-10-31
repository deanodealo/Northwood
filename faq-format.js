/* ==========================================================================
   NORTHWOOD — FAQ ANSWER FORMATTING
   Used by faq.html (to show the answers) and faq-admin.html (the staff
   editor), so both always format answers the same way.

   Staff type answers as plain text, with a few simple extras:
     - A blank line starts a new paragraph
     - Lines starting "- " become a bullet list
     - Lines starting "1. ", "2. " … become a numbered list
     - **like this** makes text bold
     - [link text](address) makes a link, e.g. [Book an Activity](activitybooking.html)
     - Email addresses and web addresses are turned into links automatically

   NWFaq.toHtml(text)   -> safe HTML for the public page
   NWFaq.fromHtml(el)   -> the plain-text version of an existing answer
                           (used once, to load the FAQs already on the page)
   NWFaq.slug(text)     -> a link-friendly id, e.g. "how-do-i-pay"
   ========================================================================== */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Only allow ordinary links: web, email, phone, pages on this site, #anchors.
  function safeHref(u) {
    u = String(u || "").trim();
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;   // javascript:, data: etc.
    if (/^\/\//.test(u)) return null;
    return u;                                          // relative: page.html, #id
  }

  function link(text, href) {
    var h = safeHref(href);
    if (!h) return esc(text);
    var ext = /^https?:/i.test(h) && h.indexOf(location.host) === -1;
    return '<a href="' + esc(h) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">" + text + "</a>";
  }

  // One line of text -> HTML (bold, links, auto-linked emails and URLs).
  function inline(s) {
    var re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)|(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;
    var out = "", last = 0, m;
    while ((m = re.exec(s))) {
      out += esc(s.slice(last, m.index));
      if (m[1] != null) out += link(inline(m[1]), m[2]);
      else if (m[3] != null) out += "<strong>" + inline(m[3]) + "</strong>";
      else if (m[4] != null) out += link(esc(m[4]), "mailto:" + m[4]);
      else if (m[5] != null) out += link(esc(m[5]), m[5]);
      last = re.lastIndex;
    }
    return out + esc(s.slice(last));
  }

  function toHtml(text) {
    var lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    var html = "", para = [], list = null;
    function flushPara() {
      if (para.length) html += "<p>" + para.map(inline).join("<br>") + "</p>";
      para = [];
    }
    function flushList() {
      if (list) html += "<" + list.tag + ">" + list.items.map(function (i) { return "<li>" + inline(i) + "</li>"; }).join("") + "</" + list.tag + ">";
      list = null;
    }
    lines.forEach(function (raw) {
      var line = raw.trim(), m;
      if (!line) { flushPara(); flushList(); return; }
      if ((m = line.match(/^[-*•]\s+(.*)$/))) {
        flushPara();
        if (!list || list.tag !== "ul") { flushList(); list = { tag: "ul", items: [] }; }
        list.items.push(m[1]); return;
      }
      if ((m = line.match(/^\d+[.)]\s+(.*)$/))) {
        flushPara();
        if (!list || list.tag !== "ol") { flushList(); list = { tag: "ol", items: [] }; }
        list.items.push(m[1]); return;
      }
      flushList();
      para.push(line);
    });
    flushPara(); flushList();
    return html;
  }

  // Existing answer HTML -> the plain-text format above.
  function inlineText(node) {
    var out = "";
    node.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, " "); return; }
      if (n.nodeType !== 1) return;
      var t = n.tagName;
      if (t === "BR") out += "\n";
      else if (t === "STRONG" || t === "B") out += "**" + inlineText(n).trim() + "**";
      else if (t === "A") {
        var txt = inlineText(n).trim(), href = n.getAttribute("href") || "";
        // Plain emails and web addresses link themselves; keep those as-is.
        if (href === "mailto:" + txt || href === txt) out += txt;
        else out += "[" + txt + "](" + href + ")";
      }
      else out += inlineText(n);
    });
    return out;
  }
  function fromHtml(el) {
    var blocks = [];
    Array.prototype.forEach.call(el.children, function (c) {
      if (c.tagName === "UL" || c.tagName === "OL") {
        var n = 0;
        blocks.push(Array.prototype.map.call(c.querySelectorAll(":scope > li"), function (li) {
          n++;
          return (c.tagName === "UL" ? "- " : n + ". ") + inlineText(li).trim();
        }).join("\n"));
      } else {
        blocks.push(inlineText(c).split("\n").map(function (l) { return l.trim(); }).join("\n").trim());
      }
    });
    return blocks.filter(Boolean).join("\n\n");
  }

  function slug(s) {
    return String(s || "").toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "faq";
  }

  window.NWFaq = { toHtml: toHtml, fromHtml: fromHtml, slug: slug, esc: esc };
})();
