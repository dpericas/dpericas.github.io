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
  /** Games progress code (jocs/js/progress.js P.code): 10 characters of this alphabet. */
  var GAMES_CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/;
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
      return { v: 1, persona: persona, nom: String(name || "").trim().slice(0, MAX_NAME), favs: [], qui: [],
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
      if (nom.length < 2 && o.equips.length) return null;   // a code without teams (only ★, «Qui ets?», games) may have no name
      var seen = {}, equips = [];
      o.equips.forEach(function (e) {
        if (!e || !isRole(e.rol)) return;
        var t = Number(e.t);
        if (!VSP.team(t) || seen[t]) return;
        seen[t] = 1;
        equips.push({ t: t, rol: e.rol, estat: e.estat === "aprovat" ? "aprovat" : "pendent",
          jugadors: (Array.isArray(e.jugadors) ? e.jugadors : []).map(function (n) { return String(n).trim(); }).filter(Boolean).slice(0, MAX_PLAYERS) });
      });
      var jocs = typeof o.jocs === "string" && GAMES_CODE.test(o.jocs) ? o.jocs : null;
      var out = { persona: o.persona, nom: nom, equips: equips,
        favs: (Array.isArray(o.favs) ? o.favs : []).map(Number).filter(function (t) { return VSP.team(t); }),
        qui: (Array.isArray(o.qui) ? o.qui : []).filter(function (k) { return P.WHO.indexOf(k) >= 0; }) };
      if (jocs) out.jocs = jocs;
      if (P.validKey(o.perfil)) out.perfil = o.perfil;
      return out;
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
    // ---- board invitations (invitacions/{CODE}, members/Invitations.kt): join a team already approved
    INV_LEN: 12,
    /** A typed code ("abcd-efgh-jkmn") or the whole link (…/invitacio/#CODE) → "ABCDEFGHJKMN"; null if it is not one. */
    normalizeInvite: function (input) {
      var s = String(input || "").trim();
      if (s.indexOf("/invitacio/") >= 0) s = s.split("/invitacio/")[1].replace(/^[#?]/, "").replace(/^c=/, "");
      var c = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (c.length !== 12) return null;
      for (var i = 0; i < c.length; i++) if (CODE_ALPHABET.indexOf(c.charAt(i)) < 0) return null;
      return c;
    },
    formatInvite: function (code) { return String(code).match(/.{1,4}/g).join("-"); },
    /** invitacions doc → {code, team, rol, jugadors, nom, usos, max, expira}; null if not valid. */
    parseInvite: function (doc) {
      if (!doc || !isRole(doc.rol) || !VSP.team(Number(doc.equip)) || String(doc.id || "").length !== 12) return null;
      return { code: doc.id, team: Number(doc.equip), rol: doc.rol, nom: String(doc.nom || "").trim(),
        jugadors: (Array.isArray(doc.jugadors) ? doc.jugadors : []).map(function (n) { return String(n).trim(); }).filter(Boolean),
        usos: Number(doc.usos) || 0, max: Number(doc.max) || 3, expira: Number(doc.expira) || 0 };
    },
    /** "ACTIVE" / "USED_UP" / "EXPIRED". */
    inviteState: function (inv, now) { return inv.expira <= now ? "EXPIRED" : inv.usos >= inv.max ? "USED_UP" : "ACTIVE"; },
    /** NEW (no membership) / ADD_PLAYERS (already in with that role: no use spent) / REPLACE. */
    acceptAction: function (cur, inv) { return !cur ? "NEW" : cur.estat === "aprovat" && cur.rol === inv.rol ? "ADD_PLAYERS" : "REPLACE"; },
    /** Current players plus the invitation's (no duplicates, at most 6). */
    mergedPlayers: function (cur, inv) {
      cur = (cur || []).map(String);
      return cur.concat(inv.jugadors.filter(function (p) { return !cur.some(function (c) { return VSP.sameName(c, p); }); })).slice(0, MAX_PLAYERS);
    },
    /** Null = OK; else why not (a player invitation while already a player in another team). */
    inviteConflict: function (roles, inv) {
      return inv.rol === "jugador" && Object.keys(roles || {}).some(function (t) { return Number(t) !== inv.team && roles[t] === "jugador"; })
        ? VSP.t("mem.err_player_one") : null;
    },
    /** structuredQuery for the memberships linked to [uid] (inside equips/{team}). */
    linkQuery: function (uid) {
      return { from: [{ collectionId: "membres" }], where: { fieldFilter: { field: { fieldPath: "enllac" }, op: "EQUAL", value: { stringValue: uid } } } };
    }
  };
  var L = VSP.memberLogic;

  /**
   * 🔗 Devices linked for good (members/SharedProfile.kt ProfileLogic, same format): perfils/{KEY} (16
   * random characters, only the linked devices know it). ★ teams and «Qui ets?»: the last change wins;
   * teams: the main device's ones (a linked device joins / leaves them); games code; "disp" = devices
   * and when last seen; "fora" = devices the main one disconnected; "vistos" = notices seen on any
   * device; "idioma" and "alertes": the last change wins. Pure: tested with node.
   */
  var P = VSP.profileLogic = {
    KEY_LEN: 16, WHO: ["player", "family", "coach", "board", "fan"],
    MAX_SEEN: 80, MAX_SEEN_ID: 64, LANGS: ["ca", "es", "en"], ALERTS: ["avisos", "recordatoris", "convocatories"],
    newKey: function (bytes) { var s = ""; for (var i = 0; i < 16; i++) s += CODE_ALPHABET.charAt(bytes[i] % CODE_ALPHABET.length); return s; },
    validKey: function (k) {
      if (typeof k !== "string" || k.length !== 16) return false;
      for (var i = 0; i < k.length; i++) if (CODE_ALPHABET.indexOf(k.charAt(i)) < 0) return false;
      return true;
    },
    /** The profile with its fields in a fixed order (two equal profiles give the same text). */
    clean: function (o) {
      o = o || {};
      var seen = {}, equips = [];
      (Array.isArray(o.equips) ? o.equips : []).forEach(function (e) {
        if (!e || !isRole(e.rol)) return;
        var t = Number(e.t); if (!VSP.team(t) || seen[t]) return; seen[t] = 1;
        equips.push({ t: t, rol: e.rol, estat: e.estat === "aprovat" ? "aprovat" : "pendent",
          jugadors: (Array.isArray(e.jugadors) ? e.jugadors : []).map(function (n) { return String(n).trim(); }).filter(Boolean).slice(0, MAX_PLAYERS) });
      });
      var favs = []; (Array.isArray(o.favs) ? o.favs : []).map(Number).forEach(function (t) { if (VSP.team(t) && favs.indexOf(t) < 0) favs.push(t); });
      favs.sort(function (a, b) { return a - b; });
      var qui = P.WHO.filter(function (k) { return Array.isArray(o.qui) && o.qui.indexOf(k) >= 0; });
      var disp = {}, src = o.disp && typeof o.disp === "object" ? o.disp : {};
      Object.keys(src).sort().forEach(function (k) { var d = src[k] || {}; disp[k] = { d: String(d.d || ""), vist: String(d.vist || "") }; });
      var fora = (Array.isArray(o.fora) ? o.fora : []).map(String).filter(Boolean).sort();
      var out = { v: 1, nom: String(o.nom || "").trim().slice(0, MAX_NAME), equips: equips, favs: favs, favsAt: Number(o.favsAt) || 0,
        qui: qui, quiAt: Number(o.quiAt) || 0 };
      if (typeof o.jocs === "string" && GAMES_CODE.test(o.jocs)) out.jocs = o.jocs;
      out.disp = disp; out.fora = fora;
      var vistos = [];
      (Array.isArray(o.vistos) ? o.vistos : []).map(function (x) { return String(x).trim(); }).forEach(function (x) {
        if (x && x.length <= P.MAX_SEEN_ID && vistos.indexOf(x) < 0) vistos.push(x);
      });
      out.vistos = vistos.slice(-P.MAX_SEEN);
      if (P.LANGS.indexOf(o.idioma) >= 0) { out.idioma = o.idioma; out.idiomaAt = Number(o.idiomaAt) || 0; }
      var al = {}, has = false, a = o.alertes && typeof o.alertes === "object" ? o.alertes : {};
      P.ALERTS.forEach(function (k) { if (typeof a[k] === "boolean") { al[k] = a[k]; has = true; } });
      if (has) { out.alertes = al; out.alertesAt = Number(o.alertesAt) || 0; }
      return out;
    },
    parse: function (json) { var o; try { o = JSON.parse(json); } catch (e) { return null; } return o && typeof o === "object" ? P.clean(o) : null; },
    same: function (a, b) {
      var x = a.slice().sort(), y = b.slice().sort();
      return x.length === y.length && x.every(function (v, i) { return String(v) === String(y[i]); });
    },
    /**
     * local = {uid, kind, today, favs, favsAt, qui, quiAt, jocs, nom?, equips? (main device only),
     * vistos?, idioma?, idiomaAt?, alertes?, alertesAt?} →
     * {favs?, favsAt, qui?, quiAt, jocs?, vistos? (to add here), idioma?, idiomaAt, alertes? (the ones
     * that differ here), alertesAt, upload (profile or null), removed}.
     */
    merge: function (remote, local) {
      remote = P.clean(remote);
      if (remote.fora.indexOf(local.uid) >= 0) return { removed: true, upload: null };
      var out = P.clean(remote), r = { favsAt: 0, quiAt: 0, upload: null, removed: false };
      if (remote.favsAt > local.favsAt) { if (!P.same(remote.favs, local.favs)) r.favs = remote.favs; r.favsAt = remote.favsAt; }
      else if (local.favsAt > remote.favsAt) { out.favs = local.favs; out.favsAt = local.favsAt; }
      if (remote.quiAt > local.quiAt) { if (!P.same(remote.qui, local.qui)) r.qui = remote.qui; r.quiAt = remote.quiAt; }
      else if (local.quiAt > remote.quiAt) { out.qui = local.qui; out.quiAt = local.quiAt; }
      if (local.equips) { out.equips = local.equips; if (String(local.nom || "").trim()) out.nom = local.nom; }
      if (remote.jocs && !local.jocs) r.jocs = remote.jocs;
      if (!remote.jocs && local.jocs) out.jocs = local.jocs;
      out.fora.forEach(function (u) { delete out.disp[u]; });
      out.disp[local.uid] = { d: local.kind, vist: local.today };
      // seen notices: everybody's (the newest kept)
      var mine = (local.vistos || []).map(String).filter(function (x) { return x.length <= P.MAX_SEEN_ID; });
      var add = mine.filter(function (x) { return remote.vistos.indexOf(x) < 0; }).sort();
      if (add.length) out.vistos = remote.vistos.concat(add).slice(-P.MAX_SEEN);
      var seen = remote.vistos.filter(function (x) { return mine.indexOf(x) < 0; });
      if (seen.length) r.vistos = seen;
      // language and alert switches: the last change wins
      var lAt = Number(local.idiomaAt) || 0, rAt = remote.idiomaAt || 0;
      r.idiomaAt = 0;
      if (rAt > lAt) { if (remote.idioma && remote.idioma !== local.idioma) r.idioma = remote.idioma; r.idiomaAt = rAt; }
      else if (lAt > rAt && P.LANGS.indexOf(local.idioma) >= 0) { out.idioma = local.idioma; out.idiomaAt = lAt; }
      var aAt = Number(local.alertesAt) || 0, raAt = remote.alertesAt || 0, la = local.alertes || {};
      r.alertesAt = 0;
      if (raAt > aAt) {
        var diff = {}, any = false;
        Object.keys(remote.alertes || {}).forEach(function (k) { if (k in la && la[k] !== remote.alertes[k]) { diff[k] = remote.alertes[k]; any = true; } });
        if (any) r.alertes = diff;
        r.alertesAt = raAt;
      } else if (aAt > raAt && Object.keys(la).length) {
        var m = {}; Object.keys(remote.alertes || {}).forEach(function (k) { m[k] = remote.alertes[k]; });
        P.ALERTS.forEach(function (k) { if (typeof la[k] === "boolean") m[k] = la[k]; });
        out.alertes = m; out.alertesAt = aAt;
      }
      out = P.clean(out);
      if (JSON.stringify(out) !== JSON.stringify(remote)) r.upload = out;
      return r;
    },
    /** Devices that [uid] did not know yet (known = the ones seen before; null = never looked: none is new). */
    newDevices: function (prof, uid, known) {
      if (!Array.isArray(known)) return [];
      return Object.keys(prof.disp).filter(function (u) { return u !== uid && prof.fora.indexOf(u) < 0 && known.indexOf(u) < 0; });
    },
    /** Linked device: main teams to join (not here, or asked with another role) and linked teams to leave. */
    teamChanges: function (main, requested, linked, roles) {
      var ids = main.map(function (e) { return e.t; });
      return {
        join: main.filter(function (e) { return requested.indexOf(e.t) < 0 || (linked.indexOf(e.t) >= 0 && roles[e.t] !== e.rol); }),
        leave: linked.filter(function (t) { return ids.indexOf(t) < 0; })
      };
    }
  };

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
      M.syncSoon();   // the linked devices follow
      return M.check();
    });
  };

  /** After leaving every team this browser is nobody's device any more (unless the shared profile links it). */
  function forgetLink() {
    var old = VSP.store("mem_link_code");
    if (!M.profileKey()) VSP.store("mem_persona", null);
    VSP.store("mem_link_code", null);
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
      M.syncSoon();   // the linked devices leave it too
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
    return VSP.token().then(function () { return M.check(); }).then(function (mine) {
      var uid = VSP.uid(), req = M.requested();
      var first = req.map(function (t) { return mine[t]; }).filter(Boolean)[0];
      var dades = L.linkData(M.persona() || uid, M.name() || (first && first.nom) || "", req, mine, uid);
      // ★ teams and «Qui ets?» travel too, and the shared profile keeps both devices linked for good
      dades.favs = VSP.favs(); dades.qui = (VSP.savedWho && VSP.savedWho()) || [];
      return M.ensureProfile().then(function (key) { if (key) dades.perfil = key; return dades; }, function () { return dades; });
    }).then(function (dades) {
      var uid = VSP.uid();
      // the games progress code (jocs/: localStorage "jocs_code") travels too, so the other device gets the same unlocks
      var games = VSP.storeJson("jocs_code", undefined, null);
      if (typeof games === "string" && GAMES_CODE.test(games)) dades.jocs = games;
      var old = VSP.store("mem_link_code");
      return (old ? VSP.fs.del("enllacos/" + old).catch(function () {}) : Promise.resolve()).then(function () {
        VSP.store("mem_link_code", null);
        function attempt(n) {
          var code = L.newCode(randomBytes()), until = Date.now() + L.LINK_MS;
          // caduca: Firestore TTL deletes the code by itself (rules: at most now + 15 min)
          return VSP.fs.set("enllacos/" + code, { owner: uid, expira: until, caduca: VSP.ts(new Date(until).toISOString()), dades: JSON.stringify(dades) }).then(function () {
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
      if (!data) throw userErr(VSP.t("mem.link_invalid"));
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
      if (data.nom) VSP.store("mem_name", data.nom);
      VSP.storeJson("mem_roles", rj); VSP.store("mem_role", null);
      VSP.storeJson("mem_players", pj);
      VSP.storeJson("mem_requested", keep.concat(teams));
      VSP.storeJson("mem_approved", M.approved().filter(function (t) { return keep.indexOf(t) >= 0; })
        .concat(data.equips.filter(function (e) { return e.estat === "aprovat"; }).map(function (e) { return e.t; })));
      VSP.store("mem_persona", data.persona);
      // the games page (jocs/) restores this progress the next time it opens (merged with this browser's)
      if (data.jocs) VSP.storeJson("jocs_pending_code", data.jocs);
      // ★ teams and «Qui ets?» of the other device (joined with this one's); with a profile, linked for good
      VSP.addFavs(teams.concat(data.favs || []));
      if ((data.qui || []).length && !(VSP.savedWho && VSP.savedWho())) VSP.storeJson("who", data.qui);
      if (data.perfil) {
        VSP.store("mem_perfil", data.perfil);
        VSP.storeJson("mem_perfil_teams", M.profileTeams().filter(function (t) { return teams.indexOf(t) < 0; }).concat(teams));
      }
      return M.check();
    }).then(function () { return M.syncProfile().catch(function () {}); }).then(function () { return M.loadPrivate(); });
  };

  // ---------- the shared profile of linked devices (VSP.profileLogic)
  M.profileKey = function () { var k = VSP.store("mem_perfil"); return P.validKey(k) ? k : null; };
  /** Teams this browser joined because of the profile. */
  M.profileTeams = function () { return ints("mem_perfil_teams"); };
  function profileUpload(key, persona, prof) {
    return VSP.fs.set("perfils/" + key, { persona: persona, owner: VSP.uid(), updated: new Date().toISOString(), dades: JSON.stringify(prof) });
  }
  function localDay(d) { function z(n) { return (n < 10 ? "0" : "") + n; } return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); }
  function pushPrefs() {
    var p = VSP.storeJson("push_prefs", undefined, null) || { avisos: true, convocatories: true };
    return { avisos: p.avisos !== false, convocatories: p.convocatories !== false };
  }
  function profileLocal(main) {
    var games = VSP.storeJson("jocs_code", undefined, null);
    var l = { uid: VSP.uid(), kind: "web", today: localDay(new Date()),
      favs: VSP.favs(), favsAt: Number(VSP.store("favs_at")) || 0,
      qui: (VSP.savedWho && VSP.savedWho()) || [], quiAt: Number(VSP.store("who_at")) || 0,
      jocs: typeof games === "string" && GAMES_CODE.test(games) ? games : null,
      vistos: VSP.seenNotices ? VSP.seenNotices() : VSP.storeJson("notices_seen", undefined, []) || [],
      idioma: P.LANGS.indexOf(VSP.store("lang")) >= 0 ? VSP.store("lang") : null, idiomaAt: Number(VSP.store("lang_at")) || 0,
      alertes: pushPrefs(), alertesAt: Number(VSP.store("alerts_at")) || 0 };
    if (main) {
      var mine = M.mine, pl = M.players(), ap = M.approved();
      l.nom = M.name();
      l.equips = M.requested().filter(function (t) { return isRole(M.roleIn(t)) && (!mine[t] || !mine[t].enllac); }).map(function (t) {
        return { t: t, rol: M.roleIn(t), estat: ap.indexOf(t) >= 0 ? "aprovat" : "pendent", jugadors: (pl[t] || []).slice(0, MAX_PLAYERS) };
      });
    }
    return l;
  }
  /** Main browser: the profile key, created now if there is none (null on a browser linked before vsp-v25). */
  M.ensureProfile = function () {
    if (M.profileKey()) return Promise.resolve(M.profileKey());
    if (M.persona()) return Promise.resolve(null);
    return VSP.token().then(function () {
      var b = new Uint8Array(16); window.crypto.getRandomValues(b);
      var key = P.newKey(b), now = Date.now();
      VSP.store("favs_at", String(Math.max(Number(VSP.store("favs_at")) || 0, now)));
      VSP.store("who_at", String(Math.max(Number(VSP.store("who_at")) || 0, now)));
      var r = P.merge({}, profileLocal(true));
      return profileUpload(key, VSP.uid(), r.upload || P.clean({})).then(function () {
        VSP.store("mem_perfil", key); VSP.storeJson("mem_perfil_known", []);   // the first device linked to it is new
        return key;
      });
    });
  };
  /** Brings the other devices' changes and sends this browser's. Resolves true if something changed here. */
  M.syncProfile = function () {
    var key = M.profileKey();
    if (!key) return Promise.resolve(false);
    var main = !M.persona(), persona, remote;
    return VSP.token().then(function () { return VSP.fs.get("perfils/" + key); }).then(function (doc) {
      persona = (doc && doc.persona) || (main ? VSP.uid() : null);
      if (!persona) return false;
      remote = P.parse(doc && doc.dades) || P.clean({});
      var r = P.merge(remote, profileLocal(main)), changed = false;
      if (r.removed) return disconnectProfile().then(function () { return true; });
      if (r.favs) { VSP.storeJson("favs", r.favs); changed = true; }
      if (r.favsAt) VSP.store("favs_at", String(r.favsAt));
      if (r.qui) { VSP.storeJson("who", r.qui); changed = true; }
      if (r.quiAt) VSP.store("who_at", String(r.quiAt));
      if (r.jocs) VSP.storeJson("jocs_pending_code", r.jocs);
      if (r.vistos) { if (VSP.addSeenNotices) VSP.addSeenNotices(r.vistos, true); else VSP.storeJson("notices_seen", (VSP.storeJson("notices_seen", undefined, []) || []).concat(r.vistos).slice(-300)); changed = true; }
      if (r.idioma) VSP.store("lang", r.idioma);   // used from the next time the web opens
      if (r.idiomaAt) VSP.store("lang_at", String(r.idiomaAt));
      if (r.alertes) { if (VSP.applyPushPrefs) VSP.applyPushPrefs(r.alertes); else VSP.storeJson("push_prefs", Object.assign(pushPrefs(), r.alertes)); }
      if (r.alertesAt) VSP.store("alerts_at", String(r.alertesAt));
      if (main) newDevices(r.upload || remote);
      return (r.upload ? profileUpload(key, persona, r.upload).catch(function () {}) : Promise.resolve()).then(function () {
        return main ? changed : followTeams(key, persona, remote).then(function (t) { return changed || t; });
      }).then(function (any) { if (r.favs) VSP.emit("favs", "profile"); return any; });
    });
  };
  /** 📱 Main browser: tells when a device it did not know joined the profile (someone used a link code). */
  function newDevices(prof) {
    var known = VSP.storeJson("mem_perfil_known", undefined, null);
    var fresh = P.newDevices(prof, VSP.uid(), Array.isArray(known) ? known : null);
    VSP.storeJson("mem_perfil_known", Object.keys(prof.disp).filter(function (u) { return u !== VSP.uid() && prof.fora.indexOf(u) < 0; }));
    if (fresh.length) VSP.toast(VSP.t("dev.new"));
  }
  /** Linked browser: the same teams as the main device. */
  function followTeams(key, persona, remote) {
    var linked = M.profileTeams(), ch = P.teamChanges(remote.equips, M.requested(), linked, M.roles());
    if (!ch.join.length && !ch.leave.length) return Promise.resolve(false);
    var joined = [];
    return ch.leave.reduce(function (p, t) { return p.then(function () { return M.leave(t).catch(function () {}); }); }, Promise.resolve()).then(function () {
      return Promise.all(ch.join.map(function (e) {
        return joinFromProfile(e, remote.nom, persona, key).then(function () { joined.push(e.t); }, function () {});
      }));
    }).then(function () {
      VSP.storeJson("mem_perfil_teams", linked.filter(function (t) { return ch.leave.indexOf(t) < 0 && joined.indexOf(t) < 0; }).concat(joined));
      if (joined.length) { VSP.addFavs(joined, true); return M.check().then(function () { return true; }); }
      return true;
    });
  }
  function joinFromProfile(e, personName, persona, key) {
    var p = path(e.t, VSP.uid()), nom = (M.name() || personName || "?").slice(0, MAX_NAME);
    return VSP.fs.get(p).then(function (cur) { return cur ? VSP.fs.del(p) : null; }).then(function () {
      return VSP.fs.set(p, { nom: nom, rol: e.rol, estat: e.estat, created: new Date().toISOString(), jugadors: e.jugadors,
        dispositiu: "web", enllac: persona, perfil: key });
    }).then(function () {
      var rj = M.roles(), pj = M.players();
      rj[e.t] = e.rol; pj[e.t] = e.jugadors;
      VSP.store("mem_name", nom); VSP.storeJson("mem_roles", rj); VSP.store("mem_role", null); VSP.storeJson("mem_players", pj);
      if (M.requested().indexOf(e.t) < 0) VSP.storeJson("mem_requested", M.requested().concat([e.t]));
      var ap = M.approved().filter(function (t) { return t !== e.t; });
      VSP.storeJson("mem_approved", e.estat === "aprovat" ? ap.concat([e.t]) : ap);
      VSP.store("mem_persona", persona);
    });
  }
  /** The main device disconnected this browser: forget the profile and leave the teams that came with it. */
  function disconnectProfile() {
    var teams = M.profileTeams();
    VSP.store("mem_perfil", null); VSP.store("mem_perfil_teams", null);
    return teams.reduce(function (p, t) { return p.then(function () { return M.leave(t).catch(function () {}); }); }, Promise.resolve()).then(function () {
      VSP.store("mem_persona", null);
    });
  }
  /** Main browser: disconnects [uid] for good (it will not come back with the profile). */
  M.removeFromProfile = function (uid) {
    var key = M.profileKey();
    if (!key) return Promise.resolve();
    return VSP.token().then(function () { return VSP.fs.get("perfils/" + key); }).then(function (doc) {
      if (!doc) return;
      var prof = P.parse(doc.dades) || P.clean({});
      if (prof.fora.indexOf(uid) < 0) prof.fora.push(uid);
      delete prof.disp[uid];
      return profileUpload(key, doc.persona || VSP.uid(), P.clean(prof));
    });
  };
  /** Main browser: the other devices of the profile [{uid, d, vist}] (this one left out). */
  M.profileDevices = function () {
    var key = M.profileKey();
    if (!key || M.persona()) return Promise.resolve([]);
    return VSP.token().then(function () { return VSP.fs.get("perfils/" + key); }).then(function (doc) {
      var prof = P.parse(doc && doc.dades); if (!prof) return [];
      return Object.keys(prof.disp).filter(function (u) { return u !== VSP.uid() && prof.fora.indexOf(u) < 0; })
        .map(function (u) { return { uid: u, d: prof.disp[u].d, vist: prof.disp[u].vist }; });
    });
  };
  /** A change here (★, «Qui ets?», teams): synced a moment later (several changes, one write). */
  var syncTimer = null;
  M.syncSoon = function () {
    if (!M.profileKey()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { M.syncProfile().catch(function () {}); }, 1500);
  };
  VSP.on("favs", function (src) { if (src !== "profile") M.syncSoon(); });
  VSP.on("who", function () { M.syncSoon(); });
  VSP.on("seen", function () { M.syncSoon(); });
  VSP.on("alerts", function () { M.syncSoon(); });

  /** The invitation of a code (anyone with the code may read it); rejects with a message to show. */
  M.peekInvite = function (input) {
    var code = L.normalizeInvite(input);
    if (!code) return Promise.reject(userErr(VSP.t("inv.bad")));
    return VSP.token().then(function () { return VSP.fs.get("invitacions/" + code); }).then(function (doc) {
      var inv = L.parseInvite(doc);
      if (!inv) throw userErr(VSP.t("inv.missing"));
      var st = L.inviteState(inv, Date.now());
      if (st === "EXPIRED") throw userErr(VSP.t("inv.expired"));
      if (st === "USED_UP") throw userErr(VSP.t("inv.used"));
      return inv;
    });
  };

  /**
   * Uses one device of the invitation: this browser's membership in the team, approved, in the same
   * commit as usos + 1 (the rules check both), exactly as MembersRepository.acceptInvitation.
   */
  M.acceptInvite = function (inv, name) {
    var clean = String(name || "").trim().slice(0, MAX_NAME);
    if (clean.length < 2) return Promise.reject(userErr(VSP.t("mem.err_name")));
    var conflict = L.inviteConflict(M.roles(), inv);
    if (conflict) return Promise.reject(userErr(conflict));
    var p, players;
    return VSP.token().then(function () {
      p = path(inv.team, VSP.uid());
      return VSP.fs.get(p);
    }).then(function (cur) {
      players = L.mergedPlayers(cur && cur.jugadors, inv);
      var act = L.acceptAction(cur, inv);
      if (act === "ADD_PLAYERS") return VSP.fs.update(p, { nom: clean, jugadors: players });
      return (act === "REPLACE" ? VSP.fs.del(p) : Promise.resolve()).then(function () {
        return VSP.fs.commit([
          { create: p, data: { nom: clean, rol: inv.rol, estat: "aprovat", created: new Date().toISOString(), jugadors: players, dispositiu: "web", invitacio: inv.code } },
          { update: "invitacions/" + inv.code, data: { usos: inv.usos + 1 } }]);
      });
    }).catch(function (e) {
      if (e && (e.status === 400 || e.status === 403 || e.status === 409)) throw userErr(VSP.t("inv.refused"));
      throw e;
    }).then(function () {
      var rj = M.roles(), pj = M.players();
      rj[inv.team] = inv.rol; pj[inv.team] = players;
      VSP.store("mem_name", clean);
      VSP.storeJson("mem_roles", rj); VSP.store("mem_role", null);
      VSP.storeJson("mem_players", pj);
      if (M.requested().indexOf(inv.team) < 0) VSP.storeJson("mem_requested", M.requested().concat([inv.team]));
      if (M.approved().indexOf(inv.team) < 0) VSP.storeJson("mem_approved", M.approved().concat([inv.team]));
      VSP.addFavs([inv.team]);
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
    return VSP.token().then(function () { return Promise.all((dev.teams || []).map(function (t) { return VSP.fs.del(path(t, dev.uid)); })); })
      .then(function () { return M.removeFromProfile(dev.uid).catch(function () {}); });   // and it does not come back by itself
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
    // folded parts: the team list open only while nothing is chosen; one team open at a time
    var teamsOpen = !teams.length, openTeam = null;
    function sorted(l) { return l.slice().sort(function (a, b) { return VSP.TEAM_ORDER.indexOf(a) - VSP.TEAM_ORDER.indexOf(b); }); }
    function chip(on, attrs, label) {
      return '<button type="button" class="chip' + (on ? " on" : "") + '" aria-pressed="' + on + '" ' + attrs + ">" + label + "</button>";
    }
    function linkHtml(req) {
      // the devices have their own page now (#dispositius); here only the code box (board invitations)
      if (!joinOpen) {
        return '<section><div class="row"><button type="button" class="btn ghost small" id="link-open">' + esc(VSP.t("mem.link_open")) + "</button></div>" +
          '<p class="meta">' + esc(VSP.t("dev.moved")) + ' <a href="#dispositius" data-href="#dispositius">' + esc(VSP.t("dev.title")) + "</a></p></section>";
      }
      return '<section><div class="form"><label>' + esc(VSP.t("mem.link_code")) + '<input id="link-code" maxlength="80" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH" value="' + esc(joinCode) + '"></label>' +
        '<p class="meta">' + esc(VSP.t("mem.link_join_help")) + " " + esc(VSP.t("inv.or_code")) + "</p>" +
        '<div class="row"><button type="button" class="btn primary small" id="link-join"' + (busy ? " disabled" : "") + ">" + esc(VSP.t("mem.link_join")) + "</button>" +
        '<button type="button" class="btn ghost small" id="link-cancel">' + esc(VSP.t("common.cancel")) + "</button></div></div></section>";
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
        // 👥 the teams, folded: the summary says which ones; open it to add or remove (state kept across redraws)
        '<details class="fold" id="mem-teams"' + (teamsOpen ? " open" : "") + "><summary><b>👥 " + esc(VSP.t("mem.teams_title")) + '</b><span class="meta">' +
        esc(teams.length ? VSP.tn("mem.teams_sum", teams.length, sorted(teams).map(VSP.teamName).join(", ")) : VSP.t("mem.teams_none")) + "</span></summary>" +
        '<p class="meta">' + esc(VSP.t("mem.teams_tap")) + '</p><div class="chips">' +
        VSP.TEAMS.map(function (t) { var on = teams.indexOf(t.id) >= 0; return chip(on, 'data-mteam="' + t.id + '"', (on ? "✓ " : "") + esc(t.name)); }).join("") +
        '</div><div class="meta">' + esc(VSP.t("mem.teams_hint")) + "</div></details>";
      sorted(teams).forEach(function (t) {
        var role = roles[t], roster = VSP.roster(t), cur = players[t] || [];
        cur.forEach(function (p) { if (!roster.some(function (r) { return VSP.sameName(r, p); })) roster.push(p); });
        // per team, folded too: team · role · who · approved or waiting
        var sum = [(role === "jugador" ? "🏐 " + VSP.t("mem.role_player") : "👨‍👩‍👧 " + VSP.t("mem.role_family")),
          cur.length ? cur.join(", ") : "⚠️ " + VSP.t(role === "jugador" ? "mem.who_missing" : "mem.kids_missing"),
          req.indexOf(t) >= 0 ? status[t] : ""].filter(Boolean).join(" · ");
        html += '<details class="fold" data-tfold="' + t + '"' + (openTeam === t ? " open" : "") + "><summary><b>" + esc(VSP.teamName(t)) + '</b><span class="meta">' + esc(sum) + "</span></summary>" +
          '<p class="step">' + esc(VSP.t("mem.step_role")) + '</p><div class="whos two" role="group" aria-label="' + esc(VSP.t("mem.who_in", VSP.teamName(t))) + '">' +
          [["jugador", "mem.role_player", "🏐", "mem.role_player_d"], ["familia", "mem.role_family", "👨‍👩‍👧", "mem.role_family_d"]].map(function (r) {
            var on = role === r[0];
            return '<button type="button" class="who' + (on ? " on" : "") + '" aria-pressed="' + on + '" data-rteam="' + t + '" data-role="' + r[0] + '"><span class="wi" aria-hidden="true">' + r[2] + "</span>" +
              "<span><b>" + esc(VSP.t(r[1])) + '</b><span class="meta">' + esc(VSP.t(r[3])) + "</span></span>" + (on ? '<span class="tick" aria-hidden="true">✓</span>' : "") + "</button>";
          }).join("") + "</div>" +
          '<p class="step">' + esc(VSP.t(role === "familia" ? "mem.step_kids" : "mem.step_me")) + '</p><div class="meta">' +
          esc(VSP.t(role === "familia" ? "mem.step_kids_d" : "mem.step_me_d")) + '</div><div class="chips">' +
          roster.map(function (p) {
            var on = cur.some(function (c) { return VSP.sameName(c, p); });
            return chip(on, 'data-pteam="' + t + '" data-pname="' + esc(p) + '"', (on ? "✓ " : "") + esc(p));
          }).join("") + "</div>" +
          '<div class="row"><input class="grow" data-addname="' + t + '" maxlength="50" placeholder="' + esc(VSP.t("mem.add_name_ph")) + '" aria-label="' + esc(VSP.t("mem.add_name_to", VSP.teamName(t))) + '"><button type="button" class="btn ghost small" data-addbtn="' + t + '">' + esc(VSP.t("common.add")) + "</button></div>" +
          '<div class="meta">' + esc(VSP.t("mem.link_hint")) + "</div>" +
          '<div class="row"><button type="button" class="btn ghost small" data-tremove="' + t + '">' + esc(VSP.t("mem.team_remove")) + "</button></div></details>";
      });
      html += '<button class="btn primary" type="submit"' + (busy ? " disabled" : "") + ">" + esc(VSP.t(req.length ? "mem.update" : "mem.send")) + "</button>" +
        '<p class="meta">' + esc(VSP.t("mem.privacy")) + "</p></form></section>";
      el.innerHTML = html;
      bind();
    }
    function keepOne(t) { if (roles[t] === "jugador" && (players[t] || []).length > 1) players[t] = players[t].slice(0, 1); }
    function bind() {
      $("mem-name").oninput = function () { name = this.value; };
      if ($("mem-teams")) $("mem-teams").ontoggle = function () { teamsOpen = this.open; };
      VSP.each("[data-tfold]", function (d) {
        d.ontoggle = function () { var t = Number(d.getAttribute("data-tfold")); if (d.open) openTeam = t; else if (openTeam === t) openTeam = null; };
      }, el);
      VSP.each("[data-tremove]", function (b) {
        b.onclick = function () { var t = Number(b.getAttribute("data-tremove")); teams = teams.filter(function (x) { return x !== t; }); delete players[t]; if (openTeam === t) openTeam = null; draw(); };
      }, el);
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
          else { roles[t] = L.defaultRole(roles, teams, last); keepOne(t); teams = teams.concat([t]); openTeam = t; }
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
          if (!confirm(VSP.t("mem.unlink_q") + "\n" + (d.teams.length ? VSP.t("mem.unlink_text", sorted(d.teams).map(VSP.teamName).join(", ")) : VSP.t("prof.unlink_text")))) return;
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
        // 12 characters: a board invitation (its own page); 8: a link code of another device
        var inv = L.normalizeInvite(joinCode);
        if (inv) { VSP.go("#invitacio/" + inv); return; }
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
    /** Devices with teams (memberships) and the ones linked only by the shared profile. */
    function loadDevices() {
      return Promise.all([M.linkedDevices().catch(function () { return []; }), M.profileDevices().catch(function () { return []; })]).then(function (r) {
        var l = r[0], known = l.map(function (d) { return d.uid; });
        r[1].forEach(function (p) {
          if (known.indexOf(p.uid) < 0) l.push({ uid: p.uid, dispositiu: p.d, teams: [], vist: p.vist });
          else l[known.indexOf(p.uid)].vist = p.vist;
        });
        devices = l;
      }, function () { devices = null; });
    }
    /** Runs [fn] showing busy / [ok] / the error; then the private data (unless [skipPrivate]: fn already did it). */
    function run(fn, ok, skipPrivate) {
      if (busy) return; busy = true; info = ""; error = ""; draw();
      fn().then(function () { busy = false; info = ok; draw(); if (!skipPrivate) M.loadPrivate(); },
        function (e) { busy = false; error = (e && e.msg) || VSP.errText(e); draw(); });
    }
    draw();
    if (M.requested().length) M.check().then(loadDevices).then(draw, function () {});
    else if (M.profileKey()) loadDevices().then(draw);
  } };

  // ---------- page "Els meus dispositius" (members/DevicesScreen.kt): Club and Preferències, not inside El meu equip
  VSP.pages.dispositius = { tab: "club", render: function (arg, el, title) {
    title(VSP.t("dev.title"));
    var busy = false, info = "", error = "", made = null, devices = null, joinOpen = false, joinCode = "";
    function sorted(l) { return l.slice().sort(function (a, b) { return VSP.TEAM_ORDER.indexOf(a) - VSP.TEAM_ORDER.indexOf(b); }); }
    function draw() {
      var persona = M.persona();
      if (made && Date.now() > made.until) made = null;
      var h = "<section><p style=\"margin-top:0\">" + esc(VSP.t("dev.intro")) + "</p>" +
        (info ? '<p class="ok" role="status"><b>' + esc(info) + "</b></p>" : "") + (error ? '<p class="err" role="alert">' + esc(error) + "</p>" : "") +
        (persona ? '<p class="meta"><b>' + esc(VSP.t("mem.linked_here")) + "</b></p>" : "") + "</section>";
      h += "<section><h2>📲 " + esc(VSP.t("dev.add_title")) + "</h2>";
      if (made) {
        h += '<p style="font-size:2em;font-weight:700;letter-spacing:.12em;text-align:center;margin:8px 0" aria-label="' + esc(VSP.t("mem.link_code")) + '">' + esc(L.formatCode(made.code)) + "</p>" +
          '<p class="meta" style="text-align:center">' + esc(VSP.t("mem.link_expires")) + "</p>";
      } else {
        h += "<p>" + esc(VSP.t("dev.add_text")) + "</p>" +
          '<div class="row"><button type="button" class="btn primary" id="dev-make"' + (busy ? " disabled" : "") + ">" + esc(VSP.t("mem.link_make")) + "</button></div>";
      }
      h += "</section><section><h2>⌨️ " + esc(VSP.t("dev.join_title")) + "</h2><p>" + esc(VSP.t("dev.join_text")) + "</p>";
      if (!joinOpen) h += '<div class="row"><button type="button" class="btn ghost" id="dev-open">' + esc(VSP.t("dev.join_btn")) + "</button></div>";
      else h += '<div class="form"><label>' + esc(VSP.t("mem.link_code")) + '<input id="dev-code" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH" value="' + esc(joinCode) + '"></label>' +
        '<div class="row"><button type="button" class="btn primary small" id="dev-join"' + (busy ? " disabled" : "") + ">" + esc(VSP.t("mem.link_join")) + "</button>" +
        '<button type="button" class="btn ghost small" id="dev-cancel">' + esc(VSP.t("common.cancel")) + "</button></div></div>";
      h += "</section><section><h2>🔗 " + esc(VSP.t("mem.devices")) + "</h2>";
      if (!devices || !devices.length) h += '<p class="meta">' + esc(VSP.t(persona ? "dev.none_linked" : "dev.none")) + "</p>";
      else h += devices.map(function (d, i) {
        return '<div class="row between"><span>' + esc(VSP.t(d.dispositiu === "web" ? "mem.dev_web" : "mem.dev_phone")) + " · " +
          esc(d.teams.length ? sorted(d.teams).map(VSP.teamName).join(", ") : VSP.t("prof.seen", d.vist || "")) +
          '</span><button type="button" class="btn ghost small" data-unlink="' + i + '">' + esc(VSP.t("mem.unlink")) + "</button></div>";
      }).join("");
      h += '<p class="meta">' + esc(VSP.t("dev.what")) + "</p></section>";
      el.innerHTML = h;
      if ($("dev-make")) $("dev-make").onclick = function () { run(function () { return M.createLink().then(function (r) { made = r; setTimeout(draw, L.LINK_MS + 1000); }); }, ""); };
      if ($("dev-open")) $("dev-open").onclick = function () { joinOpen = true; info = error = ""; draw(); if ($("dev-code")) $("dev-code").focus(); };
      if ($("dev-cancel")) $("dev-cancel").onclick = function () { joinOpen = false; joinCode = ""; draw(); };
      if ($("dev-code")) $("dev-code").oninput = function () { joinCode = this.value; };
      if ($("dev-join")) $("dev-join").onclick = function () {
        if (M.requested().length && !confirm(VSP.t("mem.join_replace_q"))) return;
        run(function () { return M.joinLink(joinCode).then(function () { joinOpen = false; joinCode = ""; }); }, VSP.t("mem.linked_done"));
      };
      VSP.each("[data-unlink]", function (b) {
        b.onclick = function () {
          var d = devices && devices[+b.getAttribute("data-unlink")]; if (!d) return;
          if (!confirm(VSP.t("mem.unlink_q") + "\n" + (d.teams.length ? VSP.t("mem.unlink_text", sorted(d.teams).map(VSP.teamName).join(", ")) : VSP.t("prof.unlink_text")))) return;
          run(function () { return M.unlinkDevice(d); }, VSP.t("mem.unlinked"));
        };
      }, el);
    }
    function load() {
      return Promise.all([M.linkedDevices().catch(function () { return []; }), M.profileDevices().catch(function () { return []; })]).then(function (r) {
        var l = r[0], known = l.map(function (d) { return d.uid; });
        r[1].forEach(function (p) {
          if (known.indexOf(p.uid) < 0) l.push({ uid: p.uid, dispositiu: p.d, teams: [], vist: p.vist });
          else l[known.indexOf(p.uid)].vist = p.vist;
        });
        devices = l;
      });
    }
    function run(fn, ok) {
      if (busy) return; busy = true; info = ""; error = ""; draw();
      fn().then(load).then(function () { busy = false; info = ok; draw(); },
        function (e) { busy = false; error = (e && e.msg) || VSP.errText(e); draw(); });
    }
    draw();
    (M.requested().length ? M.check() : Promise.resolve()).then(load).then(draw, function () {});
  } };

  // ---------- page "Invitació" (#invitacio/CODE): a board invitation opened from a QR / WhatsApp
  VSP.pages.invitacio = { tab: "club", render: function (arg, el, title) {
    title(VSP.t("inv.title"));
    var inv = null, name = M.name(), busy = true, error = "", done = false;
    // Android without the app (a verified App Link would have opened it): suggest installing it first, so
    // the same QR opens there and no device of the invitation is spent on the browser. iPhone / computer: web.
    var android = /Android/i.test(navigator.userAgent || ""), webChosen = !android;
    function draw() {
      var h = "<section>";
      if (busy && !inv) h += '<p class="meta">' + esc(VSP.t("common.loading")) + "</p>";
      if (error) h += '<p class="err" role="alert">' + esc(error) + "</p>";
      if (done) {
        h += '<p class="ok" role="status"><b>' + esc(VSP.t("inv.done", VSP.teamName(inv.team))) + "</b></p>" +
          '<div class="row"><a class="btn primary" href="#meu-equip" data-href="#meu-equip">' + esc(VSP.t("member.title")) + "</a></div>";
      } else if (inv && !webChosen) {
        h += "<p>" + esc(VSP.t(inv.rol === "jugador" ? "inv.what_player" : "inv.what_family", VSP.teamName(inv.team), inv.jugadors.join(", "))) + "</p>" +
          "<h3>" + esc(VSP.t("inv.android_title")) + "</h3><p>" + esc(VSP.t("inv.android_text")) + "</p>" +
          '<div class="row"><a class="btn primary" id="inv-install" href="app/">📲 ' + esc(VSP.t("inv.install")) + "</a></div>" +
          '<div class="row"><a class="btn ghost small" id="inv-open-app" href="invitacio/#' + esc(inv.code) + '">' + esc(VSP.t("inv.have_app")) + "</a>" +
          '<button type="button" class="btn ghost small" id="inv-web">' + esc(VSP.t("inv.continue_web")) + "</button></div>" +
          '<p class="meta">' + esc(VSP.t("inv.web_note")) + "</p>";
      } else if (inv) {
        h += "<p>" + esc(VSP.t(inv.rol === "jugador" ? "inv.what_player" : "inv.what_family", VSP.teamName(inv.team), inv.jugadors.join(", "))) + "</p>" +
          '<div class="form"><label>' + esc(VSP.t("mem.name")) + '<input id="inv-name" maxlength="60" autocomplete="name" value="' + esc(name || inv.nom) + '"></label>' +
          '<p class="meta">' + esc(VSP.t("inv.name_hint")) + " " + esc(VSP.t("inv.devices_left", inv.max - inv.usos, inv.max)) + "</p>" +
          '<button class="btn primary" id="inv-accept"' + (busy ? " disabled" : "") + ">" + esc(VSP.t("inv.accept")) + "</button></div>" +
          '<p class="meta">' + esc(VSP.t("inv.app_hint")) + ' <a href="app/">' + esc(VSP.t("inv.app_link")) + "</a></p>";
      } else if (!busy) {
        h += '<div class="row"><a class="btn ghost" href="#meu-equip" data-href="#meu-equip">' + esc(VSP.t("member.title")) + "</a></div>";
      }
      el.innerHTML = h + "</section>";
      if ($("inv-web")) $("inv-web").onclick = function () { webChosen = true; draw(); };
      if ($("inv-name")) $("inv-name").oninput = function () { name = this.value; };
      if ($("inv-accept")) $("inv-accept").onclick = function () {
        if (!name) name = inv.nom;
        busy = true; error = ""; draw();
        M.acceptInvite(inv, name).then(function () { busy = false; done = true; draw(); },
          function (e) { busy = false; error = (e && e.msg) || VSP.errText(e); draw(); });
      };
    }
    draw();
    M.peekInvite(arg).then(function (i) { inv = i; busy = false; draw(); },
      function (e) { busy = false; error = (e && e.msg) || VSP.errText(e); draw(); });
  } };

  // ---------- Club tab: «Vull provar el vòlei» only for whoever is not in a team yet (as in the app)
  function tryLink() { var a = document.getElementById("try-link"); if (a) a.hidden = M.requested().length > 0; }
  tryLink();
  if (VSP.on) VSP.on("member", tryLink);

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
