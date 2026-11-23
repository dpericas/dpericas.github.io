/* El camí de la Pili (web) — the secret room (7 taps on the crest of the hub) and the secret path.
 * Port of extras/SecretRoom.kt (SecretLogic, SecretStore, ClubCodes, SecretRoomScreen) and
 * extras/SecretPath.kt (SecretGame, SecretPathLogic, SecretPath.finish) of the Android app:
 *   - the weekly secret challenge: an action game with a twist (turbo, mirror or night), the same
 *     game and seed for everybody during an ISO week (same week / seed formulas as the app);
 *   - club codes (Firestore codis/{CODE}, published by the board): a special sticker each;
 *   - secret statistics (local) and the secret rankings (jocs/{uid}: sec + sec_set, runner, s);
 *   - the secret path: 12 games, one per club team; 2 ⭐ open the next one; the bests go to the
 *     leaderboard document as the map "s" (field -> best), capped as the Firestore rules want.
 * Local storage: localStorage "jocs_sec_*" and "jocs_sp" (bests of the secret path).
 * Routes (hub.js): #sala (the room) · #setmanal (the weekly challenge) · #secret=<field> (a path game).
 */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  var VSP = window.VSP, P = VSPG.progress;
  var t = VSPG.t || function (k) { return k; };
  var S = VSPG.secret = {};

  // ---------------------------------------------------------------- pure rules (SecretLogic)

  /** Highest believable scores (the Firestore rules refuse more). */
  S.WEEKLY_CAP = 1000;
  S.RUNNER_CAP = 2000;
  /** Taps on the crest that open the room (FunLogic.CREST_TAPS) and the time between two of them. */
  S.CREST_TAPS = 7;
  S.TAP_GAP_MS = 1500;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function floorMod(a, n) { return ((a % n) + n) % n; }
  /** Weeks since a Monday: floorDiv(epochDay + 3, 7) (1970-01-01 was a Thursday). */
  S.weekIndex = function (iso) { return Math.floor((P.epochDay(iso || P.today()) + 3) / 7); };
  /** "2026-W48": the week of the secret challenge (ISO weeks, Monday to Sunday; IsoFields of java.time). */
  S.week = function (iso) {
    var day = P.epochDay(iso || P.today());
    var dow = floorMod(day + 3, 7) + 1;              // 1 = Monday … 7 = Sunday
    var thursday = day - (dow - 1) + 3;               // the ISO year is the year of the week's Thursday
    var th = new Date(thursday * 86400000), year = th.getUTCFullYear();
    var jan1 = Math.round(Date.UTC(year, 0, 1) / 86400000);
    return year + "-W" + pad(Math.floor((thursday - jan1) / 7) + 1);
  };
  /** The twists of the weekly challenge, in the app's order. */
  S.TWISTS = ["TURBO", "MIRALL", "NIT"];
  /** This week's challenge {game, variant}: the same for everybody (SecretLogic.challenge). */
  S.challenge = function (iso) {
    var i = S.weekIndex(iso);
    return { game: P.ACTION[floorMod(i * 3 + 1, P.ACTION.length)], variant: S.TWISTS[floorMod(i, S.TWISTS.length)] };
  };
  S.seed = function (iso) { return S.weekIndex(iso) * 104729 + 77; };

  /** Club codes: letters and digits, 4 to 16 ("pili-2026" → "PILI2026"); null if not one. */
  S.normalizeCode = function (input) {
    var up = String(input == null ? "" : input).toUpperCase(), c = "";
    for (var i = 0; i < up.length; i++) { var ch = up.charAt(i); if ((ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9")) c += ch; }
    return c.length >= 4 && c.length <= 16 ? c : null;
  };
  /** Stickers a club code can give (special ones: only by code). */
  S.CODE_PRIZES = ["codi_pavello", "codi_xarxes", "codi_derbi", "codi_gala", "codi_festa", "codi_campions"];

  function cmpStr(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function rankSort(a, b) { return (b.score - a.score) || cmpStr(a.updated, b.updated) || cmpStr(a.name.toLowerCase(), b.name.toLowerCase()); }
  function entry(d, v, cap) {
    var name = typeof d.nom === "string" ? P.cleanNick(d.nom) : "";
    var score = typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(cap, Math.trunc(v))) : 0;
    if (typeof d.id !== "string" || name.length < P.MIN_NICK || score <= 0) return null;
    return { uid: d.id, name: name, score: score, updated: typeof d.updated === "string" ? d.updated : "" };
  }
  /** Ranking of [field] (sec / runner); [week] = only the documents of this week (sec_set). */
  S.rank = function (docs, field, cap, week) {
    return (docs || []).map(function (d) {
      if (week != null && d.sec_set !== week) return null;
      return entry(d, d[field], cap);
    }).filter(Boolean).sort(rankSort);
  };
  /** The hour with most games played ("hora_N" counters), or null (the first one on a tie). */
  S.favouriteHour = function (counts) {
    var best = null, n = 0;
    for (var h = 0; h < 24; h++) { var c = (counts && counts[P.hourKey(h)]) || 0; if (c > 0 && c > n) { n = c; best = h; } }
    return best;
  };

  // ---------------------------------------------------------------- the secret path (SecretGame, SecretPathLogic)

  /**
   * The 12 stages, from the youngest team to Màsters. field: NEVER renamed (phones and Firestore);
   * module: the web game that plays it (a normal game with its twist, api.mode.secret = field, or a
   * new game "sg_*"); base: the normal game it is a version of.
   */
  function sg(field, team, emoji, thresholds, cap, module, base) {
    return { field: field, team: team, emoji: emoji, thresholds: thresholds, cap: cap, module: module, base: base || null,
      title: t("sp." + field), help: t("sp.help." + field), gesture: t("sp.g." + field), cromoId: "sec_" + field };
  }
  S.GAMES = [
    sg("runner", -2, "🏃", [5, 10, 20, 35, 55], 2000, "sg_runner"),
    sg("malabars", -1, "🤹", [5, 12, 20, 32, 50], 600, "toquets", "toquets"),
    sg("ritme", 6731, "🥁", [10, 25, 45, 70, 100], 1000, "sg_ritme"),
    sg("cegues", 3634, "🙈", [4, 9, 15, 24, 36], 450, "recepcio", "recepcio"),
    sg("memoria_gran", 4916, "🃏", [200, 400, 600, 800, 1000], 1500, "memoria", "memoria"),
    sg("vent", 3632, "🌬️", [4, 9, 15, 24, 36], 450, "servei", "servei"),
    sg("senyals", 3633, "🟨", [5, 10, 15, 20, 30], 500, "sg_senyals"),
    sg("trenca", 3630, "🧱", [15, 35, 60, 90, 130], 2000, "sg_trenca"),
    sg("libero", 3631, "🦸", [5, 10, 18, 28, 40], 500, "sg_libero"),
    sg("triple", 4578, "🚧", [4, 9, 15, 24, 36], 450, "rematada", "rematada"),
    sg("forat", 3629, "🧠", [5, 10, 18, 28, 40], 500, "sg_forat"),
    sg("llegenda", -3, "👑", [1, 2, 3, 4, 5], 60, "platja", "platja")
  ];
  S.OPEN_STARS = 2;
  S.MAX_STARS = 5;
  S.FIELDS = S.GAMES.map(function (g) { return g.field; });
  S.game = function (field) { for (var i = 0; i < S.GAMES.length; i++) if (S.GAMES[i].field === field) return S.GAMES[i]; return null; };
  function sgOf(g) { return typeof g === "string" ? S.game(g) : g; }
  S.teamName = function (g) { var x = VSP.team(sgOf(g).team); return x ? x.name : ""; };
  /** [v] clamped to 0..cap of the secret game [field]. */
  S.cap = function (field, v) { var g = S.game(field); v = Math.floor(Number(v) || 0); return Math.max(0, Math.min(g ? g.cap : 0, v)); };
  S.stars = function (g, best) { g = sgOf(g); best = Number(best) || 0; return g.thresholds.filter(function (x) { return best >= x; }).length; };
  function bestOf(bests, g) { return (bests && bests[g.field]) || 0; }
  /** A stage opens when the previous one has OPEN_STARS stars. bests: {field: best}. */
  S.open = function (g, bests) {
    g = sgOf(g);
    var i = S.GAMES.indexOf(g);
    return i === 0 || (i > 0 && S.stars(S.GAMES[i - 1], bestOf(bests, S.GAMES[i - 1])) >= S.OPEN_STARS);
  };
  S.totalStars = function (bests) { return S.GAMES.reduce(function (s, g) { return s + S.stars(g, bestOf(bests, g)); }, 0); };
  S.maxStars = function () { return S.GAMES.length * S.MAX_STARS; };
  /** Every stage has OPEN_STARS stars: the path is done (Pili Llegenda). */
  S.done = function (bests) { return S.GAMES.every(function (g) { return S.stars(g, bestOf(bests, g)) >= S.OPEN_STARS; }); };
  S.gold = function (bests) { return S.GAMES.every(function (g) { return S.stars(g, bestOf(bests, g)) >= S.MAX_STARS; }); };
  /** Leaderboard map "s": only games with a score, capped (whole numbers: the rules want int). */
  S.upload = function (bests) {
    var out = {};
    S.GAMES.forEach(function (g) { var v = Math.floor(Number(bestOf(bests, g)) || 0); if (v > 0) out[g.field] = Math.min(g.cap, v); });
    return out;
  };
  /** Ranking of a secret game (leaderboard map "s"), best first. */
  S.rankPath = function (docs, g) {
    g = sgOf(g);
    return (docs || []).map(function (d) {
      var m = d.s && typeof d.s === "object" ? d.s : {};
      return entry(d, m[g.field], g.cap);
    }).filter(Boolean).sort(rankSort);
  };
  /**
   * The Pili's run: the path's "runner", or the document's "runner" (the run of the secret room,
   * uploaded too) when that one is higher.
   */
  S.rankRunner = function (docs) {
    return (docs || []).map(function (d) {
      var a = d.s && typeof d.s === "object" && typeof d.s.runner === "number" ? d.s.runner : 0;
      var b = typeof d.runner === "number" ? d.runner : 0;
      return entry(d, Math.max(a, b), S.RUNNER_CAP);
    }).filter(Boolean).sort(rankSort);
  };

  // ---------------------------------------------------------------- storage (SecretStore, SecretPath)

  var get = P._get, set = P._set;
  function strList(a) { return Array.isArray(a) ? a.filter(function (x) { return typeof x === "string" && x; }) : []; }
  function num(v) { v = Math.floor(Number(v) || 0); return v > 0 ? v : 0; }

  /** Date the secret was found ("YYYY-MM-DD"), or null. */
  S.found = function () { var f = get("sec_found", null); return typeof f === "string" && P.validDay(f) ? f : null; };
  /** First time in the secret room: the medal and the exclusive sticker. True if it was the first time. */
  S.discover = function (today) {
    if (S.found()) return false;
    set("sec_found", today || P.today());
    var c = P.special("escut_secret");
    if (c) P.addCromo(c);
    P.bump(P.COUNTER.SECRET_DOOR);   // the medal
    P.markPending();
    P.sync.pushAsync();
    VSPG.emit("progress");
    return true;
  };

  function weekState() { var w = get("sec_week", {}) || {}; return { week: typeof w.week === "string" ? w.week : null, best: num(w.best) }; }
  S.weeklyBest = function (today) { var w = weekState(); return w.week === S.week(today) ? Math.min(S.WEEKLY_CAP, w.best) : 0; };
  /** A weekly challenge game; true if it is this week's best. */
  S.weeklyScore = function (score, today) {
    var s = Math.max(0, Math.min(S.WEEKLY_CAP, Math.floor(Number(score) || 0)));
    if (s <= S.weeklyBest(today)) return false;
    set("sec_week", { week: S.week(today), best: s });
    P.markPending();
    return true;
  };

  S.runnerBest = function () { return Math.min(S.RUNNER_CAP, num(get("sec_runner", 0))); };
  /** A run of the Pili; a record goes to the secret ranking. */
  S.runnerScore = function (score) {
    var s = Math.max(0, Math.min(S.RUNNER_CAP, Math.floor(Number(score) || 0)));
    if (s <= S.runnerBest()) return false;
    set("sec_runner", s);
    P.markPending();
    return true;
  };

  /** For the leaderboard document (jocs/{uid}): sec + sec_set (this week), runner and the map "s". */
  S.uploadFields = function (today) {
    var out = {}, w = S.weeklyBest(today), r = S.runnerBest();
    if (w > 0) { out.sec = w; out.sec_set = S.week(today); }
    if (r > 0) out.runner = r;
    return out;
  };
  S.boardFields = function (today) {
    var out = S.uploadFields(today), m = S.upload(S.bests());
    if (Object.keys(m).length) out.s = m;
    return out;
  };

  S.redeemed = function () { return strList(get("sec_codes", [])); };
  S.markRedeemed = function (code) { var l = S.redeemed(); if (l.indexOf(code) < 0) l.push(code); set("sec_codes", l); };

  /** Days the games page was opened (once a day; hub start) and the first one (the "days with the games"). */
  S.recordOpen = function (today) {
    today = today || P.today();
    var o = get("sec_open", {}) || {};
    if (o.last === today) return;
    set("sec_open", { last: today, days: num(o.days) + 1, first: typeof o.first === "string" && P.validDay(o.first) ? o.first : today });
  };
  S.openDays = function () { return num((get("sec_open", {}) || {}).days); };
  S.firstDay = function () { var f = (get("sec_open", {}) || {}).first; return typeof f === "string" && P.validDay(f) ? f : null; };

  /** Bests of the secret path {field: best} (localStorage "jocs_sp"). */
  S.bests = function () {
    var raw = get("sp", {}) || {}, out = {};
    S.GAMES.forEach(function (g) { out[g.field] = Math.min(g.cap, num(raw[g.field])); });
    return out;
  };
  S.best = function (field) { return S.bests()[field] || 0; };

  /**
   * A finished secret game (SecretPath.finish): record, stars, the team's sticker at the first star,
   * the Pili Llegenda (all stages open) and the medals. The hard Pili's run also goes to the secret
   * ranking (runner). Returns the result for the game over panel (as P.finish) with secret = field
   * and secretOpened = the stages it opened. opts (tests): {hour}.
   */
  S.finish = function (field, score, opts) {
    opts = opts || {};
    var g = S.game(field);
    if (!g) throw new Error("secret game " + field);
    var s = S.cap(field, score);
    if (field === "runner") S.runnerScore(s);
    var before = S.bests();
    var record = s > (before[field] || 0);
    if (record) { var raw = get("sp", {}) || {}; raw[field] = s; set("sp", raw); }
    var after = S.bests();
    var oldStars = S.stars(g, before[field] || 0);
    var newStars = Math.max(0, S.stars(g, after[field] || 0) - oldStars);
    var C = P.COUNTER;
    P.inc(C.GAMES);
    P.inc(P.hourKey(opts.hour != null ? opts.hour : P.now().getHours()));
    var cromos = [];
    if (oldStars === 0 && newStars > 0) { var c = P.special(g.cromoId); if (c) { P.addCromo(c); cromos.push(c); } }
    if (S.done(after) && P.count(C.SECRET_PATH) === 0) P.inc(C.SECRET_PATH);
    if (S.gold(after) && P.count(C.SECRET_GOLD) === 0) P.inc(C.SECRET_GOLD);
    var medals = P.checkMedals();
    if (record || newStars > 0 || cromos.length) P.markPending();
    var opened = S.GAMES.filter(function (x) { return !S.open(x, before) && S.open(x, after); }).map(function (x) { return x.field; });
    var r = { game: g.base || g.module, secret: field, score: s, record: record, newStars: newStars, stars: S.stars(g, after[field] || 0),
      medals: medals, cromos: cromos, opened: [], secretOpened: opened, dailyBest: false };
    P.last = r;
    P.sync.pushAsync();
    VSPG.emit("progress");
    return r;
  };

  // ---------------------------------------------------------------- club codes (ClubCodes.redeem)

  /**
   * Redeems a club code: resolves {cromo} (the prize, already in the album) or {error: i18n key}.
   * Only reads codis/{CODE} (the rules let anybody signed in get one code, never list them).
   */
  S.redeem = function (input) {
    var code = S.normalizeCode(input);
    if (!code) return Promise.resolve({ error: "sec.code_bad" });
    if (S.redeemed().indexOf(code) >= 0) return Promise.resolve({ error: "sec.code_already" });
    return VSP.fs.get("codis/" + code).then(function (doc) {
      if (!doc) return { error: "sec.code_missing" };
      var until = Number(doc.expira) || 0;
      if (until < Date.now()) return { error: "sec.code_expired" };
      var cromo = typeof doc.premi === "string" ? P.special(doc.premi) : null;
      if (!cromo) return { error: "sec.code_missing" };
      P.addCromo(cromo);
      S.markRedeemed(code);
      P.bump(P.COUNTER.CLUB_CODES);
      P.markPending();
      P.sync.pushAsync();
      VSPG.emit("progress");
      return { cromo: cromo };
    }, function (e) {
      // codis/{code} is readable by anybody signed in: a 403 here means a broken session, not a missing code
      return { error: e && e.status === 404 ? "sec.code_missing" : "sec.code_offline" };
    });
  };

  // ---------------------------------------------------------------- the room (SecretRoomScreen)

  var esc = function (s) { return VSP.esc(s); };
  var rankState = null;   // {loading, docs, uid, error, waiters} while the room is shown
  var rankTab = "setmana";
  var codeMsg = null;     // {text, bad}

  function starStr(n) { var s = ""; for (var i = 0; i < S.MAX_STARS; i++) s += i < n ? "★" : "☆"; return s; }
  function card(emoji, title, body, cls) {
    return '<section class="jg-scard' + (cls ? " " + cls : "") + '"><h2>' + emoji + " " + esc(title) + "</h2>" + body + "</section>";
  }

  function weeklyHtml(today) {
    var ch = S.challenge(today), v = P.variant(ch.variant);
    return card("🗝️", t("sec.weekly_title"),
      "<p>" + esc(t("sec.weekly_text", P.title(ch.game), v.emoji + " " + v.title)) + "</p>" +
      '<p class="jg-acc"><b>' + esc(t("sec.best", S.weeklyBest(today))) + "</b></p>" +
      '<button type="button" class="jg-btn primary" id="jg-sec-weekly">' + esc(t("sec.play")) + "</button>");
  }

  function pathHtml() {
    var bests = S.bests();
    var rows = S.GAMES.map(function (g, i) {
      var open = S.open(g, bests), st = S.stars(g, bests[g.field] || 0);
      return '<button type="button" class="jg-sgrow' + (open ? "" : " locked") + '" data-sg="' + g.field + '"' + (open ? "" : " disabled") + ">" +
        '<span class="jg-emoji" aria-hidden="true">' + (open ? g.emoji : "🔒") + "</span>" +
        '<span class="jg-cmain"><span class="jg-steam">' + esc(S.teamName(g)) + "</span><b>" + esc(g.title) + "</b>" +
        (open ? "" : '<span class="jg-lock">' + esc(t("sec.locked", S.GAMES[i - 1].title)) + "</span>") + "</span>" +
        '<span class="jg-sstars" aria-label="' + esc(t("hub.stars_aria", st)) + '">' + starStr(st) + "</span>" +
        (open && bests[g.field] > 0 ? '<span class="jg-cbest"><b>' + bests[g.field] + "</b><small>" + esc(t("hub.record")) + "</small></span>" : "") +
        "</button>";
    }).join("");
    return card("🗺️", t("sec.path_title"), '<p class="jg-small">' + esc(t("sec.path_intro", S.totalStars(bests), S.maxStars())) + "</p>" + rows);
  }

  function rankingHtml() {
    var tabs = [["setmana", "🗝️ " + t("sec.weekly_title")]].concat(S.GAMES.map(function (g) { return [g.field, g.emoji + " " + g.title]; }));
    return card("🏆", t("sec.ranking_title"),
      (P.nickname() ? "" : '<p class="jg-small">' + esc(t("sec.need_nick")) + "</p>") +
      '<div class="jg-tabs" role="tablist">' + tabs.map(function (x) {
        return '<button type="button" role="tab" class="jg-tab' + (x[0] === rankTab ? " on" : "") + '" aria-selected="' + (x[0] === rankTab) + '" data-stab="' + x[0] + '">' + esc(x[1]) + "</button>";
      }).join("") + '</div><div id="jg-sec-rank"></div>');
  }

  function codesHtml() {
    return card("🔑", t("sec.codes_title"),
      "<p>" + esc(t("sec.codes_text")) + "</p>" +
      '<div class="jg-row"><input class="jg-input grow" id="jg-sec-code" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="' +
      esc(t("sec.code_label")) + '" aria-label="' + esc(t("sec.code_label")) + '">' +
      '<button type="button" class="jg-btn primary" id="jg-sec-redeem" disabled>' + esc(t("sec.code_go")) + "</button></div>" +
      '<p class="jg-msg' + (codeMsg && codeMsg.bad ? " bad" : "") + '" id="jg-sec-code-msg" role="status" aria-live="polite">' + (codeMsg ? esc(codeMsg.text) : "") + "</p>");
  }

  /** The secret statistics (only in this browser; the counters also come with a progress code). */
  S.stats = function (today) {
    today = today || P.today();
    var first = S.firstDay() || today, counters = P.counters();
    var hour = S.favouriteHour(counters);
    return [
      ["📅", t("sec.st_days", Math.max(1, P.epochDay(today) - P.epochDay(first) + 1))],
      ["📲", t("sec.st_opened", S.openDays())],
      ["🎮", t("sec.st_games", counters[P.COUNTER.GAMES] || 0)],
      ["🕒", hour === null ? t("sec.st_hour_none") : t("sec.st_hour", hour)],
      ["⭐", t("sec.st_stars", P.totalStars(P.bests()))],
      ["🃏", t("sec.st_cromos", Object.keys(P.album()).length)],
      ["🏅", t("sec.st_medals", P.medals().length)],
      ["📡", t("sec.st_lives", counters[P.COUNTER.LIVES_FOLLOWED] || 0)],
      ["👏", t("sec.st_claps", counters[P.COUNTER.CLAPS] || 0, counters[P.COUNTER.DRUMS] || 0)],
      ["🛡️", t("sec.st_found", S.found() || "—")]
    ];
  };
  function statsHtml(today) {
    return card("📊", t("sec.stats_title"), S.stats(today).map(function (x) {
      return '<p class="jg-sstat"><span aria-hidden="true">' + x[0] + "</span> " + esc(x[1]) + "</p>";
    }).join("") + '<p class="jg-small">' + esc(t("sec.stats_note")) + "</p>");
  }

  function showRank() {
    var box = VSP.$("jg-sec-rank");
    if (!box || !rankState) return;
    var hub = VSPG.hub;
    if (!P.rankingOn()) { box.innerHTML = '<p class="jg-empty">' + esc(t("rank.off")) + "</p>"; return; }
    if (rankState.loading) { box.innerHTML = '<div class="jg-center"><div class="jg-spinner" aria-label="' + esc(t("rank.loading")) + '"></div></div>'; return; }
    if (rankState.error) {
      box.innerHTML = '<div class="jg-center"><p>' + esc(t("rank.offline")) + '</p><button type="button" class="jg-btn primary" id="jg-sec-retry">' +
        esc(t("rank.retry")) + "</button></div>";
      VSP.$("jg-sec-retry").onclick = function () { rankState = null; loadRank(); };
      return;
    }
    var docs = rankState.docs, ranked;
    if (rankTab === "setmana") ranked = S.rank(docs, "sec", S.WEEKLY_CAP, S.week(P.today()));
    else if (rankTab === "runner") ranked = S.rankRunner(docs);
    else ranked = S.rankPath(docs, rankTab);
    box.innerHTML = hub.rankList(ranked, rankState.uid, t("sec.ranking_empty"));
    var ep = box.querySelector(".jg-empty-pili");
    if (ep) VSPG.piliWidget(ep, 90, { mood: "wink", style: "champion", prop: "crown" });
  }
  function loadRank() {
    if (rankState) { showRank(); return; }
    if (!P.rankingOn()) { rankState = { docs: [] }; showRank(); return; }
    var mine = rankState = { loading: true };
    showRank();
    P.board.load().then(function (r) { mine.docs = r.docs; mine.uid = r.uid; }, function () { mine.error = true; mine.docs = []; })
      .then(function () { mine.loading = false; if (rankState === mine) showRank(); });
  }

  /** Renders the room in [root] (hub.js routes #sala here). [fresh]: entering (not a re-render). */
  S.renderRoom = function (root, fresh) {
    var hub = VSPG.hub, today = P.today();
    if (fresh) { rankState = null; codeMsg = null; }
    var justFound = fresh ? S.discover(today) : false;
    var body = hub.page(t("sec.title"),
      '<div class="jg-hero"><div class="jg-hero-pili" id="jg-sec-pili"></div><p>' + esc(t("sec.intro")) + "</p></div>" +
      weeklyHtml(today) + pathHtml() + rankingHtml() + codesHtml() + statsHtml(today) +
      '<button type="button" class="jg-btn outline wide big" id="jg-sec-games">🎮 ' + esc(t("sec.all_games")) + "</button>");
    var page = root.querySelector(".jg-page");
    if (page) page.classList.add("jg-secret");
    VSPG.piliWidget(VSP.$("jg-sec-pili"), 110, { mood: "wink", style: "champion", prop: "crown" });
    VSP.$("jg-sec-weekly").onclick = function () { hub.go("setmanal"); };
    VSP.each("[data-sg]", function (b) { b.onclick = function () { hub.go("secret=" + b.getAttribute("data-sg")); }; }, body);
    VSP.each("[data-stab]", function (b) {
      b.onclick = function () {
        rankTab = b.getAttribute("data-stab");
        VSP.each("[data-stab]", function (x) { var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", String(on)); }, body);
        showRank();
      };
    }, body);
    VSP.$("jg-sec-games").onclick = function () { hub.go(""); };
    bindCodes(root);
    loadRank();
    if (justFound) {
      var d = VSPG.modal(t("sec.found_title"), '<div class="jg-center"><div id="jg-sec-found-pili"></div></div><p>' + esc(t("sec.found_text")) + "</p>",
        [{ text: t("fr.go"), primary: true }]);
      VSPG.piliWidget(d.el.querySelector("#jg-sec-found-pili"), 100, { mood: "cheer", style: "champion", prop: "crown" });
    }
    return body;
  };

  function bindCodes(root) {
    var input = VSP.$("jg-sec-code"), btn = VSP.$("jg-sec-redeem"), busy = false;
    function setMsg(text, bad) {
      codeMsg = text ? { text: text, bad: !!bad } : null;
      var el = VSP.$("jg-sec-code-msg");
      if (el) { el.textContent = text || ""; el.classList.toggle("bad", !!bad); }
    }
    function check() { btn.disabled = busy || S.normalizeCode(input.value) === null; }
    input.oninput = check;
    input.onkeydown = function (e) { if (e.key === "Enter" && !btn.disabled) btn.click(); };
    btn.onclick = function () {
      if (busy) return;
      busy = true; check();
      setMsg(t("sync.wait"), false);
      S.redeem(input.value).then(function (r) {
        busy = false;
        if (r.cromo) {
          codeMsg = { text: t("sec.code_prize", r.cromo.emoji + " " + r.cromo.title), bad: false };
          if (!document.body.contains(btn)) return;
          // the stats and the album changed: draw the room again where it was
          var y = window.pageYOffset; S.renderRoom(root, false); window.scrollTo(0, y);
          return;
        }
        setMsg(t(r.error), true);
        check();
      });
    };
    check();
  }
})();
