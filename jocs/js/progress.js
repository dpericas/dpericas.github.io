/* El camí de la Pili (web) — progression of the club games, port of extras/Progress.kt,
 * GamesLogic.kt (LeaderboardLogic), Leaderboard.kt (GameScores), AlbumCatalog.kt, PetTalk.kt,
 * season/Festivities.kt and ProgressSync.kt of the Android app: the path and the stars, variants,
 * daily challenge, medals, sticker album, the Pili pet, the team league, finish() (what a game
 * gives), the club leaderboard upload (jocs/{uid}) and the progress saved with a code
 * (progres/{code}, docs/jocs_progres.md). Local storage: localStorage keys "jocs_*".
 */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  var VSP = window.VSP;
  var P = VSPG.progress = {};
  /** Texts in the chosen language (jocs/js/i18n.js, loaded before). */
  var t = VSPG.t || function (k) { return k; };

  // ---------------------------------------------------------------- catalogue

  /** The games, in the order of the app's Game enum (ranking tabs). id = Game.field. */
  P.GAMES = [
    { id: "toquets", emoji: "🏐" },
    { id: "recepcio", emoji: "🙌" },
    { id: "bloqueig", emoji: "✋" },
    { id: "quiz", emoji: "🧠" },
    { id: "memoria", emoji: "🃏" },
    { id: "servei", emoji: "🎯" },
    { id: "colocacio", emoji: "🤲" },
    { id: "rematada", emoji: "💥" },
    { id: "platja", emoji: "🏖️" },
    { id: "rotacions", emoji: "🔄" },
    { id: "arbitre", emoji: "🟨" },
    { id: "temporada", emoji: "🎉" }
  ];
  P.GAMES.forEach(function (g) { g.title = t("game." + g.id); });
  P.IDS = P.GAMES.map(function (g) { return g.id; });
  P.game = function (id) { for (var i = 0; i < P.GAMES.length; i++) if (P.GAMES[i].id === id) return P.GAMES[i]; return null; };
  P.title = function (id) { var g = P.game(id); return g ? g.title : id; };

  P.STAGES = [
    { game: "toquets", emoji: "🏐" },
    { game: "recepcio", emoji: "🙌" },
    { game: "servei", emoji: "🎯" },
    { game: "colocacio", emoji: "🤲" },
    { game: "bloqueig", emoji: "✋" },
    { game: "rematada", emoji: "💥" },
    { game: "rotacions", emoji: "🔄" },
    { game: "platja", emoji: "🏖️" }
  ];
  P.STAGES.forEach(function (st) { st.category = t("stage." + st.game); });
  /** Real-time games: they have variants and take turns as the daily challenge. */
  P.ACTION = ["toquets", "recepcio", "servei", "colocacio", "bloqueig", "rematada", "platja"];

  P.VARIANTS = [
    { id: "NORMAL", speed: 1, emoji: "🏐" },
    { id: "NIT", speed: 1, emoji: "🌙" },
    { id: "TURBO", speed: 1.35, emoji: "⚡" },
    { id: "MIRALL", speed: 1, emoji: "🪞" }
  ];
  P.VARIANTS.forEach(function (v) { v.title = t("var." + v.id); });
  P.variant = function (id) { for (var i = 0; i < P.VARIANTS.length; i++) if (P.VARIANTS[i].id === id) return P.VARIANTS[i]; return P.VARIANTS[0]; };

  P.REFEREE_PERFECT = 110;
  var THRESHOLDS = {
    toquets: [8, 15, 25, 40, 60],
    recepcio: [6, 12, 20, 30, 45], servei: [6, 12, 20, 30, 45], colocacio: [6, 12, 20, 30, 45],
    bloqueig: [6, 12, 20, 30, 45], rematada: [6, 12, 20, 30, 45],
    rotacions: [2, 4, 6, 8, 12],
    platja: [1, 2, 3, 4, 6],
    quiz: [40, 80, 120, 150, 180],
    memoria: [200, 350, 500, 600, 700],
    arbitre: [25, 50, 75, 100, P.REFEREE_PERFECT],
    temporada: [5, 10, 20, 35, 50]
  };
  P.MAX_STARS_PER_GAME = 5;
  P.OPEN_STARS = 2;
  P.MIRROR_STARS = 30;
  P.NIGHT_STARS = 3;
  P.MAX_SCORE = 9999;
  P.MIN_NICK = 2;
  P.MAX_NICK = 16;
  P.TOP = 20;

  P.clampScore = function (v) { v = Math.floor(Number(v) || 0); return Math.max(0, Math.min(P.MAX_SCORE, v)); };
  /**
   * Anti-cheat caps per field of the leaderboard document jocs/{uid}: the Firestore rules reject a
   * document above them, so every score is clamped before it is stored or uploaded (same table in the app).
   */
  P.CAPS = {
    toquets: 600, recepcio: 450, servei: 450, colocacio: 450, bloqueig: 450, rematada: 450,
    platja: 60, rotacions: 120, quiz: 200, memoria: 1000, arbitre: 110, temporada: 500,
    diari: 1000, punts: 3000
  };
  /** [v] clamped to 0..cap of [field] (0..MAX_SCORE for a field without a cap). */
  P.cap = function (field, v) {
    v = P.clampScore(v);
    var c = Object.prototype.hasOwnProperty.call(P.CAPS, field) ? P.CAPS[field] : null;
    return c === null ? v : Math.min(c, v);
  };

  // ---------------------------------------------------------------- dates (local calendar day)

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  /** Overridable clock (tests). */
  P.now = function () { return new Date(); };
  P.today = function () { var d = P.now(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  P.nowSec = function () { return Math.floor(P.now().getTime() / 1000); };
  function parseIso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var t = Date.UTC(y, mo - 1, d), back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }
  P.validDay = function (iso) { return parseIso(iso) !== null; };
  /** LocalDate.toEpochDay(). */
  P.epochDay = function (iso) { var p = parseIso(iso); return p ? Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000) : NaN; };
  P.fromEpochDay = function (n) {
    var d = new Date(n * 86400000);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  };
  P.addDays = function (iso, n) { return P.fromEpochDay(P.epochDay(iso) + n); };
  function toIso(date) {
    if (date == null) return P.today();
    if (typeof date === "string") return date.slice(0, 10);
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  // ---------------------------------------------------------------- festivities (season/Festivities.kt)

  P.FESTIVITIES = {
    NADAL: { emojis: ["❄️", "🎄", "⭐", "🎁", "❄️", "🏐"], colors: ["#B71C1C", "#1B5E20"] },
    CARNAVAL: { emojis: ["🎭", "🎉", "🎊", "🤡", "🏐"], colors: ["#6A1B9A", "#F57C00"] },
    PASQUA: { emojis: ["🐰", "🥚", "🐣", "🍫", "🐇", "🏐"], colors: ["#8E24AA", "#FFB300"] },
    SANT_JORDI: { emojis: ["🌹", "📚", "🐉", "🌹", "🏐"], colors: ["#C62828", "#F9A825"] },
    FESTA_MAJOR: { emojis: ["🎉", "🎆", "🎊", "🥁", "🎶", "🏐"], colors: ["#1E8C34", "#C8102E"] },
    SANT_JOAN: { emojis: ["🎆", "🔥", "🎇", "✨", "🏐"], colors: ["#E65100", "#1A237E"] },
    DIADA: { emojis: ["🎗️", "⭐", "🟨", "🟥", "🏐"], colors: ["#FCD116", "#C8102E"] },
    CASTANYADA: { emojis: ["🌰", "🍂", "🍠", "🍁", "🌰", "🏐"], colors: ["#6D4C41", "#EF6C00"] }
  };
  Object.keys(P.FESTIVITIES).forEach(function (k) { P.FESTIVITIES[k].title = t("fest." + k); });
  /** Easter Sunday (anonymous Gregorian algorithm) as "YYYY-MM-DD". */
  P.easter = function (year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31), day = (h + l - 7 * m + 114) % 31 + 1;
    return year + "-" + pad(month) + "-" + pad(day);
  };
  /** [first, last] day of the Festa Major: Thursday before to Monday after the second Sunday of June. */
  P.festaMajor = function (year) {
    var first = new Date(Date.UTC(year, 5, 1)).getUTCDay();          // 0 = Sunday
    var sunday = 1 + ((7 - first) % 7) + 7;
    var iso = year + "-06-" + pad(sunday);
    return [P.addDays(iso, -3), P.addDays(iso, 1)];
  };
  /** Festivities.on(date): the enum name ("NADAL"…) or null. [date]: Date or "YYYY-MM-DD" (default today). */
  VSPG.festivityOn = P.festivityOn = function (date) {
    var iso = toIso(date), p = parseIso(iso);
    if (!p) return null;
    var md = p.m * 100 + p.d, day = P.epochDay(iso), easter = P.epochDay(P.easter(p.y));
    var fm = P.festaMajor(p.y);
    if (md >= 1207 || md <= 107) return "NADAL";
    if (day >= easter - 52 && day <= easter - 46) return "CARNAVAL";
    if (day >= easter - 7 && day <= easter + 1) return "PASQUA";
    if (md === 423) return "SANT_JORDI";
    if (day >= P.epochDay(fm[0]) && day <= P.epochDay(fm[1])) return "FESTA_MAJOR";
    if (md === 623 || md === 624) return "SANT_JOAN";
    if (md === 911) return "DIADA";
    if (md >= 1030 && md <= 1101) return "CASTANYADA";
    return null;
  };

  // ---------------------------------------------------------------- the path and the stars (pure)

  P.thresholds = function (g) { return THRESHOLDS[g] || [Infinity, Infinity, Infinity, Infinity, Infinity]; };
  /** Stars of game [g] with best score [best] (a number) or with the bests map. */
  P.stars = function (g, best) {
    if (best && typeof best === "object") best = best[g] || 0;
    best = Number(best) || 0;
    return P.thresholds(g).filter(function (t) { return best >= t; }).length;
  };
  P.totalStars = function (bests) { return P.IDS.reduce(function (s, g) { return s + P.stars(g, bests || {}); }, 0); };
  P.maxStars = function () { return P.IDS.length * P.MAX_STARS_PER_GAME; };
  P.stageIndex = function (g) { for (var i = 0; i < P.STAGES.length; i++) if (P.STAGES[i].game === g) return i; return -1; };
  P.stageOpen = function (i, bests) { return i <= 0 || P.stars(P.STAGES[i - 1].game, bests) >= P.OPEN_STARS; };
  /** The path stage is open; the referee card needs 2 ⭐ in the quiz; quiz, memory and the seasonal game: always (the seasonal one also depends on the date). */
  P.unlocked = function (g, bests) {
    var i = P.stageIndex(g);
    if (i >= 0) return P.stageOpen(i, bests);
    if (g === "arbitre") return P.stars("quiz", bests) >= P.OPEN_STARS;
    return true;
  };
  /** The game that needs 2 ⭐ to open [g], or null. */
  P.requirement = function (g) {
    var i = P.stageIndex(g);
    if (i > 0) return P.STAGES[i - 1].game;
    if (g === "arbitre") return "quiz";
    return null;
  };
  P.isAction = function (g) { return P.ACTION.indexOf(g) >= 0; };
  P.variantUnlocked = function (v, g, bests) {
    switch (v) {
      case "NORMAL": return true;
      case "NIT": return P.isAction(g) && P.stars(g, bests) >= P.NIGHT_STARS;
      case "TURBO": return P.isAction(g) && P.stars(g, bests) >= P.MAX_STARS_PER_GAME;
      case "MIRALL": return P.isAction(g) && P.totalStars(bests) >= P.MIRROR_STARS;
    }
    return false;
  };
  P.hasVariants = function (g, bests) {
    return P.isAction(g) && P.VARIANTS.some(function (v) { return v.id !== "NORMAL" && P.variantUnlocked(v.id, g, bests); });
  };
  P.newlyOpened = function (before, after) { return P.IDS.filter(function (g) { return !P.unlocked(g, before) && P.unlocked(g, after); }); };
  /** The seasonal game can only be played during a festivity. */
  /** 🎉 6.14: the festivity of [today] (or null) and the next different one with its first day ([name, "YYYY-MM-DD"]). Pure: tested. */
  P.upcomingFestivity = function (today) {
    var now = P.festivityOn(today), next = null;
    for (var i = 1; i < 400 && !next; i++) {
      var d = P.addDays(today, i), f = P.festivityOn(d);
      if (f && f !== now) next = [f, d];
    }
    return { now: now, next: next };
  };
  P.seasonOpen = function (date) { return P.festivityOn(date) !== null; };

  // ---------------------------------------------------------------- daily challenge (pure)

  P.daily = {
    game: function (iso) { var n = P.epochDay(iso || P.today()), k = P.ACTION.length; return P.ACTION[((n % k) + k) % k]; },
    seed: function (iso) { return P.epochDay(iso || P.today()) * 7919 + 2014; },
    /** Days in a row with a daily game, ending today (or yesterday: today can still be played). */
    streak: function (days, today) {
      var set = {}; (days || []).forEach(function (d) { set[d] = 1; });
      var d = set[today] ? today : P.addDays(today, -1), n = 0;
      while (set[d]) { n++; d = P.addDays(d, -1); }
      return n;
    }
  };

  // ---------------------------------------------------------------- counters and medals (pure)

  P.COUNTER = {
    GAMES: "partides", DAILY: "diaris", NIGHT_GAMES: "nit_hora", VARIANT_NIT: "var_nit", VARIANT_TURBO: "var_turbo",
    VARIANT_MIRALL: "var_mirall", LIVES_FOLLOWED: "directes", CLAPS: "aplaudiments", DRUMS: "tabals",
    SEASON_PRIZES: "temporada", PET_FED: "pili_menjar", PET_TICKLES: "pili_pessigolles",
    // the secret room (7 taps on the crest, secret.js / SecretRoom.kt)
    SECRET_DOOR: "escut_secret", CLUB_CODES: "codis_club", WEEKLY: "repte_secret",
    SECRET_PATH: "cami_secret", SECRET_GOLD: "cami_secret_or"
  };
  /** Secret codes of the app's "follow a live match" dialog (LiveEggs): only the app gives them. */
  P.SECRET_CODES = ["codi_santpedor", "codi_ace", "codi_bloc", "codi_2014"];
  /** Games finished at each hour of the day ("hora_0".."hora_23"): the secret statistics. */
  P.hourKey = function (h) { h = Math.floor(Number(h) || 0); return "hora_" + Math.max(0, Math.min(23, h)); };
  var C = P.COUNTER;

  P.MEDALS = [
    { id: "FIRST_STAR", emoji: "⭐", secret: false },
    { id: "STARS_10", emoji: "🌟", secret: false },
    { id: "STARS_25", emoji: "💫", secret: false },
    { id: "STARS_50", emoji: "🌌", secret: false },
    { id: "PATH_DONE", emoji: "🗺️", secret: false },
    { id: "PATH_GOLD", emoji: "🏆", secret: false },
    { id: "DAILY_FIRST", emoji: "📅", secret: false },
    { id: "STREAK_3", emoji: "🔥", secret: false },
    { id: "STREAK_7", emoji: "☄️", secret: false },
    { id: "GAMES_100", emoji: "💯", secret: false },
    { id: "ALBUM_10", emoji: "📒", secret: false },
    { id: "ALBUM_FULL", emoji: "📚", secret: false },
    { id: "PET_5", emoji: "🐣", secret: false },
    { id: "PET_CARE", emoji: "💚", secret: false },
    { id: "QUIZ_TOP", emoji: "🧠", secret: false },
    { id: "REFEREE", emoji: "🟨", secret: false },
    { id: "BEACH", emoji: "🏖️", secret: false },
    { id: "TEAM", emoji: "🤝", secret: false },
    { id: "FAN", emoji: "📡", secret: false },
    { id: "FESTIVE", emoji: "🎉", secret: false },
    { id: "OWL", emoji: "🦉", secret: true },
    { id: "MIRROR", emoji: "🪞", secret: true },
    { id: "TURBO", emoji: "⚡", secret: true },
    { id: "CLAPPER", emoji: "👏", secret: true },
    { id: "DRUMMER", emoji: "🥁", secret: true },
    { id: "FRIEND", emoji: "🍎", secret: true },
    { id: "CODEBREAKER", emoji: "🔐", secret: true },
    { id: "SECRET_DOOR", emoji: "🛡️", secret: true },
    { id: "CLUB_CODE", emoji: "🔑", secret: true },
    { id: "WEEKLY", emoji: "🗝️", secret: true },
    { id: "SECRET_PATH", emoji: "🗺️", secret: true },
    { id: "SECRET_GOLD", emoji: "👑", secret: true }
  ];
  P.MEDALS.forEach(function (m) { m.title = t("medal." + m.id); m.desc = t("medal." + m.id + ".d"); });
  P.medal = function (id) { for (var i = 0; i < P.MEDALS.length; i++) if (P.MEDALS[i].id === id) return P.MEDALS[i]; return null; };
  P.medalOrder = function (id) { for (var i = 0; i < P.MEDALS.length; i++) if (P.MEDALS[i].id === id) return i; return 999; };

  /** Medals.earned(m, stats). stats: { bests, counters, streak, cromos, cromosTotal, petLevel, team }. */
  P.medalEarned = function (m, s) {
    var bests = s.bests || {}, stars = P.totalStars(bests);
    function count(k) { return (s.counters && s.counters[k]) || 0; }
    switch (m) {
      case "FIRST_STAR": return stars >= 1;
      case "STARS_10": return stars >= 10;
      case "STARS_25": return stars >= 25;
      case "STARS_50": return stars >= 50;
      case "PATH_DONE": return P.STAGES.every(function (st) { return P.stars(st.game, bests) >= P.OPEN_STARS; });
      case "PATH_GOLD": return P.STAGES.every(function (st) { return P.stars(st.game, bests) >= P.MAX_STARS_PER_GAME; });
      case "DAILY_FIRST": return count(C.DAILY) >= 1;
      case "STREAK_3": return (s.streak || 0) >= 3;
      case "STREAK_7": return (s.streak || 0) >= 7;
      case "GAMES_100": return count(C.GAMES) >= 100;
      case "ALBUM_10": return (s.cromos || 0) >= 10;
      case "ALBUM_FULL": return (s.cromosTotal || 0) > 0 && (s.cromos || 0) >= s.cromosTotal;
      case "PET_5": return (s.petLevel || 1) >= 5;
      case "PET_CARE": return (s.careStreak || 0) >= P.pet.CARE_DAYS;
      case "QUIZ_TOP": return P.stars("quiz", bests) >= P.MAX_STARS_PER_GAME;
      case "REFEREE": return P.stars("arbitre", bests) >= 4;
      case "BEACH": return P.stars("platja", bests) >= P.MAX_STARS_PER_GAME;
      case "TEAM": return s.team !== null && s.team !== undefined;
      case "FAN": return count(C.LIVES_FOLLOWED) >= 10;
      case "FESTIVE": return count(C.SEASON_PRIZES) >= 1;
      case "OWL": return count(C.NIGHT_GAMES) >= 1;
      case "MIRROR": return count(C.VARIANT_MIRALL) >= 1;
      case "TURBO": return count(C.VARIANT_TURBO) >= 5;
      case "CLAPPER": return count(C.CLAPS) >= 50;
      case "DRUMMER": return count(C.DRUMS) >= 20;
      case "FRIEND": return count(C.PET_FED) >= 20;
      case "CODEBREAKER": return P.SECRET_CODES.every(function (k) { return count(k) >= 1; });
      case "SECRET_DOOR": return count(C.SECRET_DOOR) >= 1;
      case "CLUB_CODE": return count(C.CLUB_CODES) >= 1;
      case "WEEKLY": return count(C.WEEKLY) >= 3;
      case "SECRET_PATH": return count(C.SECRET_PATH) >= 1;
      case "SECRET_GOLD": return count(C.SECRET_GOLD) >= 1;
    }
    return false;
  };
  P.medalsAll = function (s) { return P.MEDALS.filter(function (m) { return P.medalEarned(m.id, s); }).map(function (m) { return m.id; }); };

  // ---------------------------------------------------------------- sticker album (AlbumCatalog.kt: ids NEVER change)

  function cr(id, emoji, kind, fest) { return { id: id, emoji: emoji, kind: kind, title: t("cromo." + id), festivity: fest || null }; }
  P.ALBUM = [
    cr("pili_verda", "🏐", "PILI"),
    cr("pili_ratlles", "🎽", "PILI"),
    cr("pili_campiona", "🏆", "PILI"),
    cr("pili_rematadora", "🦸", "PILI"),
    cr("pili_ulleres", "🕶️", "PILI"),
    cr("pili_ullet", "😉", "PILI"),
    cr("pili_dormilega", "😴", "PILI"),
    cr("club_2014", "🎂", "CLUB"),
    cr("club_colors", "💚", "CLUB"),
    cr("club_santpedor", "📍", "CLUB"),
    cr("club_pavello", "🏟️", "CLUB"),
    cr("club_senior_femeni", "👩", "CLUB"),
    cr("club_senior_masculi", "👨", "CLUB"),
    cr("club_masters", "🧓", "CLUB"),
    cr("club_juvenil", "🧑", "CLUB"),
    cr("club_cadet", "🧒", "CLUB"),
    cr("club_infantil", "👧", "CLUB"),
    cr("club_alevi", "👦", "CLUB"),
    cr("club_escola", "🐣", "CLUB"),
    cr("club_aficio", "📣", "CLUB"),
    cr("club_tabal", "🥁", "CLUB"),
    cr("club_cotxes", "🚗", "CLUB"),
    cr("volei_libero", "🟨", "VOLEI"),
    cr("volei_collocador", "🤲", "VOLEI"),
    cr("volei_central", "🧱", "VOLEI"),
    cr("volei_receptor", "🙌", "VOLEI"),
    cr("volei_oposat", "💪", "VOLEI"),
    cr("volei_servei", "🎯", "VOLEI"),
    cr("volei_servei_salt", "🚀", "VOLEI"),
    cr("volei_recepcio", "🛡️", "VOLEI"),
    cr("volei_collocacio", "👐", "VOLEI"),
    cr("volei_rematada", "⚡", "VOLEI"),
    cr("volei_bloqueig", "✋", "VOLEI"),
    cr("volei_defensa", "🤸", "VOLEI"),
    cr("volei_rotacio", "🔄", "VOLEI"),
    cr("volei_temps_mort", "⏱️", "VOLEI"),
    cr("volei_punt_set", "🏁", "VOLEI"),
    cr("pavello_xarxa", "🥅", "PAVELLO"),
    cr("pavello_carro", "🛒", "PAVELLO"),
    cr("pavello_marcador", "🔢", "PAVELLO"),
    cr("pavello_banqueta", "🪑", "PAVELLO"),
    cr("pavello_arbitre", "🟥", "PAVELLO"),
    cr("pavello_aigua", "💧", "PAVELLO"),
    cr("pavello_vestidor", "👟", "PAVELLO"),
    cr("pavello_pista", "📐", "PAVELLO"),
    cr("nadal_torro", "🍫", "FESTA", "NADAL"),
    cr("nadal_tio", "🪵", "FESTA", "NADAL"),
    cr("carnaval_disfressa", "🎭", "FESTA", "CARNAVAL"),
    cr("pasqua_mona", "🥚", "FESTA", "PASQUA"),
    cr("sant_jordi_rosa", "🌹", "FESTA", "SANT_JORDI"),
    cr("sant_jordi_llibre", "📚", "FESTA", "SANT_JORDI"),
    cr("festa_major_santpedor", "🎆", "FESTA", "FESTA_MAJOR"),
    cr("sant_joan_revetlla", "🔥", "FESTA", "SANT_JOAN"),
    cr("diada_onze", "🎗️", "FESTA", "DIADA"),
    cr("castanyada_castanyes", "🌰", "FESTA", "CASTANYADA"),
    cr("castanyada_moniato", "🍠", "FESTA", "CASTANYADA")
  ];
  P.ALBUM_KINDS = [
    { id: "PILI", color: "#3CC24A" }, { id: "CLUB", color: "#1C211E" },
    { id: "VOLEI", color: "#1E8C34" }, { id: "PAVELLO", color: "#37474F" },
    { id: "FESTA", color: "#C62828" }
  ];
  P.ALBUM_KINDS.forEach(function (k) { k.title = t("kind." + k.id); });
  /**
   * Special stickers (AlbumCatalog special = true, after the festive ones in the app's order): given
   * only by their own easter egg — the app's Reis and birthday, the secret room (the crest, the club
   * codes) and the secret path (one per team). Never drawn as a reward, not part of the regular album.
   */
  function sp(id, emoji) { var c = cr(id, emoji, "FESTA"); c.special = true; return c; }
  P.SPECIAL = [
    sp("reis_regal", "🎁"), sp("aniversari_app", "🎂"),
    sp("escut_secret", "🛡️"),
    sp("codi_pavello", "🏟️"), sp("codi_xarxes", "📸"), sp("codi_derbi", "🔥"), sp("codi_gala", "🌟"), sp("codi_festa", "🎉"),
    sp("sec_runner", "🏃"), sp("sec_malabars", "🤹"), sp("sec_ritme", "🥁"), sp("sec_cegues", "🙈"), sp("sec_memoria_gran", "🃏"),
    sp("sec_vent", "🌬️"), sp("sec_senyals", "🟨"), sp("sec_trenca", "🧱"), sp("sec_libero", "🦸"), sp("sec_triple", "🚧"),
    sp("sec_forat", "🎯"), sp("sec_llegenda", "👑"),
    sp("codi_campions", "🏆")
  ];
  P.REGULAR = P.ALBUM.filter(function (c) { return !c.festivity; });
  /** Festive and special stickers (the album's last section). */
  P.EXTRA = P.ALBUM.filter(function (c) { return c.festivity; }).concat(P.SPECIAL);
  P.cromo = function (id) {
    for (var i = 0; i < P.ALBUM.length; i++) if (P.ALBUM[i].id === id) return P.ALBUM[i];
    return P.special(id);
  };
  /** A special sticker by id (AlbumCatalog.special), or null. */
  P.special = function (id) { for (var i = 0; i < P.SPECIAL.length; i++) if (P.SPECIAL[i].id === id) return P.SPECIAL[i]; return null; };
  P.cromoNumber = function (c) { var i = P.ALBUM.indexOf(c); return i >= 0 ? i + 1 : P.ALBUM.length + P.SPECIAL.indexOf(c) + 1; };
  P.ownedRegular = function (owned) { return P.REGULAR.filter(function (c) { return (owned[c.id] || 0) > 0; }).length; };
  /** Different festive and special stickers owned. */
  P.ownedFestive = function (owned) { return P.EXTRA.filter(function (c) { return (owned[c.id] || 0) > 0; }).length; };
  function pick(list, rnd) { return list[Math.floor(rnd() * list.length) % list.length]; }
  /**
   * Album.draw: a sticker for a reward, preferably one not owned yet (3 of every 4 times), never a
   * festivity one unless it is [festivity]'s. [rnd]: () -> [0,1).
   */
  P.drawCromo = function (rnd, owned, festivity, all) {
    all = all || P.ALBUM; owned = owned || {};
    var pool = all.filter(function (c) { return !c.festivity || c.festivity === festivity; });
    if (!pool.length) return null;
    var fest = pool.filter(function (c) { return festivity && c.festivity === festivity; });
    if (fest.length) {
      var fm = fest.filter(function (c) { return !(owned[c.id] > 0); });
      return pick(fm.length ? fm : fest, rnd);
    }
    var missing = pool.filter(function (c) { return !(owned[c.id] > 0); });
    return (missing.length && Math.floor(rnd() * 4) !== 0) ? pick(missing, rnd) : pick(pool, rnd);
  };

  // ---------------------------------------------------------------- the Pili pet (pure; times in epoch seconds)

  P.pet = {
    FEED_EVERY: 3 * 3600,
    TICKLE_GAP_MS: 700,
    MILESTONES: [3, 5, 8, 10],
    level: function (xp) { return 1 + Math.floor(Math.sqrt(Math.max(0, xp || 0) / 50)); },
    xpFor: function (level) { return 50 * (level - 1) * (level - 1); },
    fresh: function () { return copyPet(null); },
    decay: function (s, now) {
      s = copyPet(s);
      if (!s.updated) { s.updated = now; return s; }
      var h = Math.max(0, now - s.updated) / 3600;
      s.food = clamp01(s.food - h / 36); s.joy = clamp01(s.joy - h / 24); s.updated = now;
      // the app's other indicators (extras/Progress.kt PetLogic): kept in step so a sync does not undo them
      s.energy = clamp01(s.energy - h / 30); s.clean = clamp01(s.clean - h / 48); s.fit = clamp01(s.fit - h / 96);
      return s;
    },
    canFeed: function (s, now) { return now - (s.lastFed || 0) >= P.pet.FEED_EVERY; },
    feed: function (s, now) {
      var d = P.pet.decay(s, now);
      if (!P.pet.canFeed(d, now)) return d;
      d.food = 1; d.xp += 5; d.lastFed = now; return d;
    },
    tickle: function (s, now) { var d = P.pet.decay(s, now); d.joy = Math.min(1, d.joy + 0.15); d.xp += 1; return d; },
    trained: function (s, now, newStars) {
      var d = P.pet.decay(s, now); d.xp += 5 + newStars * 20; d.joy = Math.min(1, d.joy + 0.1);
      d.fit = clamp01(d.fit + 0.08); d.energy = clamp01(d.energy - 0.05); return d;
    },
    mood: function (s) {
      if (s.energy < 0.12) return "sleep";
      if (s.food < 0.25 || s.joy < 0.2 || s.clean < 0.15) return "sad";
      if (s.joy > 0.75 && s.food > 0.5 && s.energy > 0.4) return "cheer";
      return "happy";
    },
    // ---- the app's other indicators, naps, showers and the inventory (PetLogic in extras/Progress.kt)
    NAP_EVERY: 4 * 3600,
    SHOWER_EVERY: 6 * 3600,
    MAX_ITEM: 20,
    CARE_DAYS: 7,
    canNap: function (s, now) { return now - (s.lastNap || 0) >= P.pet.NAP_EVERY; },
    canShower: function (s, now) { return now - (s.lastShower || 0) >= P.pet.SHOWER_EVERY; },
    nap: function (s, now) {
      var d = P.pet.decay(s, now);
      if (!P.pet.canNap(d, now)) return d;
      d.energy = clamp01(d.energy + 0.6); d.xp += 2; d.lastNap = now; return d;
    },
    shower: function (s, now) {
      var d = P.pet.decay(s, now);
      if (!P.pet.canShower(d, now)) return d;
      d.clean = 1; d.joy = clamp01(d.joy + 0.05); d.xp += 2; d.lastShower = now; return d;
    },
    addItem: function (s, id) {
      s = copyPet(s);
      if (!P.pet.item(id)) return s;
      s.inv[id] = Math.min(P.pet.MAX_ITEM, (s.inv[id] || 0) + 1); return s;
    },
    use: function (s, id, now) {
      var it = P.pet.item(id), n = (s && s.inv && s.inv[id]) || 0;
      if (!it || n <= 0) return copyPet(s);
      var d = P.pet.decay(s, now);
      d.food = clamp01(d.food + (it.food || 0)); d.joy = clamp01(d.joy + (it.joy || 0)); d.energy = clamp01(d.energy + (it.energy || 0));
      d.clean = clamp01(d.clean + (it.clean || 0)); d.fit = clamp01(d.fit + (it.fit || 0)); d.xp += it.xp == null ? 2 : it.xp;
      if (n === 1) delete d.inv[id]; else d.inv[id] = n - 1;
      return d;
    },
    /** The indicator she needs most ("food" | "joy" | "energy" | "clean") or null. */
    need: function (s) {
      var best = null, v = 1;
      [["food", s.food / 0.25], ["joy", s.joy / 0.2], ["energy", s.energy / 0.2], ["clean", s.clean / 0.2]].forEach(function (x) {
        if (x[1] < v) { v = x[1]; best = x[0]; }
      });
      return best;
    },
    wellCared: function (s) { return s.food >= 0.5 && s.joy >= 0.5 && s.energy >= 0.4 && s.clean >= 0.4; },
    item: function (id) { for (var i = 0; i < PET_ITEMS.length; i++) if (PET_ITEMS[i].id === id) return PET_ITEMS[i]; return null; },
    /** The special item of each festivity (PetItems.festive). */
    festive: function (f) {
      return { CASTANYADA: "castanyes", NADAL: "torro", CARNAVAL: "bunyol", PASQUA: "mona", SANT_JORDI: "rosa",
        FESTA_MAJOR: "pastis", SANT_JOAN: "coca", DIADA: "patomaquet" }[f] || null;
    },
    /** PetLogic.reward: the item a source gives now, or null over today's cap. */
    reward: function (source, givenToday, rnd, festivity) {
      var src = P.PET_SOURCES[source];
      if (!src || givenToday >= src.cap) return null;
      if (source === "FESTIVE") return P.pet.festive(festivity);
      return src.pool[Math.min(src.pool.length - 1, Math.floor((rnd || Math.random)() * src.pool.length))];
    },
    milestone: function (level) { var m = null; P.pet.MILESTONES.forEach(function (x) { if (level >= x) m = x; }); return m; },
    nextMilestone: function (level) { for (var i = 0; i < P.pet.MILESTONES.length; i++) if (P.pet.MILESTONES[i] > level) return P.pet.MILESTONES[i]; return null; },
    levelProgress: function (xp) {
      var l = P.pet.level(xp), from = P.pet.xpFor(l), to = P.pet.xpFor(l + 1);
      return clamp01((xp - from) / (to - from));
    },
    feedWait: function (s, now) { return Math.max(0, P.pet.FEED_EVERY - (now - (s.lastFed || 0))); },
    formatWait: function (seconds) {
      var min = Math.max(1, Math.floor((seconds + 59) / 60)), h = Math.floor(min / 60), m = min % 60;
      return h > 0 ? h + " h " + pad(m) + " min" : m + " min";
    }
  };
  function clamp01(v) { v = Number(v); if (!(v === v)) return 0; return Math.max(0, Math.min(1, v)); }
  function it(id, emoji, o) { o = o || {}; o.id = id; o.emoji = emoji; return o; }
  /** PetItems.ALL: what each item does (same order as the app). */
  var PET_ITEMS = P.PET_ITEMS = [
    it("poma", "🍎", { food: 0.25 }), it("entrepa", "🥪", { food: 0.6, xp: 4 }), it("platan", "🍌", { food: 0.2, energy: 0.2 }),
    it("isotonic", "🧃", { energy: 0.45 }), it("crispetes", "🍿", { joy: 0.25, food: 0.15 }), it("croissant", "🥐", { food: 0.35, joy: 0.1 }),
    it("batut", "🥤", { fit: 0.15, food: 0.2, xp: 4 }), it("pilota", "🏐", { joy: 0.35, fit: 0.1, xp: 4 }), it("sabo", "🧼", { clean: 0.6 }),
    it("llaminadura", "🍬", { joy: 0.2 }),
    it("castanyes", "🌰", { food: 0.3, joy: 0.25, xp: 6 }), it("torro", "🍫", { food: 0.25, joy: 0.35, xp: 6 }),
    it("bunyol", "🍩", { food: 0.3, joy: 0.3, xp: 6 }), it("mona", "🥚", { food: 0.25, joy: 0.4, xp: 6 }), it("rosa", "🌹", { joy: 0.5, xp: 6 }),
    it("pastis", "🎂", { food: 0.3, joy: 0.4, xp: 6 }), it("coca", "🥧", { food: 0.35, joy: 0.3, xp: 6 }),
    it("patomaquet", "🍅", { food: 0.5, energy: 0.1, xp: 6 }),
    it("trofeu", "🏆", { food: 0.2, joy: 0.6, energy: 0.2, fit: 0.2, xp: 20 })
  ];
  PET_ITEMS.forEach(function (x) { x.name = t("pet.item." + x.id); });
  /** PetSource: where items come from on the web (the app has more: notices, agenda, live, scoreboard, call-ups, wins). */
  P.PET_SOURCES = {
    GAME: { pool: ["platan", "isotonic", "pilota", "sabo"], cap: 5 },
    DAILY: { pool: ["poma"], cap: 1 },
    FESTIVE: { pool: [], cap: 1 },
    WIN: { pool: ["trofeu"], cap: 2 }
  };
  function copyPet(s) {
    s = s || {};
    // energy, clean, fit, naps, showers and the inventory come from the app: kept as they are
    var inv = {};
    if (s.inv && typeof s.inv === "object") PET_ITEMS.forEach(function (x) { var n = Math.floor(Number(s.inv[x.id]) || 0); if (n > 0) inv[x.id] = Math.min(20, n); });
    return { xp: Math.max(0, Math.floor(Number(s.xp) || 0)), food: s.food == null ? 1 : clamp01(s.food), joy: s.joy == null ? 1 : clamp01(s.joy),
      updated: Math.floor(Number(s.updated) || 0), lastFed: Math.floor(Number(s.lastFed) || 0),
      energy: s.energy == null ? 1 : clamp01(s.energy), clean: s.clean == null ? 1 : clamp01(s.clean), fit: s.fit == null ? 0.5 : clamp01(s.fit),
      lastNap: Math.floor(Number(s.lastNap) || 0), lastShower: Math.floor(Number(s.lastShower) || 0), inv: inv };
  }

  // ---------------------------------------------------------------- leaderboard and league (pure)

  var BAD = ["puta", "puto", "putes", "merda", "cabron", "cabro", "polla", "cony", "cono", "joder", "collons",
    "mierda", "gilipolla", "maricon", "subnormal", "fuck", "shit", "bitch", "nazi", "hitler"];
  /** Trimmed nickname with collapsed spaces. */
  P.cleanNick = function (raw) { return String(raw == null ? "" : raw).trim().replace(/\s+/g, " "); };
  /** null if valid, otherwise "TOO_SHORT" | "TOO_LONG" | "NOT_ALLOWED" (LeaderboardLogic.nickError). */
  P.nickError = function (raw) {
    var n = P.cleanNick(raw);
    if (n.length < P.MIN_NICK) return "TOO_SHORT";
    if (n.length > P.MAX_NICK) return "TOO_LONG";
    var flat = n.toLowerCase();
    if (flat.normalize) flat = flat.normalize("NFD");
    flat = flat.replace(/[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]+/g, "")
      .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/@/g, "a");
    var words = flat.split(/[^a-z]+/).filter(function (w) { return w.length > 0; });
    var joined = words.join("");
    var bad = BAD.some(function (b) { return b.length <= 5 ? words.indexOf(b) >= 0 : joined.indexOf(b) >= 0; });
    return bad ? "NOT_ALLOWED" : null;
  };
  P.NICK_TEXT = { TOO_SHORT: t("nick.short"), TOO_LONG: t("nick.long"), NOT_ALLOWED: t("nick.bad"), HINT: t("nick.hint") };
  function cmpStr(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function rankSort(a, b) { return (b.score - a.score) || cmpStr(a.updated, b.updated) || cmpStr(a.name.toLowerCase(), b.name.toLowerCase()); }
  /** LeaderboardLogic.rank: entries {uid, name, score, updated} with a score (> 0) in [field], best first. */
  P.rank = function (docs, field) {
    return (docs || []).map(function (d) {
      var name = typeof d.nom === "string" ? P.cleanNick(d.nom) : "";
      var score = typeof d[field] === "number" ? Math.trunc(d[field]) : 0;
      if (typeof d.id !== "string" || name.length < P.MIN_NICK || score <= 0) return null;
      return { uid: d.id, name: name, score: P.clampScore(score), updated: typeof d.updated === "string" ? d.updated : "" };
    }).filter(Boolean).sort(rankSort);
  };
  /** The monthly ranking of [field]: documents whose "mes" is [month] ("YYYY-MM"), by m[field], best first. */
  P.monthRank = function (docs, field, month) {
    return (docs || []).map(function (d) {
      if (d.mes !== month || !d.m || typeof d.m !== "object") return null;
      var name = typeof d.nom === "string" ? P.cleanNick(d.nom) : "";
      var score = typeof d.m[field] === "number" ? Math.trunc(d.m[field]) : 0;
      if (typeof d.id !== "string" || name.length < P.MIN_NICK || score <= 0) return null;
      return { uid: d.id, name: name, score: P.cap(field, score), updated: typeof d.updated === "string" ? d.updated : "" };
    }).filter(Boolean).sort(rankSort);
  };
  /** 1-based position of [uid] in [ranked], or null. */
  P.position = function (ranked, uid) {
    if (!uid) return null;
    for (var i = 0; i < ranked.length; i++) if (ranked[i].uid === uid) return i + 1;
    return null;
  };
  /** LeagueLogic.points: stars, medals and different stickers. */
  P.leaguePointsOf = function (stars, medals, cromos) { return Math.max(0, Math.min(P.MAX_SCORE, stars * 10 + medals * 5 + cromos * 2)); };
  /** LeagueLogic.table: teams by total points (documents with "equip" and "punts"). */
  P.leagueTable = function (docs) {
    var by = {}, order = [];
    (docs || []).forEach(function (d) {
      if (typeof d.equip !== "number") return;
      var t = Math.trunc(d.equip), pts = typeof d.punts === "number" ? Math.trunc(d.punts) : 0;
      pts = P.cap("punts", pts);
      if (!by[t]) { by[t] = { team: t, points: 0, players: 0 }; order.push(t); }
      by[t].points += pts; by[t].players++;
    });
    return order.map(function (t) { return by[t]; })
      .sort(function (a, b) { return (b.points - a.points) || (b.players - a.players) || (a.team - b.team); });
  };
  /** LeagueLogic.daily: today's daily challenge ranking (documents whose "diari_dia" is [today]). */
  P.dailyRank = function (docs, today) {
    return (docs || []).map(function (d) {
      if (d.diari_dia !== today) return null;
      var name = typeof d.nom === "string" ? P.cleanNick(d.nom) : "";
      var score = typeof d.diari === "number" ? Math.trunc(d.diari) : 0;
      if (typeof d.id !== "string" || name.length < P.MIN_NICK || score <= 0) return null;
      return { uid: d.id, name: name, score: P.clampScore(score), updated: typeof d.updated === "string" ? d.updated : "" };
    }).filter(Boolean).sort(rankSort);
  };

  // ---------------------------------------------------------------- PRNG and helpers

  /** mulberry32: a seeded PRNG, () -> [0,1). */
  P.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  /** 32 random bits (crypto when available). */
  P.randomSeed = function () {
    try { var a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0]; } catch (e) { return Math.floor(Math.random() * 4294967296); }
  };

  // ---------------------------------------------------------------- local storage (localStorage "jocs_*")

  function get(k, def) { var v = VSP.storeJson("jocs_" + k, undefined, def); return v == null ? def : v; }
  function set(k, v) { if (v === null || v === undefined) VSP.store("jocs_" + k, null); else VSP.storeJson("jocs_" + k, v); }
  P._get = get; P._set = set;
  function intMap(o) {
    var out = {};
    if (o && typeof o === "object" && !Array.isArray(o)) Object.keys(o).forEach(function (k) {
      var v = Number(o[k]); if (isFinite(v) && v >= 0) out[k] = Math.floor(v);
    });
    return out;
  }
  function strList(a) {
    var out = [];
    if (Array.isArray(a)) a.forEach(function (x) { if (typeof x === "string" && x.trim() && out.indexOf(x) < 0) out.push(x); });
    return out;
  }

  P.bests = function () { var b = intMap(get("bests", {})), out = {}; P.IDS.forEach(function (g) { out[g] = P.cap(g, b[g] || 0); }); return out; };
  P.best = function (g) { return P.bests()[g] || 0; };
  function setBest(g, v) { var b = intMap(get("bests", {})); b[g] = P.cap(g, v); set("bests", b); }

  P.counters = function () { return intMap(get("counters", {})); };
  P.count = function (k) { return P.counters()[k] || 0; };
  P.inc = function (k, by) { var c = P.counters(); c[k] = (c[k] || 0) + (by == null ? 1 : by); set("counters", c); };
  /** +by to a counter and checks the medals it may give (ProgressStore.bump). */
  P.bump = function (k, by) { P.inc(k, by); return P.checkMedals(); };

  function dailyState() { var d = get("daily", {}) || {}; return { days: strList(d.days), date: typeof d.date === "string" ? d.date : null, best: Math.max(0, Math.floor(Number(d.best) || 0)) }; }
  P.dailyDays = function () { return dailyState().days.filter(P.validDay); };
  P.streak = function (today) { return P.daily.streak(P.dailyDays(), today || P.today()); };
  /** Best daily score of [date] (0 if not played that day). */
  P.dailyBest = function (date) { var d = dailyState(); return d.date === (date || P.today()) ? d.best : 0; };
  /** {date, best} of the last daily played, or null (leaderboard upload). */
  P.lastDaily = function () { var d = dailyState(); return d.date ? { date: d.date, best: d.best } : null; };
  /** Records a daily challenge game; true if it is today's best. */
  P.recordDaily = function (score, today) {
    score = P.cap("diari", score);
    var d = dailyState(), limit = P.epochDay(today) - 60;
    if (d.days.indexOf(today) < 0) d.days.push(today);
    d.days = d.days.filter(function (x) { return P.validDay(x) && P.epochDay(x) >= limit; }).sort();
    var best = d.date === today ? d.best : 0, isBest = score > best;
    if (isBest) { d.date = today; d.best = score; }
    set("daily", d);
    return isBest;
  };

  // ---------------------------------------------------------------- monthly bests (ranking «Aquest mes»)

  /** Current month "YYYY-MM" (local time). */
  P.month = function () { var d = P.now(); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
  function monthState() { var o = get("month", {}) || {}; return { mes: typeof o.mes === "string" ? o.mes : null, m: intMap(o.m) }; }
  /** This month's best of every game played this month ({} again when the month changes). */
  P.monthBests = function () {
    var s = monthState(), out = {};
    if (s.mes !== P.month()) return out;
    P.IDS.forEach(function (g) { var v = P.cap(g, s.m[g] || 0); if (v > 0) out[g] = v; });
    return out;
  };
  /** Records a game of this month; true if it is a new monthly best (the leaderboard doc gets pending). */
  P.recordMonth = function (g, score) {
    score = P.cap(g, score);
    if (score <= 0 || P.IDS.indexOf(g) < 0) return false;
    var m = P.monthBests();
    if (score <= (m[g] || 0)) return false;
    m[g] = score;
    set("month", { mes: P.month(), m: m });
    P.markPending();
    return true;
  };

  P.album = function () { var a = intMap(get("album", {})), out = {}; Object.keys(a).forEach(function (k) { if (a[k] > 0) out[k] = a[k]; }); return out; };
  P.addCromo = function (c) { var a = P.album(); a[c.id] = (a[c.id] || 0) + 1; set("album", a); };
  /** Different regular stickers owned (festive ones are extras: they don't count for the full album). */
  P.uniqueCromos = function () { return P.ownedRegular(P.album()); };

  P.medals = function () { return strList(get("medals", [])).filter(function (n) { return P.medal(n); }); };
  P.unseenMedals = function () { var seen = strList(get("medals_seen", [])); return P.medals().filter(function (m) { return seen.indexOf(m) < 0; }).length; };
  P.markMedalsSeen = function () { set("medals_seen", strList(get("medals_seen", [])).concat(P.medals()).filter(function (x, i, a) { return a.indexOf(x) === i; })); };

  P.petState = function (now) { return P.pet.decay(copyPet(get("pet", null)), now == null ? P.nowSec() : now); };
  P.savePet = function (s, check) {
    s = copyPet(s);
    set("pet", s);
    // 💚 a day she was well looked after (the last 30 are kept)
    if (P.pet.wellCared(s)) {
      var today = P.today(), from = P.addDays(today, -30);
      set("pet_care", P.careDays().concat([today]).filter(function (d, i, a) { return a.indexOf(d) === i && d >= from; }));
    }
    if (check !== false) P.checkMedals();
  };
  P.careDays = function () { return strList(get("pet_care", [])).filter(P.validDay); };
  P.careStreak = function (today) { return P.daily.streak(P.careDays(), today || P.today()); };
  /**
   * PetRewards.earn: one item from [source] if today's cap allows; returns its id (or null).
   * Counters per day in "jocs_pet_rewards" ({ day, n: { SOURCE: count } }).
   */
  P.earnPet = function (source, opts) {
    opts = opts || {};
    var today = opts.today || P.today(), r = get("pet_rewards", {}) || {};
    if (r.day !== today || typeof r.n !== "object" || !r.n) r = { day: today, n: {} };
    var id = P.pet.reward(source, r.n[source] || 0, opts.rnd, source === "FESTIVE" ? P.festivityOn(today) : null);
    if (!id) return null;
    r.n[source] = (r.n[source] || 0) + 1;
    set("pet_rewards", r);
    var now = opts.now != null ? opts.now : P.nowSec();
    P.savePet(P.pet.addItem(P.petState(now), id), false);
    return id;
  };

  /**
   * 🏆 6.11: a ★ team won (the club web leaves the matches in localStorage "jocs_wins_pending", js/home.js):
   * one trophy per match, never one the app or another device already gave ("trofeus", synced). Returns how many.
   */
  P.claimWins = function (opts) {
    opts = opts || {};
    var pending = strList(get("wins_pending", [])), given = strList(get("trofeus", [])), n = 0;
    pending.forEach(function (id) {
      if (given.indexOf(id) >= 0) return;
      given.push(id);   // remembered even past the daily cap: a match gives its trophy only once
      if (P.earnPet("WIN", opts)) n++;
    });
    set("trofeus", given.sort().slice(-200));
    set("wins_pending", []);
    return n;
  };

  /** Teams where this browser is an approved member (localStorage "mem_approved", written by js/member.js). */
  P.approvedTeams = function () {
    var a = VSP.storeJson("mem_approved", undefined, []);
    if (!Array.isArray(a)) return [];
    return a.map(Number).filter(function (x) { return isFinite(x) && Math.trunc(x) === x; });
  };
  /** The league team: only a team where this browser is an approved member (otherwise null). */
  P.team = function () {
    var t = get("team", null);
    if (typeof t !== "number" || !isFinite(t)) return null;
    return P.approvedTeams().indexOf(t) >= 0 ? t : null;
  };
  /** A chosen team that is no longer approved is dropped (and the document re-uploaded without it). */
  P.dropUnapprovedTeam = function () {
    var t = get("team", null);
    if (t === null || t === undefined || P.team() !== null) return false;
    set("team", null);
    P.markPending();
    return true;
  };
  /** Chooses the league team (null = none); false if this browser is not an approved member of it. */
  P.setTeam = function (team) {
    team = team === null || team === undefined || team === "" ? null : Number(team);
    if (team !== null && P.approvedTeams().indexOf(team) < 0) return false;
    set("team", team);
    P.checkMedals();
    P.markPending();
    VSPG.emit("progress");
    return true;
  };

  P.nickname = function () { var n = get("nick", null); return typeof n === "string" && n.trim() ? n : null; };
  P.setNickname = function (nick) {
    set("nick", P.cleanNick(nick));
    P.markPending();
    VSPG.emit("progress");
  };

  /** Carnet d'àrbitre: date (YYYY-MM-DD) a level 0..3 was passed, or null; markPassed keeps the first date. */
  P.refereeDate = function (level) { var r = get("referee", {}) || {}; return typeof r[level] === "string" ? r[level] : null; };
  P.refereePassed = function (level, today) {
    var r = get("referee", {}) || {};
    if (typeof r[level] !== "string") { r[String(level)] = today || P.today(); set("referee", r); }
  };

  P.stats = function () {
    return { bests: P.bests(), counters: P.counters(), streak: P.streak(), cromos: P.uniqueCromos(),
      cromosTotal: P.REGULAR.length, petLevel: P.pet.level(P.petState().xp), team: P.team(), careStreak: P.careStreak() };
  };
  P.leaguePoints = function () { return P.leaguePointsOf(P.totalStars(P.bests()), P.medals().length, P.uniqueCromos()); };

  /** Stores the newly earned medals and returns them (ids, in medal order). */
  P.checkMedals = function () {
    var have = P.medals(), now = P.medalsAll(P.stats());
    var fresh = now.filter(function (m) { return have.indexOf(m) < 0; }).sort(function (a, b) { return P.medalOrder(a) - P.medalOrder(b); });
    if (fresh.length) {
      set("medals", strList(get("medals", [])).concat(fresh));
      P.markPending();
    }
    return fresh;
  };

  // ---------------------------------------------------------------- tiny event bus ("progress": something changed)

  var handlers = {};
  VSPG.on = function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); };
  VSPG.emit = function (ev, arg) { (handlers[ev] || []).slice().forEach(function (fn) { try { fn(arg); } catch (e) { if (window.console) console.error(e); } }); };

  // ---------------------------------------------------------------- a finished game

  /** GameScores.submit: keeps the best; true = new record. */
  P.submit = function (g, score) {
    if (score <= P.best(g)) return false;
    setBest(g, score);
    P.markPending();
    return true;
  };

  /**
   * GameScores.finish: keeps the record, gives the rewards (a sticker per new star, medals, newly
   * opened games), trains the Pili pet, records the daily challenge. Returns the result
   * {game, score, record, newStars, stars, medals: [ids], cromos: [cromo], opened: [ids], dailyBest}.
   * mode: {variant, seed, daily, weekly}; opts (tests): {today, rnd, hour, now}.
   */
  P.finish = function (g, score, mode, opts) {
    mode = mode || {}; opts = opts || {};
    score = P.cap(g, score);
    var today = opts.today || P.today(), rnd = opts.rnd || Math.random;
    var hour = opts.hour != null ? opts.hour : P.now().getHours();
    var before = P.bests();
    // the daily challenge (or the secret weekly one) may be a game still locked in the path: then it
    // only counts for the day / the week
    var counts = !((mode.daily || mode.weekly) && !P.unlocked(g, before));
    var record = counts ? P.submit(g, score) : false;
    if (counts) P.recordMonth(g, score);
    var after = P.bests();
    var newStars = Math.max(0, P.stars(g, after) - P.stars(g, before));
    P.inc(C.GAMES);
    // 📊 6.16: games per day for the club web's anonymous statistics (js/stats.js), only if they are on
    try {
      if (localStorage.getItem("stats") === "1") {
        var sg = JSON.parse(localStorage.getItem("stats_games") || "{}") || {}, dk = String(today);
        sg[dk] = (Number(sg[dk]) || 0) + 1;
        Object.keys(sg).forEach(function (k) { if (k < P.addDays(dk, -14)) delete sg[k]; });
        localStorage.setItem("stats_games", JSON.stringify(sg));
      }
    } catch (e) {}
    if (mode.variant === "NIT") P.inc(C.VARIANT_NIT);
    else if (mode.variant === "TURBO") P.inc(C.VARIANT_TURBO);
    else if (mode.variant === "MIRALL") P.inc(C.VARIANT_MIRALL);
    if (hour < 5) P.inc(C.NIGHT_GAMES);
    P.inc(P.hourKey(hour));
    if (mode.weekly) {
      P.inc(C.WEEKLY);
      if (VSPG.secret) VSPG.secret.weeklyScore(score, today);
    }
    var dailyBest = false;
    if (mode.daily && score > 0) {
      dailyBest = P.recordDaily(score, today);
      P.inc(C.DAILY);
      P.markPending();
    }
    // a sticker for every new star; the seasonal game gives its festivity's sticker
    var festivity = g === "temporada" ? P.festivityOn(today) : null;
    var cromos = [];
    for (var i = 0; i < newStars; i++) {
      var c = P.drawCromo(rnd, P.album(), festivity);
      if (c) { P.addCromo(c); cromos.push(c); }
    }
    if (g === "temporada" && festivity && score > 0) {
      var owned = P.album();
      var missing = P.ALBUM.filter(function (x) { return x.festivity === festivity && !(owned[x.id] > 0); });
      if (missing.length) { var prize = pick(missing, rnd); P.addCromo(prize); cromos.push(prize); P.inc(C.SEASON_PRIZES); }
    }
    var now = opts.now != null ? opts.now : P.nowSec();
    P.savePet(P.pet.trained(P.petState(now), now, newStars), false);
    var petItem = P.earnPet("GAME", { now: now, today: today, rnd: rnd });   // 🎁 an item for the Pili (up to 5 a day)
    var medals = P.checkMedals();
    if (newStars > 0 || cromos.length) P.markPending();
    var r = { game: g, score: score, record: record, newStars: newStars, stars: P.stars(g, after), medals: medals,
      cromos: cromos, opened: P.newlyOpened(before, after), dailyBest: dailyBest, petItem: petItem };
    P.last = r;
    P.sync.pushAsync();   // with a saved code: keep it up to date
    VSPG.emit("progress");
    return r;
  };

  /** RewardLines: the texts of what the last game gave. */
  P.rewardLines = function (r) {
    var out = [];
    if (!r) return out;
    if (r.newStars > 0) out.push(t("rew.stars", r.newStars, r.stars));
    if (r.petItem && P.pet.item(r.petItem)) out.push(t("pet.earned", P.pet.item(r.petItem).emoji + " " + P.pet.item(r.petItem).name));
    (r.opened || []).forEach(function (g) { out.push(t("rew.opened", P.title(g))); });
    (r.secretOpened || []).forEach(function (f) {
      var sg = VSPG.secret && VSPG.secret.game(f);
      if (sg) out.push(t("rew.opened", sg.emoji + " " + sg.title));
    });
    (r.medals || []).forEach(function (m) { var x = P.medal(m); if (x) out.push(t("rew.medal", x.emoji + " " + x.title)); });
    (r.cromos || []).forEach(function (c) { out.push(t("rew.cromo", c.emoji + " " + c.title)); });
    if (r.dailyBest) out.push(t("rew.daily"));
    return out;
  };

  // ---------------------------------------------------------------- club leaderboard (jocs/{uid})

  P.board = {};
  P.rankingOn = function () {
    try {
      var cfg = VSPG.configLoaded ? VSP.config : VSP.parseConfig((VSP.storeJson("cache_data", undefined, null) || {}).cfg);
      return cfg.off.indexOf("ranking") < 0;
    } catch (e) { return true; }
  };
  P.board.pending = function () { return get("pending", false) === true; };
  /** Something the leaderboard shows changed (records, stars, medals, team, daily): upload it soon. */
  P.markPending = function () { set("pending", true); P.board.syncAsync(); };
  var boardTimer = 0, boardBusy = null;
  /** Debounced upload; offline it stays pending for the next time. */
  P.board.syncAsync = function (delay) {
    if (!P.board.pending() || !P.nickname()) return;
    clearTimeout(boardTimer);
    boardTimer = setTimeout(function () { P.board.upload().catch(function () {}); }, delay == null ? 1500 : delay);
  };
  /** The own document of the leaderboard. */
  P.board.doc = function () {
    var nick = P.nickname(), bests = P.bests();
    var data = { nom: String(nick || "").slice(0, P.MAX_NICK) };
    P.IDS.forEach(function (g) { data[g] = P.cap(g, bests[g]); });
    var t = P.team();   // only a team where this browser is an approved member
    if (t !== null) data.equip = Math.trunc(t);
    data.punts = P.cap("punts", P.leaguePoints());
    var ld = P.lastDaily();
    if (ld) { data.diari_dia = ld.date; data.diari = P.cap("diari", ld.best); }
    // monthly ranking: only when something was played this month
    var mb = P.monthBests();
    if (Object.keys(mb).length) { data.mes = P.month(); data.m = mb; }
    // the secret room: this week's secret challenge (sec, sec_set), the Pili's run (runner) and the
    // secret path (map "s"), as GameScores.upload of the app
    var sf = VSPG.secret ? VSPG.secret.boardFields() : {};
    Object.keys(sf).forEach(function (k) { data[k] = sf[k]; });
    data.updated = P.now().toISOString();
    return data;
  };
  /** Uploads jocs/{uid} if something is pending and there is a nickname. Resolves true if uploaded. */
  P.board.upload = function () {
    if (boardBusy) return boardBusy;
    if (!P.rankingOn() || !P.nickname() || !P.board.pending()) return Promise.resolve(false);
    if (P.nickError(P.nickname())) return Promise.resolve(false);
    boardBusy = VSP.token().then(function () {
      var uid = VSP.uid();
      if (!uid) throw new Error("sense sessió");
      set("pending", false);
      return VSP.fs.set("jocs/" + uid, P.board.doc()).then(function () { return true; }, function (e) {
        // 403: the board hid this player (jocs_amagats/{uid}) or the rules rejected the document:
        // retrying would fail the same way, so it is not pending any more and no error is shown
        if (e && e.status === 403) return false;
        set("pending", true);
        throw e;
      });
    });
    boardBusy.then(clear, clear);
    function clear() { boardBusy = null; }
    return boardBusy;
  };
  /** Every document of a collection (pages of 300 by document id, up to [max]). */
  P.listAll = function (coll, max) {
    max = max || 3000;
    var all = [], seen = {};
    function add(list) {
      var n = 0;
      list.forEach(function (d) { if (d && d.id && !seen[d.id]) { seen[d.id] = 1; all.push(d); n++; } });
      return n;
    }
    function next(lastId) {
      var prefix = "projects/" + VSP.FIREBASE_PROJECT + "/databases/(default)/documents/";
      return VSP.fs.query({
        from: [{ collectionId: coll }],
        orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
        startAt: { values: [{ referenceValue: prefix + coll + "/" + lastId }], before: false },
        limit: 300
      }).then(function (list) {
        var added = add(list);
        if (list.length < 300 || !added || all.length >= max) return all;
        return next(list[list.length - 1].id);
      });
    }
    return VSP.fs.list(coll, "&orderBy=__name__").then(function (list) {
      add(list);
      if (list.length < 300 || all.length >= max) return all;
      return next(list[list.length - 1].id);
    });
  };
  /** Every leaderboard document (with "id") and the own uid; uploads first if something is pending. */
  P.board.load = function () {
    var first = P.board.pending() && P.nickname() ? P.board.upload().catch(function () {}) : Promise.resolve();
    return first.then(function () { return VSP.token(); }).then(function () {
      return P.listAll("jocs", 3000).then(function (docs) { return { docs: docs, uid: VSP.uid() }; });
    });
  };

  // ---------------------------------------------------------------- progress saved with a code (docs/jocs_progres.md)

  P.code = {
    ALPHABET: "23456789ABCDEFGHJKMNPQRSTUVWXYZ",
    LENGTH: 10,
    /** A new random code (crypto.getRandomValues, no modulo bias). */
    generate: function () {
      var A = P.code.ALPHABET, out = "", limit = 256 - (256 % A.length), buf = new Uint8Array(32);
      while (out.length < P.code.LENGTH) {
        window.crypto.getRandomValues(buf);
        for (var i = 0; i < buf.length && out.length < P.code.LENGTH; i++) if (buf[i] < limit) out += A.charAt(buf[i] % A.length);
      }
      return out;
    },
    /** What the person typed -> the code, or null if it is not one. */
    normalize: function (raw) {
      var up = String(raw == null ? "" : raw).toUpperCase(), c = "";
      for (var i = 0; i < up.length; i++) {
        var ch = up.charAt(i);
        if (/[0-9]/.test(ch) || ch.toLowerCase() !== ch.toUpperCase()) c += ch;   // letters and digits only
      }
      if (c.length !== P.code.LENGTH) return null;
      for (var j = 0; j < c.length; j++) if (P.code.ALPHABET.indexOf(c.charAt(j)) < 0) return null;
      return c;
    },
    pretty: function (code) { return code && code.length === P.code.LENGTH ? code.slice(0, 5) + "-" + code.slice(5) : (code || ""); },
    get: function () { var c = get("code", null); return typeof c === "string" && P.code.normalize(c) === c ? c : null; },
    set: function (c) { set("code", c); }
  };

  P.snapshot = {
    MAX_LENGTH: 20000,
    /** The local progress as a snapshot object (the spec's JSON). */
    export: function () {
      var bests = {}, b = P.bests(), d = dailyState(), r = get("referee", {}) || {}, referee = {};
      P.IDS.forEach(function (g) { if (b[g] > 0) bests[g] = b[g]; });
      for (var l = 0; l < 4; l++) if (typeof r[l] === "string" && r[l]) referee[String(l)] = r[l];
      var s = { v: 1 };
      var nick = P.nickname(), team = P.team();
      if (nick) s.nom = nick;
      if (team !== null) s.equip = Math.trunc(team);
      s.bests = bests;
      s.album = P.album();
      s.medals = P.medals().slice().sort();
      s.medalsSeen = strList(get("medals_seen", [])).sort();
      s.counters = P.counters();
      s.pet = copyPet(get("pet", null));
      s.daily = { days: d.days.slice().sort() };
      if (d.date) s.daily.date = d.date;
      s.daily.best = d.best;
      s.referee = referee;
      s.festes = strList(get("festes", [])).sort();
      var tr = strList(get("trofeus", [])).sort().slice(-200);
      if (tr.length) s.trofeus = tr;
      return s;
    },
    /** Parses the JSON text of "dades" (v must be 1); null if it is not valid. */
    parse: function (text) {
      var o;
      try { o = typeof text === "string" ? JSON.parse(text) : text; } catch (e) { return null; }
      if (!o || typeof o !== "object" || o.v !== 1) return null;
      var d = o.daily && typeof o.daily === "object" ? o.daily : {};
      var referee = {};
      if (o.referee && typeof o.referee === "object") Object.keys(o.referee).forEach(function (k) {
        if (typeof o.referee[k] === "string" && o.referee[k].trim()) referee[k] = o.referee[k];
      });
      var s = { v: 1 };
      if (typeof o.nom === "string" && o.nom.trim()) s.nom = o.nom;
      if (typeof o.equip === "number" && isFinite(o.equip)) s.equip = Math.trunc(o.equip);
      s.bests = intMap(o.bests);
      s.album = intMap(o.album);
      s.medals = strList(o.medals);
      s.medalsSeen = strList(o.medalsSeen);
      s.counters = intMap(o.counters);
      s.pet = copyPet(o.pet && typeof o.pet === "object" ? o.pet : null);
      s.daily = { days: strList(d.days) };
      if (typeof d.date === "string" && d.date.trim()) s.daily.date = d.date;
      s.daily.best = Math.max(0, Math.floor(Number(d.best) || 0));
      s.referee = referee;
      s.festes = strList(o.festes);
      var tr = strList(o.trofeus).sort().slice(-200);
      if (tr.length) s.trofeus = tr;
      return s;
    },
    /** Never loses anything (docs/jocs_progres.md); [local] wins for nickname and team. */
    merge: function (local, saved, today) {
      today = today || P.today();
      function maxMap(a, b) {
        var out = {};
        Object.keys(a || {}).concat(Object.keys(b || {})).forEach(function (k) { out[k] = Math.max((a || {})[k] || 0, (b || {})[k] || 0); });
        return out;
      }
      function union(a, b) { return strList((a || []).concat(b || [])).sort(); }
      var limit = P.epochDay(today) - 60;
      var days = union(local.daily.days, saved.daily.days).filter(function (x) { return P.validDay(x) && P.epochDay(x) >= limit; });
      var ld = local.daily.date || null, sd = saved.daily.date || null, dDate, dBest;
      if (ld === sd) { dDate = ld; dBest = Math.max(local.daily.best || 0, saved.daily.best || 0); }
      else if (sd === null) { dDate = ld; dBest = local.daily.best || 0; }
      else if (ld === null || sd > ld) { dDate = sd; dBest = saved.daily.best || 0; }
      else { dDate = ld; dBest = local.daily.best || 0; }
      var pet = local.pet.xp !== saved.pet.xp ? (local.pet.xp > saved.pet.xp ? local.pet : saved.pet)
        : (local.pet.updated >= saved.pet.updated ? local.pet : saved.pet);
      var referee = {};
      Object.keys(local.referee || {}).concat(Object.keys(saved.referee || {})).forEach(function (k) {
        var a = (local.referee || {})[k], b = (saved.referee || {})[k];
        referee[k] = a && b ? (a < b ? a : b) : (a || b);
      });
      var m = { v: 1 };
      var nom = local.nom != null ? local.nom : saved.nom, equip = local.equip != null ? local.equip : saved.equip;
      if (nom != null) m.nom = nom;
      if (equip != null) m.equip = equip;
      m.bests = maxMap(local.bests, saved.bests);
      m.album = maxMap(local.album, saved.album);
      m.medals = union(local.medals, saved.medals);
      m.medalsSeen = union(local.medalsSeen, saved.medalsSeen);
      m.counters = maxMap(local.counters, saved.counters);
      m.pet = copyPet(pet);
      m.daily = { days: days };
      if (dDate) m.daily.date = dDate;
      m.daily.best = dBest;
      m.referee = referee;
      m.festes = union(local.festes, saved.festes);
      // 🏆 matches whose trophy was already given (app or web): never twice (6.11)
      var tr = union(local.trofeus || [], saved.trofeus || []).sort().slice(-200);
      if (tr.length) m.trofeus = tr;
      return m;
    },
    /** Canonical text (sorted keys) to compare two snapshots. */
    canon: function (s) {
      function c(v) {
        if (Array.isArray(v)) return v.map(c);
        if (v && typeof v === "object") { var o = {}; Object.keys(v).sort().forEach(function (k) { o[k] = c(v[k]); }); return o; }
        return v;
      }
      return JSON.stringify(c(s));
    },
    equal: function (a, b) { return !!a && !!b && P.snapshot.canon(a) === P.snapshot.canon(b); },
    /** Writes [s] as the local progress (after a merge, so nothing is lost). */
    apply: function (s) {
      var b = intMap(get("bests", {}));
      P.IDS.forEach(function (g) { if (s.bests[g] != null) b[g] = P.cap(g, s.bests[g]); });
      set("bests", b);
      var album = {}; Object.keys(s.album).forEach(function (k) { if (s.album[k] > 0) album[k] = s.album[k]; });
      set("album", album);
      set("medals", s.medals.filter(function (n) { return P.medal(n); }));
      set("medals_seen", s.medalsSeen.slice());
      var cnt = P.counters(); Object.keys(s.counters).forEach(function (k) { cnt[k] = s.counters[k]; });
      set("counters", cnt);
      set("pet", copyPet(s.pet));
      var d = dailyState();
      d.days = s.daily.days.slice();
      if (s.daily.date) { d.date = s.daily.date; d.best = s.daily.best || 0; }
      set("daily", d);
      set("festes", s.festes.slice());
      if (s.trofeus) set("trofeus", strList(get("trofeus", [])).concat(s.trofeus).filter(function (x, i, l) { return l.indexOf(x) === i; }).sort().slice(-200));
      if (!P.nickname() && s.nom != null && P.nickError(s.nom) === null) set("nick", P.cleanNick(s.nom));
      if (P.team() === null && s.equip != null && P.approvedTeams().indexOf(s.equip) >= 0) set("team", s.equip);
      var r = get("referee", {}) || {};
      Object.keys(s.referee).forEach(function (l) { r[l] = s.referee[l]; });
      set("referee", r);
      set("pending", true);
      P.checkMedals();
      P.board.syncAsync();
    }
  };

  P.sync = {};
  var syncChain = Promise.resolve();
  function serial(fn) { var p = syncChain.then(fn, fn); syncChain = p.catch(function () {}); return p; }
  function download(code) {
    return VSP.fs.get("progres/" + code).then(function (doc) {
      if (!doc) return { exists: false, snap: null };
      return { exists: true, snap: typeof doc.dades === "string" ? P.snapshot.parse(doc.dades) : null };
    });
  }
  function upload(code, s) {
    var text = JSON.stringify(s);
    if (text.length > P.snapshot.MAX_LENGTH) { var big = new Error(t("sync.too_big")); big.code = "TOO_BIG"; return Promise.reject(big); }
    return VSP.token().then(function () {
      return VSP.fs.set("progres/" + code, { dades: text, owner: VSP.uid() || "", updated: P.now().toISOString() });
    });
  }
  /** Desa el progrés: creates a code the first time, otherwise downloads + merges; uploads. Resolves the code. */
  P.sync.save = function () {
    return serial(function () {
      var code = P.code.get();
      if (!code) { code = P.code.generate(); P.code.set(code); }
      var local = P.snapshot.export();
      return download(code).then(function (d) {
        var merged = d.snap ? P.snapshot.merge(local, d.snap) : local;
        if (!P.snapshot.equal(merged, local)) { P.snapshot.apply(merged); merged = P.snapshot.export(); VSPG.emit("progress"); }
        return upload(code, merged);
      }).then(function () { P.board.syncAsync(); return code; });
    });
  };
  /** Recupera amb un codi: false if there is no progress with that code (or it is not valid). */
  P.sync.restore = function (raw) {
    var code = P.code.normalize(raw);
    if (!code) return Promise.resolve(false);
    return serial(function () {
      return download(code).then(function (d) {
        if (!d.exists || !d.snap) return false;
        P.snapshot.apply(P.snapshot.merge(P.snapshot.export(), d.snap));
        var merged = P.snapshot.export();   // after apply: with the medals the merge may have given
        P.code.set(code);
        VSPG.emit("progress");
        return upload(code, merged).then(function () { P.board.syncAsync(); return true; });
      });
    });
  };
  /** With a code: brings the other devices' progress and sends this one's. Resolves true if something local changed. */
  P.sync.sync = function () {
    var code = P.code.get();
    if (!code) return Promise.resolve(false);
    return serial(function () {
      var local = P.snapshot.export();
      return download(code).then(function (d) {
        var merged = d.snap ? P.snapshot.merge(local, d.snap) : local;
        var changed = !P.snapshot.equal(merged, local);
        if (changed) { P.snapshot.apply(merged); merged = P.snapshot.export(); VSPG.emit("progress"); }
        var up = (d.snap && P.snapshot.equal(merged, d.snap)) ? Promise.resolve() : upload(code, merged);
        return up.then(function () { return changed; });
      });
    });
  };
  /** After a game: send the progress in the background (only with a code). */
  P.sync.pushAsync = function () {
    if (!P.code.get()) return;
    P.sync.sync().catch(function () {});
  };
})();
