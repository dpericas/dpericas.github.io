/* Agenda: official matches (published by the editors' phones) + friendlies, "Els meus partits",
 * match page with call-up (+ vinc / no vinc), directions, .ics calendar file and shared cars. */
(function () {
  "use strict";
  var VSP = window.VSP, $ = VSP.$, esc = VSP.esc;

  VSP.matches = [];
  VSP.matchById = {};
  VSP.convocations = {};

  function fromAgenda(p, team) {
    var f = String(p.f || ""), time = f.slice(11, 16);
    var t = Number(p.t || team);
    var lid = Number(p.lid || 0), gl = Number(p.gl || 0), gv = Number(p.gv || 0);
    var st = String(p.st || "");
    var la = p.la != null && p.la !== "" ? Number(p.la) : null, lo = p.lo != null && p.lo !== "" ? Number(p.lo) : null;
    return { id: String(p.id), team: t, date: f.slice(0, 10), time: time && time !== "00:00" ? time : null,
      home: String(p.l || "").trim(), away: String(p.v || "").trim(), homeIsClub: lid !== 0 && lid === t,
      played: /finali[tz]/i.test(st) || gl + gv > 0, hs: gl, as: gv, venue: String(p.c || "").trim(), address: String(p.d || "").trim(),
      lat: isFinite(la) ? la : null, lon: isFinite(lo) ? lo : null, comp: p.co || "", round: Number(p.j || 0), friendly: false };
  }
  /** Same id as the app (ClubContent.parseFriendlies): negative, from the Java hash of the document id. */
  function friendlyId(o) {
    var key = o.id || (o.equip + "-" + o.data + "-" + String(o.rival || "").trim());
    return String(-(VSP.javaHash(key) & 0x7fffffff) - 1);
  }
  function fromFriendly(o) {
    var t = VSP.team(o.equip);
    var club = "VOLEI SANTPEDOR" + (t ? " " + t.name.toUpperCase() : ""), home = o.local !== false;
    var sc = o.sets_club, sr = o.sets_rival, has = typeof sc === "number" && typeof sr === "number";
    var rival = String(o.rival || "").trim();
    return { id: friendlyId(o), team: Number(o.equip), date: o.data, time: o.hora || null,
      home: home ? club : rival, away: home ? rival : club, homeIsClub: home, played: has,
      hs: has ? (home ? sc : sr) : 0, as: has ? (home ? sr : sc) : 0, venue: String(o.lloc || "").trim(), address: String(o.adreca || "").trim(),
      lat: null, lon: null, comp: o.competicio || VSP.t("ag.friendly"), round: Number(o.jornada || 0), friendly: true };
  }
  VSP.rival = function (m) { return m.homeIsClub ? m.away : m.home; };

  /** Called once the data is loaded. */
  VSP.setupMatches = function (agendaDocs, friendlies, convs) {
    var list = [], latest = "";
    agendaDocs.forEach(function (d) {
      (d.partits || []).forEach(function (p) { if (p && p.f) list.push(fromAgenda(p, d.equip || Number(d.id))); });
      if ((d.actualitzat || "") > latest) latest = d.actualitzat;
    });
    friendlies.forEach(function (o) { if (o.equip && o.data && o.rival) list.push(fromFriendly(o)); });
    var seen = {};
    VSP.matches = list.filter(function (m) { if (seen[m.id]) return false; seen[m.id] = 1; return true; });
    VSP.matchById = {};
    VSP.matches.forEach(function (m) { VSP.matchById[m.id] = m; });
    pubConvs = {};
    convs.forEach(function (o) { var c = VSP.convFrom(o); if (c) pubConvs[c.fixture] = c; });
    rebuildConvs();
    VSP.agendaUpdated = latest;
  };

  /**
   * Call-ups (docs/privacitat_dades_equip.md): the public convocatories/{fixture} is only a summary
   * {partit, equip, n, created, autor}; the full call-up (meeting, place, names…) is in
   * equips/{team}/convocatories/{fixture}, readable by the team's approved members. An old public
   * document that still has "convocades" is shown in full (the app migrates them).
   */
  var pubConvs = {}, privConvs = {};
  VSP.privConvState = {};   // team -> "ok" | "err" (private call-ups of an approved team)
  VSP.convFrom = function (o) {
    var id = String(o.partit || o.id || ""), team = Number(o.equip || 0);
    if (!id || !team) return null;
    if (!Array.isArray(o.convocades)) {
      var n = Number(o.n);
      return { fixture: id, team: team, stub: true, n: isFinite(n) && n > 0 ? Math.floor(n) : 0, meeting: "", place: "", kit: "",
        players: [], notes: "", author: "", created: o.created || "" };
    }
    var players = o.convocades.map(String).filter(function (s) { return s.trim(); });
    return { fixture: id, team: team, stub: false, n: players.length, meeting: o.quedada || "", place: o.lloc || "", kit: o.equipacio || "",
      players: players, notes: o.notes || "", author: o.autorNom || "", created: o.created || "" };
  };
  function rebuildConvs() {
    var out = {};
    Object.keys(pubConvs).forEach(function (k) { out[k] = pubConvs[k]; });
    Object.keys(privConvs).forEach(function (k) { out[k] = privConvs[k]; });
    VSP.convocations = out;
  }
  /** Full call-ups of the teams this browser is an approved member of ({team: [docs]}, null = could not load). */
  VSP.setPrivateConvocations = function (byTeam) {
    privConvs = {}; VSP.privConvState = {};
    Object.keys(byTeam || {}).forEach(function (t) {
      var docs = byTeam[t];
      VSP.privConvState[t] = docs ? "ok" : "err";
      (docs || []).forEach(function (o) {
        var c = VSP.convFrom(o);
        if (c && !c.stub && c.team === Number(t)) privConvs[c.fixture] = c;
      });
    });
    rebuildConvs();
    VSP.emit("convs");
  };
  VSP.sortMatches = function (list, desc) {
    return list.sort(function (a, b) { var k = (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")); return desc ? -k : k; });
  };
  VSP.upcoming = function (m) { return m.date >= VSP.today() && !m.played; };

  VSP.mapsQuery = function (m) {
    if (m.lat != null && m.lon != null) return m.lat + "," + m.lon;
    return m.address || m.venue || null;
  };
  /** Google Maps directions ("Com arribar"), as the app. */
  VSP.directionsUrl = function (q) { return q ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(q) : null; };

  VSP.matchRow = function (m) {
    var res = "";
    if (m.played) {
      var won = m.homeIsClub ? m.hs > m.as : m.as > m.hs;
      res = '<span class="score ' + (won ? "win" : "loss") + '">' + esc(m.hs) + "-" + esc(m.as) + "</span>";
    }
    var h = esc(VSP.niceTeam(m.home)), a = esc(VSP.niceTeam(m.away));
    var teams = (m.homeIsClub ? "<b>" + h + "</b>" : h) + " – " + (m.homeIsClub ? a : "<b>" + a + "</b>");
    var conv = VSP.convocations[m.id];
    return '<a class="match" href="#partit/' + esc(m.id) + '" data-href="#partit/' + esc(m.id) + '">' +
      (m.time ? '<span class="t">' + esc(m.time) + "</span>" : '<span class="t tbc" title="' + esc(VSP.t("ag.tbc_long")) + '">' + esc(VSP.t("ag.tbc")) + "</span>") +
      '<span class="teams">' + teams + "</span>" + (res || '<span class="go" aria-hidden="true">›</span>') +
      '<span class="info">' + (VSP.isFav(m.team) ? "★ " : "") + esc(VSP.teamName(m.team)) + ' · <span class="where' + (m.homeIsClub ? " home" : "") + '">' + esc(VSP.t(m.homeIsClub ? "ag.home_l" : "ag.away_l")) + "</span>" +
      (m.venue ? " · " + esc(VSP.pretty(m.venue)) : "") +
      (m.round ? " · " + esc(VSP.t("ag.round_short", m.round)) : "") + (m.comp && !m.round ? " · " + esc(m.comp) : "") +
      (conv && !m.played ? ' · <b class="conv">' + esc(VSP.t("ag.conv")) + "</b>" : "") + "</span></a>";
  };

  // ---------- agenda tab
  /**
   * ★ Els meus on or off when the Agenda opens: what the user chose in this session; else on when
   * ⚙️ Preferències › "only my teams by default" (ag_mine_default) is on; else the last choice (ag_mine).
   */
  function session(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {}
    return null;
  }
  function initialMine() {
    var s = session("ag_mine");
    if (s === "1" || s === "0") return s === "1";
    return VSP.store("ag_mine_default") === "1" || VSP.store("ag_mine") === "1";
  }
  /** ⚙️ Preferències: changes the default and applies it now (forgets this session's choice). */
  VSP.setAgendaMineDefault = function (on) {
    VSP.store("ag_mine_default", on ? "1" : null);
    session("ag_mine", null);
    onlyMine = initialMine();
    if (VSP.matches.length && $("agenda")) renderAgenda();
  };
  var mode = "next", onlyMine = initialMine(), chosen = [], showAll = false;
  /** "Propers" shows the next two weeks until "Veure'n més" (a team's whole season is long). Pure: tested. */
  VSP.AGENDA_DAYS = 14;
  VSP.agendaWindow = function (list, today, all) {
    if (all) return { shown: list, hidden: 0 };
    var end = VSP.addDays(today, VSP.AGENDA_DAYS), shown = list.filter(function (m) { return m.date <= end; });
    if (!shown.length) shown = list.slice(0, 10);   // nothing in two weeks (holidays): the next ten
    return { shown: shown, hidden: list.length - shown.length };
  };
  try { chosen = JSON.parse(VSP.store("teams") || "[]").map(Number); } catch (e) { chosen = []; }

  VSP.renderAgendaTab = function () {
    $("agenda-note").textContent = VSP.offline ? (VSP.cachedAt ? VSP.t("ag.offline_saved", VSP.fmtDate(VSP.isoDay(new Date(VSP.cachedAt)))) : VSP.t("ag.offline")) :
      VSP.agendaUpdated ? VSP.t("ag.updated", VSP.fmtDate(VSP.agendaUpdated.slice(0, 10)), VSP.fmtTime(new Date(VSP.agendaUpdated))) : "";
    var present = {};
    VSP.matches.forEach(function (m) { present[m.team] = 1; });
    $("team-chips").innerHTML = '<button class="chip" data-team="all">' + esc(VSP.t("ag.all")) + "</button>" + VSP.TEAM_ORDER.filter(function (t) { return present[t]; })
      .map(function (t) { return '<button class="chip" data-team="' + t + '">' + esc(VSP.teamName(t)) + "</button>"; }).join("");
    VSP.each("#team-chips button", function (b) {
      b.onclick = function () {
        var t = b.getAttribute("data-team");
        if (t === "all") chosen = [];
        else { t = Number(t); var i = chosen.indexOf(t); if (i >= 0) chosen.splice(i, 1); else chosen.push(t); }
        VSP.store("teams", JSON.stringify(chosen));
        renderAgenda();
      };
    });
    renderAgenda();
  };

  function renderAgenda() {
    var favs = VSP.favs();
    $("mine-chip").hidden = !favs.length;
    var mine = onlyMine && favs.length > 0;
    $("mine-chip").classList.toggle("on", mine);
    $("mine-chip").setAttribute("aria-pressed", mine ? "true" : "false");
    VSP.each("[data-mode]", function (b) { var on = b.getAttribute("data-mode") === mode; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
    VSP.each("#team-chips button", function (b) {
      var t = b.getAttribute("data-team");
      var on = t === "all" ? chosen.length === 0 : chosen.indexOf(Number(t)) >= 0;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    $("team-chips").hidden = mine;
    var t = VSP.today();
    var team1 = mine ? (favs.length === 1 ? favs[0] : null) : (chosen.length === 1 ? chosen[0] : null);
    $("print-btn").hidden = team1 == null;
    $("print-btn").setAttribute("data-team", team1 == null ? "" : team1);
    var list = VSP.matches.filter(function (m) { return mine ? favs.indexOf(m.team) >= 0 : (!chosen.length || chosen.indexOf(m.team) >= 0); })
      .filter(function (m) { return mode === "today" ? m.date === t : mode === "next" ? m.date >= t && !(m.played && m.date < t) : m.played; });
    VSP.sortMatches(list, mode === "played");
    if (mode === "played") list = list.slice(0, 60);
    var hiddenN = 0;
    if (mode === "next") { var w = VSP.agendaWindow(list, t, showAll); list = w.shown; hiddenN = w.hidden; }
    if (!list.length) {
      $("agenda").innerHTML = '<div class="empty">' + esc(VSP.matches.length ? (mode === "today" ? VSP.t("ag.none_today") : VSP.t("ag.none")) :
        VSP.t("ag.not_published")) + "</div>";
      return;
    }
    var html = "", day = "";
    list.forEach(function (m) {
      if (m.date !== day) { day = m.date; html += '<div class="day-head">' + esc(m.date === t ? VSP.t("ag.today_day", VSP.fmtDate(m.date)) : VSP.fmtDate(m.date)) + "</div>"; }
      html += VSP.matchRow(m);
    });
    if (hiddenN) html += '<div class="more"><button class="btn ghost small" type="button" id="ag-more">' + esc(VSP.t("ag.more", hiddenN)) + "</button></div>";
    $("agenda").innerHTML = html;
    if ($("ag-more")) $("ag-more").onclick = function () { showAll = true; renderAgenda(); };
  }
  VSP.on("favs", function () { if (VSP.matches) renderAgenda(); });

  VSP.initAgenda = function () {
    VSP.each("[data-mode]", function (b) { b.onclick = function () { mode = b.getAttribute("data-mode"); showAll = false; renderAgenda(); }; });
    $("mine-chip").onclick = function () { onlyMine = !onlyMine; VSP.store("ag_mine", onlyMine ? "1" : "0"); session("ag_mine", onlyMine ? "1" : "0"); renderAgenda(); };
    $("print-btn").onclick = function () { printCalendar(Number($("print-btn").getAttribute("data-team"))); };
  };

  VSP.renderToday = function () {
    var t = VSP.today();
    var list = VSP.matches.filter(function (m) { return m.date === t; }).sort(function (a, b) { return (a.time || "").localeCompare(b.time || ""); });
    $("today-sec").hidden = !list.length;
    $("today").innerHTML = list.map(VSP.matchRow).join("");
  };

  // printable season calendar of one team
  function printCalendar(team) {
    var list = VSP.sortMatches(VSP.matches.filter(function (m) { return m.team === team; }));
    var y = list.length ? Number(list[0].date.slice(0, 4)) - (Number(list[0].date.slice(5, 7)) >= 8 ? 0 : 1) : new Date().getFullYear();
    $("print").innerHTML = "<h1>" + esc(VSP.t("ag.print_title", VSP.teamName(team), y + "-" + VSP.pad((y + 1) % 100))) + "</h1>" +
      "<p>" + esc(VSP.t("ag.print_sub", VSP.fmtDate(VSP.today(), true))) + "</p>" +
      "<table><tr>" + VSP.t("ag.print_cols").split(",").map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr>" +
      list.map(function (m) {
        return '<tr class="' + (m.homeIsClub ? "home" : "") + '"><td>' + (m.round || "") + "</td><td>" + esc(VSP.shortDate(m.date)) + "</td><td>" +
          esc(m.time || VSP.t("ag.tbc")) + "</td><td>" + esc(m.home) + " – " + esc(m.away) + "</td><td>" + esc(VSP.pretty(m.venue)) + "</td><td>" +
          (m.played ? esc(m.hs) + "-" + esc(m.as) : "") + "</td></tr>";
      }).join("") + "</table>";
    window.print();
  }

  // ---------- .ics file (add to calendar on iPhone, Mac, Outlook, Google…)
  function icsText(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function fold(line) {
    var out = [], s = line;
    while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); }
    out.push(s); return out.join("\r\n");
  }
  VSP.ics = function (m) {
    var d = m.date.replace(/-/g, ""), stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Club Volei Santpedor//Web//CA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VTIMEZONE", "TZID:Europe/Madrid",
      "BEGIN:STANDARD", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "END:STANDARD",
      "BEGIN:DAYLIGHT", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "END:DAYLIGHT",
      "END:VTIMEZONE",
      "BEGIN:VEVENT", "UID:vsp-" + m.id.replace(/[^0-9a-z-]/gi, "") + "@dpericas.github.io", "DTSTAMP:" + stamp];
    if (m.time) {
      var hm = m.time.replace(":", "");
      var end = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +hm.slice(0, 2) + 2, +hm.slice(2, 4));
      var e = VSP.isoDay(end).replace(/-/g, "") + "T" + VSP.pad(end.getHours()) + VSP.pad(end.getMinutes()) + "00";
      lines.push("DTSTART;TZID=Europe/Madrid:" + d + "T" + hm + "00", "DTEND;TZID=Europe/Madrid:" + e);
    } else {
      lines.push("DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + VSP.addDays(m.date, 1).replace(/-/g, ""));
    }
    var conv = VSP.convocations[m.id];
    var desc = [m.comp + (m.round ? " · " + VSP.t("ag.round", m.round) : ""), conv && conv.meeting ? VSP.t("ag.ics_meeting", conv.meeting + (conv.place ? " · " + conv.place : "")) : "", "Club Vòlei Santpedor"]
      .filter(Boolean).join("\n");
    lines.push(fold("SUMMARY:" + icsText("🏐 " + VSP.teamName(m.team) + ": " + m.home + " - " + m.away)));
    var loc = [m.venue, m.address].filter(Boolean).join(", ");
    if (loc) lines.push(fold("LOCATION:" + icsText(loc)));
    lines.push(fold("DESCRIPTION:" + icsText(desc)), "END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  };

  // ---------- match page
  VSP.pages.partit = { tab: "agenda", render: function (id, el, title) {
    var m = VSP.matchById[id];
    if (!m) { title(VSP.t("ag.match")); el.innerHTML = '<div class="empty">' + esc(VSP.t("ag.match_missing")) + "</div>"; return; }
    title(VSP.teamName(m.team));
    var conv = VSP.convocations[m.id];
    var q = VSP.mapsQuery(m), maps = VSP.directionsUrl(q);
    var res = m.played ? '<div class="bigscore">' + esc(m.hs) + " – " + esc(m.as) + "</div>" : "";
    var carpool = !m.played && !m.homeIsClub && VSP.featureOn("cotxes");
    el.innerHTML =
      '<section><div class="meta">' + esc(VSP.pretty(VSP.fmtDate(m.date, true))) + " · " + esc(m.time || VSP.t("ag.time_tbc")) + "</div>" +
      '<h3 class="vs">' + (m.homeIsClub ? "<b>" + esc(m.home) + "</b>" : esc(m.home)) + "<span>–</span>" + (m.homeIsClub ? esc(m.away) : "<b>" + esc(m.away) + "</b>") + "</h3>" + res +
      '<div class="meta">' + esc(VSP.t(m.homeIsClub ? "ag.home" : "ag.away")) + (m.round ? " · " + esc(VSP.t("ag.round", m.round)) : "") + (m.comp ? " · " + esc(m.comp) : "") + "</div>" +
      (m.venue ? '<p>📍 ' + esc(VSP.pretty(m.venue)) + (m.address ? '<br><span class="muted">' + esc(VSP.pretty(m.address)) + "</span>" : "") + "</p>" : "") +
      '<div class="row">' +
      (!m.played ? '<button class="btn ghost small" id="m-ics">' + esc(VSP.t("ag.btn_calendar")) + "</button>" : "") +
      (maps ? '<a class="btn ghost small" href="' + esc(maps) + '" target="_blank" rel="noopener">' + esc(VSP.t("common.directions")) + "</a>" : "") +
      (m.venue && VSP.featureOn("consells") ? '<a class="btn ghost small" href="#pavello/' + esc(VSP.venueKey(m.venue)) + '" data-href="#pavello/' + esc(VSP.venueKey(m.venue)) + '">' + esc(VSP.t("ag.btn_hall")) + "</a>" : "") +
      '<a class="btn ghost small" href="#equip/' + m.team + '" data-href="#equip/' + m.team + '">' + esc(VSP.t("ag.btn_team")) + "</a>" +
      "</div></section>" +
      (conv ? '<section id="conv-sec"></section>' : "") +
      (carpool ? '<section id="cp-sec"><h2>' + esc(VSP.t("cp.title")) + '</h2><div id="cp"><div class="empty">' + esc(VSP.t("common.loading")) + "</div></div></section>" : "");
    if ($("m-ics")) $("m-ics").onclick = function () {
      VSP.download("partit-" + m.date + ".ics", "text/calendar;charset=utf-8", VSP.ics(m));
    };
    if (conv) renderConvocation(m, conv, $("conv-sec"));
    if (carpool) VSP.carpool(m, $("cp"));
  } };

  // the full call-ups of the member's teams arrive after the page: refresh only the call-up section
  VSP.on("convs", function () {
    var h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    if (h.indexOf("partit/") !== 0) return;
    var m = VSP.matchById[h.slice(7)], c = m && VSP.convocations[m.id];
    if (!m || !c || !$("page-body")) return;
    var sec = $("conv-sec");
    if (!sec) {
      sec = document.createElement("section"); sec.id = "conv-sec";
      var cp = $("cp-sec"); if (cp) cp.parentNode.insertBefore(sec, cp); else $("page-body").appendChild(sec);
    }
    var busy = sec.querySelector("#rsvp-send") && sec.querySelector("#rsvp-send").disabled;
    if (sec.getAttribute("data-shown") === convKey(c) || busy) return;
    renderConvocation(m, c, sec);
  });
  function convKey(c) { return (c.stub ? "s" + (VSP.privConvState[c.team] || "") : "f") + ":" + c.fixture + ":" + c.created; }

  function renderConvocation(m, c, el) {
    el.setAttribute("data-shown", convKey(c));
    if (c.stub) {
      var member = VSP.member && VSP.member.approved().indexOf(c.team) >= 0, st = VSP.privConvState[c.team];
      el.innerHTML = "<h2>" + esc(VSP.t("ag.conv")) + "</h2><p><b>" + esc(VSP.t("ag.conv_published") + (c.n ? " · " + VSP.tn("ag.conv_called", c.n) : "")) + "</b></p>" +
        (member ? '<p class="muted">' + esc(st === "err" ? VSP.t("ag.conv_err") :
          st === "ok" ? VSP.t("ag.conv_not_yet") : VSP.t("ag.conv_loading")) + "</p>"
          : '<p class="muted">' + VSP.t("ag.conv_join", '<a href="#meu-equip" data-href="#meu-equip">' + esc(VSP.t("member.title")) + "</a>") + "</p>");
      return;
    }
    el.innerHTML = "<h2>" + esc(VSP.t("ag.conv")) + "</h2>" +
      (c.meeting ? "<p>⏰ <b>" + esc(VSP.t("ag.meeting")) + "</b> " + esc(c.meeting) + (c.place ? " · " + esc(c.place) : "") + "</p>" : "") +
      (c.kit ? "<p>👕 <b>" + esc(VSP.t("ag.kit")) + "</b> " + esc(c.kit) + "</p>" : "") +
      (c.players.length ? "<p>✅ <b>" + esc(VSP.t("ag.called_list", c.players.length)) + "</b></p>" + VSP.chips(c.players) : "") +
      (c.notes ? '<p style="white-space:pre-line">📝 ' + esc(c.notes) + "</p>" : "") +
      (c.author ? '<div class="meta">' + esc(VSP.t("ag.published_by", c.author)) + "</div>" : "") +
      '<div id="rsvp"></div>';
    if (!m.played && VSP.rsvpSection) VSP.rsvpSection(m, c, $("rsvp"));
  }

  // ---------- shared cars (cotxes/{match}/entrades, carpool/Carpool.kt)
  function cpMine() { return VSP.storeJson("cp_mine", undefined, []) || []; }
  function cpRemember(match, id, exp) { var l = cpMine(); l.push({ m: match, id: id, e: exp }); VSP.storeJson("cp_mine", l); }
  function cpForget(match, id) { VSP.storeJson("cp_mine", cpMine().filter(function (x) { return !(x.m === match && x.id === id); })); }
  /** The phone of an entry lives in cotxes/{match}/telefons/{id} (owner + the team's members only). */
  function cpPhonePath(match, id) { return "cotxes/" + match + "/telefons/" + id; }
  /** Deletes an entry and its phone (a missing or unreadable phone document is not an error). */
  function cpDelete(match, id) {
    var ph = VSP.fs.del(cpPhonePath(match, id)).catch(function () {});
    return ph.then(function () { return VSP.fs.del("cotxes/" + match + "/entrades/" + id); }).then(function () { cpForget(match, id); });
  }
  /** Deletes this browser's own entries two days after their match (as the app does). */
  VSP.carpoolCleanup = function () {
    var now = Date.now();
    cpMine().filter(function (x) { return x.e && Date.parse(x.e) <= now; }).forEach(function (x) {
      cpDelete(x.m, x.id).catch(function () {});
    });
  };

  VSP.carpool = function (m, el) {
    var entries = [], phones = {}, busy = false, me = VSP.uid(), gen = 0;
    function isMember() { return !!(VSP.member && VSP.member.approved().indexOf(m.team) >= 0); }
    function load() {
      el.innerHTML = '<div class="empty">' + esc(VSP.t("common.loading")) + "</div>";
      var g = ++gen;
      VSP.fs.list("cotxes/" + m.id + "/entrades").then(function (l) {
        if (g !== gen) return;
        me = VSP.uid();
        entries = l.filter(function (e) { return ["offer", "need", "passenger"].indexOf(e.kind) >= 0; })
          .sort(function (a, b) { return String(a.created || "").localeCompare(String(b.created || "")); });
        phones = {};
        draw();
        loadPhones(g);
      }, function (e) { el.innerHTML = '<div class="empty">' + esc(VSP.t("cp.load_err", VSP.errText(e))) + "</div>"; });
    }
    /**
     * Phones: cotxes/{match}/telefons/{id}, readable by the entry's owner and the team's approved members
     * (403 / 404 = no phone shown). Only tried where it can be allowed: own entries, or all of them for a member.
     */
    function loadPhones(g) {
      var member = isMember();
      var todo = entries.filter(function (e) { return (member || e.owner === me) && e.kind !== "passenger"; });
      if (!todo.length) return;
      Promise.all(todo.map(function (e) {
        return VSP.fs.get(cpPhonePath(m.id, e.id)).then(function (d) {
          if (d && typeof d.phone === "string" && d.phone.trim()) phones[e.id] = d.phone;
        }, function () {});
      })).then(function () { if (g === gen && !$("cp-f")) draw(); });
    }
    function tel(e) {
      var p = phones[e.id] || e.phone;   // (old entries still had the phone in the public entry)
      if (p) return '<a class="btn ghost small" href="tel:' + esc(String(p).replace(/[^0-9+]/g, "")) + '">' + esc(VSP.t("cp.call")) + "</a>";
      return isMember() || e.owner === me ? "" : '<span class="meta">' + esc(VSP.t("cp.phone_members")) + "</span>";
    }
    function draw() {
      var offers = entries.filter(function (e) { return e.kind === "offer"; });
      var cars = offers.map(function (o) {
        return { o: o, p: entries.filter(function (e) { return e.kind === "passenger" && e.offerId === o.id; }).slice(0, o.seats || 0) };
      });
      var needs = entries.filter(function (e) { return e.kind === "need"; });
      var html = '<div class="row"><button class="btn primary small" data-cp="offer">🚗 ' + esc(VSP.t("cp.offer")) + '</button><button class="btn ghost small" data-cp="need">' + esc(VSP.t("cp.need")) + "</button></div>" +
        '<p class="muted">' + esc(VSP.t("cp.info")) + "</p>" +
        '<div id="cp-form"></div>' +
        '<h3 class="sub">' + esc(VSP.t("cp.cars", cars.length)) + "</h3>" +
        (cars.length ? cars.map(function (c) {
          var free = Math.max(0, (c.o.seats || 0) - c.p.length), mine = c.p.filter(function (p) { return p.owner === me; })[0];
          var where = [c.o.from ? VSP.t("cp.from", c.o.from) : "", c.o.time ? VSP.t("cp.at", c.o.time) : ""].filter(Boolean).join(" ");
          var act = c.o.owner === me ? '<button class="btn ghost small" data-del-car="' + esc(c.o.id) + '">' + esc(VSP.t("cp.remove_car")) + "</button>"
            : mine ? '<button class="btn ghost small" data-del="' + esc(mine.id) + '">' + esc(VSP.t("cp.unjoin")) + "</button>"
            : free > 0 ? '<button class="btn primary small" data-join="' + esc(c.o.id) + '">' + esc(VSP.t("cp.join")) + "</button>" : "";
          return '<div class="card"><div class="row" style="justify-content:space-between"><b>🚗 ' + esc(c.o.name) + "</b>" +
            '<b class="' + (free > 0 ? "ok" : "bad") + '">' + esc(VSP.t("cp.free_of", free, c.o.seats)) + "</b></div>" +
            (where ? '<div class="meta">' + esc(where) + "</div>" : "") + (c.o.note ? '<div class="meta">' + esc(c.o.note) + "</div>" : "") +
            (c.p.length ? '<div class="meta">' + esc(VSP.t("cp.going", c.p.map(function (p) { return p.name; }).join(", "))) + "</div>" : "") +
            '<div class="row" style="margin-top:6px">' + tel(c.o) + act + "</div></div>";
        }).join("") : '<div class="empty">' + esc(VSP.t("cp.no_cars")) + "</div>") +
        '<h3 class="sub">' + esc(VSP.t("cp.needs", needs.length)) + "</h3>" +
        (needs.length ? needs.map(function (n) {
          return '<div class="card soft"><b>' + esc(n.seats > 1 ? n.name + " · " + VSP.tn("cp.seats", n.seats) : n.name) + "</b>" +
            (n.note ? '<div class="meta">' + esc(n.note) + "</div>" : "") +
            '<div class="row" style="margin-top:6px">' + tel(n) + (n.owner === me ? '<button class="btn ghost small" data-del="' + esc(n.id) + '">' + esc(VSP.t("cp.remove")) + "</button>" : "") + "</div></div>";
        }).join("") : '<div class="empty">' + esc(VSP.t("cp.nobody")) + "</div>");
      el.innerHTML = html;
      VSP.each("[data-cp]", function (b) { b.onclick = function () { form(b.getAttribute("data-cp")); }; }, el);
      VSP.each("[data-join]", function (b) {
        b.onclick = function () { var o = offers.filter(function (x) { return x.id === b.getAttribute("data-join"); })[0]; if (o) form("passenger", o); };
      }, el);
      VSP.each("[data-del]", function (b) { b.onclick = function () { remove([b.getAttribute("data-del")]); }; }, el);
      VSP.each("[data-del-car]", function (b) {
        b.onclick = function () {
          var id = b.getAttribute("data-del-car");
          if (!confirm(VSP.t("cp.remove_car_q"))) return;
          remove([id].concat(entries.filter(function (e) { return e.kind === "passenger" && e.offerId === id && e.owner === me; }).map(function (e) { return e.id; })));
        };
      }, el);
    }
    function form(kind, offer) {
      var f = $("cp-form");
      var defTime = "";
      if (m.time) { var h = +m.time.slice(0, 2) - 1; defTime = h >= 0 ? VSP.pad(h) + m.time.slice(2) : ""; }
      f.innerHTML = '<form class="card form" id="cp-f"><b>' + esc(kind === "offer" ? VSP.t("cp.offer") : kind === "need" ? VSP.t("cp.need") : VSP.t("cp.join_car", offer.name)) + "</b>" +
        "<label>" + esc(VSP.t("cp.f_name")) + '<input name="name" maxlength="40" required autocomplete="name" value="' + esc(VSP.store("cp_name") || "") + '"></label>' +
        (kind !== "passenger" ? "<label>" + esc(VSP.t(kind === "offer" ? "cp.f_free" : "cp.f_needed")) + '<input name="seats" type="number" min="1" max="8" required value="' + (kind === "offer" ? 3 : 1) + '"></label>' : "") +
        (kind === "offer" ? "<label>" + esc(VSP.t("cp.f_from")) + '<input name="from" maxlength="60" value="Pavelló Rafa Martínez"></label><label>' + esc(VSP.t("cp.f_time")) + '<input name="time" maxlength="10" value="' + esc(defTime) + '"></label>' : "") +
        "<label>" + esc(VSP.t("cp.f_phone")) + '<input name="phone" type="tel" maxlength="20" autocomplete="tel" value="' + esc(VSP.store("cp_phone") || "") + '"></label>' +
        "<label>" + esc(VSP.t("cp.f_note")) + '<input name="note" maxlength="120"></label>' +
        '<div class="meta">' + esc(VSP.t("cp.f_who_sees")) + "</div>" +
        '<div class="row"><button class="btn primary small" type="submit">' + esc(VSP.t("cp.save")) + '</button><button class="btn ghost small" type="button" id="cp-cancel">' + esc(VSP.t("common.cancel")) + "</button></div>" +
        '<div class="err" id="cp-err" role="alert"></div></form>';
      $("cp-cancel").onclick = function () { f.innerHTML = ""; draw(); };
      f.querySelector("input[name=name]").focus();
      $("cp-f").onsubmit = function (ev) {
        ev.preventDefault();
        if (busy) return;
        var fd = new FormData(ev.target);
        var name = String(fd.get("name") || "").trim().slice(0, 40);
        var seats = kind === "passenger" ? 1 : parseInt(fd.get("seats"), 10);
        if (!name) { $("cp-err").textContent = VSP.t("cp.err_name"); return; }
        if (!(seats >= 1 && seats <= 8)) { $("cp-err").textContent = VSP.t("cp.err_seats"); return; }
        var phone = String(fd.get("phone") || "").replace(/[^0-9+ ]/g, "").slice(0, 20);
        VSP.store("cp_name", name); VSP.store("cp_phone", phone.trim());
        var expires = new Date(VSP.addDays(m.date, 2) + "T00:00:00+01:00").toISOString();
        busy = true;
        VSP.token().then(function () {
          var data = { kind: kind, name: name, seats: seats, from: String(fd.get("from") || "").trim().slice(0, 60),
            time: String(fd.get("time") || "").trim().slice(0, 10), phone: "", note: String(fd.get("note") || "").trim().slice(0, 120),
            offerId: offer ? offer.id : "", owner: VSP.uid(), created: VSP.ts(new Date().toISOString()), expira: VSP.ts(expires) };
          return VSP.fs.add("cotxes/" + m.id + "/entrades", data).then(function (id) {
            cpRemember(m.id, id, expires);
            if (!phone.trim()) return;
            // the phone goes apart, readable only by the team (the entry itself is public)
            return VSP.fs.set(cpPhonePath(m.id, id), { phone: phone.trim(), equip: m.team, owner: VSP.uid() }).catch(function (e) {
              VSP.toast(VSP.t("cp.phone_not_saved", VSP.errText(e)));
            });
          });
        }).then(function () { busy = false; f.innerHTML = ""; load(); }, function (e) { busy = false; $("cp-err").textContent = VSP.t("cp.save_err", VSP.errText(e)); });
      };
    }
    function remove(ids) {
      if (busy) return; busy = true;
      Promise.all(ids.map(function (id) { return cpDelete(m.id, id); }))
        .then(function () { busy = false; load(); }, function (e) { busy = false; VSP.toast(VSP.t("cp.del_err", VSP.errText(e))); });
    }
    load();
  };
})();
