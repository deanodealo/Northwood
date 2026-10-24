/**
 * Northwood Stadium — Add to Home Screen popup
 * Handles: Android/Chrome (beforeinstallprompt) + iOS Safari instruction card
 * Place at: add-to-home.js (same folder as index.html)
 * Add to <head>: <script src="add-to-home.js" defer></script>
 *
 * Requires HTTPS (or localhost) — beforeinstallprompt will not fire on a
 * plain http:// address like a Live Server LAN IP, since that's not
 * considered a secure context. Test on the real deployed site, or via
 * Chrome DevTools → Application → Manifest → "Add to home screen" link.
 */

(function () {
  'use strict';

  const DISMISSED_KEY = 'northwood_aths_dismissed';
  const INSTALL_KEY   = 'northwood_aths_installed';
  const BOOKING_SHOWN_KEY = 'northwood_aths_after_booking';

  function isDismissed() {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === '1' ||
             localStorage.getItem(INSTALL_KEY)     === '1';
    } catch (e) { return false; }
  }

  function dismiss(permanent) {
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1');
      if (permanent) localStorage.setItem(INSTALL_KEY, '1');
    } catch (e) { /* private browsing: nothing to remember */ }
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  }

  function isInStandaloneMode() {
    return window.navigator.standalone === true ||
           window.matchMedia('(display-mode: standalone)').matches;
  }

  /* ── CSS ─────────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('aths-styles')) return;
    const style = document.createElement('style');
    style.id = 'aths-styles';
    style.textContent = `
      @keyframes athsSlideUp { from { transform:translateX(-50%) translateY(40px); opacity:0 }
                                 to { transform:translateX(-50%) translateY(0); opacity:1 } }
      @keyframes athsBounce  { 0%,100% { transform:translateY(0) } 50% { transform:translateY(5px) } }

      #aths-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(11,11,12,0.55);
        z-index: 9099;
      }

      #aths-card {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        width: min(360px, calc(100vw - 32px));
        background: #0B0B0C;
        border-radius: 16px;
        border-top: 4px solid #C8102E;
        border-bottom: 4px solid #C8102E;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        z-index: 9100;
        overflow: visible;
        animation: athsSlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1);
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        box-sizing: border-box;
      }

      /* X close button — defensively reset in case any global button/input
         rule on the site ever tries to stretch it (this was the exact bug
         that hit FC Hanley's version of this popup). */
      #aths-close {
        position: absolute !important;
        top: 8px !important;
        right: 8px !important;
        width: auto !important;
        min-width: 0 !important;
        margin: 0 !important;
        padding: 2px 6px !important;
        background: none !important;
        border: none !important;
        border-radius: 0 !important;
        color: rgba(255,255,255,0.55);
        font-size: 22px !important;
        line-height: 1;
        cursor: pointer;
        z-index: 10;
        transition: color 0.2s;
      }
      #aths-close:hover { color: #fff; background: none !important; }

      /* Header: logo + title */
      #aths-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 40px 0 16px;
      }
      #aths-logo {
        width: 44px !important;
        height: 44px;
        border-radius: 10px;
        object-fit: cover;
        flex-shrink: 0;
        border: 2px solid #C8102E;
        margin: 0;
      }
      #aths-title {
        font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
        font-size: 1.05rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        color: #FFFFFF;
        margin: 0;
        line-height: 1.25;
      }

      /* Body */
      #aths-body {
        font-size: 0.82rem;
        color: rgba(255,255,255,0.75);
        margin: 12px 16px 14px;
        line-height: 1.5;
      }

      /* iOS share-icon hint */
      #aths-ios-hint {
        text-align: center;
        color: rgba(255,255,255,0.6);
        font-size: 0.72rem;
        padding: 0 16px 16px;
        line-height: 1.5;
      }
      #aths-ios-hint svg {
        display: block;
        margin: 0 auto 4px;
        animation: athsBounce 1.2s ease-in-out infinite;
      }

      /* Action buttons — same defensive reset as the close button */
      #aths-actions {
        display: flex;
        gap: 8px;
        padding: 0 16px 16px;
      }
      .aths-btn {
        flex: 1;
        width: auto !important;
        margin: 0 !important;
        padding: 11px 14px !important;
        border-radius: 8px !important;
        border: none;
        font-family: 'DM Sans', sans-serif;
        font-size: 0.82rem !important;
        font-weight: 700;
        cursor: pointer;
        transition: filter 0.2s, transform 0.1s;
      }
      .aths-btn:active { transform: scale(0.97); }
      .aths-btn-primary { background: #C8102E !important; color: #FFFFFF !important; }
      .aths-btn-primary:hover { filter: brightness(1.1); background: #C8102E !important; }
      .aths-btn-secondary {
        background: rgba(255,255,255,0.08) !important;
        color: rgba(255,255,255,0.7) !important;
        border: 1px solid rgba(255,255,255,0.18);
      }
      .aths-btn-secondary:hover { background: rgba(255,255,255,0.16) !important; }
    `;
    document.head.appendChild(style);
  }

  /* ── Build card ───────────────────────────────────────────────
     kind:    'native' (Android/Chrome install button), 'ios' (Share →
              Add to Home Screen steps) or 'manual' (use the browser menu)
     context: 'auto' (popup after page load), 'booking' (after a booking)
              or 'menu' (a "Get the App" link was tapped) */
  function buildCard(kind, context) {
    injectStyles();

    const backdrop = document.createElement('div');
    backdrop.id = 'aths-backdrop';
    if (kind !== 'ios') backdrop.addEventListener('click', () => hideAll(false));

    const card = document.createElement('div');
    card.id = 'aths-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'aths-title');

    const shareIcon = `<svg style="display:inline-block;vertical-align:middle;margin:0 2px" width="15" height="15"
              viewBox="0 0 24 24" fill="none" stroke="#C8102E" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
           <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
           <polyline points="16 6 12 2 8 6"/>
           <line x1="12" y1="2" x2="12" y2="15"/>
         </svg>`;

    const lead = context === 'booking'
      ? `<strong style="color:#fff">Check your bookings in one tap.</strong> `
      : '';

    const bodyText =
      kind === 'ios'
        ? `${lead}Tap the <strong style="color:#C8102E">Share</strong> ${shareIcon}
           button in your browser bar, then choose
           <strong style="color:#C8102E">"Add to Home Screen"</strong>`
      : kind === 'native'
        ? `${lead}Get quick access to activity bookings and updates — install the Northwood Stadium app!`
        : `${lead}Open your browser's menu
           (<strong style="color:#C8102E">&#8942;</strong> or <strong style="color:#C8102E">&#9776;</strong>)
           and choose <strong style="color:#C8102E">"Install app"</strong> or
           <strong style="color:#C8102E">"Add to Home screen"</strong>.`;

    const actions =
      kind === 'native'
        ? `<button class="aths-btn aths-btn-primary" id="aths-install">Install</button>
           <button class="aths-btn aths-btn-secondary" id="aths-later">Not now</button>`
        : `<button class="aths-btn aths-btn-secondary" id="aths-later" style="flex:1;">${context === 'menu' ? 'Close' : 'Maybe later'}</button>`;

    card.innerHTML = `
      <button id="aths-close" aria-label="Close">&times;</button>
      <div id="aths-header">
        <img id="aths-logo" src="./images/apple-touch-icon.png" alt="Northwood Stadium">
        <p id="aths-title">Add Northwood Stadium<br>to your home screen</p>
      </div>
      <p id="aths-body">${bodyText}</p>
      ${kind === 'ios' ? `
        <div id="aths-ios-hint">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8102E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
          </svg>
          Look for the share icon in your browser's toolbar
        </div>` : ''}
      <div id="aths-actions">${actions}</div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(card);

    card.querySelector('#aths-close').addEventListener('click', () => hideAll(false));
    card.querySelector('#aths-later').addEventListener('click', () => hideAll(false));

    const install = card.querySelector('#aths-install');
    if (install) {
      install.addEventListener('click', async () => {
        hideAll(false);
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') dismiss(true);
        deferredPrompt = null;
      });
    }
    return card;
  }

  function hideAll(permanent) {
    dismiss(permanent);
    const card = document.getElementById('aths-card');
    const backdrop = document.getElementById('aths-backdrop');
    if (card) card.remove();
    if (backdrop) backdrop.remove();
  }

  /* ── Service worker ───────────────────────────────────────── */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    // updateViaCache: 'none' — always fetch sw.js itself fresh, so a new
    // version is picked up on the next visit rather than up to a day later.
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => {
        // Opened from the home screen, the site is often just "resumed"
        // from the background rather than reloaded, so it can sit on an
        // old version for days. Each time it comes back to the front:
        //  - ask for any newer service worker, and
        //  - if it's been in the background for 30+ minutes, reload the
        //    page so it picks up the latest version of the site.
        let hiddenAt = null;
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            hiddenAt = Date.now();
            return;
          }
          reg.update().catch(() => {});
          if (isInStandaloneMode() && hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000) {
            location.reload();
          }
        });
      })
      .catch(() => {});
  }

  /* ── Show logic ───────────────────────────────────────────── */
  let deferredPrompt = null;   // Android/Chrome's saved install prompt

  function isIOSSafari() {
    return isIOS() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
  }

  // Which version of the card can we usefully show on this device?
  function cardKind() {
    if (deferredPrompt) return 'native';
    if (isIOS()) return 'ios';
    return 'manual';
  }

  // Storage that can't break the page (it throws in some private modes)
  function store(kind, key, value) {
    try {
      const st = kind === 'local' ? localStorage : sessionStorage;
      if (value === undefined) return st.getItem(key);
      st.setItem(key, value);
    } catch (e) { return null; }
  }

  // context: 'auto' | 'booking' | 'menu'
  //  - 'auto' and 'booking' only show where we can genuinely help (an
  //    install button on Android, or Safari's steps on iPhone), never
  //    once the app is installed, and never twice in one visit.
  //  - 'menu' is someone asking for it, so it always opens (falling back
  //    to "use your browser menu" instructions on other browsers).
  function show(context) {
    if (isInStandaloneMode()) return false;
    if (document.getElementById('aths-card')) return false;
    if (context !== 'menu') {
      if (store('local', INSTALL_KEY) === '1') return false;
      const kind = cardKind();
      if (kind === 'manual') return false;
      if (kind === 'ios' && !isIOSSafari()) return false;
    }
    if (context === 'auto' && isDismissed()) return false;
    if (context === 'booking') {
      if (store('session', BOOKING_SHOWN_KEY) === '1') return false;
      store('session', BOOKING_SHOWN_KEY, '1');
    }
    buildCard(cardKind(), context);
    return true;
  }

  // Public hooks: the booking page calls NorthwoodATHS.show('booking')
  // after a booking; any element with data-aths-open opens it on demand.
  window.NorthwoodATHS = { show: show };

  /* ── Main ─────────────────────────────────────────────────── */
  function init() {
    registerSW();

    // "Get the App" links: hidden when already running as the installed app
    const openers = document.querySelectorAll('[data-aths-open]');
    openers.forEach(el => {
      if (isInStandaloneMode()) {
        el.hidden = true;
        const wrap = el.closest('[data-aths-open-wrap]');
        if (wrap) wrap.hidden = true;
        return;
      }
      el.addEventListener('click', e => { e.preventDefault(); show('menu'); });
    });

    if (isInStandaloneMode()) return;

    // Pages can opt out of the automatic popup (the booking page does, so
    // it never covers the booking form; it asks after a booking instead).
    const self = document.querySelector('script[src*="add-to-home.js"]');
    const autoPopup = !(self && self.getAttribute('data-auto') === 'off');

    /* Android / Chrome path */
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
      if (autoPopup) setTimeout(() => show('auto'), 3000);
    });

    window.addEventListener('appinstalled', () => { dismiss(true); hideAll(true); });

    /* iOS Safari path — no beforeinstallprompt event exists on iOS, so
       this shows after a delay (Safari only, as before). */
    if (autoPopup && isIOSSafari()) {
      setTimeout(() => show('auto'), 3000);
    }
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

})();
