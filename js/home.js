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
    el.innerHTML = "<span>" + (c.level === "avis" ? "⚠️ " : "ℹ️ ") + esc(c.message) + '</span><button aria-label="Tancar el missatge">×</button>';
    el.querySelector("button").onclick = function () { VSP.store("rc_closed", c.message); el.hidden = true; };
  };

  // ---------- notices
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
        '<div class="meta">' + esc(VSP.fmtDate(o.data || String(o.created || "").slice(0, 10))) + (o.autorNom ? " · " + esc(o.autorNom) : "") + "</div>" +
        (o.text ? "<p>" + esc(o.text) + "</p>" : "") +
        (link ? '<p><a href="' + esc(link) + '" target="_blank" rel="noopener">Més informació</a></p>' : "") +
        (o.imatge ? '<p><button class="btn ghost small" data-img="' + esc(o.imatge) + '">🖼️ Veure la imatge</button></p>' : "") +
        (o.adjunt ? '<p><button class="btn ghost small" data-doc="' + esc(o.adjunt) + '" data-name="' + esc(o.adjuntNom || "document.pdf") + '">📎 ' + esc(o.adjuntNom || "Document") + "</button></p>" : "") +
        VSP.chips(VSP.teamsOf(o)) + "</div>";
    }).join("") : '<div class="empty">Ara mateix no hi ha avisos.</div>';
    // PDF documents attached from the app (fs://fitxers/{id}) or plain https ones
    VSP.each("#avisos [data-doc]", function (b) {
      b.onclick = function () {
        var src = b.getAttribute("data-doc"), name = b.getAttribute("data-name");
        if (/^https:\/\//.test(src)) { window.open(src, "_blank", "noopener"); return; }
        var m = /^fs:\/\/fitxers\/([A-Za-z0-9]+)$/.exec(src); if (!m) return;
        var label = b.textContent; b.textContent = "Baixant…";
        VSP.blob("fitxers/" + m[1], "dades").then(function (b64) {
          var bin = atob(b64), bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
          var a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          b.textContent = label;
        }).catch(function (e) {
          // a team-only document (fitxers privat) can be read only by the team's approved members
          b.textContent = e && e.status === 403 ? "Document només per als membres de l'equip" : "No s'ha pogut baixar el document";
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
        b.textContent = "Carregant…";
        VSP.blob("fotos/" + m[1], "jpeg").then(function (j) { show("data:image/jpeg;base64," + j); })
          .catch(function () { b.textContent = "No s'ha pogut carregar la imatge"; });
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
        (o.lloc ? " · " + esc(o.lloc) : "") + "</div>" + (o.text ? "<p>" + esc(o.text) + "</p>" : "") +
        '<p class="row">' + (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">Més informació</a>' : "") +
        (maps && (o.lloc || o.adreca) ? '<a href="' + esc(maps) + '" target="_blank" rel="noopener">🧭 Com arribar</a>' : "") + "</p>" +
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
      return '<div class="res"><span class="h' + (hw ? " win" : "") + '">' + esc(o.local) + "</span>" +
        '<span class="score">' + esc(o.sets_local) + " – " + esc(o.sets_visitant) + "</span>" +
        '<span class="a' + (hw ? "" : " win") + '">' + esc(o.visitant) + "</span>" +
        '<div class="meta">' + esc(VSP.fmtDate(o.data)) + (o.parcials ? " · " + esc(o.parcials) : "") +
        (o.competicio ? " · " + esc(o.competicio) : "") + "</div></div>";
    }).join("");
  };

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
      return '<tr><td class="day">' + esc(s.dia) + '</td><td class="time">' + esc(s.inici) + "–" + esc(s.fi) + "</td><td>" + esc(s.lloc) + "</td></tr>";
    }).join("") + "</table>";
  };
  VSP.renderTrainings = function () {
    var ids = VSP.TEAM_ORDER.filter(function (i) { return VSP.trainings[i] && VSP.trainings[i].length; });
    $("horaris").innerHTML = ids.length ? ids.map(function (id) {
      return '<details class="team"' + (ids.length === 1 ? " open" : "") + "><summary>" + esc(VSP.teamName(id)) +
        "</summary>" + VSP.trainingTable(VSP.trainings[id]) + "</details>";
    }).join("") : '<div class="empty">Encara no hi ha horaris publicats.</div>';
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
        var sc = x.s ? '<span class="lscore">' + x.s.sh + "-" + x.s.sa + '</span><span class="muted">Set ' + x.s.n + ": " + x.s.h + "-" + x.s.a + "</span>" : "";
        return '<a class="live" href="live/#' + esc(x.a.topic) + '"><span><b>' + esc(h) + " – " + esc(aw) + "</b>" +
          (c ? '<span class="muted">' + esc(c) + "</span>" : "") + sc + "</span><span>Segueix ▶</span></a>";
      }).join("");
      $("live").innerHTML = html;
      // "Seguir un partit": the same list (or that nothing is live now), and the code box below it
      if ($("follow-live")) $("follow-live").innerHTML = html || '<div class="empty">Ara no hi ha cap partit del club en directe. Si t\'han enviat un enllaç o un codi, posa\'l aquí sota.</div>';
    }).catch(function () {
      if ($("follow-live")) $("follow-live").innerHTML = '<div class="empty">No s\'ha pogut consultar la llista de directes. Pots seguir un partit amb el codi.</div>';
    });
  }
  VSP.initLive = function () {
    loadLive();
    setInterval(function () { if (!document.hidden) loadLive(); }, 60000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) loadLive(); });
    $("code-f").onsubmit = function (ev) {
      ev.preventDefault();
      var m = /vsp-[a-z0-9]{6,32}/.exec(String($("code-in").value || "").toLowerCase());
      if (!m) { $("code-err").textContent = "No hi trobo cap codi de partit (comença per «vsp-»)."; return; }
      $("code-err").textContent = "";
      location.href = "live/#" + m[0];
    };
  };
})();
