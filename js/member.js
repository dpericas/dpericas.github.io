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
      if (String(name || "").trim().length < 2) return VSP.t("mem.err_name");
      if (!teams.length) return VSP.t("mem.err_teams");
      roles = roles || {};
      if (teams.some(function (t) { return !isRole(roles[t]); })) return VSP.t("mem.err_role");
      if (teams.filter(function (t) { return roles[t] === "jugador"; }).length > 1) return VSP.t("mem.err_player_one");
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
      out[t] = VSP.t(m === undefined ? (ap.indexOf(t) >= 0 ? "mem.st_in" : "mem.st_pending") : m === null ? "mem.st_missing" : m.estat === "aprovat" ? "mem.st_in" : "mem.st_pending");
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
      if (!dades.equips.length) throw userErr(VSP.t("mem.link_no_requests"));
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
    if (!code) return Promise.reject(userErr(VSP.t("mem.link_bad_format")));
    var uid, data;
    return VSP.token().then(function () {
      uid = VSP.uid();
      return VSP.fs.get("enllacos/" + code);
    }).then(function (doc) {
      if (!doc) throw userErr(VSP.t("mem.link_unknown"));
      if (!(Number(doc.expira) >= Date.now())) throw userErr(VSP.t("mem.link_expired"));
      data = L.parseLink(doc.dades);
      if (!data || !data.equips.length) throw userErr(VSP.t("mem.link_invalid"));
      if (data.persona === uid) throw userErr(VSP.t("mem.link_same"));
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
        if (e && e.status === 403) throw userErr(VSP.t("mem.link_refused"));
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

  /** Editors zone role of this browser (hint saved by editors/ after signing in; display only). */
  function editorHint() {
    var h = null;
    try { h = JSON.parse(localStorage.getItem("vsp_editor_hint") || "null"); } catch (e) { h = null; }
    return h && typeof h === "object" ? h : null;
  }
  function coachOf(t) { var h = editorHint(); return !!(h && h.role === "entrenador" && Array.isArray(h.teams) && h.teams.indexOf(Number(t)) >= 0); }

  // ---------- page "El meu equip" (MyMembershipScreen)
  VSP.pages["meu-equip"] = { tab: "club", render: function (arg, el, title) {
    title(VSP.t("member.title"));
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
      var h = "<section><h2>" + esc(VSP.t("mem.devices_title")) + "</h2>";
      if (persona) h += '<p class="meta">' + esc(VSP.t("mem.linked_here")) + "</p>";
      if (made && Date.now() > made.until) made = null;
      if (made) {
        h += '<p style="font-size:2em;font-weight:700;letter-spacing:.12em;text-align:center;margin:8px 0" aria-label="' + esc(VSP.t("mem.link_code")) + '">' + esc(L.formatCode(made.code)) + "</p>" +
          '<p class="meta" style="text-align:center">' + esc(VSP.t("mem.link_expires")) + "</p>";
      } else if (hasDocs) {
        h += '<p class="meta">' + esc(VSP.t("mem.link_why")) + "</p>" +
          '<div class="row"><button type="button" class="btn ghost small" id="link-make"' + (busy ? " disabled" : "") + ">" + esc(VSP.t("mem.link_make")) + "</button></div>";
      }
      if (!persona && devices && devices.length) {
        h += "<h3>" + esc(VSP.t("mem.devices")) + "</h3>" + devices.map(function (d, i) {
          return '<div class="row between"><span>' + esc(VSP.t(d.dispositiu === "web" ? "mem.dev_web" : "mem.dev_phone")) + " · " +
            esc(sorted(d.teams).map(VSP.teamName).join(", ")) + '</span><button type="button" class="btn ghost small" data-unlink="' + i + '">' + esc(VSP.t("mem.unlink")) + "</button></div>";
        }).join("");
      }
      if (!joinOpen) {
        h += '<div class="row" style="margin-top:8px"><button type="button" class="btn ghost small" id="link-open">' + esc(VSP.t("mem.link_open")) + "</button></div>";
      } else {
        h += '<div class="form" style="margin-top:8px"><label>' + esc(VSP.t("mem.link_code")) + '<input id="link-code" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH" value="' + esc(joinCode) + '"></label>' +
          '<p class="meta">' + esc(VSP.t("mem.link_join_help")) + "</p>" +
          '<div class="row"><button type="button" class="btn primary small" id="link-join"' + (busy ? " disabled" : "") + ">" + esc(VSP.t("mem.link_join")) + "</button>" +
          '<button type="button" class="btn ghost small" id="link-cancel">' + esc(VSP.t("common.cancel")) + "</button></div></div>";
      }
      return h + "</section>";
    }
    function draw() {
      var status = VSP.memberStatus(), req = M.requested();
      var anyFamily = teams.some(function (t) { return roles[t] === "familia"; });
      var html = "<section><p>" + esc(VSP.t("mem.intro")) + "</p>" +
        (info ? '<p class="ok" role="status"><b>' + esc(info) + "</b></p>" : "") + (error ? '<p class="err" role="alert">' + esc(error) + "</p>" : "") + "</section>";
      if (req.length) {
        html += "<section><h2>" + esc(VSP.t("mem.status")) + "</h2>" + req.map(function (t) {
          var r = M.roleIn(t);
          return '<div class="row between"><span><b>' + esc(VSP.teamName(t)) + '</b><br><span class="meta">' +
            esc(r === "jugador" ? "🏐 " + VSP.t("mem.role_player") : r === "familia" ? "👨‍👩‍👧 " + VSP.t("mem.role_family") : "") + (coachOf(t) ? " · 📋 " + esc(VSP.t("mem.role_coach")) : "") +
            "</span></span><span>" + esc(status[t]) + '</span><button class="btn ghost small" data-leave="' + t + '">' + esc(VSP.t("common.leave_btn")) + "</button></div>";
        }).join("") + '<div class="row" style="margin-top:8px"><button class="btn ghost small" id="mem-refresh">' + esc(VSP.t("common.update")) + "</button></div></section>";
      }
      var eh = editorHint();
      if (eh) {
        var lbl = eh.role === "admin" ? "⚙️ " + VSP.t("mem.role_admin") : eh.role === "junta" ? "🏛️ " + VSP.t("mem.role_board") : "📋 " + VSP.t("mem.role_coach");
        var et = (eh.teams || []).map(function (t) { return VSP.teamName(t); }).join(", ");
        html += '<section><p class="meta">' + esc(VSP.t("mem.editors_zone")) + " <b>" + esc(lbl) + "</b>" + (eh.role === "entrenador" && et ? " · " + esc(et) : "") + "</p></section>";
      }
      html += linkHtml(req);
      html += '<section><form id="mem-f" class="form">' +
        "<label>" + esc(VSP.t("mem.name")) + '<input id="mem-name" maxlength="60" autocomplete="name" value="' + esc(name) + '" placeholder="' +
        esc(VSP.t(anyFamily ? "mem.name_hint_family" : "mem.name_hint_player")) + '"></label>' +
        "<fieldset><legend>" + esc(VSP.t("mem.teams_legend")) + '</legend><div class="chips">' +
        VSP.TEAMS.map(function (t) { return chip(teams.indexOf(t.id) >= 0, 'data-mteam="' + t.id + '"', esc(t.name)); }).join("") +
        '</div><div class="meta">' + esc(VSP.t("mem.teams_hint")) + "</div></fieldset>";
      sorted(teams).forEach(function (t) {
        var role = roles[t], roster = VSP.roster(t), cur = players[t] || [];
        cur.forEach(function (p) { if (!roster.some(function (r) { return VSP.sameName(r, p); })) roster.push(p); });
        html += '<fieldset><legend>' + esc(VSP.teamName(t)) + '</legend><div class="chips" role="group" aria-label="' + esc(VSP.t("mem.who_in", VSP.teamName(t))) + '">' +
          [["jugador", "mem.role_player"], ["familia", "mem.role_family"]].map(function (r) { return chip(role === r[0], 'data-rteam="' + t + '" data-role="' + r[0] + '"', esc(VSP.t(r[1]))); }).join("") +
          '</div><div class="meta">' + esc(role === "familia" ? VSP.t("mem.kids_in", VSP.teamName(t)) : VSP.t("mem.who_in_q", VSP.teamName(t))) + '</div><div class="chips">' +
          roster.map(function (p) {
            var on = cur.some(function (c) { return VSP.sameName(c, p); });
            return chip(on, 'data-pteam="' + t + '" data-pname="' + esc(p) + '"', esc(p));
          }).join("") + "</div>" +
          '<div class="row"><input class="grow" data-addname="' + t + '" maxlength="50" placeholder="' + esc(VSP.t("mem.add_name_ph")) + '" aria-label="' + esc(VSP.t("mem.add_name_to", VSP.teamName(t))) + '"><button type="button" class="btn ghost small" data-addbtn="' + t + '">' + esc(VSP.t("common.add")) + "</button></div>" +
          '<div class="meta">' + esc(VSP.t("mem.link_hint")) + "</div></fieldset>";
      });
      html += '<button class="btn primary" type="submit"' + (busy ? " disabled" : "") + ">" + esc(VSP.t(req.length ? "mem.update" : "mem.send")) + "</button>" +
        '<p class="meta">' + esc(VSP.t("mem.privacy")) + "</p></form></section>";
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
          if (!confirm(VSP.t("mem.leave_q", VSP.teamName(t)) + "\n" + VSP.t("mem.leave_text"))) return;
          run(function () { return M.leave(t).then(function () { teams = teams.filter(function (x) { return x !== t; }); }); }, "");
        };
      }, el);
      VSP.each("[data-unlink]", function (b) {
        b.onclick = function () {
          var d = devices && devices[+b.getAttribute("data-unlink")]; if (!d) return;
          if (!confirm(VSP.t("mem.unlink_q") + "\n" + VSP.t("mem.unlink_text", sorted(d.teams).map(VSP.teamName).join(", ")))) return;
          run(function () { return M.unlinkDevice(d).then(loadDevices); }, VSP.t("mem.unlinked"), true);
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
        if (M.requested().length && !confirm(VSP.t("mem.join_replace_q"))) return;
        run(function () {
          return M.joinLink(joinCode).then(function () {
            joinOpen = false; joinCode = ""; devices = null;
            name = M.name(); teams = M.requested().slice(); players = M.players(); roles = M.roles();
          });
        }, VSP.t("mem.linked_done"), true);
      };
      $("mem-f").onsubmit = function (ev) {
        ev.preventDefault();
        error = L.validate(name, roles, teams) || "";
        if (error) { info = ""; draw(); return; }
        var pl = {}, rl = {}; teams.forEach(function (t) { pl[t] = players[t] || []; rl[t] = roles[t]; });
        VSP.store("mem_last_role", last);
        run(function () { return M.request(name, rl, teams, pl); }, VSP.t("mem.sent"));
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
      if (!(M.players()[team] || []).length) el.innerHTML = '<p class="meta">' + VSP.t("rsvp.link_hint", '<a href="#meu-equip" data-href="#meu-equip">' + esc(VSP.t("member.title")) + "</a>") + "</p>";
      return;
    }
    var answers = {}, note = "", busy = false, msg = "";
    mine.forEach(function (p) { answers[p] = null; });
    function docPath() { return "equips/" + team + "/respostes/" + c.fixture + "_" + VSP.uid(); }
    function draw() {
      var anyNo = mine.some(function (p) { return answers[p] === false; });
      el.innerHTML = '<hr><h3 class="sub">' + esc(VSP.t("rsvp.title")) + "</h3>" + mine.map(function (p, i) {
        return '<div class="row between rsvp"><span>' + esc(p) + '</span><span class="chips" style="margin:0">' +
          '<button class="chip' + (answers[p] === true ? " on" : "") + '" aria-pressed="' + (answers[p] === true) + '" data-a="' + i + '" data-v="1">✅ ' + esc(VSP.t("rsvp.yes")) + "</button>" +
          '<button class="chip' + (answers[p] === false ? " on" : "") + '" aria-pressed="' + (answers[p] === false) + '" data-a="' + i + '" data-v="0">❌ ' + esc(VSP.t("rsvp.no")) + "</button></span></div>";
      }).join("") +
        (anyNo ? '<label class="form">' + esc(VSP.t("rsvp.reason")) + '<input id="rsvp-note" maxlength="120" value="' + esc(note) + '"></label>' : "") +
        (msg ? '<p class="ok" role="status">' + esc(msg) + "</p>" : "") +
        '<button class="btn primary small" id="rsvp-send"' + (busy || !mine.some(function (p) { return answers[p] !== null; }) ? " disabled" : "") + ">" + esc(VSP.t("rsvp.send")) + "</button>";
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
        }).then(function () { busy = false; msg = VSP.t("rsvp.sent"); draw(); },
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
