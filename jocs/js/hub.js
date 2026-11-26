/* El camí de la Pili (web) — the hub (port of GamesHub of extras/Games.kt) and its pages: the
 * club ranking (Leaderboard.kt: a tab per game, today's daily challenge and the team league),
 * medals, sticker album, "La meva Pili" (PetScreen.kt), nickname, variant chooser and the box to
 * save / restore the progress with a code (docs/jocs_progres.md).
 * Navigation with the URL hash so the browser back button works:
 *   (empty) hub · #joc=servei[&v=TURBO][&diari=1] · #ranking[=<game>|avui|lliga] · #medalles · #album · #pili
 *   the secret room (7 taps on the crest, secret.js): #sala · #setmanal (weekly challenge) · #secret=<field> (secret path)
 */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  var VSP = window.VSP, P = VSPG.progress, esc = VSP.esc, t = VSPG.t, th = VSPG.th;
  var hub = VSPG.hub = {};

  // core.js routes the club web on hashchange; this page has its own router
  try { window.removeEventListener("hashchange", VSP.route); } catch (e) {}

  var root = null, inAppNav = 0, rankCache = null, petTimers = [];

  // ---------------------------------------------------------------- routing

  function parseHash() {
    var h = (location.hash || "").replace(/^#/, ""), out = {};
    try { h = decodeURIComponent(h); } catch (e) {}
    h.split("&").forEach(function (p) {
      if (!p) return;
      var i = p.indexOf("=");
      if (i < 0) out[p] = ""; else out[p.slice(0, i)] = p.slice(i + 1);
    });
    return out;
  }
  hub.go = function (hash) { inAppNav++; location.hash = hash; };
  hub.back = function () {
    if (inAppNav > 0) { inAppNav--; history.back(); }
    else { location.hash = ""; }
  };
  function clearTimers() { petTimers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); petTimers = []; }

  hub.route = function () {
    var q = parseHash();
    if (window.VSP && VSP.statsTouch) VSP.statsTouch("pili" in q ? "pili" : "jocs");   // 📊 only if the statistics are on
    VSPG.stopGame();
    clearTimers();
    if (!("ranking" in q)) rankCache = null;
    var S = VSPG.secret;
    document.body.classList.toggle("in-game", "joc" in q || "secret" in q || "setmanal" in q);
    if ("secret" in q && S) {
      var sg = S.game(q.secret);
      document.title = t("hub.doc_title", sg ? sg.title : q.secret);
      VSPG.openGame(root, null, { secret: q.secret }, hub.back);
      window.scrollTo(0, 0);
      return;
    }
    if ("setmanal" in q && S) {
      var ch = S.challenge(P.today());
      document.title = t("hub.doc_title", t("sec.weekly_title"));
      VSPG.openGame(root, ch.game, { weekly: true }, hub.back);
      window.scrollTo(0, 0);
      return;
    }
    if ("sala" in q && S) { S.renderRoom(root, true); return; }
    if ("joc" in q) {
      document.title = t("hub.doc_title", P.title(q.joc));
      VSPG.openGame(root, q.joc, { variant: q.v || "NORMAL", daily: q.diari === "1" }, hub.back);
      window.scrollTo(0, 0);
      return;
    }
    if ("ranking" in q) { renderRanking(q.ranking || "toquets", q.mes === "1"); return; }
    if ("medalles" in q) { renderMedals(); return; }
    if ("album" in q) { renderAlbum(); return; }
    if ("pili" in q) { renderPet(); return; }
    renderHub();
  };

  function page(title, bodyHtml) {
    document.title = t("hub.doc_title", title);
    root.innerHTML = '<div class="jg-page"><header class="jg-head"><button type="button" class="jg-back" aria-label="' + esc(t("fr.back")) + '">←</button>' +
      "<h1>" + esc(title) + '</h1></header><div class="jg-wrap">' + bodyHtml + "</div></div>";
    root.querySelector(".jg-back").onclick = hub.back;
    window.scrollTo(0, 0);
    return root.querySelector(".jg-wrap");
  }
  hub.page = page;

  function stars(n) { return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, P.MAX_STARS_PER_GAME - n); }

  // ---------------------------------------------------------------- hub

  function stageCard(num, emoji, category, g, bests, lockedText, today) {
    var open = P.unlocked(g, bests) && !lockedText;
    var best = bests[g] || 0, st = P.stars(g, best), need = P.requirement(g);
    var sub;
    if (lockedText) sub = '<span class="jg-lock">' + esc(lockedText) + "</span>";
    else if (!open && need) sub = '<span class="jg-lock">' + esc(t("hub.locked_need", P.title(need))) + "</span>";
    else sub = '<span class="jg-stars" aria-label="' + esc(t("hub.stars_aria", st)) + '">' + stars(st) + "</span>";
    var clickable = open || !!lockedText;
    return '<button type="button" class="jg-card' + (open ? "" : " locked") + '" data-game="' + esc(g) + '"' + (clickable ? "" : " disabled") + ">" +
      (num != null ? '<span class="jg-num">' + num + "</span>" : "") +
      '<span class="jg-emoji" aria-hidden="true">' + (open || lockedText ? emoji : "🔒") + "</span>" +
      '<span class="jg-cmain">' + (category ? '<span class="jg-cat">' + esc(category.toUpperCase()) + "</span>" : "") +
      "<b>" + esc(P.title(g)) + "</b>" + sub + "</span>" +
      (open ? '<span class="jg-cbest"><b>' + best + "</b><small>" + esc(t("hub.record")) + "</small></span>" : "") + "</button>";
  }

  function tile(emoji, title, sub, hash, id) {
    return '<button type="button" class="jg-tile"' + (id ? ' id="' + id + '"' : "") + ' data-go="' + esc(hash) + '"><span class="jg-emoji" aria-hidden="true">' + emoji +
      '</span><b class="grow">' + esc(title) + '</b><span class="jg-tsub">' + esc(sub) + "</span></button>";
  }

  function renderHub() {
    document.title = t("hub.site_title");
    var bests = P.bests(), today = P.today(), fest = P.festivityOn(today);
    var dGame = P.daily.game(today), dBest = P.dailyBest(today), streak = P.streak(today);
    var unseen = P.unseenMedals(), nick = P.nickname();
    var html = '<div class="jg-page"><header class="jg-head"><a class="jg-back" href="../#club" aria-label="' + esc(t("hub.back_site")) + '">←</a>' +
      '<button type="button" class="jg-crest" id="jg-crest" aria-label="' + esc(t("sec.crest")) + '"><img src="../live/logo.jpg" alt=""></button>' +
      "<h1>" + esc(t("hub.title")) + '</h1><span class="jg-total">' + esc(t("hub.stars", P.totalStars(bests), P.maxStars())) + "</span></header>" +
      '<div class="jg-wrap">' +
      '<div class="jg-hero"><div class="jg-hero-pili"></div><p>' + esc(t("hub.intro")) + "</p></div>" +
      // daily challenge
      '<section class="jg-daily"><h2>' + esc(t("fr.daily_tag")) + "</h2>" +
      "<p>" + th("hub.daily_desc", "<b>" + esc(P.title(dGame)) + "</b>") + "</p>" +
      '<div class="jg-row between"><span class="jg-acc">' + esc(t("hub.daily_best", dBest)) + "</span>" +
      (streak > 0 ? "<b>" + esc(streak === 1 ? t("hub.streak1") : t("hub.streak", streak)) + "</b>" : "") + "</div>" +
      '<div class="jg-row"><button type="button" class="jg-btn primary" id="jg-daily-play">' + esc(t("fr.play")) + "</button>" +
      '<button type="button" class="jg-btn outline" data-go="ranking=avui">' + esc(t("hub.daily_rank")) + "</button></div></section>" +
      // the path
      '<h2 class="jg-sec">' + esc(t("hub.path")) + "</h2>" +
      '<p class="jg-intro">' + esc(t("hub.path_intro")) + "</p>" +
      P.STAGES.map(function (st, i) { return stageCard(i + 1, st.emoji, st.category, st.game, bests, null, today); }).join("") +
      '<h2 class="jg-sec">' + esc(t("hub.more")) + "</h2>" +
      stageCard(null, "🧠", null, "quiz", bests, null, today) +
      stageCard(null, "🃏", null, "memoria", bests, null, today) +
      stageCard(null, "🟨", null, "arbitre", bests, null, today) +
      stageCard(null, fest ? P.FESTIVITIES[fest].emojis[0] : "🎉", null, "temporada", bests,
        fest ? null : t("hub.season_off"), today) +
      '<h2 class="jg-sec">' + esc(t("hub.collection")) + "</h2>" +
      tile("🏅", t("hub.medals") + (unseen > 0 ? " •" : ""), t("hub.count", P.medals().length, P.MEDALS.length), "medalles") +
      tile("🃏", t("hub.album"), t("hub.count", P.uniqueCromos(), P.REGULAR.length), "album") +
      tile("🐣", t("hub.pet"), t("hub.level", P.pet.level(P.petState().xp)), "pili") +
      tile("🤝", t("hub.league"), t("league.my_points", P.leaguePoints()), "ranking=lliga") +
      '<button type="button" class="jg-btn primary wide big" data-go="ranking">' + esc(t("hub.ranking_btn")) + "</button>" +
      '<p class="jg-nick">' + (nick ? th("hub.playing_as", "<b>" + esc(nick) + "</b>") : esc(t("fr.nick_none"))) + "</p>" +
      '<div class="jg-center"><button type="button" class="jg-link" id="jg-nick-edit">' + esc(nick ? t("hub.nick_edit") : t("hub.nick_set")) + "</button></div>" +
      saveBoxHtml() +
      langsHtml() +
      '<p class="jg-foot">Club Vòlei Santpedor · <a href="../">' + esc(t("hub.foot_site")) + '</a> · <a href="../app/">' + esc(t("hub.foot_app")) + "</a></p>" +
      "</div></div>";
    root.innerHTML = html;
    VSPG.piliWidget(root.querySelector(".jg-hero-pili"), 96, { mood: "cheer", style: "spiker", prop: VSPG.propFor(fest) });
    VSP.each(".jg-card[data-game]", function (b) { b.onclick = function () { openGame(b.getAttribute("data-game")); }; }, root);
    VSP.each("[data-go]", function (b) { b.onclick = function () { hub.go(b.getAttribute("data-go")); }; }, root);
    VSP.$("jg-daily-play").onclick = function () { hub.go("joc=" + dGame + "&diari=1"); };
    VSP.$("jg-nick-edit").onclick = function () { nicknameDialog(renderHub); };
    VSP.$("jg-crest").onclick = crestTap;
    bindSaveBox();
    VSP.each("[data-lang]", function (b) { b.onclick = function () { setLang(b.getAttribute("data-lang")); }; }, root);
  }

  /** 7 taps on the crest (less than 1.5 s apart): the secret room (ClubHeader of the app). */
  var crestTaps = 0, crestLast = 0;
  function crestTap() {
    var S = VSPG.secret, now = Date.now();
    if (!S) return;
    crestTaps = now - crestLast < S.TAP_GAP_MS ? crestTaps + 1 : 1;
    crestLast = now;
    var left = S.CREST_TAPS - crestTaps;
    if (left <= 0) { crestTaps = 0; hub.go("sala"); return; }
    if (left <= 3) VSPG.toast(VSPG.tn("sec.taps_left", left));
  }

  /** The language of the games (same choice as the club web: localStorage "lang"; Catalan by default). */
  var LANG_NAMES = [["ca", "Català"], ["es", "Español"], ["en", "English"]];
  function langsHtml() {
    return '<div class="jg-langs" role="group" aria-label="' + esc(t("hub.lang")) + '">' + LANG_NAMES.map(function (l) {
      return '<button type="button" class="jg-btn small ghost' + (l[0] === VSPG.lang ? " on" : "") + '" data-lang="' + l[0] + '" lang="' + l[0] + '"' +
        (l[0] === VSPG.lang ? ' aria-pressed="true"' : ' aria-pressed="false"') + ">" + l[1] + "</button>";
    }).join("") + "</div>";
  }
  function setLang(lang) {
    if (lang === VSPG.lang) return;
    VSP.store("lang", lang);
    location.reload();
  }

  /** Opens a game of the hub: the variant chooser when it has variants unlocked. */
  function openGame(g) {
    var bests = P.bests();
    if (P.hasVariants(g, bests) && P.unlocked(g, bests)) { variantDialog(g, bests); return; }
    hub.go("joc=" + g);
  }

  function variantDialog(g, bests) {
    var html = '<div class="jg-variants">' + P.VARIANTS.map(function (v) {
      if (P.variantUnlocked(v.id, g, bests)) return '<button type="button" class="jg-btn ghost wide" data-v="' + v.id + '">' + v.emoji + "  " + esc(v.title) + "</button>";
      var need = v.id === "NIT" ? t("hub.v_need_nit") : v.id === "TURBO" ? t("hub.v_need_turbo") : t("hub.v_need_mirall", P.MIRROR_STARS);
      return '<p class="jg-vlocked">' + esc(t("hub.v_locked", v.title, need)) + "</p>";
    }).join("") + "</div>";
    var d = VSPG.modal(P.title(g) + " · " + t("hub.mode"), html, [{ text: t("hub.cancel") }]);
    VSP.each("[data-v]", function (b) {
      b.onclick = function () { d.close(); hub.go("joc=" + g + (b.getAttribute("data-v") === "NORMAL" ? "" : "&v=" + b.getAttribute("data-v"))); };
    }, d.el);
  }

  function nicknameDialog(after) {
    var cur = P.nickname() || "";
    var d = VSPG.modal(t("hub.nick_title"),
      "<p>" + esc(t("hub.nick_text")) + "</p>" +
      '<label class="jg-label" for="jg-nick-in">' + esc(t("hub.nick_label")) + '</label><input id="jg-nick-in" class="jg-input" maxlength="20" autocomplete="off" value="' + esc(cur) + '">' +
      '<p class="jg-hint" id="jg-nick-hint">' + esc(P.NICK_TEXT.HINT) + "</p>",
      [{ text: t("hub.cancel") }, {
        text: t("hub.save"), primary: true, onClick: function () {
          var v = VSP.$("jg-nick-in").value, err = P.nickError(v);
          if (err) { var h = VSP.$("jg-nick-hint"); h.textContent = P.NICK_TEXT[err]; h.classList.add("bad"); return false; }
          P.setNickname(v);
          VSPG.toast(t("hub.nick_saved"));
          if (after) after();
        }
      }]);
    var input = VSP.$("jg-nick-in");
    input.oninput = function () {
      var h = VSP.$("jg-nick-hint"), n = P.cleanNick(input.value);
      var err = n.length > P.MAX_NICK ? "TOO_LONG" : null;
      h.textContent = err ? P.NICK_TEXT[err] : P.NICK_TEXT.HINT;
      h.classList.toggle("bad", !!err);
    };
    input.onkeydown = function (e) { if (e.key === "Enter") d.el.querySelector(".jg-btn.primary").click(); };
    return d;
  }
  hub.nicknameDialog = nicknameDialog;

  // ---------------------------------------------------------------- save / restore with a code

  var saveMsg = null;   // {text, bad}
  function saveBoxHtml() {
    var code = P.code.get();
    return '<section class="jg-save" id="jg-save"><h2>' + esc(t("sync.title")) + "</h2>" +
      '<p class="jg-small">' + esc(t("sync.intro")) + "</p>" +
      (code ? '<p class="jg-small"><b>' + esc(t("sync.your_code")) + '</b></p><div class="jg-code" id="jg-code">' + esc(P.code.pretty(code)) + "</div>" +
        '<div class="jg-row"><button type="button" class="jg-btn ghost small" id="jg-code-copy">' + esc(t("sync.copy")) + "</button>" +
        '<button type="button" class="jg-btn ghost small" id="jg-code-share">' + esc(t("sync.share")) + "</button></div>" +
        '<p class="jg-small">' + esc(t("sync.auto")) + "</p>" : "") +
      '<button type="button" class="jg-btn primary wide" id="jg-save-now">' + esc(code ? t("sync.save_now") : t("sync.create")) + "</button>" +
      "<h3>" + esc(t("sync.restore_h")) + "</h3>" +
      '<div class="jg-row"><input class="jg-input grow" id="jg-restore-in" placeholder="XXXXX-XXXXX" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="' + esc(t("sync.code_aria")) + '">' +
      '<button type="button" class="jg-btn primary" id="jg-restore">' + esc(t("sync.restore_btn")) + "</button></div>" +
      '<p class="jg-msg' + (saveMsg && saveMsg.bad ? " bad" : "") + '" id="jg-save-msg" role="status" aria-live="polite">' + (saveMsg ? esc(saveMsg.text) : "") + "</p></section>";
  }
  var busy = false;
  function setMsg(text, bad) {
    saveMsg = text ? { text: text, bad: !!bad } : null;
    var el = VSP.$("jg-save-msg");
    if (el) { el.textContent = text || ""; el.classList.toggle("bad", !!bad); }
  }
  function setBusy(on) {
    busy = on;
    ["jg-save-now", "jg-restore"].forEach(function (id) { var b = VSP.$(id); if (b) b.disabled = on; });
    if (on) setMsg(t("sync.wait"));
  }
  function offlineText(e) {
    if (e && e.status === 403) return t("sync.denied");
    if (e && e.code === "TOO_BIG") return t("sync.too_big");
    return t("sync.offline");
  }
  function rerenderKeepingScroll() {
    var y = window.pageYOffset;
    renderHub();
    window.scrollTo(0, y);
  }
  function bindSaveBox() {
    var copy = VSP.$("jg-code-copy"), share = VSP.$("jg-code-share");
    if (copy) copy.onclick = function () {
      VSPG.copy(P.code.pretty(P.code.get())).then(function (ok) { setMsg(ok ? t("sync.copied") : t("sync.copy_fail"), !ok); });
    };
    if (share) share.onclick = function () { VSPG.share(t("sync.share_text", P.code.pretty(P.code.get())) + " · " + VSPG.SITE_URL); };
    VSP.$("jg-save-now").onclick = function () {
      if (busy) return;
      setBusy(true);
      P.sync.save().then(function () {
        busy = false;
        saveMsg = { text: t("sync.saved"), bad: false };
        rerenderKeepingScroll();
      }, function (e) { setBusy(false); setMsg(offlineText(e), true); });
    };
    var input = VSP.$("jg-restore-in");
    input.onkeydown = function (e) { if (e.key === "Enter") VSP.$("jg-restore").click(); };
    VSP.$("jg-restore").onclick = function () {
      if (busy) return;
      var code = P.code.normalize(input.value);
      if (!input.value.trim()) { setMsg(t("sync.empty"), true); input.focus(); return; }
      if (!code) { setMsg(t("sync.invalid"), true); input.focus(); return; }
      var mine = P.code.get();
      if (mine === code) { setMsg(t("sync.mine"), false); return; }
      VSPG.modal(t("sync.restore_title"),
        "<p>" + th("sync.restore_q", "<b>" + esc(P.code.pretty(code)) + "</b>") + "</p>" +
        (mine ? "<p>" + th("sync.restore_switch", "<b>" + esc(P.code.pretty(mine)) + "</b>") + "</p>" : ""),
        [{ text: t("hub.cancel") }, {
          text: t("sync.restore_btn"), primary: true, onClick: function () {
            setBusy(true);
            P.sync.restore(code).then(function (ok) {
              busy = false;
              if (!ok) { setBusy(false); setMsg(t("sync.not_found"), true); return; }
              saveMsg = { text: t("sync.restored"), bad: false };
              rerenderKeepingScroll();
            }, function (e) { setBusy(false); setMsg(offlineText(e), true); });
          }
        }]);
    };
  }

  // ---------------------------------------------------------------- ranking

  var TAB_DAILY = "avui", TAB_LEAGUE = "lliga";
  /** Per-game tabs: "Sempre" (all-time records) or "Aquest mes" (the documents of the current month). */
  function rankHash(tab, month) { return "#ranking=" + tab + (month ? "&mes=1" : ""); }
  function renderRanking(tab, month) {
    if (tab !== TAB_DAILY && tab !== TAB_LEAGUE && !P.game(tab)) tab = "toquets";
    var perGame = tab !== TAB_DAILY && tab !== TAB_LEAGUE;
    month = !!month && perGame;
    var nick = P.nickname();
    var tabs = P.GAMES.map(function (g) { return [g.id, g.title]; }).concat([[TAB_DAILY, t("hub.daily_rank")], [TAB_LEAGUE, t("hub.league")]]);
    var body = page(t("rank.title"),
      '<div class="jg-row between jg-nickrow"><span class="grow">' + (nick ? th("hub.playing_as", "<b>" + esc(nick) + "</b>") : esc(t("fr.nick_none"))) + "</span>" +
      '<button type="button" class="jg-link" id="jg-nick-edit">✏️ ' + esc(nick ? t("hub.nick_edit") : t("hub.nick_set")) + "</button></div>" +
      '<div class="jg-tabs" role="tablist">' + tabs.map(function (x) {
        return '<button type="button" role="tab" class="jg-tab' + (x[0] === tab ? " on" : "") + '" aria-selected="' + (x[0] === tab) + '" data-tab="' + x[0] + '">' + esc(x[1]) + "</button>";
      }).join("") + "</div>" +
      (perGame ? '<div class="jg-rank-toggle" role="group">' +
        '<button type="button" class="jg-tab' + (month ? "" : " on") + '" aria-pressed="' + !month + '" data-month="0">' + esc(t("rank.always")) + "</button>" +
        '<button type="button" class="jg-tab' + (month ? " on" : "") + '" aria-pressed="' + month + '" data-month="1">' + esc(t("rank.month")) + "</button></div>" : "") +
      '<div id="jg-rank-body"></div>');
    VSP.$("jg-nick-edit").onclick = function () { nicknameDialog(function () { rankCache = null; renderRanking(tab, month); }); };
    VSP.each(".jg-tab[data-tab]", function (b) {
      b.onclick = function () { var x = b.getAttribute("data-tab"); history.replaceState(null, "", rankHash(x, month)); renderRanking(x, month); };
    }, body);
    VSP.each("[data-month]", function (b) {
      b.onclick = function () { var mo = b.getAttribute("data-month") === "1"; history.replaceState(null, "", rankHash(tab, mo)); renderRanking(tab, mo); };
    }, body);
    var on = body.querySelector(".jg-tab.on");
    if (on && on.scrollIntoView) try { on.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {}
    var box = VSP.$("jg-rank-body");
    if (!P.rankingOn()) { box.innerHTML = '<p class="jg-empty">' + esc(t("rank.off")) + "</p>"; return; }
    function show() {
      if (!VSP.$("jg-rank-body") || box !== VSP.$("jg-rank-body")) return;
      if (rankCache.error) {
        box.innerHTML = '<div class="jg-center jg-offline"><div class="jg-off-pili"></div><p>' + esc(t("rank.offline")) + "</p>" +
          (P.board.pending() && P.nickname() ? '<p class="jg-acc">' + esc(t("rank.pending")) + "</p>" : "") +
          '<button type="button" class="jg-btn primary" id="jg-retry">' + esc(t("rank.retry")) + "</button></div>";
        VSPG.piliWidget(box.querySelector(".jg-off-pili"), 110, { mood: "sad" });
        VSP.$("jg-retry").onclick = function () { rankCache = null; renderRanking(tab, month); };
        return;
      }
      if (tab === TAB_LEAGUE) { renderLeague(box, rankCache.docs, tab); return; }
      var ranked = tab === TAB_DAILY ? P.dailyRank(rankCache.docs, P.today())
        : month ? P.monthRank(rankCache.docs, tab, P.month()) : P.rank(rankCache.docs, tab);
      box.innerHTML = rankList(ranked, rankCache.uid, tab === TAB_DAILY ? t("rank.daily_empty") : month ? t("rank.month_empty") : t("rank.empty"));
      var ep = box.querySelector(".jg-empty-pili");
      if (ep) VSPG.piliWidget(ep, 110, { mood: "wink", style: "spiker" });
    }
    if (rankCache && !rankCache.loading) { show(); return; }
    box.innerHTML = '<div class="jg-center"><div class="jg-spinner" aria-label="' + esc(t("rank.loading")) + '"></div></div>';
    if (rankCache && rankCache.loading) { rankCache.waiters.push(show); return; }
    var mine = rankCache = { loading: true, waiters: [show] };
    P.board.load().then(function (r) { mine.docs = r.docs; mine.uid = r.uid; }, function () { mine.error = true; mine.docs = []; })
      .then(function () {
        mine.loading = false;
        if (rankCache !== mine) return;
        var w = mine.waiters; mine.waiters = [];
        w.forEach(function (fn) { fn(); });
      });
  }

  function medal(pos) { return pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : pos + "."; }
  function rankRow(pos, e, me) {
    return '<div class="jg-rrow' + (me ? " me" : "") + '"><span class="jg-pos">' + medal(pos) + '</span><span class="grow jg-rname">' +
      esc(e.name) + (me ? " " + esc(t("rank.you")) : "") + '</span><b class="jg-rscore">' + e.score + "</b></div>";
  }
  hub.rankList = rankList;
  function rankList(ranked, uid, empty) {
    if (!ranked.length) return '<div class="jg-center"><div class="jg-empty-pili"></div><p>' + esc(empty) + "</p></div>";
    var mine = P.position(ranked, uid);
    var out = '<p class="jg-acc jg-pos-line">' + esc(mine ? t("rank.position", mine, ranked.length) : t("rank.not_ranked")) + "</p>";
    ranked.slice(0, P.TOP).forEach(function (e, i) { out += rankRow(i + 1, e, e.uid === uid); });
    if (mine && mine > P.TOP) out += '<p class="jg-center">⋯</p>' + rankRow(mine, ranked[mine - 1], true);
    return out;
  }

  function teamName(id) { var x = VSP.team(id); return x ? x.name : String(id); }
  function renderLeague(box, docs, tab) {
    P.dropUnapprovedTeam();
    var team = P.team(), table = P.leagueTable(docs), approved = P.approvedTeams();
    // only the teams where this browser is an approved member (👤 El meu equip of the club web)
    var mineTeams = VSP.TEAMS.filter(function (x) { return approved.indexOf(x.id) >= 0; });
    var html = '<p class="jg-small">' + esc(t("league.intro")) + "</p>";
    if (mineTeams.length) {
      var opts = '<option value="">' + esc(t("league.none")) + "</option>" + mineTeams.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === team ? " selected" : "") + ">" + esc(x.name) + "</option>";
      }).join("");
      html += '<div class="jg-row"><label for="jg-team" class="jg-label inline">' + esc(t("league.pick")) + ':</label><select id="jg-team" class="jg-input grow">' + opts + "</select></div>";
    } else {
      html += '<p class="jg-acc" id="jg-team-hint">' + th("league.need_member", '<a href="../#meu-equip">' + esc(t("league.my_team")) + "</a>") + "</p>";
    }
    html += '<p class="jg-acc">' + esc(t("league.my_points", P.leaguePoints())) + "</p>";
    if (!table.length) html += '<p class="jg-empty">' + esc(t("league.empty")) + "</p>";
    table.forEach(function (r, i) {
      var me = r.team === team;
      html += '<div class="jg-rrow' + (me ? " me" : "") + '"><span class="jg-pos">' + medal(i + 1) + '</span><span class="grow"><b>' + esc(teamName(r.team)) +
        '</b><span class="jg-rsub">' + esc(t("league.row", r.points, r.players)) + '</span></span><b class="jg-rscore">' + r.points + "</b></div>";
    });
    box.innerHTML = html;
    var sel = VSP.$("jg-team");
    if (sel) sel.onchange = function () {
      var v = this.value;
      if (!P.setTeam(v === "" ? null : Number(v))) return;
      // send it now and read the league again
      var up = P.nickname() ? P.board.upload().catch(function () {}) : Promise.resolve();
      rankCache = null;
      up.then(function () { if ((parseHash().ranking || "") === tab) renderRanking(tab); });
    };
  }

  // ---------------------------------------------------------------- medals

  function renderMedals() {
    P.checkMedals();
    var earned = P.medals();
    var list = P.MEDALS.slice().sort(function (a, b) {
      function rank(m) { return earned.indexOf(m.id) >= 0 ? 0 : !m.secret ? 1 : 2; }
      return (rank(a) - rank(b)) || (P.medalOrder(a.id) - P.medalOrder(b.id));
    });
    var html = '<div class="jg-center"><p class="jg-big">' + esc(t("med.count", earned.length, P.MEDALS.length)) + "</p>" +
      '<p class="jg-small">' + esc(t("med.intro")) + "</p></div>" +
      list.map(function (m) {
        var got = earned.indexOf(m.id) >= 0, hidden = !got && m.secret;
        return '<div class="jg-medal' + (got ? " got" : "") + '"><span class="jg-memoji' + (got || hidden ? "" : " dim") + '" aria-hidden="true">' + (hidden ? "❓" : m.emoji) + "</span>" +
          '<span class="grow"><b>' + esc(hidden ? t("med.secret") : m.title) + "</b>" + (hidden ? "" : "<small>" + esc(m.desc) + "</small>") + "</span>" +
          (got ? '<span class="jg-check" aria-label="' + esc(t("med.earned")) + '">✓</span>' : "") + "</div>";
      }).join("");
    page(t("hub.medals"), html);
    P.markMedalsSeen();
  }

  // ---------------------------------------------------------------- album

  function renderAlbum() {
    var owned = P.album();
    var festive = P.EXTRA;   // festive and special stickers (AlbumCatalog.EXTRA)
    function card(c) {
      var n = P.cromoNumber(c), count = owned[c.id] || 0;
      if (count <= 0) return '<div class="jg-cromo missing" aria-label="' + esc(t("alb.missing", n)) + '"><span class="q">?</span><small>#' + n + "</small></div>";
      var kind = P.ALBUM_KINDS.filter(function (k) { return k.id === c.kind; })[0];
      var bg = c.special ? "linear-gradient(#FFC107,#1C211E)"
        : c.festivity ? "linear-gradient(" + P.FESTIVITIES[c.festivity].colors[0] + "," + P.FESTIVITIES[c.festivity].colors[1] + ")"
        : "linear-gradient(" + kind.color + "," + kind.color + "b3)";
      return '<div class="jg-cromo" style="background:' + bg + '"><small class="n">#' + n + "</small>" + (count > 1 ? '<span class="dup">×' + count + "</span>" : "") +
        '<span class="e" aria-hidden="true">' + c.emoji + "</span><b>" + esc(c.title) + "</b></div>";
    }
    var html = '<div class="jg-center"><p class="jg-big">' + esc(t("hub.count", P.ownedRegular(owned), P.REGULAR.length)) + "</p>" +
      '<p class="jg-small">' + esc(t("alb.intro")) + "</p></div>";
    P.ALBUM_KINDS.forEach(function (k) {
      if (k.id === "FESTA") return;
      var list = P.REGULAR.filter(function (c) { return c.kind === k.id; });
      html += "<h3 class=\"jg-sec small\">" + esc(k.title) + '</h3><div class="jg-cromos">' + list.map(card).join("") + "</div>";
    });
    html += '<h3 class="jg-sec small">' + esc(t("alb.fest_count", P.ownedFestive(owned), festive.length)) + "</h3>" +
      '<p class="jg-small">' + esc(t("alb.fest_note")) + "</p>" +
      '<div class="jg-cromos">' + festive.map(card).join("") + "</div>";
    page(t("hub.album"), html);
  }

  // ---------------------------------------------------------------- La meva Pili

  var MILESTONE_TEXT = { 3: t("pet.lv3"), 5: t("pet.lv5"), 8: t("pet.lv8"), 10: t("pet.lv10") };
  /** 🎉 6.14: today's festivity and when the next festive item comes. */
  function festHtml() {
    var today = P.today(), u = P.upcomingFestivity(today);
    function emo(f) { var it = P.pet.item(P.pet.festive(f)); return it ? it.emoji : "🎉"; }
    var out = '<p class="jg-acc"><b>' + esc(t("pet.fest_title")) + "</b></p>";
    if (u.now) out += '<p class="jg-small">' + esc(t("pet.fest_now", emo(u.now), P.FESTIVITIES[u.now].title)) + "</p>";
    if (u.next) {
      var days = P.epochDay(u.next[1]) - P.epochDay(today);
      var when = new Date(u.next[1] + "T12:00:00").toLocaleDateString(VSP.locale ? VSP.locale() : "ca", { weekday: "long", day: "numeric", month: "long" });
      out += '<p class="jg-small">' + esc(t("pet.fest_next", emo(u.next[0]), P.FESTIVITIES[u.next[0]].title, when, t(days === 1 ? "pet.fest_day" : "pet.fest_days", days))) + "</p>";
    }
    return out;
  }
  function renderPet() {
    // 🍎 the daily item and the festivity special (once a day, like opening the app)
    P.earnPet("DAILY"); P.earnPet("FESTIVE");
    // 🏆 a ★ team won (6.11): a trophy per match, never twice with the app
    var trophies = P.claimWins ? P.claimWins() : 0;
    function bar(key, cls) { return '<div class="jg-stat"><b>' + esc(t("pet." + key)) + '</b><div class="jg-bar ' + cls + '"><i id="jg-pet-' + key + '"></i></div></div>'; }
    var body = page(t("hub.pet"),
      '<div class="jg-center"><p class="jg-big" id="jg-pet-level"></p><div class="jg-bar xp"><i id="jg-pet-xpbar"></i></div><p class="jg-small" id="jg-pet-xp"></p>' +
      '<button type="button" class="jg-pet" id="jg-pet" aria-label="' + esc(t("pet.aria")) + '"></button>' +
      '<p class="jg-bubble" id="jg-pet-bubble" aria-live="polite"></p></div>' +
      bar("food", "food") + bar("joy", "joy") + bar("energy", "energy") + bar("clean", "clean") + bar("fit", "fit") +
      '<button type="button" class="jg-btn primary wide big" id="jg-feed">' + esc(t("pet.feed")) + "</button>" +
      '<p class="jg-small jg-center" id="jg-feed-wait"></p>' +
      '<div class="jg-care"><button type="button" class="jg-btn" id="jg-nap">' + esc(t("pet.nap")) + '</button>' +
      '<button type="button" class="jg-btn" id="jg-shower">' + esc(t("pet.shower")) + "</button></div>" +
      '<p class="jg-small jg-center" id="jg-care-wait"></p>' +
      '<div class="jg-inv"><h3>' + esc(t("pet.inventory")) + '</h3><div id="jg-inv"></div>' +
      festHtml() +
      '<p class="jg-acc"><b>' + esc(t("pet.earn_title")) + '</b></p><p class="jg-small jg-pre">' + esc(t("pet.earn_list")) + "</p></div>" +
      '<div id="jg-milestone"></div>' +
      '<p class="jg-small jg-center">' + esc(t("pet.train")) + "</p>");
    var petBtn = VSP.$("jg-pet");
    var widget = VSPG.piliWidget(petBtn, 240, { mood: "happy", style: "green", shadow: true });
    var message = null, msgTimer = 0, cheerTimer = 0, cheer = false, lastTickle = 0, invKey = null;
    if (trophies) { message = t("pet.trophy_won"); cheer = true; }
    function update() {
      if (!document.body.contains(petBtn)) return;
      var now = P.nowSec(), pet = P.petState(now), level = P.pet.level(pet.xp);
      VSP.$("jg-pet-level").textContent = t("pet.level", level);
      VSP.$("jg-pet-xpbar").style.width = Math.round(P.pet.levelProgress(pet.xp) * 100) + "%";
      VSP.$("jg-pet-xp").textContent = t("pet.xp", pet.xp, P.pet.xpFor(level + 1), level + 1);
      ["food", "joy", "energy", "clean", "fit"].forEach(function (k) { VSP.$("jg-pet-" + k).style.width = Math.round(pet[k] * 100) + "%"; });
      widget.set({ mood: cheer ? "cheer" : P.pet.mood(pet) });
      var need = P.pet.need(pet);
      VSP.$("jg-pet-bubble").textContent = message || t({ food: "pet.hungry", joy: "pet.bored", energy: "pet.tired", clean: "pet.dirty" }[need] || "pet.tap");
      var can = P.pet.canFeed(pet, now);
      VSP.$("jg-feed").disabled = !can;
      VSP.$("jg-feed-wait").textContent = can ? "" : t("pet.feed_wait", P.pet.formatWait(P.pet.feedWait(pet, now)));
      var canNap = P.pet.canNap(pet, now), canShower = P.pet.canShower(pet, now);
      VSP.$("jg-nap").disabled = !canNap; VSP.$("jg-shower").disabled = !canShower;
      VSP.$("jg-care-wait").textContent = [
        canNap ? "" : t("pet.nap_wait", P.pet.formatWait(Math.max(0, P.pet.NAP_EVERY - (now - pet.lastNap)))),
        canShower ? "" : t("pet.shower_wait", P.pet.formatWait(Math.max(0, P.pet.SHOWER_EVERY - (now - pet.lastShower))))
      ].filter(Boolean).join("\n");
      // 🎒 redrawn only when it changes (keeps the focus on the buttons)
      var owned = P.PET_ITEMS.filter(function (x) { return (pet.inv[x.id] || 0) > 0; });
      var key = owned.map(function (x) { return x.id + pet.inv[x.id]; }).join(",");
      if (key !== invKey) {
        invKey = key;
        VSP.$("jg-inv").innerHTML = owned.length ? '<p class="jg-small">' + esc(t("pet.inventory_hint")) + '</p><div class="jg-items">' +
          owned.map(function (x) {
            return '<button type="button" class="jg-item" data-item="' + esc(x.id) + '" aria-label="' + esc(x.name + " ×" + pet.inv[x.id]) + '">' +
              '<span class="e">' + x.emoji + '</span><span class="n">×' + pet.inv[x.id] + '</span><span class="l">' + esc(x.name) + "</span></button>";
          }).join("") + "</div>"
          : '<p class="jg-small">' + esc(t("pet.inventory_empty")) + "</p>";
      }
      var ms = P.pet.milestone(level), next = P.pet.nextMilestone(level);
      VSP.$("jg-milestone").innerHTML = (ms ? '<p class="jg-milestone">' + esc(MILESTONE_TEXT[ms]) + "</p>" : "") +
        (next ? '<p class="jg-acc jg-center jg-small">' + esc(t("pet.next_msg", next)) + "</p>" : "");
    }
    function say(text) {
      message = text; clearTimeout(msgTimer);
      msgTimer = setTimeout(function () { message = null; update(); }, 3500); petTimers.push(msgTimer);
    }
    function cheerUp() {
      cheer = true; clearTimeout(cheerTimer);
      cheerTimer = setTimeout(function () { cheer = false; update(); }, 1500); petTimers.push(cheerTimer);
    }
    function freshMedals() {
      return P.checkMedals().map(function (id) { var m = P.medal(id); return t("rew.medal", m.emoji + " " + m.title); }).join("\n");
    }
    /** Nap, shower or an item: [change] gives the new state; [said] is her answer. */
    function care(change, said) {
      var now = P.nowSec(), before = P.petState(now), after = change(before, now);
      if (JSON.stringify(after) === JSON.stringify(before)) { update(); return; }
      P.savePet(after, false);
      var m = freshMedals();
      say(said + (m ? "\n" + m : ""));
      cheerUp();
      try { if (navigator.vibrate) navigator.vibrate(20); } catch (e) {}
      P.sync.pushAsync();
      update();
    }
    petBtn.onclick = function () {
      try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
      petBtn.classList.remove("jump"); void petBtn.offsetWidth; petBtn.classList.add("jump");
      cheerUp();
      var t = Date.now();
      if (t - lastTickle >= P.pet.TICKLE_GAP_MS) {
        lastTickle = t;
        var now = P.nowSec();
        P.savePet(P.pet.tickle(P.petState(now), now), false);
        P.inc(P.COUNTER.PET_TICKLES);
        var m = freshMedals();
        if (m) say(m);
      }
      update();
    };
    VSP.$("jg-feed").onclick = function () {
      var now = P.nowSec(), before = P.petState(now);
      if (!P.pet.canFeed(before, now)) { update(); return; }
      P.savePet(P.pet.feed(before, now), false);
      P.inc(P.COUNTER.PET_FED);
      var m = freshMedals();
      say(t("pet.yum") + (m ? "\n" + m : ""));
      cheerUp();
      update();
    };
    VSP.$("jg-nap").onclick = function () { care(P.pet.nap, t("pet.nap_done")); };
    VSP.$("jg-shower").onclick = function () { care(P.pet.shower, t("pet.shower_done")); };
    VSP.$("jg-inv").onclick = function (e) {
      var b = e.target.closest && e.target.closest("[data-item]");
      if (!b) return;
      var x = P.pet.item(b.getAttribute("data-item"));
      if (x) care(function (s, now) { return P.pet.use(s, x.id, now); }, t("pet.used", x.emoji + " " + x.name));
    };
    update();
    petTimers.push(setInterval(update, 20000));
    return body;
  }

  // ---------------------------------------------------------------- start

  hub.start = function (el) {
    root = el || VSP.$("app");
    window.addEventListener("hashchange", hub.route);
    window.addEventListener("pagehide", function () { VSPG.stopGame(); });
    window.addEventListener("online", function () { P.board.syncAsync(0); });
    // re-draw the hub when the progress changes from elsewhere (a code restored, another device)
    var pend = 0;
    VSPG.on("progress", function () {
      clearTimeout(pend);
      pend = setTimeout(function () {
        var q = parseHash();
        if (!Object.keys(q).length && root.querySelector(".jg-hero")) {
          var y = window.pageYOffset; renderHub(); window.scrollTo(0, y);
        }
      }, 50);
    });
    hub.route();
    // remote switches (config/app: "ranking" can be turned off by the club)
    VSP.fs.get("config/app").then(function (cfg) { VSP.config = VSP.parseConfig(cfg); VSPG.configLoaded = true; }, function () {});
    // linked from "El meu equip" with a code that carried the games progress: restore it once (merged
    // with this browser's progress, nothing is lost); otherwise, with a saved code: bring the progress
    // of the other phones / the app and send this one's
    var pending = VSP.storeJson("jocs_pending_code", undefined, null);
    if (typeof pending === "string" && pending && pending !== P.code.get()) {
      P.sync.restore(pending).then(function () { VSP.store("jocs_pending_code", null); }, function () {});
    } else {
      if (pending) VSP.store("jocs_pending_code", null);
      P.sync.sync().catch(function () {});
    }
    P.dropUnapprovedTeam();   // left the team (👤 El meu equip): out of the league
    if (VSPG.secret) VSPG.secret.recordOpen();   // the secret statistics: days the games were opened
    P.board.syncAsync(2000);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { hub.start(); });
  else setTimeout(function () { hub.start(); }, 0);
})();
