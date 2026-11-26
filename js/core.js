/* Club Vòlei Santpedor — public web (PWA). Shared core: helpers, teams, Firebase (anonymous
 * session + Firestore REST), remote switches, page router and data loading.
 * Same data and rules as the Android app (voleimanager): docs/firestore.rules. */
(function () {
  "use strict";
  // js/i18n.js (loaded before, on the translated pages) may have made VSP already
  var VSP = window.VSP = window.VSP || {};
  // pages without js/i18n.js (live/: Catalan only; jocs/ has its own jocs/js/i18n.js) do not use the texts of this file
  if (!VSP.t) { VSP.t = function (k) { return k; }; VSP.tn = function (k) { return k; }; VSP.lang = "ca"; }

  VSP.FIREBASE_PROJECT = "volei-santpedor-eaa1d";
  VSP.FIREBASE_KEY = "AIzaSyAfdF-SxBI89qHnq_Ke2jCki_HnXosBxoY";
  VSP.NTFY = "https://ntfy.sh";
  VSP.CHANNEL = "vspclub-5pksq4432g";
  VSP.CLUB_ID = 206572812;
  VSP.SEASON = "2627";
  /** Web version = the service worker cache name: keep it in sync by hand with CACHE in sw.js. */
  VSP.WEB_VERSION = "vsp-v29";

  // ---------- teams (ClubConfig.ALL_TEAMS, same order and names as the app)
  function sq(list) { return list.map(function (x) { return { nom: x[0], rol: x[1], dorsal: "" }; }); }
  VSP.TEAMS = [
    { id: 3629, name: "Sènior Femení", sub: "4a Divisió", fed: true },
    { id: 4578, name: "Sènior Masculí", sub: "3a Divisió", fed: true },
    { id: -3, name: "Màsters Mixt", sub: "No federat", fed: false, squad: sq([
      ["Gregori Rodríguez", "1r Entrenador"], ["Marta Rodríguez", "2a Entrenadora"], ["Oscar Carrasco", "Jugador/a"],
      ["Raquel Carrillo", "Jugador/a"], ["Rita Perez", "Jugador/a"], ["Vanessa Duque", "Jugador/a"], ["Daniel Pericas", "Jugador/a"],
      ["Pere Navarro", "Jugador/a"], ["Anna Ferre", "Jugador/a"], ["Ciscu Torradeflot", "Jugador/a"], ["Laura Giraldez", "Jugador/a"],
      ["Jordi Gil", "Jugador/a"], ["Josep Solé", "Jugador/a"], ["Genís Llobet", "Jugador/a"], ["Mireia Mesas", "Jugador/a"],
      ["Nacho Lanaspa", "Jugador/a"], ["Imma Ficapal", "Jugador/a"]]) },
    { id: 3630, name: "Juvenil Femení V", sub: "4a Divisió · Equip V", fed: true },
    { id: 3631, name: "Juvenil Femení N", sub: "Preferent · Equip N", fed: true },
    { id: 3632, name: "Cadet Femení V", sub: "4a Divisió · Equip V", fed: true },
    { id: 3633, name: "Cadet Femení N", sub: "Preferent · Equip N", fed: true },
    { id: 3634, name: "Infantil Femení V", sub: "Preferent · Equip V", fed: true },
    { id: 4916, name: "Infantil Femení N", sub: "Preferent · Equip N", fed: true },
    { id: 6731, name: "Aleví Femení", sub: "3x3 · categoria mixta", fed: true },
    { id: -1, name: "Escola Aleví Femení", sub: "No federat", fed: false },
    { id: -2, name: "Escola Femení", sub: "No federat", fed: false }
  ];
  VSP.TEAM_ORDER = VSP.TEAMS.map(function (t) { return t.id; });
  VSP.team = function (id) { id = Number(id); for (var i = 0; i < VSP.TEAMS.length; i++) if (VSP.TEAMS[i].id === id) return VSP.TEAMS[i]; return null; };
  VSP.teamName = function (id) { var t = VSP.team(id); return t ? t.name : "Vòlei Santpedor"; };
  /** The team's subtitle (category, "Equip V"…) in the chosen language; team names stay as they are. */
  VSP.teamSub = function (t) {
    var parts = { "4a Divisió": "teams.sub.4a", "3a Divisió": "teams.sub.3a", "Preferent": "teams.sub.pref", "No federat": "teams.sub.nofed", "categoria mixta": "teams.sub.mixed" };
    return String((t && t.sub) || "").split(" · ").map(function (p) {
      var m = /^Equip (\S+)$/.exec(p);
      if (m) return VSP.t("teams.sub.team", m[1]);
      return parts[p] ? VSP.t(parts[p]) : p;
    }).join(" · ");
  };
  /** Official page of a federated team (ClubConfig.teamUrl: the server redirects it to the results web). */
  VSP.teamUrl = function (id) {
    return "https://resultadosvoleibol.isquad.es/equipo.php?id_equipo=" + id + "&id_territorial=17&id_club=" + VSP.CLUB_ID + "&id_temp=" + VSP.SEASON;
  };

  // ---------- helpers
  var $ = VSP.$ = function (id) { return document.getElementById(id); };
  VSP.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var esc = VSP.esc;
  VSP.safeUrl = function (u) { return /^https:\/\//i.test(u || "") ? u : null; };
  VSP.store = function (k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; }
    return null;
  };
  VSP.storeJson = function (k, v, def) {
    if (v === undefined) { try { var s = VSP.store(k); return s ? JSON.parse(s) : def; } catch (e) { return def; } }
    VSP.store(k, JSON.stringify(v)); return v;
  };
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  VSP.pad = pad;
  VSP.isoDay = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  VSP.today = function () { return VSP.isoDay(new Date()); };
  VSP.addDays = function (iso, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); if (!m) return iso;
    return VSP.isoDay(new Date(+m[1], +m[2] - 1, +m[3] + n));
  };
  /** Training days as the club writes them (data: Catalan), Monday first. */
  VSP.DAYS = ["Dilluns", "Dimarts", "Dimecres", "Dijous", "Divendres", "Dissabte", "Diumenge"];
  /** A training day of the data in the chosen language ("Dilluns" → "Lunes"); unknown text as it is. */
  VSP.dayLabel = function (dia) {
    var i = VSP.DAYS.indexOf(String(dia || "").trim());
    return i < 0 ? dia : VSP.t("date.days_mon_first").split(",")[i];
  };
  /** Locale for Intl / toLocale…String in the chosen language. */
  VSP.locale = function () { return { es: "es-ES", en: "en-GB" }[VSP.lang] || "ca-ES"; };
  /** "dissabte 5 de desembre" / "sábado 5 de diciembre" / "Saturday 5 December" (+ year). */
  VSP.fmtDate = function (iso, withYear) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); if (!m) return "";
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    var wd = VSP.t("date.weekdays").split(",")[d.getDay()];
    var mo = VSP.t("date.months").split(",")[d.getMonth()];
    if (VSP.lang === "en") return wd + " " + d.getDate() + " " + mo + (withYear ? " " + m[1] : "");
    if (VSP.lang === "es") return wd + " " + d.getDate() + " de " + mo + (withYear ? " de " + m[1] : "");
    return wd + " " + d.getDate() + (/^[aeiou]/.test(mo) ? " d'" : " de ") + mo + (withYear ? " de " + m[1] : "");
  };
  /** "18:30" in the chosen language. */
  VSP.fmtTime = function (date) { return date.toLocaleTimeString(VSP.locale(), { hour: "2-digit", minute: "2-digit" }); };
  VSP.shortDate = function (iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? (+m[3]) + "/" + (+m[2]) : ""; };
  VSP.pretty = function (s) { s = String(s || "").toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
  /** Team names as the federation writes them ("CLUB VOLEIBOL CUNIT") read better in title case; the club's own
   *  teams are shortened to "Santpedor N" (short enough for a phone's results row). Pure: tested. */
  var SMALL = { de: 1, del: 1, dels: 1, la: 1, les: 1, el: 1, els: 1, i: 1, y: 1, en: 1, a: 1, al: 1, als: 1, o: 1, per: 1, amb: 1 };
  VSP.titleCase = function (s) {
    return String(s || "").trim().toLowerCase().split(/\s+/).map(function (w, i) {
      if (!w) return w;
      if (SMALL[w]) return i > 0 ? w : w.charAt(0).toUpperCase() + w.slice(1);
      if (/^(d|l)'/.test(w)) return w.charAt(0) + "'" + w.charAt(2).toUpperCase() + w.slice(3);
      if (w.length <= 2 || (w.length === 3 && !/[aeiouàèéíòóú]/.test(w))) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(" ");
  };
  VSP.niceTeam = function (s) {
    var m = /^(?:club\s+)?v[oò]lei\s+santpedor\b\s*(.*)$/i.exec(String(s || "").trim());
    return m ? ("Santpedor " + VSP.titleCase(m[1])).trim() : VSP.titleCase(s);
  };
  /** Venues and addresses come from the federation in any case ("Pavelló rafa martínez - pista 2"): same title case,
   *  but a lone dash, "C/" and numbers are left as they are. Pure: tested. */
  VSP.niceVenue = function (s) {
    s = String(s || "").trim();
    if (!s) return "";
    return VSP.titleCase(s).replace(/\bC\//g, "C/").replace(/\bS\/N\b/g, "s/n");
  };
  /** WhatsApp-style formatting in texts written by the club, on text ALREADY escaped: *bold*, _italic_, ~struck~. Pure: tested. */
  VSP.waFormat = function (html) {
    function wrap(ch, tag) {
      var c = ch.replace(/[*~]/g, "\\$&");
      var re = new RegExp("(^|[\\s(¡¿\"'«])" + c + "(?=\\S)([^" + ch + "\\n]*?\\S)" + c + "(?=$|[\\s.,;:!?)»\"'])", "g");
      html = html.replace(re, "$1<" + tag + ">$2</" + tag + ">");
    }
    wrap("*", "b"); wrap("_", "i"); wrap("~", "s");
    return html;
  };
  VSP.chips = function (names) {
    return names.length ? '<div class="chips">' + names.map(function (n) { return '<span class="chip">' + esc(n) + "</span>"; }).join("") + "</div>" : "";
  };
  VSP.teamsOf = function (o) {
    var ids = [];
    if (o.equip != null && o.equip !== "") ids.push(o.equip);
    if (Array.isArray(o.equips)) ids = ids.concat(o.equips);
    return ids.map(function (i) { var t = VSP.team(i); return t ? t.name : null; }).filter(Boolean);
  };
  VSP.each = function (sel, fn, root) { Array.prototype.forEach.call((root || document).querySelectorAll(sel), fn); };
  /** "Arya Gil" -> "Arya G." (as in the call-ups; Convocation.shortPerson). */
  VSP.shortPerson = function (name) {
    var p = String(name || "").trim().split(/\s+/);
    return p.length < 2 ? String(name || "").trim() : p[0] + " " + p[1].charAt(0).toUpperCase() + ".";
  };
  /** Same names ignoring case and spaces (MembersLogic.sameName). */
  VSP.sameName = function (a, b) {
    function n(s) { return String(s || "").trim().replace(/\s+/g, " ").toLowerCase(); }
    return n(a) === n(b);
  };
  /** Java String.hashCode (friendly match ids are derived from it in the app). */
  VSP.javaHash = function (s) {
    var h = 0; s = String(s);
    for (var i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h;
  };
  /** Hall document id (VenueRepository.key): no accents, lower case, words joined by "-". */
  VSP.venueKey = function (v) {
    var k = String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]+/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    return k || "sense-nom";
  };
  VSP.toast = function (msg) {
    var t = $("toast"); if (!t) return;
    t.textContent = msg; t.hidden = false; t.classList.add("on");
    clearTimeout(VSP._toast);
    VSP._toast = setTimeout(function () { t.classList.remove("on"); t.hidden = true; }, 3500);
  };
  VSP.getJson = function (url, opts) {
    return fetch(url, opts).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  };
  VSP.download = function (name, mime, text) {
    var url = URL.createObjectURL(new Blob([text], { type: mime }));
    var a = document.createElement("a"); a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  };

  // ---------- favourites (★): same idea as the app, kept in this browser
  VSP.favs = function () { return (VSP.storeJson("favs", undefined, []) || []).map(Number).filter(function (x) { return VSP.team(x); }); };
  VSP.isFav = function (id) { return VSP.favs().indexOf(Number(id)) >= 0; };
  VSP.setFav = function (id, on) {
    var f = VSP.favs().filter(function (x) { return x !== Number(id); });
    if (on) f.push(Number(id));
    VSP.storeJson("favs", f);
    VSP.store("favs_at", String(Date.now()));   // changed here: linked devices follow it (js/member.js profile)
    VSP.emit("favs");
  };
  /** Adds teams; [fromProfile] = they came from a linked device (not a change made here). */
  VSP.addFavs = function (ids, fromProfile) {
    var f = VSP.favs(), before = f.length;
    ids.forEach(function (i) { if (VSP.team(Number(i)) && f.indexOf(Number(i)) < 0) f.push(Number(i)); });
    VSP.storeJson("favs", f);
    if (f.length !== before && !fromProfile) VSP.store("favs_at", String(Date.now()));
    VSP.emit("favs", fromProfile ? "profile" : undefined);
  };

  // ---------- tiny event bus
  var handlers = {};
  VSP.on = function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); };
  VSP.emit = function (ev, arg) { (handlers[ev] || []).forEach(function (fn) { try { fn(arg); } catch (e) { if (window.console) console.error(e); } }); };

  // ---------- Firebase: one anonymous account per browser (its uid is "this phone" for the rules)
  var tok = null, tokUntil = 0, tokPending = null;
  VSP.uid = function () { return VSP.store("fb_uid"); };
  function authCall(url, body, form) {
    return fetch(url, { method: "POST", headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" }, body: body })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error((j.error && j.error.message) || ("HTTP " + r.status)); e.status = r.status; throw e; } return j; }); });
  }
  /**
   * Token of the anonymous session. The refresh token stays in localStorage so this browser keeps
   * the same uid (memberships, carpool entries, tips, orders belong to it). A new anonymous account
   * is created only when there is none or Firebase says the saved one is no longer valid — never on
   * a mere network error.
   */
  VSP.token = function () {
    if (tok && Date.now() < tokUntil) return Promise.resolve(tok);
    if (tokPending) return tokPending;
    var refresh = VSP.store("fb_refresh");
    var p = refresh
      ? authCall("https://securetoken.googleapis.com/v1/token?key=" + VSP.FIREBASE_KEY,
          "grant_type=refresh_token&refresh_token=" + encodeURIComponent(refresh), true)
          .then(function (r) { return { t: r.id_token, r: r.refresh_token, u: r.user_id, e: r.expires_in }; })
          .catch(function (e) { if (e.status === 400 || e.status === 403) return signUp(); throw e; })
      : signUp();
    tokPending = p.then(function (x) {
      VSP.store("fb_refresh", x.r); if (x.u) VSP.store("fb_uid", x.u);
      tok = x.t; tokUntil = Date.now() + ((Number(x.e) || 3600) * 1000) - 60000;
      tokPending = null;
      return tok;
    }, function (e) { tokPending = null; throw e; });
    return tokPending;
  };
  function signUp() {
    return authCall("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + VSP.FIREBASE_KEY, JSON.stringify({ returnSecureToken: true }))
      .then(function (r) { return { t: r.idToken, r: r.refreshToken, u: r.localId, e: r.expiresIn }; });
  }

  // Firestore values <-> JS
  function fsValue(v) {
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return v.doubleValue;
    if ("booleanValue" in v) return v.booleanValue;
    if ("timestampValue" in v) return v.timestampValue;
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(fsValue);
    if ("mapValue" in v) return fsFields(v.mapValue.fields || {});
    return null;
  }
  function fsFields(f) { var o = {}; Object.keys(f || {}).forEach(function (k) { o[k] = fsValue(f[k]); }); return o; }
  VSP.fsDoc = function (d) { var o = fsFields(d.fields || {}); o.id = d.name.split("/").pop(); return o; };
  /** Marks a value as a Firestore timestamp / double when writing. */
  VSP.ts = function (iso) { return { __ts: iso }; };
  VSP.dbl = function (n) { return { __dbl: n }; };
  function toValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === "string") return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
    if (v.__ts) return { timestampValue: v.__ts };
    if (v.__dbl !== undefined) return { doubleValue: v.__dbl };
    return { mapValue: { fields: toFields(v) } };
  }
  function toFields(o) { var f = {}; Object.keys(o).forEach(function (k) { f[k] = toValue(o[k]); }); return f; }
  VSP.toFields = toFields;

  var BASE = "https://firestore.googleapis.com/v1/projects/" + VSP.FIREBASE_PROJECT + "/databases/(default)/documents";
  VSP.FS_BASE = BASE;
  function call(method, url, body) {
    return VSP.token().then(function (t) {
      var h = { Authorization: "Bearer " + t };
      if (body !== undefined) h["Content-Type"] = "application/json";
      return fetch(url, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    }).then(function (r) {
      return r.text().then(function (txt) {
        var j = null; try { j = txt ? JSON.parse(txt) : {}; } catch (e) { j = {}; }
        if (!r.ok) { var e = new Error((j && j.error && j.error.message) || ("HTTP " + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  VSP.fs = {
    list: function (coll, extra) {
      return call("GET", BASE + "/" + coll + "?pageSize=300" + (extra || "")).then(function (r) { return (r.documents || []).map(VSP.fsDoc); });
    },
    get: function (path, extra) {
      return call("GET", BASE + "/" + path + (extra || "")).then(VSP.fsDoc, function (e) { if (e.status === 404) return null; throw e; });
    },
    /** Creates with an automatic id; returns the id. */
    add: function (coll, data) { return call("POST", BASE + "/" + coll, { fields: toFields(data) }).then(function (d) { return d.name.split("/").pop(); }); },
    /** Creates or replaces the whole document. */
    set: function (path, data) { return call("PATCH", BASE + "/" + path, { fields: toFields(data) }); },
    /** Changes only the fields given. */
    update: function (path, data) {
      var mask = Object.keys(data).map(function (k) { return "updateMask.fieldPaths=" + encodeURIComponent(k); }).join("&");
      return call("PATCH", BASE + "/" + path + "?" + mask, { fields: toFields(data) });
    },
    del: function (path) { return call("DELETE", BASE + "/" + path).catch(function (e) { if (e.status !== 404) throw e; }); },
    /** runQuery at the root, or under the document [parent] (e.g. "equips/3631" for its subcollections). */
    query: function (structuredQuery, parent) {
      return call("POST", BASE + (parent ? "/" + parent : "") + ":runQuery", { structuredQuery: structuredQuery }).then(function (rows) {
        return (rows || []).filter(function (x) { return x.document; }).map(function (x) { return VSP.fsDoc(x.document); });
      });
    },
    /**
     * Several writes, all or none (the rules see them together: getAfter). Each write:
     * {create: path, data} (fails if it exists) or {update: path, data} (only those fields, must exist).
     */
    commit: function (writes) {
      var prefix = "projects/" + VSP.FIREBASE_PROJECT + "/databases/(default)/documents/";
      return call("POST", BASE + ":commit", { writes: writes.map(function (w) {
        if (w.create) return { update: { name: prefix + w.create, fields: toFields(w.data) }, currentDocument: { exists: false } };
        return { update: { name: prefix + w.update, fields: toFields(w.data) }, updateMask: { fieldPaths: Object.keys(w.data) }, currentDocument: { exists: true } };
      }) });
    },
    /** Several documents by path, only the fields of [mask]. */
    batchGet: function (paths, mask) {
      var prefix = "projects/" + VSP.FIREBASE_PROJECT + "/databases/(default)/documents/";
      var body = { documents: paths.map(function (p) { return prefix + p; }) };
      if (mask) body.mask = { fieldPaths: mask };
      return call("POST", BASE + ":batchGet", body).then(function (rows) {
        return (rows || []).filter(function (x) { return x.found; }).map(function (x) { return VSP.fsDoc(x.found); });
      });
    }
  };
  /** Error text for the user (in the chosen language). */
  VSP.errText = function (e) {
    if (!e) return "";
    if (e.status === 403) return VSP.t("err.403");
    if (e.status === 404) return VSP.t("err.404");
    if (e instanceof TypeError || /fetch|network/i.test(e.message || "")) return VSP.t("err.network");
    return VSP.t("err.other", e.message || e);
  };
  /** Big base64 blobs (photos, PDF) by id. */
  VSP.blob = function (path, field) {
    return call("GET", BASE + "/" + path + "?mask.fieldPaths=" + field).then(function (d) {
      return d.fields && d.fields[field] ? d.fields[field].stringValue : null;
    });
  };

  // ---------- remote switches (config/app, admin/RemoteConfig.kt)
  VSP.config = { off: [], message: "", level: "info" };
  VSP.featureOn = function (key) { return VSP.config.off.indexOf(key) < 0; };
  VSP.parseConfig = function (o) {
    if (!o) return { off: [], message: "", level: "info" };
    return {
      off: (Array.isArray(o.desactivades) ? o.desactivades : []).map(function (s) { return String(s).trim(); }).filter(Boolean),
      message: String(o.missatge || "").trim().slice(0, 300),
      level: o.nivell === "avis" ? "avis" : "info"
    };
  };

  // ---------- 📊 anonymous statistics (js/stats.js): the last day each part of the web was used, only if they are on.
  // Same section ids as the app (stats/UsageExtras.kt). Kept in this browser; sent at most once a day.
  VSP.STATS_SECTIONS = ["inici", "equips", "agenda", "club", "avisos", "directe", "marcador", "jocs", "pili", "galeria", "cotxes", "editors"];
  VSP.statsTouch = function (sec) {
    if (VSP.store("stats") !== "1" || VSP.STATS_SECTIONS.indexOf(sec) < 0) return;
    var m = {}; try { m = JSON.parse(VSP.store("stats_sec") || "{}") || {}; } catch (e) { m = {}; }
    var d = VSP.isoDay(new Date());
    if (m[sec] !== d) { m[sec] = d; VSP.store("stats_sec", JSON.stringify(m)); }
  };
  /** Page of the web -> section. Pure. */
  VSP.statsSectionOf = function (name) {
    if (VSP.STATS_SECTIONS.indexOf(name) >= 0) return name;
    return { equip: "equips", partit: "agenda", galeria: "galeria", album: "galeria", proposa: "galeria", benvinguda: "inici" }[name] ||
      (VSP.pages[name] ? "club" : null);
  };

  // ---------- tabs and pages (hash router: #equips, #inici, #agenda, #club, #<page>/<arg>)
  VSP.TABS = ["inici", "equips", "agenda", "club"];
  VSP.pages = {};
  VSP.currentTab = null;
  function showTab(tab) {
    VSP.each("[data-tab]", function (el) { el.hidden = el.getAttribute("data-tab") !== tab; });
    VSP.each("nav.tabs button", function (b) {
      var on = b.getAttribute("data-go") === tab; b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    VSP.currentTab = tab; VSP.store("tab", tab);
  }
  VSP.route = function () {
    var h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    var page = $("page");
    var name = h.split("/")[0], arg = h.slice(name.length + 1);
    if (VSP.pages[name]) {
      VSP.statsTouch(VSP.statsSectionOf(name));
      VSP.each("[data-tab]", function (el) { el.hidden = true; });
      page.hidden = false;
      page.innerHTML = '<div class="page-head"><button class="back" id="page-back" aria-label="' + esc(VSP.t("common.back")) + '">←</button><h2 id="page-title"></h2></div><div id="page-body"><div class="empty">' + esc(VSP.t("common.loading")) + "</div></div>";
      $("page-back").onclick = VSP.back;
      VSP.each("nav.tabs button", function (b) { b.classList.toggle("on", b.getAttribute("data-go") === VSP.pages[name].tab); });
      window.scrollTo(0, 0);
      VSP.loaded.then(function () {
        if (decodeURIComponent((location.hash || "").replace(/^#/, "")) !== h) return;
        try { VSP.pages[name].render(arg, $("page-body"), function (t) { $("page-title").textContent = t; document.title = t + " · Vòlei Santpedor"; }); }
        catch (e) { $("page-body").innerHTML = '<div class="empty">' + esc(VSP.errText(e)) + "</div>"; if (window.console) console.error(e); }
      });
      return;
    }
    page.hidden = true; page.innerHTML = "";
    document.title = "Club Vòlei Santpedor";
    // no tab in the address: the last one used, or Inici when opening the web (⚙️ Preferències › start_tab)
    var first = VSP.currentTab === null && VSP.store("start_tab") === "inici";
    var tab = VSP.TABS.indexOf(h) >= 0 ? h : first ? "inici" : (VSP.store("tab") || "inici");
    if (VSP.TABS.indexOf(tab) < 0) tab = "inici";
    var changed = tab !== VSP.currentTab;
    showTab(tab);
    VSP.statsTouch(tab);
    if (changed) window.scrollTo(0, 0);
  };
  var inAppNav = 0;
  VSP.go = function (hash) { inAppNav++; location.hash = hash; };
  VSP.back = function () {
    if (inAppNav > 0) { inAppNav--; history.back(); }
    else { var p = (location.hash || "").replace(/^#/, "").split("/")[0]; location.hash = (VSP.pages[p] && VSP.pages[p].tab) || VSP.currentTab || "inici"; }
  };
  /** Links inside the app: <a data-go="#equip/3629">. */
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("[data-href]");
    if (a) { ev.preventDefault(); VSP.go(a.getAttribute("data-href")); }
  });
  window.addEventListener("hashchange", VSP.route);

  // ---------- data: everything the club publishes from the app (cached for offline use)
  VSP.data = {};
  // plantilles are not here: minors' names are only for approved members (member.js loadSquads)
  var COLLS = ["avisos", "activitats", "amistosos", "horaris", "resultats", "agenda", "convocatories", "albums", "comandes"];
  function web(file, key) {
    return VSP.getJson("club/" + file + "?t=" + Date.now()).then(function (r) { return r[key] || []; }).catch(function () { return []; });
  }
  function merge(a, b) {
    var seen = {}, out = [];
    a.concat(b).forEach(function (o) { var k = o.id || JSON.stringify(o); if (!seen[k]) { seen[k] = 1; out.push(o); } });
    return out;
  }
  VSP.load = function () {
    var fsAll = Promise.all(COLLS.map(function (c) {
      return VSP.fs.list(c).then(function (l) { return { ok: true, l: l }; }, function () { return { ok: false, l: [] }; });
    })).then(function (rs) {
      return VSP.fs.get("config/app").catch(function () { return undefined; }).then(function (cfg) { return { rs: rs, cfg: cfg }; });
    }).catch(function () { return null; });
    return Promise.all([web("avisos.json", "avisos"), web("activitats.json", "activitats"), web("amistosos.json", "partits"),
      web("horaris.json", "equips"), web("galeria.json", "albums"), fsAll]).then(function (r) {
      var cached = VSP.storeJson("cache_data", undefined, null);
      var fsr = r[5], d = {}, online = !!(fsr && fsr.rs.some(function (x) { return x.ok; }));
      COLLS.forEach(function (c, i) {
        d[c] = online ? fsr.rs[i].l : ((cached && cached.d && cached.d[c]) || []);
        if (online && !fsr.rs[i].ok && cached && cached.d && cached.d[c]) d[c] = cached.d[c];
      });
      var cfg = online ? (fsr.cfg === undefined ? (cached && cached.cfg) : fsr.cfg) : (cached && cached.cfg);
      if (online) { try { VSP.storeJson("cache_data", { t: Date.now(), d: d, cfg: cfg || null }); } catch (e) {} }
      VSP.offline = !online;
      VSP.cachedAt = !online && cached ? cached.t : null;
      VSP.config = VSP.parseConfig(cfg);
      VSP.data = {
        avisos: merge(r[0], d.avisos), activitats: merge(r[1], d.activitats), amistosos: merge(r[2], d.amistosos),
        horarisWeb: r[3], horaris: d.horaris, resultats: d.resultats, agenda: d.agenda, convocatories: d.convocatories,
        plantilles: (VSP.data && VSP.data.plantilles) || [], albums: d.albums, albumsWeb: r[4], comandes: d.comandes
      };
      return VSP.data;
    });
  };
})();
