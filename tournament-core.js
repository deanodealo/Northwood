/* ==========================================================================
   TOURNAMENT CORE — shared by tournaments-admin.html (staff) and
   tournament.html (public / big screen). No Firebase in here: just the
   maths, so it can be tested on its own (see the test file in the repo
   notes) and the two pages always agree.

   Ported from the FC Hanley Festival of Football software:
     - circle-method round robin (odd numbers get a rest each round)
     - slot scheduler: keeps rounds in order, never puts a team on two
       pitches at once, and lets the teams that just played have a rest
     - league table: points, then goal difference, then goals scored
   Plus, for Northwood's weekly youth club tournaments:
     - "games per team" so a big turnout still finishes on time
     - semi-finals (1st v 4th, 2nd v 3rd) and a final, or a final only
     - penalties to decide a level knockout match

   A tournament (one Firestore doc in "tournaments") looks like:
     { name, date "YYYY-MM-DD", startTime "HH:MM", matchMins, changeMins,
       pitches: ["Pitch 1", ...], knockout: "semis" | "final" | "none",
       gamesPerTeam, teams: { t1: { name } }, teamOrder: ["t1", ...],
       fixtures: { g01: { stage: "group"|"semi"|"final", round, slot, pitch,
                          time "HH:MM", home, away, hs, as, status:
                          "upcoming"|"live"|"ft", pens: teamId|null,
                          label, from: {...} } },
       status: "live" | "finished", public: true, ... }
   Room for later: a "goals" list on each fixture for top scorers.
   ========================================================================== */
(function (root) {
  "use strict";

  // ── Time helpers ("HH:MM" <-> minutes after midnight) ────────
  function toMins(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  }
  function fromMins(mins) {
    const h = Math.floor(mins / 60) % 24, m = mins % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }
  // "18:05" -> "6:05pm"
  function niceTime(hhmm) {
    const t = toMins(hhmm), h = Math.floor(t / 60) % 24, m = t % 60;
    return (h % 12 || 12) + ":" + String(m).padStart(2, "0") + (h < 12 ? "am" : "pm");
  }

  // ── Round robin (circle method, as FC Hanley) ────────────────
  // Returns [{ round, home, away }]. With an odd number of teams, one team
  // rests each round.
  function roundRobin(teamIds) {
    const list = teamIds.length % 2 === 0 ? teamIds.slice() : teamIds.concat([null]);
    const size = list.length, half = size / 2, out = [];
    if (size < 2) return out;
    const fixed = list[0], rotating = list.slice(1);
    for (let round = 0; round < size - 1; round++) {
      const turned = rotating.slice(rotating.length - round).concat(rotating.slice(0, rotating.length - round));
      const row = [fixed].concat(turned);
      for (let i = 0; i < half; i++) {
        const a = row[i], b = row[size - 1 - i];
        if (a && b) out.push(round % 2 ? { round, home: b, away: a } : { round, home: a, away: b });
      }
    }
    return out;
  }

  // Most rounds that make sense for this many teams.
  function maxRounds(teamCount) { return teamCount < 2 ? 0 : (teamCount % 2 === 0 ? teamCount - 1 : teamCount); }

  // Keep the first N rounds, so every team plays (about) N games. With an
  // odd number of teams some play one fewer, because someone rests each round.
  function limitRounds(fixtures, rounds) {
    return fixtures.filter(f => f.round < rounds);
  }

  // ── Scheduler (FC Hanley's slot logic) ───────────────────────
  // Puts fixtures into time slots across the pitches. Rounds stay in order;
  // within a round, teams that have waited longest go first, and a team
  // that played in the previous slot is held back if another match can go.
  function schedule(fixtures, pitches, startTime, matchMins, changeMins) {
    const pitchCount = Math.max(1, pitches.length);
    const step = Number(matchMins) + Number(changeMins || 0);
    let left = fixtures.map((f, i) => Object.assign({ _i: i }, f));
    const lastSlot = {};
    const out = [];
    let slot = 0;
    while (left.length) {
      const busy = new Set();
      const prev = new Set(Object.keys(lastSlot).filter(t => lastSlot[t] === slot - 1));
      const candidates = left.slice().sort((a, b) =>
        (a.round - b.round) ||
        ((prev.has(a.home) || prev.has(a.away)) - (prev.has(b.home) || prev.has(b.away))) ||
        (Math.max(lastSlot[a.home] ?? -99, lastSlot[a.away] ?? -99) - Math.max(lastSlot[b.home] ?? -99, lastSlot[b.away] ?? -99)) ||
        (a._i - b._i));
      const minRound = candidates[0].round;
      let placed = 0;
      for (const f of candidates) {
        if (placed >= pitchCount) break;
        // Don't start the next round while this round still has matches to
        // play, unless a pitch would otherwise stand empty.
        if (f.round > minRound && candidates.some(c => c.round === minRound && !busy.has(c.home) && !busy.has(c.away) && !c._done)) continue;
        if (busy.has(f.home) || busy.has(f.away)) continue;
        busy.add(f.home); busy.add(f.away);
        f._done = true;
        lastSlot[f.home] = slot; lastSlot[f.away] = slot;
        out.push({ stage: "group", round: f.round, slot, pitch: pitches[placed] || ("Pitch " + (placed + 1)),
          time: fromMins(toMins(startTime) + slot * step), home: f.home, away: f.away });
        placed++;
      }
      if (!placed) { // a round-ordering edge case: place anything that fits
        const f = candidates.find(c => !busy.has(c.home) && !busy.has(c.away));
        f._done = true; lastSlot[f.home] = slot; lastSlot[f.away] = slot;
        out.push({ stage: "group", round: f.round, slot, pitch: pitches[0] || "Pitch 1", time: fromMins(toMins(startTime) + slot * step), home: f.home, away: f.away });
      }
      left = left.filter(f => !f._done);
      slot++;
    }
    return out;
  }

  // ── Knockouts ────────────────────────────────────────────────
  // What knockout is possible with this many teams.
  function knockoutFor(choice, teamCount) {
    if (choice === "semis" && teamCount >= 4) return "semis";
    if ((choice === "semis" || choice === "final") && teamCount >= 2) return "final";
    return "none";
  }

  // Knockout fixtures, scheduled after the group games. Semis go on two
  // pitches at once if there are two; the final gets a slot of its own.
  function knockoutFixtures(kind, pitches, afterSlot, startTime, matchMins, changeMins) {
    const step = Number(matchMins) + Number(changeMins || 0);
    const at = s => fromMins(toMins(startTime) + s * step);
    const p = i => pitches[i] || pitches[0] || "Pitch 1";
    const out = {};
    let slot = afterSlot + 1;
    if (kind === "semis") {
      const twoPitches = pitches.length >= 2;
      out.sf1 = { stage: "semi", label: "Semi-final 1", slot, pitch: p(0), time: at(slot), from: { home: { pos: 1 }, away: { pos: 4 } } };
      if (!twoPitches) slot++;
      out.sf2 = { stage: "semi", label: "Semi-final 2", slot, pitch: twoPitches ? p(1) : p(0), time: at(slot), from: { home: { pos: 2 }, away: { pos: 3 } } };
      slot++;
      out.final = { stage: "final", label: "Final", slot, pitch: p(0), time: at(slot), from: { home: { winnerOf: "sf1" }, away: { winnerOf: "sf2" } } };
    } else if (kind === "final") {
      out.final = { stage: "final", label: "Final", slot, pitch: p(0), time: at(slot), from: { home: { pos: 1 }, away: { pos: 2 } } };
    }
    Object.values(out).forEach(f => Object.assign(f, { round: 99, home: null, away: null, hs: 0, as: 0, status: "upcoming", pens: null }));
    return out;
  }

  // ── Build a whole tournament's fixtures ──────────────────────
  // settings: { teamOrder, pitches, startTime, matchMins, changeMins, gamesPerTeam, knockout }
  function buildFixtures(settings) {
    const ids = settings.teamOrder;
    const rounds = Math.min(maxRounds(ids.length), Math.max(1, Number(settings.gamesPerTeam) || maxRounds(ids.length)));
    const group = schedule(limitRounds(roundRobin(ids), rounds), settings.pitches, settings.startTime, settings.matchMins, settings.changeMins);
    const fixtures = {};
    group.forEach((f, i) => {
      fixtures["g" + String(i + 1).padStart(2, "0")] = Object.assign(f, { hs: 0, as: 0, status: "upcoming", pens: null });
    });
    const lastSlot = group.length ? Math.max.apply(null, group.map(f => f.slot)) : -1;
    const kind = knockoutFor(settings.knockout, ids.length);
    Object.assign(fixtures, knockoutFixtures(kind, settings.pitches, lastSlot, settings.startTime, settings.matchMins, settings.changeMins));
    return { fixtures, knockout: kind, rounds };
  }

  // Quick numbers for the setup screen.
  function summary(settings) {
    const built = buildFixtures(settings);
    const list = Object.values(built.fixtures);
    const group = list.filter(f => f.stage === "group");
    const games = {};
    settings.teamOrder.forEach(t => { games[t] = 0; });
    group.forEach(f => { games[f.home]++; games[f.away]++; });
    const counts = Object.values(games);
    const lastSlot = list.length ? Math.max.apply(null, list.map(f => f.slot)) : 0;
    const finish = fromMins(toMins(settings.startTime) + (lastSlot + 1) * Number(settings.matchMins) + lastSlot * Number(settings.changeMins || 0));
    return {
      groupMatches: group.length,
      knockoutMatches: list.length - group.length,
      knockout: built.knockout,
      minGames: counts.length ? Math.min.apply(null, counts) : 0,
      maxGames: counts.length ? Math.max.apply(null, counts) : 0,
      finish
    };
  }

  // ── League table ─────────────────────────────────────────────
  // Only finished group games count. Order: points, goal difference,
  // goals scored, then name (as FC Hanley).
  function table(tournament) {
    const rows = {};
    (tournament.teamOrder || Object.keys(tournament.teams || {})).forEach(id => {
      rows[id] = { id, name: (tournament.teams[id] || {}).name || id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
    });
    Object.values(tournament.fixtures || {}).forEach(f => {
      if (f.stage !== "group" || f.status !== "ft" || !rows[f.home] || !rows[f.away]) return;
      const h = rows[f.home], a = rows[f.away], hs = Number(f.hs) || 0, as = Number(f.as) || 0;
      h.p++; a.p++; h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
      if (hs > as) { h.w++; a.l++; h.pts += 3; }
      else if (as > hs) { a.w++; h.l++; a.pts += 3; }
      else { h.d++; a.d++; h.pts++; a.pts++; }
    });
    return Object.values(rows).map(r => Object.assign(r, { gd: r.gf - r.ga }))
      .sort((x, y) => (y.pts - x.pts) || (y.gd - x.gd) || (y.gf - x.gf) || x.name.localeCompare(y.name));
  }

  function winnerOf(f) {
    if (!f || f.status !== "ft" || !f.home || !f.away) return null;
    if (Number(f.hs) > Number(f.as)) return f.home;
    if (Number(f.as) > Number(f.hs)) return f.away;
    return f.pens || null; // level: decided on penalties
  }

  function groupDone(tournament) {
    const g = Object.values(tournament.fixtures || {}).filter(f => f.stage === "group");
    return g.length > 0 && g.every(f => f.status === "ft");
  }

  // Who should be in each knockout match right now (from the table and
  // earlier results). Returns { fixtureId: { home, away } } for the ones
  // that can be filled.
  function knockoutTeams(tournament) {
    const out = {};
    const t = table(tournament);
    const fx = tournament.fixtures || {};
    Object.keys(fx).forEach(id => {
      const f = fx[id];
      if (!f.from) return;
      const pick = src => src.pos ? (t[src.pos - 1] || {}).id || null : winnerOf(fx[src.winnerOf]);
      out[id] = { home: pick(f.from.home), away: pick(f.from.away) };
    });
    return out;
  }

  // "1st v 4th", "Winner SF1" etc., for knockout slots not yet filled.
  function placeholder(src) {
    if (!src) return "TBC";
    if (src.pos) return ["", "1st", "2nd", "3rd", "4th"][src.pos] + " in table";
    if (src.winnerOf) return "Winner " + (src.winnerOf === "sf1" ? "SF1" : "SF2");
    return "TBC";
  }

  // Fixtures in playing order.
  function ordered(tournament) {
    return Object.keys(tournament.fixtures || {}).map(id => Object.assign({ id }, tournament.fixtures[id]))
      .sort((a, b) => (a.slot - b.slot) || String(a.pitch).localeCompare(String(b.pitch), undefined, { numeric: true }) || a.id.localeCompare(b.id));
  }

  const api = { toMins, fromMins, niceTime, roundRobin, maxRounds, limitRounds, schedule, knockoutFor, knockoutFixtures,
    buildFixtures, summary, table, winnerOf, groupDone, knockoutTeams, placeholder, ordered };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Tourney = api;
})(this);
