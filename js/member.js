/* 👤 El meu equip (members/Members.kt): a player or a family asks to join their team(s)
 * (equips/{team}/membres/{uid}, pending until a coach approves it), with a role per team (a parent
 * can be "família" in a youth team and "jugador/a" in Màsters). Approved members read the
 * team-only notices (equips/{team}/avisos, shown with 🔒), see the full call-ups
 * (equips/{team}/convocatories; others only see how many were called) and answer them with
 * "vinc / no vinc" (equips/{team}/respostes/{fixture}_{uid}, members/Rsvp.kt).
 * Link codes (enllacos/{CODE}, 10 min): the same person on another device (app ↔ web, two
 * phones) joins the same teams without asking again; the coaches see one person. */
(function () {
  "use strict";
  var VSP = window.VSP, $ = VSP.$, esc = VSP.esc;
  var MAX_NAME = 60, MAX_PLAYERS = 6, MAX_NOTE = 120;
  var ROLES = ["jugador", "familia"];
  function isRole(r) { return ROLES.indexOf(r) >= 0; }

  // local state of this browser (like the app's "members" preferences)
  function ints(k) { return (VSP.storeJson(k, undefined, []) || []).map(Number); }
  var M = VSP.member = {
    requested: function () { return ints("mem_requested"); },
    approved: function () { return ints("mem_approved"); },
    name: function () { return VSP.store("mem_name") || ""; },
    /** Role per requested team {team: "jugador"|"familia"} (before 01.43 there was one role for all: mem_role). */
    roles: function () {
      var saved = VSP.storeJson("mem_roles", undefined, null);
      return VSP.memberLogic.migrateRoles(saved, VSP.store("mem_role"), M.requested());
    },
    roleIn: function (t) { return M.roles()[t] || null; },
    players: function () { return VSP.storeJson("mem_players", undefined, {}) || {}; },
    /** Principal uid when this browser was linked with a code to another device (null = it is the principal). */
    persona: function () { return VSP.store("mem_persona") || null; },
    mine: {}   // team -> membership (null = not found any more), from the last check
  };

  var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", CODE_LEN = 8;

  /** Pure rules (MembersLogic): tested with node. */
  VSP.memberLogic = {
    /** name ≥ 2, at least one team, a role in each one and "jugador/a" in one team at most. */
    validate: function (name, roles, teams) {
      if (String(name || "").trim().length < 2) return "Escriu el nom (almenys 2 lletres).";
      if (!teams.length) return "Tria l'equip.";
      roles = roles || {};
      if (teams.some(function (t) { return !isRole(roles[t]); })) return "Tria si ets jugador/a o família a cada equip.";
      if (teams.filter(function (t) { return roles[t] === "jugador"; }).length > 1) return "Només pots ser jugador/a d'un equip; als altres hi pots ser com a família.";
      return null;
    },
    /** Role of a newly chosen team: family when already a player in another chosen team, else [suggested] (or family). */
    defaultRole: function (roles, teams, suggested) {
      if (teams.some(function (t) { return roles[t] === "jugador"; })) return "familia";
      return isRole(suggested) ? suggested : "familia";
    },
    /** Saved roles per team, or the old single role (mem_role) for every requested team. */
    migrateRoles: function (saved, legacy, teams) {
      var out = {};
      if (saved && typeof saved === "object") {
        Object.keys(saved).forEach(function (k) { if (isRole(saved[k]) && teams.indexOf(Number(k)) >= 0) out[Number(k)] = saved[k]; });
        return out;
      }
      if (isRole(legacy)) teams.forEach(function (t) { out[t] = legacy; });
      return out;
    },
    /** CREATE / UPDATE / NONE for the team's current document (null = none). */
    action: function (current, name, role, players) {
      if (!current || current.rol !== role) return "CREATE";
      var cur = (current.jugadors || []).map(String);
      if (current.nom !== name || JSON.stringify(cur) !== JSON.stringify(players)) return "UPDATE";
      return "NONE";
    },
    calledOf: function (mine, called) { return called.filter(function (c) { return mine.some(function (m) { return VSP.sameName(m, c); }); }); },

    // ---- link codes
    CODE_ALPHABET: CODE_ALPHABET, CODE_LEN: CODE_LEN, LINK_MS: 10 * 60 * 1000,
    /** A code from 8 random bytes (32 symbols: byte % 32 has no bias). */
    newCode: function (bytes) {
      var s = "";
      for (var i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET.charAt(bytes[i] % CODE_ALPHABET.length);
      return s;
    },
    /** "abcd-efgh " → "ABCDEFGH"; null if it is not a valid code. */
    normalizeCode: function (input) {
      var c = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (c.length !== CODE_LEN) return null;
      for (var i = 0; i < c.length; i++) if (CODE_ALPHABET.indexOf(c.charAt(i)) < 0) return null;
      return c;
    },
    formatCode: function (code) { return String(code).slice(0, 4) + "-" + String(code).slice(4); },
    /**
     * What a code carries (enllacos/{code}.dades): the person and the teams with a membership document
     * of that person (its "enllac", or this device's [uid] when it has none: the rules check the new
     * device's "enllac" against it, so a team this device asked for on its own is left out when linked).
     */
    linkData: function (persona, name, teams, mine, uid) {
      return { v: 1, persona: persona, nom: String(name || "").trim().slice(0, MAX_NAME),
        equips: teams.filter(function (t) { return mine[t] && isRole(mine[t].rol) && (mine[t].enllac || uid) === persona; }).map(function (t) {
          var d = mine[t];
          return { t: Number(t), rol: d.rol, estat: d.estat === "aprovat" ? "aprovat" : "pendent",
            jugadors: (d.jugadors || []).map(String).slice(0, MAX_PLAYERS) };
        }) };
    },
    /** dades (JSON text) → {persona, nom, equips[{t, rol, estat, jugadors}]}; null if not valid. Unknown teams are skipped. */
    parseLink: function (json) {
      var o; try { o = JSON.parse(json); } catch (e) { return null; }
      if (!o || typeof o.persona !== "string" || !o.persona.trim() || !Array.isArray(o.equips)) return null;
      var nom = String(o.nom || "").trim().slice(0, MAX_NAME);
      if (nom.length < 2) return null;
      var seen = {}, equips = [];
      o.equips.forEach(function (e) {
        if (!e || !isRole(e.rol)) return;
        var t = Number(e.t);
        if (!VSP.team(t) || seen[t]) return;
        seen[t] = 1;
        equips.push({ t: t, rol: e.rol, estat: e.estat === "aprovat" ? "aprovat" : "pendent",
          jugadors: (Array.isArray(e.jugadors) ? e.jugadors : []).map(function (n) { return String(n).trim(); }).filter(Boolean).slice(0, MAX_PLAYERS) });
      });
      return { persona: o.persona, nom: nom, equips: equips };
    },
    /** Devices linked to this one: query rows [{t, doc}] → one entry per device uid with its teams. */
    devices: function (rows) {
      var by = {}, out = [];
      rows.forEach(function (r) {
        var id = r.doc && r.doc.id; if (!id) return;
        if (!by[id]) { by[id] = { uid: id, dispositiu: r.doc.dispositiu || "", teams: [] }; out.push(by[id]); }
        if (by[id].teams.indexOf(r.t) < 0) by[id].teams.push(r.t);
      });
      return out;
    },
    /** structuredQuery for the memberships linked to [uid] (inside equips/{team}). */
    linkQuery: function (uid) {
      return { from: [{ collectionId: "membres" }], where: { fieldFilter: { field: { fieldPath: "enllac" }, op: "EQUAL", value: { stringValue: uid } } } };
    }
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
  /** An error with a text ready for the user. */
  function userErr(msg) { var e = new Error(msg); e.msg = msg; return e; }

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
   * for every chosen team, no document (or another role in that team) → a new pending request;
   * same role → only the name and who they stand for are updated, keeping the approval.
   */
  M.request = function (name, roles, teams, players) {
    var clean = String(name).trim().slice(0, MAX_NAME);
    function names(t) { return (players[t] || []).slice(0, roles[t] === "jugador" ? 1 : MAX_PLAYERS); }
    return VSP.token().then(function () {
      var uid = VSP.uid(), fs = VSP.fs;
      var dropped = M.requested().filter(function (t) { return teams.indexOf(t) < 0; });
      return Promise.all(dropped.map(function (t) { return fs.del(path(t, uid)); })).then(function () {
        return Promise.all(teams.map(function (t) {
          var p = path(t, uid);
          return fs.get(p).then(function (cur) {
            var act = L.action(cur, clean, roles[t], names(t));
            if (act === "CREATE") {
              return (cur ? fs.del(p) : Promise.resolve()).then(function () {
                return fs.set(p, { nom: clean, rol: roles[t], estat: "pendent", created: new Date().toISOString(), jugadors: names(t), dispositiu: "web" });
              });
            }
            if (act === "UPDATE") return fs.update(p, { nom: clean, jugadors: names(t) });
          });
        }));
      });
    }).then(function () {
      var pj = {}, rj = {}; teams.forEach(function (t) { pj[t] = names(t); rj[t] = roles[t]; });
      VSP.storeJson("mem_players", pj); VSP.store("mem_name", String(name).trim());
      VSP.storeJson("mem_roles", rj); VSP.store("mem_role", null);
      VSP.storeJson("mem_requested", teams);
      VSP.storeJson("mem_approved", M.approved().filter(function (t) { return teams.indexOf(t) >= 0; }));
      VSP.addFavs(teams);   // their teams go first, as in the app
      return M.check();
    });
  };

  /** After leaving every team this browser is nobody's device any more. */
  function forgetLink() {
    var old = VSP.store("mem_link_code");
    VSP.store("mem_persona", null); VSP.store("mem_link_code", null);
    if (old) VSP.fs.del("enllacos/" + old).catch(function () {});
  }

  M.leave = function (t) {
    return VSP.token().then(function () { return VSP.fs.del(path(t, VSP.uid())); }).then(function () {
      var rj = M.roles(); delete rj[t];
      VSP.storeJson("mem_requested", M.requested().filter(function (x) { return x !== t; }));
      VSP.storeJson("mem_approved", M.approved().filter(function (x) { return x !== t; }));
      VSP.storeJson("mem_roles", rj); VSP.store("mem_role", null);
      var pj = M.players(); delete pj[t]; VSP.storeJson("mem_players", pj);
      if (!M.requested().length) forgetLink();
      return M.check();
    });
  };

  function randomBytes() {
    var b = new Uint8Array(CODE_LEN);
    window.crypto.getRandomValues(b);
    return b;
  }

  /**
   * New link code for another device of this person: enllacos/{CODE} = {owner, expira, dades}.
   * The previous code of this browser is deleted first. Resolves {code, until}.
   */
  M.createLink = function () {
    return M.check().then(function (mine) {
      var uid = VSP.uid(), req = M.requested();
      var first = req.map(function (t) { return mine[t]; }).filter(Boolean)[0];
      var dades = L.linkData(M.persona() || uid, M.name() || (first && first.nom) || "", req, mine, uid);
      if (!dades.equips.length) throw userErr("Encara no tens cap sol·licitud feta en cap equip.");
      var old = VSP.store("mem_link_code");
      return (old ? VSP.fs.del("enllacos/" + old).catch(function () {}) : Promise.resolve()).then(function () {
        VSP.store("mem_link_code", null);
        function attempt(n) {
          var code = L.newCode(randomBytes()), until = Date.now() + L.LINK_MS;
          return VSP.fs.set("enllacos/" + code, { owner: uid, expira: until, dades: JSON.stringify(dades) }).then(function () {
            VSP.store("mem_link_code", code);
            return { code: code, until: until };
          }, function (e) { if (e.status === 403 && n < 2) return attempt(n + 1); throw e; });   // 403: that code is someone else's
        }
        return attempt(0);
      });
    });
  };

  /**
   * Joins the teams of a link code made on another device of the same person: one membership per
   * team with the same role and state ("enllac" = the person, "codi" = the code; the rules check it
   * against the owner's membership). Teams of this browser not in the code are kept.
   */
  M.joinLink = function (input) {
    var code = L.normalizeCode(input);
    if (!code) return Promise.reject(userErr("El codi té 8 lletres i xifres (p. ex. ABCD-EFGH)."));
    var uid, data;
    return VSP.token().then(function () {
      uid = VSP.uid();
      return VSP.fs.get("enllacos/" + code);
    }).then(function (doc) {
      if (!doc) throw userErr("Aquest codi no existeix.");
      if (!(Number(doc.expira) >= Date.now())) throw userErr("El codi ha caducat; genera'n un de nou.");
      data = L.parseLink(doc.dades);
      if (!data || !data.equips.length) throw userErr("Aquest codi no és vàlid.");
      if (data.persona === uid) throw userErr("Aquest codi és d'aquest mateix dispositiu.");
      var done = [];   // memberships written: undone when another team fails (no half-linked device)
      return Promise.all(data.equips.map(function (e) {
        var p = path(e.t, uid);
        return VSP.fs.get(p).then(function (cur) { return cur ? VSP.fs.del(p) : null; }).then(function () {
          return VSP.fs.set(p, { nom: data.nom, rol: e.rol, estat: e.estat, created: new Date().toISOString(), jugadors: e.jugadors,
            dispositiu: "web", enllac: data.persona, codi: code }).then(function () { done.push(p); });
        });
      })).catch(function (e) {
        return Promise.all(done.map(function (p) { return VSP.fs.del(p).catch(function () {}); })).then(function () { throw e; });
      }).catch(function (e) {
        if (e && e.status === 403) throw userErr("No s'ha pogut enllaçar (el codi ja no és vàlid o la membresia ha canviat).");
        throw e;
      });
    }).then(function () {
      var teams = data.equips.map(function (e) { return e.t; });
      var keep = M.requested().filter(function (t) { return teams.indexOf(t) < 0; });
      var rj = M.roles(), pj = M.players();
      data.equips.forEach(function (e) { rj[e.t] = e.rol; pj[e.t] = e.jugadors; });
      VSP.store("mem_name", data.nom);
      VSP.storeJson("mem_roles", rj); VSP.store("mem_role", null);
      VSP.storeJson("mem_players", pj);
      VSP.storeJson("mem_requested", keep.concat(teams));
      VSP.storeJson("mem_approved", M.approved().filter(function (t) { return keep.indexOf(t) >= 0; })
        .concat(data.equips.filter(function (e) { return e.estat === "aprovat"; }).map(function (e) { return e.t; })));
      VSP.store("mem_persona", data.persona);
      VSP.addFavs(teams);
      return M.check();
    }).then(function () { return M.loadPrivate(); });
  };

  /** Devices linked to this browser (only when it is the principal): [{uid, dispositiu, teams}]. */
  M.linkedDevices = function () {
    var req = M.requested();
    if (M.persona() || !req.length) return Promise.resolve([]);
    return VSP.token().then(function () {
      var q = L.linkQuery(VSP.uid());
      return Promise.all(req.map(function (t) {
        return VSP.fs.query(q, "equips/" + t).then(function (l) { return l.map(function (d) { return { t: t, doc: d }; }); }, function () { return []; });
      }));
    }).then(function (ls) { return L.devices([].concat.apply([], ls)); });
  };

  /** Disconnects a linked device: its memberships in every team are deleted. */
  M.unlinkDevice = function (dev) {
    return VSP.token().then(function () { return Promise.all(dev.teams.map(function (t) { return VSP.fs.del(path(t, dev.uid)); })); });
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

  /**
   * Full call-ups of the approved teams (equips/{team}/convocatories, docs/privacitat_dades_equip.md):
   * they replace the public summaries in VSP.convocations. A team that cannot be read (not approved
   * any more, offline) keeps the summary.
   */
  M.loadPrivateConvocations = function () {
    var ap = M.approved();
    if (!ap.length) { VSP.setPrivateConvocations({}); return Promise.resolve(); }
    return Promise.all(ap.map(function (t) {
      return VSP.fs.list("equips/" + t + "/convocatories").then(function (l) { return [t, l]; }, function () { return [t, null]; });
    })).then(function (rows) {
      var by = {}; rows.forEach(function (r) { by[r[0]] = r[1]; });
      VSP.setPrivateConvocations(by);
    });
  };
  /**
   * Squads (plantilles): minors' names, only for approved members of any club team and editors
   * (docs/firestore.rules). The rules follow the pointer socis/{uid} = {equip} to a team where
   * this browser is approved (MembersRepository.ensurePointer). Others only get the adults' (Màsters).
   */
  var PUBLIC_SQUADS = [-3];
  function ensurePointer(ap) {
    var want = ap.length ? (ap.indexOf(Number(VSP.store("mem_soci"))) >= 0 ? Number(VSP.store("mem_soci")) : Math.min.apply(null, ap)) : null;
    var cur = VSP.store("mem_soci") ? Number(VSP.store("mem_soci")) : null;
    if (want === cur) return Promise.resolve();
    return VSP.token().then(function () {
      var p = "socis/" + VSP.uid();
      return want === null ? VSP.fs.del(p) : VSP.fs.set(p, { equip: want });
    }).then(function () { VSP.store("mem_soci", want === null ? "" : String(want)); });
  }
  function publicSquads() {
    return Promise.all(PUBLIC_SQUADS.map(function (t) {
      return VSP.fs.get("plantilles/" + t).then(function (d) { if (d) d.id = String(t); return d; }, function () { return null; });
    })).then(function (l) { return l.filter(Boolean); });
  }
  M.loadSquads = function () {
    var ap = M.approved();
    var load = ap.length ? ensurePointer(ap).then(function () { return VSP.fs.list("plantilles"); }).catch(publicSquads)
      : ensurePointer([]).catch(function () {}).then(publicSquads);
    return load.then(function (l) { VSP.data.plantilles = l || []; VSP.emit("squads"); });
  };

  /** Everything only for the approved teams: notices, call-ups and squads. */
  M.loadPrivate = function () { return Promise.all([M.loadPrivateNotices(), M.loadPrivateConvocations(), M.loadSquads()]); };

  // ---------- page "El meu equip" (MyMembershipScreen)
  VSP.pages["meu-equip"] = { tab: "club", render: function (arg, el, title) {
    title("El meu equip");
    var name = M.name(), teams = M.requested().slice(), players = M.players(), roles = M.roles();
    var last = VSP.store("mem_last_role");
    if (!isRole(last)) last = isRole(VSP.store("mem_role")) ? VSP.store("mem_role") : "familia";
    var busy = false, info = "", error = "";
    // link codes: the join form (open), the code made here and the linked devices (null = not loaded)
    var joinOpen = false, joinCode = "", made = null, devices = null;
    function sorted(l) { return l.slice().sort(function (a, b) { return VSP.TEAM_ORDER.indexOf(a) - VSP.TEAM_ORDER.indexOf(b); }); }
    function chip(on, attrs, label) {
      return '<button type="button" class="chip' + (on ? " on" : "") + '" aria-pressed="' + on + '" ' + attrs + ">" + label + "</button>";
    }
    function linkHtml(req) {
      var persona = M.persona(), hasDocs = req.some(function (t) { return M.mine[t]; });
      var h = '<section><h2>🔗 Altres dispositius</h2>';
      if (persona) h += '<p class="meta">Aquest dispositiu està enllaçat amb el teu compte principal.</p>';
      if (made && Date.now() > made.until) made = null;
      if (made) {
        h += '<p style="font-size:2em;font-weight:700;letter-spacing:.12em;text-align:center;margin:8px 0" aria-label="Codi d\'enllaç">' + esc(L.formatCode(made.code)) + "</p>" +
          '<p class="meta" style="text-align:center">Caduca en 10 minuts. A l\'app: Club › 👤 El meu equip › Enllaça amb un codi.</p>';
      } else if (hasDocs) {
        h += '<p class="meta">Fes servir el mateix compte a l\'app o en un altre navegador sense tornar-ho a demanar: els entrenadors hi veuran una sola persona.</p>' +
          '<div class="row"><button type="button" class="btn ghost small" id="link-make"' + (busy ? " disabled" : "") + ">🔗 Connecta un altre dispositiu</button></div>";
      }
      if (!persona && devices && devices.length) {
        h += "<h3>Dispositius enllaçats</h3>" + devices.map(function (d, i) {
          return '<div class="row between"><span>' + (d.dispositiu === "web" ? "💻 Web" : "📱 Mòbil") + " · " +
            esc(sorted(d.teams).map(VSP.teamName).join(", ")) + '</span><button type="button" class="btn ghost small" data-unlink="' + i + '">Desconnecta</button></div>';
        }).join("");
      }
      if (!joinOpen) {
        h += '<div class="row" style="margin-top:8px"><button type="button" class="btn ghost small" id="link-open">🔗 Ja estic donat d\'alta a l\'app o en un altre dispositiu</button></div>';
      } else {
        h += '<div class="form" style="margin-top:8px"><label>Codi d\'enllaç<input id="link-code" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH" value="' + esc(joinCode) + '"></label>' +
          '<p class="meta">Al dispositiu on ja estàs donat d\'alta, obre 👤 El meu equip i genera un codi per connectar un altre dispositiu.</p>' +
          '<div class="row"><button type="button" class="btn primary small" id="link-join"' + (busy ? " disabled" : "") + '>Enllaça</button>' +
          '<button type="button" class="btn ghost small" id="link-cancel">Cancel·la</button></div></div>';
      }
      return h + "</section>";
    }
    function draw() {
      var status = VSP.memberStatus(), req = M.requested();
      var anyFamily = teams.some(function (t) { return roles[t] === "familia"; });
      var html = '<section><p>Si ets jugador/a o família, demana entrar al teu equip. Quan l\'entrenador/a t\'aprovi rebràs els avisos només per a l\'equip i podràs respondre les convocatòries («vinc / no vinc»).</p>' +
        (info ? '<p class="ok" role="status"><b>' + esc(info) + "</b></p>" : "") + (error ? '<p class="err" role="alert">' + esc(error) + "</p>" : "") + "</section>";
      if (req.length) {
        html += '<section><h2>Estat</h2>' + req.map(function (t) {
          return '<div class="row between"><b>' + esc(VSP.teamName(t)) + "</b><span>" + esc(status[t]) + '</span><button class="btn ghost small" data-leave="' + t + '">Surt</button></div>';
        }).join("") + '<div class="row" style="margin-top:8px"><button class="btn ghost small" id="mem-refresh">↻ Actualitza</button></div></section>';
      }
      html += linkHtml(req);
      html += '<section><form id="mem-f" class="form">' +
        '<label>Nom<input id="mem-name" maxlength="60" autocomplete="name" value="' + esc(name) + '" placeholder="' +
        (anyFamily ? "Ex.: Família Puig (mare de la Laia)" : "Nom i cognom") + '"></label>' +
        '<fieldset><legend>Els teus equips (on jugues o on juguen els teus fills/es)</legend><div class="chips">' +
        VSP.TEAMS.map(function (t) { return chip(teams.indexOf(t.id) >= 0, 'data-mteam="' + t.id + '"', esc(t.name)); }).join("") +
        '</div><div class="meta">Pots ser jugador/a d\'un sol equip i família de tots els que calgui. Pots seguir altres equips amb ★ a la pestanya Equips.</div></fieldset>';
      sorted(teams).forEach(function (t) {
        var role = roles[t], roster = VSP.roster(t), cur = players[t] || [];
        cur.forEach(function (p) { if (!roster.some(function (r) { return VSP.sameName(r, p); })) roster.push(p); });
        html += '<fieldset><legend>' + esc(VSP.teamName(t)) + '</legend><div class="chips" role="group" aria-label="' + esc("Qui ets a " + VSP.teamName(t)) + '">' +
          [["jugador", "Jugador/a"], ["familia", "Família"]].map(function (r) { return chip(role === r[0], 'data-rteam="' + t + '" data-role="' + r[0] + '"', r[1]); }).join("") +
          '</div><div class="meta">' + esc(role === "familia" ? "Els teus fills/es a " + VSP.teamName(t) + " (fins a 6):" : "Qui ets a " + VSP.teamName(t) + "?") + '</div><div class="chips">' +
          roster.map(function (p) {
            var on = cur.some(function (c) { return VSP.sameName(c, p); });
            return chip(on, 'data-pteam="' + t + '" data-pname="' + esc(p) + '"', esc(p));
          }).join("") + "</div>" +
          '<div class="row"><input class="grow" data-addname="' + t + '" maxlength="50" placeholder="Afegeix el nom com surt a la convocatòria (p. ex. Laia G.)" aria-label="Afegeix un nom a ' + esc(VSP.teamName(t)) + '"><button type="button" class="btn ghost small" data-addbtn="' + t + '">Afegeix</button></div>' +
          '<div class="meta">Serveix per avisar-te quan hi hagi convocatòria i respondre «vinc / no vinc».</div></fieldset>';
      });
      html += '<button class="btn primary" type="submit"' + (busy ? " disabled" : "") + ">" + (req.length ? "Actualitza la sol·licitud" : "Envia la sol·licitud") + "</button>" +
        '<p class="meta">El nom només el veuen els entrenadors dels equips triats i la junta. Queda lligat a aquest navegador (si l\'esborres o canvies de mòbil, ho hauràs de tornar a demanar o enllaçar-lo amb un codi).</p></form></section>';
      el.innerHTML = html;
      bind();
    }
    function keepOne(t) { if (roles[t] === "jugador" && (players[t] || []).length > 1) players[t] = players[t].slice(0, 1); }
    function bind() {
      $("mem-name").oninput = function () { name = this.value; };
      VSP.each("[data-rteam]", function (b) {
        b.onclick = function () {
          var t = Number(b.getAttribute("data-rteam"));
          roles[t] = last = b.getAttribute("data-role"); keepOne(t); info = error = ""; draw();
        };
      }, el);
      VSP.each("[data-mteam]", function (b) {
        b.onclick = function () {
          var t = Number(b.getAttribute("data-mteam"));
          if (teams.indexOf(t) >= 0) teams = teams.filter(function (x) { return x !== t; });
          else { roles[t] = L.defaultRole(roles, teams, last); keepOne(t); teams = teams.concat([t]); }
          draw();
        };
      }, el);
      VSP.each("[data-pteam]", function (b) {
        b.onclick = function () {
          var t = b.getAttribute("data-pteam"), p = b.getAttribute("data-pname"), cur = players[t] || [];
          if (cur.some(function (c) { return VSP.sameName(c, p); })) cur = cur.filter(function (c) { return !VSP.sameName(c, p); });
          else cur = roles[t] === "jugador" ? [p] : cur.concat([p]).slice(0, MAX_PLAYERS);
          players[t] = cur; draw();
        };
      }, el);
      VSP.each("[data-addbtn]", function (b) {
        b.onclick = function () {
          var t = b.getAttribute("data-addbtn"), inp = el.querySelector('[data-addname="' + t + '"]');
          var p = String(inp.value || "").trim().replace(/\s+/g, " ").slice(0, 50); if (!p) return;
          var cur = (players[t] || []).filter(function (c) { return !VSP.sameName(c, p); });
          players[t] = roles[t] === "jugador" ? [p] : cur.concat([p]).slice(0, MAX_PLAYERS);
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
      VSP.each("[data-unlink]", function (b) {
        b.onclick = function () {
          var d = devices && devices[+b.getAttribute("data-unlink")]; if (!d) return;
          if (!confirm("Desconnectar aquest dispositiu?\nSortirà de " + sorted(d.teams).map(VSP.teamName).join(", ") + " i haurà de tornar a demanar-ho o enllaçar-se amb un codi nou.")) return;
          run(function () { return M.unlinkDevice(d).then(loadDevices); }, "Dispositiu desconnectat.", true);
        };
      }, el);
      if ($("mem-refresh")) $("mem-refresh").onclick = function () { run(function () { return M.check().then(loadDevices); }, ""); };
      if ($("link-make")) $("link-make").onclick = function () {
        run(function () { return M.createLink().then(function (r) { made = r; }); }, "", true);
      };
      if ($("link-open")) $("link-open").onclick = function () { joinOpen = true; info = error = ""; draw(); if ($("link-code")) $("link-code").focus(); };
      if ($("link-cancel")) $("link-cancel").onclick = function () { joinOpen = false; joinCode = ""; draw(); };
      if ($("link-code")) $("link-code").oninput = function () { joinCode = this.value; };
      if ($("link-join")) $("link-join").onclick = function () {
        if (M.requested().length && !confirm("Les sol·licituds d'aquest navegador als equips del codi se substituiran per les de l'altre dispositiu. Continuar?")) return;
        run(function () {
          return M.joinLink(joinCode).then(function () {
            joinOpen = false; joinCode = ""; devices = null;
            name = M.name(); teams = M.requested().slice(); players = M.players(); roles = M.roles();
          });
        }, "Fet! Aquest dispositiu ja està enllaçat amb el teu compte.", true);
      };
      $("mem-f").onsubmit = function (ev) {
        ev.preventDefault();
        error = L.validate(name, roles, teams) || "";
        if (error) { info = ""; draw(); return; }
        var pl = {}, rl = {}; teams.forEach(function (t) { pl[t] = players[t] || []; rl[t] = roles[t]; });
        VSP.store("mem_last_role", last);
        run(function () { return M.request(name, rl, teams, pl); }, "Sol·licitud enviada. L'entrenador/a l'ha d'aprovar.");
      };
    }
    function loadDevices() {
      return M.linkedDevices().then(function (l) { devices = l; }, function () { devices = null; });
    }
    /** Runs [fn] showing busy / [ok] / the error; then the private data (unless [skipPrivate]: fn already did it). */
    function run(fn, ok, skipPrivate) {
      if (busy) return; busy = true; info = ""; error = ""; draw();
      fn().then(function () { busy = false; info = ok; draw(); if (!skipPrivate) M.loadPrivate(); },
        function (e) { busy = false; error = (e && e.msg) || VSP.errText(e); draw(); });
    }
    draw();
    if (M.requested().length) M.check().then(loadDevices).then(draw, function () {});
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
          return VSP.fs.set(docPath(), { partit: String(c.fixture), owner: VSP.uid(), nom: (M.name() || M.roleIn(team) || "").slice(0, MAX_NAME),
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
