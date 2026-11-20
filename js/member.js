/* 👤 El meu equip (members/Members.kt): a player or a family asks to join their team(s)
 * (equips/{team}/membres/{uid}, pending until a coach approves it). Approved members read the
 * team-only notices (equips/{team}/avisos, shown with 🔒) and answer the call-ups with
 * "vinc / no vinc" (equips/{team}/respostes/{fixture}_{uid}, members/Rsvp.kt). */
(function () {
  "use strict";
  var VSP = window.VSP, $ = VSP.$, esc = VSP.esc;
  var MAX_NAME = 60, MAX_PLAYERS = 6, MAX_NOTE = 120;

  // local state of this browser (like the app's "members" preferences)
  function ints(k) { return (VSP.storeJson(k, undefined, []) || []).map(Number); }
  var M = VSP.member = {
    requested: function () { return ints("mem_requested"); },
    approved: function () { return ints("mem_approved"); },
    name: function () { return VSP.store("mem_name") || ""; },
    role: function () { var r = VSP.store("mem_role"); return r === "jugador" || r === "familia" ? r : null; },
    players: function () { return VSP.storeJson("mem_players", undefined, {}) || {}; },
    mine: {}   // team -> membership (null = not found any more), from the last check
  };

  /** Pure rules (MembersLogic): tested with node. */
  VSP.memberLogic = {
    validate: function (name, role, teams) {
      if (String(name || "").trim().length < 2) return "Escriu el nom (almenys 2 lletres).";
      if (!role) return "Tria si ets jugador/a o família.";
      if (!teams.length) return "Tria l'equip.";
      if (role === "jugador" && teams.length > 1) return "Un jugador/a només pot ser d'un equip (els altres els pots seguir amb ★).";
      return null;
    },
    /** CREATE / UPDATE / NONE for the team's current document (null = none). */
    action: function (current, name, role, players) {
      if (!current || current.rol !== role) return "CREATE";
      var cur = (current.jugadors || []).map(String);
      if (current.nom !== name || JSON.stringify(cur) !== JSON.stringify(players)) return "UPDATE";
      return "NONE";
    },
    calledOf: function (mine, called) { return called.filter(function (c) { return mine.some(function (m) { return VSP.sameName(m, c); }); }); }
  };
  var L = VSP.memberLogic;

  /** "✅ Dins" / "⏳ Pendent" / "❔ No aprovada" per requested team (from the last check). */
  VSP.memberStatus = function () {
    var out = {}, ap = M.approved();
    M.requested().forEach(function (t) {
      var m = M.mine[t];
      out[t] = m === undefined ? (ap.indexOf(t) >= 0 ? "✅ Dins" : "⏳ Pendent") : m === null ? "❔ No aprovada" : m.estat === "aprovat" ? "✅ Dins" : "⏳ Pendent";
    });
    return out;
  };

  function path(t, uid) { return "equips/" + t + "/membres/" + uid; }

  /** State of this browser's requests; refreshes the approved teams. */
  M.check = function () {
    var req = M.requested();
    if (!req.length) { M.mine = {}; return Promise.resolve({}); }
    return VSP.token().then(function () {
      var uid = VSP.uid();
      return Promise.all(req.map(function (t) { return VSP.fs.get(path(t, uid)).then(function (d) { return [t, d]; }); }));
    }).then(function (rows) {
      var mine = {}; rows.forEach(function (r) { mine[r[0]] = r[1]; });
      M.mine = mine;
      VSP.storeJson("mem_approved", rows.filter(function (r) { return r[1] && r[1].estat === "aprovat"; }).map(function (r) { return r[0]; }));
      VSP.emit("member");
      return mine;
    });
  };

  /**
   * Sends (or changes) the request, exactly as MembersRepository.request: dropped teams are left;
   * for every chosen team, no document (or another role) → a new pending request; same role → only
   * the name and who they stand for are updated, keeping the approval.
   */
  M.request = function (name, role, teams, players) {
    var clean = String(name).trim().slice(0, MAX_NAME);
    function names(t) { return (players[t] || []).slice(0, MAX_PLAYERS); }
    return VSP.token().then(function () {
      var uid = VSP.uid(), fs = VSP.fs;
      var dropped = M.requested().filter(function (t) { return teams.indexOf(t) < 0; });
      return Promise.all(dropped.map(function (t) { return fs.del(path(t, uid)); })).then(function () {
        return Promise.all(teams.map(function (t) {
          var p = path(t, uid);
          return fs.get(p).then(function (cur) {
            var act = L.action(cur, clean, role, names(t));
            if (act === "CREATE") {
              return (cur ? fs.del(p) : Promise.resolve()).then(function () {
                return fs.set(p, { nom: clean, rol: role, estat: "pendent", created: new Date().toISOString(), jugadors: names(t) });
              });
            }
            if (act === "UPDATE") return fs.update(p, { nom: clean, jugadors: names(t) });
          });
        }));
      });
    }).then(function () {
      var pj = {}; teams.forEach(function (t) { pj[t] = names(t); });
      VSP.storeJson("mem_players", pj); VSP.store("mem_name", String(name).trim()); VSP.store("mem_role", role);
      VSP.storeJson("mem_requested", teams);
      VSP.storeJson("mem_approved", M.approved().filter(function (t) { return teams.indexOf(t) >= 0; }));
      VSP.addFavs(teams);   // their teams go first, as in the app
      return M.check();
    });
  };

  M.leave = function (t) {
    return VSP.token().then(function () { return VSP.fs.del(path(t, VSP.uid())); }).then(function () {
      VSP.storeJson("mem_requested", M.requested().filter(function (x) { return x !== t; }));
      VSP.storeJson("mem_approved", M.approved().filter(function (x) { return x !== t; }));
      var pj = M.players(); delete pj[t]; VSP.storeJson("mem_players", pj);
      return M.check();
    });
  };

  /** Team-only notices of the approved teams, in the avisos format, marked 🔒. */
  M.loadPrivateNotices = function () {
    var ap = M.approved();
    if (!ap.length) { VSP.setPrivateNotices([]); return Promise.resolve(); }
    return Promise.all(ap.map(function (t) {
      return VSP.fs.list("equips/" + t + "/avisos").then(function (l) {
        return l.map(function (o) { o.id = "eq:" + t + ":" + o.id; o.titol = "🔒 " + (o.titol || ""); o.equips = [t]; delete o.equip; o.priv = true; return o; });
      }, function () { return []; });
    })).then(function (ls) { VSP.setPrivateNotices([].concat.apply([], ls)); });
  };

  // ---------- page "El meu equip" (MyMembershipScreen)
  VSP.pages["meu-equip"] = { tab: "club", render: function (arg, el, title) {
    title("El meu equip");
    var role = M.role(), name = M.name(), teams = M.requested().slice(), players = M.players();
    if (!teams.length && !role) teams = [];
    var busy = false, info = "", error = "";
    function draw() {
      var status = VSP.memberStatus(), req = M.requested();
      var html = '<section><p>Si ets jugador/a o família, demana entrar al teu equip. Quan l\'entrenador/a t\'aprovi rebràs els avisos només per a l\'equip i podràs respondre les convocatòries («vinc / no vinc»).</p>' +
        (info ? '<p class="ok" role="status"><b>' + esc(info) + "</b></p>" : "") + (error ? '<p class="err" role="alert">' + esc(error) + "</p>" : "") + "</section>";
      if (req.length) {
        html += '<section><h2>Estat</h2>' + req.map(function (t) {
          return '<div class="row between"><b>' + esc(VSP.teamName(t)) + "</b><span>" + esc(status[t]) + '</span><button class="btn ghost small" data-leave="' + t + '">Surt</button></div>';
        }).join("") + '<div class="row" style="margin-top:8px"><button class="btn ghost small" id="mem-refresh">↻ Actualitza</button></div></section>';
      }
      html += '<section><form id="mem-f" class="form"><fieldset><legend>Qui ets?</legend><div class="chips">' +
        [["jugador", "Jugador/a"], ["familia", "Família"]].map(function (r) {
          return '<button type="button" class="chip' + (role === r[0] ? " on" : "") + '" aria-pressed="' + (role === r[0]) + '" data-role="' + r[0] + '">' + r[1] + "</button>";
        }).join("") + "</div></fieldset>" +
        '<label>Nom<input id="mem-name" maxlength="60" autocomplete="name" value="' + esc(name) + '" placeholder="' +
        (role === "familia" ? "Ex.: Família Puig (mare de la Laia)" : "Nom i cognom") + '"></label>' +
        '<fieldset><legend>' + (role === "familia" ? "Equips dels teus fills/es (un o més)" : "El teu equip") + '</legend><div class="chips">' +
        VSP.TEAMS.map(function (t) {
          var on = teams.indexOf(t.id) >= 0;
          return '<button type="button" class="chip' + (on ? " on" : "") + '" aria-pressed="' + on + '" data-mteam="' + t.id + '">' + esc(t.name) + "</button>";
        }).join("") + '</div><div class="meta">Pots seguir altres equips amb ★ a la pestanya Equips.</div></fieldset>';
      teams.slice().sort(function (a, b) { return a - b; }).forEach(function (t) {
        var roster = VSP.roster(t), cur = players[t] || [];
        cur.forEach(function (p) { if (!roster.some(function (r) { return VSP.sameName(r, p); })) roster.push(p); });
        html += '<fieldset><legend>' + esc((role === "familia" ? "Els teus fills/es a " : "Qui ets a ") + VSP.teamName(t) + "?") + '</legend><div class="chips">' +
          roster.map(function (p) {
            var on = cur.some(function (c) { return VSP.sameName(c, p); });
            return '<button type="button" class="chip' + (on ? " on" : "") + '" aria-pressed="' + on + '" data-pteam="' + t + '" data-pname="' + esc(p) + '">' + esc(p) + "</button>";
          }).join("") + "</div>" +
          '<div class="row"><input class="grow" data-addname="' + t + '" maxlength="50" placeholder="Afegeix el nom com surt a la convocatòria (p. ex. Laia G.)" aria-label="Afegeix un nom a ' + esc(VSP.teamName(t)) + '"><button type="button" class="btn ghost small" data-addbtn="' + t + '">Afegeix</button></div>' +
          '<div class="meta">Serveix per avisar-te quan hi hagi convocatòria i respondre «vinc / no vinc».</div></fieldset>';
      });
      html += '<button class="btn primary" type="submit"' + (busy ? " disabled" : "") + ">" + (req.length ? "Actualitza la sol·licitud" : "Envia la sol·licitud") + "</button>" +
        '<p class="meta">El nom només el veuen els entrenadors dels equips triats i la junta. Queda lligat a aquest navegador (si l\'esborres o canvies de mòbil, ho hauràs de tornar a demanar).</p></form></section>';
      el.innerHTML = html;
      bind();
    }
    function bind() {
      $("mem-name").oninput = function () { name = this.value; };
      VSP.each("[data-role]", function (b) {
        b.onclick = function () { role = b.getAttribute("data-role"); if (role === "jugador" && teams.length > 1) teams = [teams[0]]; info = error = ""; draw(); };
      }, el);
      VSP.each("[data-mteam]", function (b) {
        b.onclick = function () {
          var t = Number(b.getAttribute("data-mteam"));
          if (teams.indexOf(t) >= 0) teams = teams.filter(function (x) { return x !== t; });
          else teams = role === "jugador" ? [t] : teams.concat([t]);
          draw();
        };
      }, el);
      VSP.each("[data-pteam]", function (b) {
        b.onclick = function () {
          var t = b.getAttribute("data-pteam"), p = b.getAttribute("data-pname"), cur = players[t] || [];
          if (cur.some(function (c) { return VSP.sameName(c, p); })) cur = cur.filter(function (c) { return !VSP.sameName(c, p); });
          else cur = role === "jugador" ? [p] : cur.concat([p]).slice(0, MAX_PLAYERS);
          players[t] = cur; draw();
        };
      }, el);
      VSP.each("[data-addbtn]", function (b) {
        b.onclick = function () {
          var t = b.getAttribute("data-addbtn"), inp = el.querySelector('[data-addname="' + t + '"]');
          var p = String(inp.value || "").trim().replace(/\s+/g, " ").slice(0, 50); if (!p) return;
          var cur = (players[t] || []).filter(function (c) { return !VSP.sameName(c, p); });
          players[t] = role === "jugador" ? [p] : cur.concat([p]).slice(0, MAX_PLAYERS);
          draw();
        };
      }, el);
      VSP.each("[data-leave]", function (b) {
        b.onclick = function () {
          var t = Number(b.getAttribute("data-leave"));
          if (!confirm("Sortir de " + VSP.teamName(t) + "?\nDeixaràs de rebre els avisos només per a l'equip. Ho pots tornar a demanar quan vulguis.")) return;
          run(function () { return M.leave(t).then(function () { teams = teams.filter(function (x) { return x !== t; }); }); }, "");
        };
      }, el);
      if ($("mem-refresh")) $("mem-refresh").onclick = function () { run(M.check, ""); };
      $("mem-f").onsubmit = function (ev) {
        ev.preventDefault();
        error = L.validate(name, role, teams) || "";
        if (error) { info = ""; draw(); return; }
        var pl = {}; teams.forEach(function (t) { pl[t] = players[t] || []; });
        run(function () { return M.request(name, role, teams, pl); }, "Sol·licitud enviada. L'entrenador/a l'ha d'aprovar.");
      };
    }
    function run(fn, ok) {
      if (busy) return; busy = true; info = ""; error = ""; draw();
      fn().then(function () { busy = false; info = ok; draw(); M.loadPrivateNotices(); }, function (e) { busy = false; error = VSP.errText(e); draw(); });
    }
    draw();
    if (M.requested().length) M.check().then(draw, function () {});
  } };

  // ---------- vinc / no vinc inside a published call-up
  VSP.rsvpSection = function (m, c, el) {
    var team = c.team;
    if (M.approved().indexOf(team) < 0) return;
    var mine = L.calledOf(M.players()[team] || [], c.players);
    if (!mine.length) {
      if (!(M.players()[team] || []).length) el.innerHTML = '<p class="meta">Per respondre «vinc / no vinc», indica qui ets a Club › 👤 <a href="#meu-equip" data-href="#meu-equip">El meu equip</a>.</p>';
      return;
    }
    var answers = {}, note = "", busy = false, msg = "";
    mine.forEach(function (p) { answers[p] = null; });
    function docPath() { return "equips/" + team + "/respostes/" + c.fixture + "_" + VSP.uid(); }
    function draw() {
      var anyNo = mine.some(function (p) { return answers[p] === false; });
      el.innerHTML = '<hr><h3 class="sub">Hi aniràs?</h3>' + mine.map(function (p, i) {
        return '<div class="row between rsvp"><span>' + esc(p) + '</span><span class="chips" style="margin:0">' +
          '<button class="chip' + (answers[p] === true ? " on" : "") + '" aria-pressed="' + (answers[p] === true) + '" data-a="' + i + '" data-v="1">✅ Vinc</button>' +
          '<button class="chip' + (answers[p] === false ? " on" : "") + '" aria-pressed="' + (answers[p] === false) + '" data-a="' + i + '" data-v="0">❌ No vinc</button></span></div>';
      }).join("") +
        (anyNo ? '<label class="form">Motiu (opcional)<input id="rsvp-note" maxlength="120" value="' + esc(note) + '"></label>' : "") +
        (msg ? '<p class="ok" role="status">' + esc(msg) + "</p>" : "") +
        '<button class="btn primary small" id="rsvp-send"' + (busy || !mine.some(function (p) { return answers[p] !== null; }) ? " disabled" : "") + ">Envia la resposta</button>";
      VSP.each("[data-a]", function (b) {
        b.onclick = function () { answers[mine[+b.getAttribute("data-a")]] = b.getAttribute("data-v") === "1"; msg = ""; draw(); };
      }, el);
      if ($("rsvp-note")) $("rsvp-note").oninput = function () { note = this.value.slice(0, MAX_NOTE); };
      $("rsvp-send").onclick = function () {
        busy = true; draw();
        var yes = mine.filter(function (p) { return answers[p] === true; }), no = mine.filter(function (p) { return answers[p] === false; });
        VSP.token().then(function () {
          return VSP.fs.set(docPath(), { partit: String(c.fixture), owner: VSP.uid(), nom: (M.name() || M.role() || "").slice(0, MAX_NAME),
            vinc: yes.slice(0, 6), novinc: no.slice(0, 6), nota: no.length ? note.trim().slice(0, MAX_NOTE) : "", created: new Date().toISOString() });
        }).then(function () { busy = false; msg = "Resposta enviada. Gràcies!"; draw(); },
          function (e) { busy = false; msg = VSP.errText(e); draw(); });
      };
    }
    draw();
    VSP.token().then(function () { return VSP.fs.get(docPath()); }).then(function (r) {
      if (!r) return;
      mine.forEach(function (p) {
        answers[p] = (r.vinc || []).some(function (x) { return VSP.sameName(x, p); }) ? true : (r.novinc || []).some(function (x) { return VSP.sameName(x, p); }) ? false : null;
      });
      note = r.nota || ""; draw();
    }).catch(function () {});
  };
})();
