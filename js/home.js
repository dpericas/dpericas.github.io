/* Inici: remote message, live matches of the club (ntfy club channel), today's matches, latest
 * results, notices (public + 🔒 team-only ones of the approved teams), activities. */
(function () {
  "use strict";
  var VSP = window.VSP, $ = VSP.$, esc = VSP.esc;

  // ---------- administrators' message (config/app "missatge"; closable, back when the text changes)
  VSP.renderBanner = function () {
    var c = VSP.config, el = $("rc-banner");
    if (!c.message || VSP.store("rc_closed") === c.message) { el.hidden = true; return; }
    el.hidden = false;
    el.className = "banner" + (c.level === "avis" ? " warn" : "");
    el.innerHTML = "<span>" + (c.level === "avis" ? "⚠️ " : "ℹ️ ") + esc(c.message) + '</span><button aria-label="' + esc(VSP.t("home.close_msg")) + '">×</button>';
    el.querySelector("button").onclick = function () { VSP.store("rc_closed", c.message); el.hidden = true; };
  };

  // ---------- notices
  /** Who signs a notice ("signatura"): «Junta», «Entrenador/a», the club, or the short name ("Maria P."); never the full name. Pure: tested. */
  VSP.signedBy = function (o) {
    var s = o.signatura;
    if (s === "junta" || s === "entrenador" || s === "club") return VSP.t("sig." + s);
    return o.autorNom ? VSP.shortPerson(o.autorNom) : "";
  };
  var publicNotices = [], privateNotices = [];
  VSP.renderNotices = function (list) { if (list) publicNotices = list; draw(); };
  VSP.setPrivateNotices = function (list) { privateNotices = list || []; draw(); };
  function draw() {
    var t = VSP.today();
    var list = publicNotices.concat(privateNotices).filter(function (o) { return o.titol && (!o.fins || o.fins >= t); })
      .sort(function (a, b) { return ((b.urgent ? 1 : 0) - (a.urgent ? 1 : 0)) || String(b.data || b.created || "").localeCompare(String(a.data || a.created || "")); });
    $("avisos").innerHTML = list.length ? list.map(function (o) {
      var link = VSP.safeUrl(o.enllac);
      return '<div class="item' + (o.urgent ? " urgent" : "") + (o.priv ? " priv" : "") + '"><h3>' + (o.urgent ? "⚠️ " : "") + esc(o.titol) + "</h3>" +
        '<div class="meta">' + esc(VSP.fmtDate(o.data || String(o.created || "").slice(0, 10))) + (VSP.signedBy(o) ? " · " + esc(VSP.signedBy(o)) : "") + "</div>" +
        (o.text ? "<p>" + VSP.waFormat(esc(o.text)) + "</p>" : "") +
        (link ? '<p><a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(VSP.t("common.more_info")) + "</a></p>" : "") +
        (o.imatge ? '<p><button class="btn ghost small" data-img="' + esc(o.imatge) + '">' + esc(VSP.t("home.see_image")) + "</button></p>" : "") +
        (o.adjunt ? '<p><button class="btn ghost small" data-doc="' + esc(o.adjunt) + '" data-name="' + esc(o.adjuntNom || "document.pdf") + '">📎 ' + esc(o.adjuntNom || VSP.t("home.document")) + "</button></p>" : "") +
        VSP.chips(VSP.teamsOf(o)) + "</div>";
    }).join("") : '<div class="empty">' + esc(VSP.t("home.no_notices")) + "</div>";
    // PDF documents attached from the app (fs://fitxers/{id}) or plain https ones
    VSP.each("#avisos [data-doc]", function (b) {
      b.onclick = function () {
        var src = b.getAttribute("data-doc"), name = b.getAttribute("data-name");
        if (/^https:\/\//.test(src)) { window.open(src, "_blank", "noopener"); return; }
        var m = /^fs:\/\/fitxers\/([A-Za-z0-9]+)$/.exec(src); if (!m) return;
        var label = b.textContent; b.textContent = VSP.t("home.downloading");
        VSP.blob("fitxers/" + m[1], "dades").then(function (b64) {
          var bin = atob(b64), bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
          var a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          b.textContent = label;
        }).catch(function (e) {
          // a team-only document (fitxers privat) can be read only by the team's approved members
          b.textContent = e && e.status === 403 ? VSP.t("home.doc_members_only") : VSP.t("home.doc_failed");
        });
      };
    });
    // images attached from the app (fs://fotos/{id}) or plain https ones
    VSP.each("#avisos [data-img]", function (b) {
      b.onclick = function () {
        var src = b.getAttribute("data-img");
        var show = function (url) { var img = document.createElement("img"); img.src = url; img.alt = ""; img.className = "notice-img"; b.replaceWith(img); };
        if (/^https:\/\//.test(src)) { show(src); return; }
        var m = /^fs:\/\/fotos\/([A-Za-z0-9]+)$/.exec(src); if (!m) return;
        b.textContent = VSP.t("common.loading");
        VSP.blob("fotos/" + m[1], "jpeg").then(function (j) { show("data:image/jpeg;base64," + j); })
          .catch(function () { b.textContent = VSP.t("home.img_failed"); });
      };
    });
  }

  VSP.renderActivities = function (list) {
    var t = VSP.today();
    list = list.filter(function (o) { return o.titol && o.data && (o.fins || o.data) >= t; })
      .sort(function (a, b) { return a.data.localeCompare(b.data); });
    $("act-sec").hidden = !list.length;
    $("activitats").innerHTML = list.map(function (o) {
      var link = VSP.safeUrl(o.enllac), maps = VSP.directionsUrl(o.adreca || o.lloc);
      var when = VSP.fmtDate(o.data) + (o.hora ? " · " + o.hora : "") + (o.fins && o.fins !== o.data ? " – " + VSP.fmtDate(o.fins) : "");
      return '<div class="item"><h3>' + esc(o.titol) + '</h3><div class="meta">' + esc(when) +
        (o.lloc ? " · " + esc(o.lloc) : "") + "</div>" + (o.text ? "<p>" + VSP.waFormat(esc(o.text)) + "</p>" : "") +
        '<p class="row">' + (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(VSP.t("common.more_info")) + "</a>" : "") +
        (maps && (o.lloc || o.adreca) ? '<a href="' + esc(maps) + '" target="_blank" rel="noopener">' + esc(VSP.t("common.directions")) + "</a>" : "") + "</p>" +
        VSP.chips(VSP.teamsOf(o)) + "</div>";
    }).join("");
  };

  VSP.renderResults = function (list) {
    var since = Date.now() - 60 * 24 * 3600 * 1000;
    list = list.filter(function (o) { return o.local && o.visitant && (o.t || 0) > since; })
      .sort(function (a, b) { return (b.t || 0) - (a.t || 0); }).slice(0, 8);
    $("res-sec").hidden = !list.length;
    $("resultats").innerHTML = list.map(function (o) {
      var hw = o.sets_local > o.sets_visitant;
      return '<div class="res"><span class="h' + (hw ? " win" : "") + '">' + esc(VSP.niceTeam(o.local)) + "</span>" +
        '<span class="score">' + esc(o.sets_local) + " – " + esc(o.sets_visitant) + "</span>" +
        '<span class="a' + (hw ? "" : " win") + '">' + esc(VSP.niceTeam(o.visitant)) + "</span>" +
        '<div class="meta">' + esc(VSP.fmtDate(o.data)) + (o.parcials ? " · " + esc(o.parcials) : "") +
        (o.competicio ? " · " + esc(o.competicio) : "") + "</div></div>";
    }).join("");
  };

  /** "Avui", "Demà", "D'aquí a 3 dies" or "" (a week or more away). Pure: tested. */
  VSP.relDay = function (iso, today) {
    var d = Math.round((Date.parse(iso + "T12:00:00") - Date.parse(today + "T12:00:00")) / 86400000);
    return d === 0 ? VSP.t("home.next_today") : d === 1 ? VSP.t("home.next_tomorrow") : d > 1 && d < 7 ? VSP.t("home.next_in_days", d) : "";
  };
  /** The next match of each ★ team (soonest first, 3 at most). Pure: tested. */
  VSP.nextOfTeams = function (matches, favs, today) {
    var best = {};
    matches.forEach(function (m) {
      if (favs.indexOf(m.team) < 0 || m.played || m.date < today) return;
      var b = best[m.team];
      if (!b || (m.date + (m.time || "99")) < (b.date + (b.time || "99"))) best[m.team] = m;
    });
    return VSP.sortMatches(Object.keys(best).map(function (k) { return best[k]; })).slice(0, 3);
  };
  /** 📅 El teu proper partit, at the top of Inici: the ★ teams' next match, or how to choose them. */
  VSP.renderNext = function () {
    var favs = VSP.favs(), t = VSP.today(), sec = $("next-sec");
    if (!sec || !VSP.matches.length) { if (sec) sec.hidden = true; return; }
    sec.hidden = false;
    if (!favs.length) {
      $("next").innerHTML = '<p class="muted" style="margin-top:0">' + esc(VSP.t("home.next_pick")) + '</p><a class="btn ghost small" href="#equips">' + esc(VSP.t("home.next_pick_btn")) + "</a>";
      return;
    }
    var list = VSP.nextOfTeams(VSP.matches, favs, t);
    $("next").innerHTML = list.length ? list.map(function (m) {
      var rel = VSP.relDay(m.date, t), conv = VSP.convocations[m.id];
      var when = (rel ? rel + " · " : "") + VSP.fmtDate(m.date) + " · " + (m.time || VSP.t("ag.tbc_long"));
      return '<a class="nextm" href="#partit/' + esc(m.id) + '" data-href="#partit/' + esc(m.id) + '"><span class="when">' + esc(when) + "</span>" +
        '<span class="vs">' + esc(VSP.t(m.homeIsClub ? "home.next_vs" : "home.next_at", VSP.niceTeam(VSP.rival(m)))) + "</span>" +
        '<span class="btn primary small">' + esc(conv ? VSP.t("ag.conv") : VSP.t("home.see_match")) + "</span>" +
        '<span class="info">★ ' + esc(VSP.teamName(m.team)) + " · " + esc(VSP.t(m.homeIsClub ? "ag.home" : "ag.away")) + (m.venue ? " · " + esc(VSP.pretty(m.venue)) : "") + "</span></a>";
    }).join("") : '<div class="empty">' + esc(VSP.t("home.next_none")) + "</div>";
    // 📅 the whole season of each ★ team in the phone's calendar (files written by .github/workflows/calendaris.yml)
    var cal = favs.filter(function (id) { return VSP.calTeams.indexOf(id) >= 0; });
    if (cal.length) $("next").innerHTML += '<div class="calsub"><p class="muted">' + esc(VSP.t("cal.text")) + '</p><div class="row">' + cal.map(function (id) {
      return '<a class="btn ghost small" href="' + esc(VSP.calUrl(id)) + '" target="_blank" rel="noopener">📅 ' + esc(VSP.teamName(id)) + "</a>";
    }).join("") + "</div></div>";
  };
  /** Teams with a subscribable calendar (cal/index.json) and its address: webcal:// on Apple devices, Google Calendar elsewhere. */
  VSP.calTeams = [];
  VSP.calUrl = function (id, apple) {
    var ics = location.host + location.pathname.replace(/[^/]*$/, "") + "cal/" + id + ".ics";
    if (apple === undefined) apple = VSP.isIOS || /Macintosh/.test(navigator.userAgent);
    return apple ? "webcal://" + ics : "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent("webcal://" + ics);
  };
  VSP.loadCalendars = function () {
    return VSP.getJson("cal/index.json").then(function (o) {
      VSP.calTeams = (o && Array.isArray(o.teams) ? o.teams : []).map(Number);
      VSP.renderNext();
    }).catch(function () {});
  };
  VSP.on("favs", function () { VSP.renderNext(); });
  VSP.on("convs", function () { VSP.renderNext(); });

  /** Training sessions per team (web horaris.json + Firestore horaris). */
  VSP.trainings = {};
  VSP.setupTrainings = function (webList, fsList) {
    var byTeam = {};
    webList.forEach(function (o) { if (o.equip) byTeam[o.equip] = o.sessions || []; });
    fsList.forEach(function (o) { var id = o.equip || Number(o.id); if (id) byTeam[id] = o.sessions || []; });
    Object.keys(byTeam).forEach(function (k) {
      byTeam[k] = byTeam[k].slice().sort(function (a, b) {
        return (VSP.DAYS.indexOf(a.dia) - VSP.DAYS.indexOf(b.dia)) || String(a.inici || "").localeCompare(String(b.inici || ""));
      });
    });
    VSP.trainings = byTeam;
  };
  VSP.trainingTable = function (ses) {
    return "<table>" + ses.map(function (s) {
      return '<tr><td class="day">' + esc(VSP.dayLabel(s.dia)) + '</td><td class="time">' + esc(s.inici) + "–" + esc(s.fi) + "</td><td>" + esc(s.lloc) + "</td></tr>";
    }).join("") + "</table>";
  };
  VSP.renderTrainings = function () {
    var ids = VSP.TEAM_ORDER.filter(function (i) { return VSP.trainings[i] && VSP.trainings[i].length; });
    $("horaris").innerHTML = ids.length ? ids.map(function (id) {
      return '<details class="team"' + (ids.length === 1 ? " open" : "") + "><summary>" + esc(VSP.teamName(id)) +
        "</summary>" + VSP.trainingTable(VSP.trainings[id]) + "</details>";
    }).join("") : '<div class="empty">' + esc(VSP.t("common.no_trainings")) + "</div>";
  };

  // ---------- 🔴 live now (live/ClubLive.kt liveNow(): club channel + latest snapshot of each match)
  /** Same rules as the app's ScoreEngine, only points and sets (copied from live/index.html). */
  VSP.replay = function (d) {
    var r = String(d.r || "3,25,15,2").split(",").map(Number), setsToWin = r[0] || 3, setPts = r[1] || 25, tbPts = r[2] || 15, lead = r[3] || 2, all = r[6] === 1;
    var maxSets = setsToWin * 2 - 1, sets = [], h = 0, a = 0, sh = 0, sa = 0, done = false, e = d.e || "";
    for (var i = 0; i < e.length && !done; i++) {
      var c = e[i];
      if (c === "[") { var j = e.indexOf("]", i); if (j < 0) break; i = j; continue; }
      if (c !== "h" && c !== "a") continue;
      if (c === "h") h++; else a++;
      var n = sets.length + 1, target = (maxSets > 1 && n === maxSets) ? tbPts : setPts;
      if (Math.max(h, a) >= target && Math.abs(h - a) >= lead) {
        sets.push([h, a]); if (h > a) sh++; else sa++;
        done = all ? sets.length >= maxSets : (sh === setsToWin || sa === setsToWin);
        if (!done) { h = 0; a = 0; }
      }
    }
    return { sets: sets, h: done ? sets[sets.length - 1][0] : h, a: done ? sets[sets.length - 1][1] : a, sh: sh, sa: sa, done: done, n: sets.length + (done ? 0 : 1) };
  };
  var STALE = 3 * 3600 * 1000;
  function lines(url) {
    return fetch(url).then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) {
      return t.split("\n").map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(function (m) { return m && m.event === "message"; });
    });
  }
  /** Active announcements (latest per topic is "live"), newest first. Pure: tested. */
  VSP.activeTopics = function (msgs) {
    var last = {};
    msgs.forEach(function (m) {
      try {
        var a = JSON.parse(m.message);
        if (a.v !== 1 || !/^vsp-[a-z0-9]{6,32}$/.test(a.topic || "")) return;
        if (!last[a.topic] || last[a.topic].t <= a.t) last[a.topic] = a;
      } catch (e) {}
    });
    return Object.keys(last).map(function (k) { return last[k]; }).filter(function (a) { return a.k === "live"; })
      .sort(function (a, b) { return b.t - a.t; });
  };
  /**
   * Matches live now: announced on the club channel, listed by an editor or a team member (Firestore
   * directes/{topic}) and with the newest score signed by them (js/livesign.js). "end" messages are
   * not trusted (anyone can post to the channel): the signed scores say when a match is over.
   */
  function loadLive() {
    lines(VSP.NTFY + "/" + VSP.CHANNEL + "/json?poll=1&since=12h").then(function (msgs) {
      var seen = {}, active = [], now = Date.now();
      msgs.forEach(function (m) {
        try { var a = JSON.parse(m.message); if (a.v === 1 && a.k === "live" && /^vsp-[a-z0-9]{12}$/.test(a.topic || "") && !seen[a.topic]) { seen[a.topic] = 1; active.push(a); } } catch (e) {}
      });
      active = active.slice(-30);
      return Promise.all(active.map(function (a) {
        return VSP.liveKey(a.topic).then(function (key) {
          if (!key) return null;
          return lines(VSP.NTFY + "/" + a.topic + "/json?poll=1&since=12h").then(function (ms) {
            var snaps = [];
            ms.forEach(function (m) { try { var d = JSON.parse(m.message); if (VSP.liveGuard(d, now)) snaps.push(d); } catch (e) {} });
            return Promise.all(snaps.map(function (d) { return VSP.liveVerified(d, a.topic).then(function (ok) { return ok ? d : null; }); }));
          }).then(function (ok) {
            var snap = null;
            ok.forEach(function (d) { if (d && (!snap || d.t > snap.t)) snap = d; });
            return snap;
          });
        }).then(function (snap) {
          if (!snap) return null;
          var s = VSP.replay(snap);
          if ((snap.end || 0) !== 0 || s.done || now - (snap.t || 0) >= STALE) return null;
          return { a: { topic: a.topic, h: snap.h, a: snap.a, c: snap.c }, d: snap, s: s };
        }, function () { return null; });
      }));
    }).then(function (live) {
      live = (live || []).filter(Boolean);
      $("live-sec").hidden = !live.length;
      var html = live.map(function (x) {
        var h = x.d ? x.d.h : x.a.h, aw = x.d ? x.d.a : x.a.a, c = (x.d && x.d.c) || x.a.c;
        var sc = x.s ? '<span class="lscore">' + x.s.sh + "-" + x.s.sa + '</span><span class="muted">' + esc(VSP.t("home.set_score", x.s.n, x.s.h + "-" + x.s.a)) + "</span>" : "";
        return '<a class="live" href="live/#' + esc(x.a.topic) + '"><span><b>' + esc(h) + " – " + esc(aw) + "</b>" +
          (c ? '<span class="muted">' + esc(c) + "</span>" : "") + sc + "</span><span>" + esc(VSP.t("home.follow")) + "</span></a>";
      }).join("");
      $("live").innerHTML = html;
      // "Seguir un partit": the same list (or that nothing is live now), and the code box below it
      if ($("follow-live")) $("follow-live").innerHTML = html || '<div class="empty">' + esc(VSP.t("home.no_live")) + "</div>";
    }).catch(function () {
      if ($("follow-live")) $("follow-live").innerHTML = '<div class="empty">' + esc(VSP.t("home.live_failed")) + "</div>";
    });
  }
  VSP.initLive = function () {
    loadLive();
    setInterval(function () { if (!document.hidden) loadLive(); }, 60000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) loadLive(); });
    $("code-f").onsubmit = function (ev) {
      ev.preventDefault();
      var m = /vsp-[a-z0-9]{6,32}/.exec(String($("code-in").value || "").toLowerCase());
      if (!m) { $("code-err").textContent = VSP.t("home.code_bad"); return; }
      $("code-err").textContent = "";
      location.href = "live/#" + m[0];
    };
  };
})();
