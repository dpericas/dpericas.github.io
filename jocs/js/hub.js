/* El camí de la Pili (web) — the hub (port of GamesHub of extras/Games.kt) and its pages: the
 * club ranking (Leaderboard.kt: a tab per game, today's daily challenge and the team league),
 * medals, sticker album, "La meva Pili" (PetScreen.kt), nickname, variant chooser and the box to
 * save / restore the progress with a code (docs/jocs_progres.md).
 * Navigation with the URL hash so the browser back button works:
 *   (empty) hub · #joc=servei[&v=TURBO][&diari=1] · #ranking[=<game>|avui|lliga] · #medalles · #album · #pili
 */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  var VSP = window.VSP, P = VSPG.progress, esc = VSP.esc;
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
    VSPG.stopGame();
    clearTimers();
    if (!("ranking" in q)) rankCache = null;
    document.body.classList.toggle("in-game", "joc" in q);
    if ("joc" in q) {
      document.title = P.title(q.joc) + " · Jocs del club";
      VSPG.openGame(root, q.joc, { variant: q.v || "NORMAL", daily: q.diari === "1" }, hub.back);
      window.scrollTo(0, 0);
      return;
    }
    if ("ranking" in q) { renderRanking(q.ranking || "toquets"); return; }
    if ("medalles" in q) { renderMedals(); return; }
    if ("album" in q) { renderAlbum(); return; }
    if ("pili" in q) { renderPet(); return; }
    renderHub();
  };

  function page(title, bodyHtml) {
    document.title = title + " · Jocs del club";
    root.innerHTML = '<div class="jg-page"><header class="jg-head"><button type="button" class="jg-back" aria-label="Enrere">←</button>' +
      "<h1>" + esc(title) + '</h1></header><div class="jg-wrap">' + bodyHtml + "</div></div>";
    root.querySelector(".jg-back").onclick = hub.back;
    window.scrollTo(0, 0);
    return root.querySelector(".jg-wrap");
  }

  function stars(n) { return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, P.MAX_STARS_PER_GAME - n); }

  // ---------------------------------------------------------------- hub

  function stageCard(num, emoji, category, g, bests, lockedText, today) {
    var open = P.unlocked(g, bests) && !lockedText;
    var best = bests[g] || 0, st = P.stars(g, best), need = P.requirement(g);
    var sub;
    if (lockedText) sub = '<span class="jg-lock">' + esc(lockedText) + "</span>";
    else if (!open && need) sub = '<span class="jg-lock">🔒 Aconsegueix 2 ⭐ a ' + esc(P.title(need)) + "</span>";
    else sub = '<span class="jg-stars" aria-label="' + st + ' de 5 estrelles">' + stars(st) + "</span>";
    var clickable = open || !!lockedText;
    return '<button type="button" class="jg-card' + (open ? "" : " locked") + '" data-game="' + esc(g) + '"' + (clickable ? "" : " disabled") + ">" +
      (num != null ? '<span class="jg-num">' + num + "</span>" : "") +
      '<span class="jg-emoji" aria-hidden="true">' + (open || lockedText ? emoji : "🔒") + "</span>" +
      '<span class="jg-cmain">' + (category ? '<span class="jg-cat">' + esc(category.toUpperCase()) + "</span>" : "") +
      "<b>" + esc(P.title(g)) + "</b>" + sub + "</span>" +
      (open ? '<span class="jg-cbest"><b>' + best + "</b><small>rècord</small></span>" : "") + "</button>";
  }

  function tile(emoji, title, sub, hash, id) {
    return '<button type="button" class="jg-tile"' + (id ? ' id="' + id + '"' : "") + ' data-go="' + esc(hash) + '"><span class="jg-emoji" aria-hidden="true">' + emoji +
      '</span><b class="grow">' + esc(title) + '</b><span class="jg-tsub">' + esc(sub) + "</span></button>";
  }

  function renderHub() {
    document.title = "Jocs del club · Vòlei Santpedor";
    var bests = P.bests(), today = P.today(), fest = P.festivityOn(today);
    var dGame = P.daily.game(today), dBest = P.dailyBest(today), streak = P.streak(today);
    var unseen = P.unseenMedals(), nick = P.nickname();
    var html = '<div class="jg-page"><header class="jg-head"><a class="jg-back" href="../#club" aria-label="Torna al web del club">←</a>' +
      '<h1>Jocs del club</h1><span class="jg-total">⭐ ' + P.totalStars(bests) + " de " + P.maxStars() + "</span></header>" +
      '<div class="jg-wrap">' +
      '<div class="jg-hero"><div class="jg-hero-pili"></div><p>Tria un joc i supera el teu rècord. Són els mateixos jocs que a l\'app del club!</p></div>' +
      // daily challenge
      '<section class="jg-daily"><h2>📅 Repte del dia</h2>' +
      "<p>Avui: <b>" + esc(P.title(dGame)) + "</b>. La mateixa partida per a tothom!</p>" +
      '<div class="jg-row between"><span class="jg-acc">El teu millor d\'avui: ' + dBest + "</span>" +
      (streak > 0 ? "<b>🔥 " + streak + (streak === 1 ? " dia seguit" : " dies seguits") + "</b>" : "") + "</div>" +
      '<div class="jg-row"><button type="button" class="jg-btn primary" id="jg-daily-play">Juga</button>' +
      '<button type="button" class="jg-btn outline" data-go="ranking=avui">Rànquing d\'avui</button></div></section>' +
      // the path
      '<h2 class="jg-sec">El camí de la Pili</h2>' +
      '<p class="jg-intro">Cada joc té 5 ⭐. Amb 2 ⭐ en una etapa s\'obre la següent. Amb més estrelles desbloqueges variants i cromos.</p>' +
      P.STAGES.map(function (st, i) { return stageCard(i + 1, st.emoji, st.category, st.game, bests, null, today); }).join("") +
      '<h2 class="jg-sec">Més jocs</h2>' +
      stageCard(null, "🧠", null, "quiz", bests, null, today) +
      stageCard(null, "🃏", null, "memoria", bests, null, today) +
      stageCard(null, "🟨", null, "arbitre", bests, null, today) +
      stageCard(null, fest ? P.FESTIVITIES[fest].emojis[0] : "🎉", null, "temporada", bests,
        fest ? null : "🔒 Torna-hi per una festa (Castanyada, Nadal, Carnestoltes, Sant Jordi, Sant Joan…)", today) +
      '<h2 class="jg-sec">La meva col·lecció</h2>' +
      tile("🏅", "Medalles" + (unseen > 0 ? " •" : ""), P.medals().length + " de " + P.MEDALS.length, "medalles") +
      tile("🃏", "Àlbum de cromos", P.uniqueCromos() + " de " + P.REGULAR.length, "album") +
      tile("🐣", "La meva Pili", "Nivell " + P.pet.level(P.petState().xp), "pili") +
      tile("🤝", "Lliga d'equips", "Aportes " + P.leaguePoints() + " punts", "ranking=lliga") +
      '<button type="button" class="jg-btn primary wide big" data-go="ranking">🏆 Rànquing del club</button>' +
      '<p class="jg-nick">' + (nick ? "Jugues com a <b>" + esc(nick) + "</b>" : "Posa't un àlies per sortir al rànquing del club.") + "</p>" +
      '<div class="jg-center"><button type="button" class="jg-link" id="jg-nick-edit">' + (nick ? "Canvia l'àlies" : "Posa't un àlies") + "</button></div>" +
      saveBoxHtml() +
      '<p class="jg-foot">Club Vòlei Santpedor · <a href="../">Web del club</a> · <a href="../app/">L\'app</a></p>' +
      "</div></div>";
    root.innerHTML = html;
    VSPG.piliWidget(root.querySelector(".jg-hero-pili"), 96, { mood: "cheer", style: "spiker", prop: VSPG.propFor(fest) });
    VSP.each(".jg-card[data-game]", function (b) { b.onclick = function () { openGame(b.getAttribute("data-game")); }; }, root);
    VSP.each("[data-go]", function (b) { b.onclick = function () { hub.go(b.getAttribute("data-go")); }; }, root);
    VSP.$("jg-daily-play").onclick = function () { hub.go("joc=" + dGame + "&diari=1"); };
    VSP.$("jg-nick-edit").onclick = function () { nicknameDialog(renderHub); };
    bindSaveBox();
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
      var need = v.id === "NIT" ? "3 ⭐ en aquest joc" : v.id === "TURBO" ? "5 ⭐ en aquest joc" : P.MIRROR_STARS + " ⭐ en total";
      return '<p class="jg-vlocked">🔒 ' + esc(v.title) + ": " + esc(need) + "</p>";
    }).join("") + "</div>";
    var d = VSPG.modal(P.title(g) + " · Mode de joc", html, [{ text: "Cancel·la" }]);
    VSP.each("[data-v]", function (b) {
      b.onclick = function () { d.close(); hub.go("joc=" + g + (b.getAttribute("data-v") === "NORMAL" ? "" : "&v=" + b.getAttribute("data-v"))); };
    }, d.el);
  }

  function nicknameDialog(after) {
    var cur = P.nickname() || "";
    var d = VSPG.modal("El teu àlies",
      "<p>Al rànquing només es publiquen l'àlies i els rècords dels jocs. No hi posis el teu nom complet.</p>" +
      '<label class="jg-label" for="jg-nick-in">Àlies</label><input id="jg-nick-in" class="jg-input" maxlength="20" autocomplete="off" value="' + esc(cur) + '">' +
      '<p class="jg-hint" id="jg-nick-hint">' + P.NICK_TEXT.HINT + "</p>",
      [{ text: "Cancel·la" }, {
        text: "Desa", primary: true, onClick: function () {
          var v = VSP.$("jg-nick-in").value, err = P.nickError(v);
          if (err) { var h = VSP.$("jg-nick-hint"); h.textContent = P.NICK_TEXT[err]; h.classList.add("bad"); return false; }
          P.setNickname(v);
          VSPG.toast("Àlies desat");
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
    return '<section class="jg-save" id="jg-save"><h2>💾 Desa el progrés</h2>' +
      '<p class="jg-small">Amb un codi pots recuperar els teus jocs (estrelles, rècords, medalles, cromos i la teva Pili) en un altre mòbil, a l\'app o en aquest web. Qui tingui el codi pot fer servir el teu progrés: guarda\'l bé.</p>' +
      (code ? '<p class="jg-small"><b>El teu codi</b></p><div class="jg-code" id="jg-code">' + esc(P.code.pretty(code)) + "</div>" +
        '<div class="jg-row"><button type="button" class="jg-btn ghost small" id="jg-code-copy">Copia</button>' +
        '<button type="button" class="jg-btn ghost small" id="jg-code-share">Comparteix</button></div>' +
        '<p class="jg-small">Amb aquest codi el progrés es desa sol després de cada partida.</p>' : "") +
      '<button type="button" class="jg-btn primary wide" id="jg-save-now">' + (code ? "Desa ara" : "Crea el meu codi i desa") + "</button>" +
      '<h3>Ja tens un codi? Recupera amb un codi</h3>' +
      '<div class="jg-row"><input class="jg-input grow" id="jg-restore-in" placeholder="XXXXX-XXXXX" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Codi del progrés">' +
      '<button type="button" class="jg-btn primary" id="jg-restore">Recupera</button></div>' +
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
    if (on) setMsg("Un moment…");
  }
  function offlineText(e) {
    if (e && e.status === 403) return "No s'ha pogut desar (permís denegat). Torna-ho a provar més tard.";
    if (e && e.message && /massa gran/.test(e.message)) return e.message;
    return "No s'ha pogut connectar. Torna-ho a provar amb connexió.";
  }
  function rerenderKeepingScroll() {
    var y = window.pageYOffset;
    renderHub();
    window.scrollTo(0, y);
  }
  function bindSaveBox() {
    var copy = VSP.$("jg-code-copy"), share = VSP.$("jg-code-share");
    if (copy) copy.onclick = function () {
      VSPG.copy(P.code.pretty(P.code.get())).then(function (ok) { setMsg(ok ? "Copiat" : "No s'ha pogut copiar: apunta't el codi.", !ok); });
    };
    if (share) share.onclick = function () { VSPG.share("El meu codi dels jocs del Vòlei Santpedor: " + P.code.pretty(P.code.get()) + " · " + VSPG.SITE_URL); };
    VSP.$("jg-save-now").onclick = function () {
      if (busy) return;
      setBusy(true);
      P.sync.save().then(function () {
        busy = false;
        saveMsg = { text: "✅ Desat. Amb aquest codi es guarda sol després de cada partida.", bad: false };
        rerenderKeepingScroll();
      }, function (e) { setBusy(false); setMsg(offlineText(e), true); });
    };
    var input = VSP.$("jg-restore-in");
    input.onkeydown = function (e) { if (e.key === "Enter") VSP.$("jg-restore").click(); };
    VSP.$("jg-restore").onclick = function () {
      if (busy) return;
      var code = P.code.normalize(input.value);
      if (!input.value.trim()) { setMsg("Escriu el codi que vas desar (XXXXX-XXXXX).", true); input.focus(); return; }
      if (!code) { setMsg("Aquest codi no és vàlid: ha de tenir 10 lletres i números (sense 0, O, 1, I ni L).", true); input.focus(); return; }
      var mine = P.code.get();
      if (mine === code) { setMsg("Aquest ja és el teu codi. Fes servir «Desa ara» per sincronitzar-lo.", false); return; }
      VSPG.modal("Recupera el progrés",
        "<p>Es baixarà el progrés del codi <b>" + esc(P.code.pretty(code)) + "</b> i s'ajuntarà amb el d'aquest navegador. No es perd res: es queda el millor de cada cosa.</p>" +
        (mine ? "<p>A partir d'ara aquest navegador desarà el progrés amb aquest codi (en lloc de <b>" + esc(P.code.pretty(mine)) + "</b>).</p>" : ""),
        [{ text: "Cancel·la" }, {
          text: "Recupera", primary: true, onClick: function () {
            setBusy(true);
            P.sync.restore(code).then(function (ok) {
              busy = false;
              if (!ok) { setBusy(false); setMsg("No hi ha cap progrés amb aquest codi.", true); return; }
              saveMsg = { text: "✅ Progrés recuperat i ajuntat amb el d'aquest navegador.", bad: false };
              rerenderKeepingScroll();
            }, function (e) { setBusy(false); setMsg(offlineText(e), true); });
          }
        }]);
    };
  }

  // ---------------------------------------------------------------- ranking

  var TAB_DAILY = "avui", TAB_LEAGUE = "lliga";
  function renderRanking(tab) {
    if (tab !== TAB_DAILY && tab !== TAB_LEAGUE && !P.game(tab)) tab = "toquets";
    var nick = P.nickname();
    var tabs = P.GAMES.map(function (g) { return [g.id, g.title]; }).concat([[TAB_DAILY, "Rànquing d'avui"], [TAB_LEAGUE, "Lliga d'equips"]]);
    var body = page("Rànquing del club",
      '<div class="jg-row between jg-nickrow"><span class="grow">' + (nick ? "Jugues com a <b>" + esc(nick) + "</b>" : "Posa't un àlies per sortir al rànquing del club.") + "</span>" +
      '<button type="button" class="jg-link" id="jg-nick-edit">✏️ ' + (nick ? "Canvia l'àlies" : "Posa't un àlies") + "</button></div>" +
      '<div class="jg-tabs" role="tablist">' + tabs.map(function (t) {
        return '<button type="button" role="tab" class="jg-tab' + (t[0] === tab ? " on" : "") + '" aria-selected="' + (t[0] === tab) + '" data-tab="' + t[0] + '">' + esc(t[1]) + "</button>";
      }).join("") + '</div><div id="jg-rank-body"></div>');
    VSP.$("jg-nick-edit").onclick = function () { nicknameDialog(function () { rankCache = null; renderRanking(tab); }); };
    VSP.each(".jg-tab", function (b) {
      b.onclick = function () { history.replaceState(null, "", "#ranking=" + b.getAttribute("data-tab")); renderRanking(b.getAttribute("data-tab")); };
    }, body);
    var on = body.querySelector(".jg-tab.on");
    if (on && on.scrollIntoView) try { on.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {}
    var box = VSP.$("jg-rank-body");
    if (!P.rankingOn()) { box.innerHTML = '<p class="jg-empty">El rànquing del club està aturat temporalment.</p>'; return; }
    function show() {
      if (!VSP.$("jg-rank-body") || box !== VSP.$("jg-rank-body")) return;
      if (rankCache.error) {
        box.innerHTML = '<div class="jg-center jg-offline"><div class="jg-off-pili"></div><p>No s\'ha pogut carregar el rànquing. Comprova la connexió.</p>' +
          (P.board.pending() && P.nickname() ? '<p class="jg-acc">El teu rècord es pujarà quan tornis a tenir connexió.</p>' : "") +
          '<button type="button" class="jg-btn primary" id="jg-retry">Torna-ho a provar</button></div>';
        VSPG.piliWidget(box.querySelector(".jg-off-pili"), 110, { mood: "sad" });
        VSP.$("jg-retry").onclick = function () { rankCache = null; renderRanking(tab); };
        return;
      }
      if (tab === TAB_LEAGUE) { renderLeague(box, rankCache.docs, tab); return; }
      var ranked = tab === TAB_DAILY ? P.dailyRank(rankCache.docs, P.today()) : P.rank(rankCache.docs, tab);
      box.innerHTML = rankList(ranked, rankCache.uid, tab === TAB_DAILY ? "Avui encara no ha jugat ningú amb àlies." :
        "Encara no hi ha ningú al rànquing d'aquest joc. Sigues el primer!");
      var ep = box.querySelector(".jg-empty-pili");
      if (ep) VSPG.piliWidget(ep, 110, { mood: "wink", style: "spiker" });
    }
    if (rankCache && !rankCache.loading) { show(); return; }
    box.innerHTML = '<div class="jg-center"><div class="jg-spinner" aria-label="Carregant"></div></div>';
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
      esc(e.name) + (me ? " (tu)" : "") + '</span><b class="jg-rscore">' + e.score + "</b></div>";
  }
  function rankList(ranked, uid, empty) {
    if (!ranked.length) return '<div class="jg-center"><div class="jg-empty-pili"></div><p>' + esc(empty) + "</p></div>";
    var mine = P.position(ranked, uid);
    var out = '<p class="jg-acc jg-pos-line">' + (mine ? "La teva posició: " + mine + " de " + ranked.length : "Encara no surts al rànquing d'aquest joc.") + "</p>";
    ranked.slice(0, P.TOP).forEach(function (e, i) { out += rankRow(i + 1, e, e.uid === uid); });
    if (mine && mine > P.TOP) out += '<p class="jg-center">⋯</p>' + rankRow(mine, ranked[mine - 1], true);
    return out;
  }

  function teamName(id) { var t = VSP.team(id); return t ? t.name : String(id); }
  function renderLeague(box, docs, tab) {
    var team = P.team(), table = P.leagueTable(docs);
    var opts = '<option value="">Cap</option>' + VSP.TEAMS.map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === team ? " selected" : "") + ">" + esc(t.name) + "</option>";
    }).join("");
    var html = '<p class="jg-small">Les teves ⭐, medalles i cromos sumen punts per al teu equip del club. Cal tenir un àlies al rànquing.</p>' +
      '<div class="jg-row"><label for="jg-team" class="jg-label inline">El meu equip:</label><select id="jg-team" class="jg-input grow">' + opts + "</select></div>" +
      '<p class="jg-acc">Aportes ' + P.leaguePoints() + " punts</p>";
    if (!table.length) html += '<p class="jg-empty">Encara no hi ha cap equip a la lliga.</p>';
    table.forEach(function (r, i) {
      var me = r.team === team;
      html += '<div class="jg-rrow' + (me ? " me" : "") + '"><span class="jg-pos">' + medal(i + 1) + '</span><span class="grow"><b>' + esc(teamName(r.team)) +
        '</b><span class="jg-rsub">' + r.points + " punts · " + r.players + ' jugadors/es</span></span><b class="jg-rscore">' + r.points + "</b></div>";
    });
    box.innerHTML = html;
    VSP.$("jg-team").onchange = function () {
      var v = this.value;
      P.setTeam(v === "" ? null : Number(v));
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
    var html = '<div class="jg-center"><p class="jg-big">🏅 ' + earned.length + " de " + P.MEDALS.length + " medalles</p>" +
      '<p class="jg-small">Juga, col·lecciona i cuida la Pili per guanyar-les. Algunes són secretes…</p></div>' +
      list.map(function (m) {
        var got = earned.indexOf(m.id) >= 0, hidden = !got && m.secret;
        return '<div class="jg-medal' + (got ? " got" : "") + '"><span class="jg-memoji' + (got || hidden ? "" : " dim") + '" aria-hidden="true">' + (hidden ? "❓" : m.emoji) + "</span>" +
          '<span class="grow"><b>' + esc(hidden ? "Medalla secreta" : m.title) + "</b>" + (hidden ? "" : "<small>" + esc(m.desc) + "</small>") + "</span>" +
          (got ? '<span class="jg-check" aria-label="Aconseguida">✓</span>' : "") + "</div>";
      }).join("");
    page("Medalles", html);
    P.markMedalsSeen();
  }

  // ---------------------------------------------------------------- album

  function renderAlbum() {
    var owned = P.album();
    var festive = P.ALBUM.filter(function (c) { return c.festivity; });
    function card(c) {
      var n = P.cromoNumber(c), count = owned[c.id] || 0;
      if (count <= 0) return '<div class="jg-cromo missing" aria-label="Cromo ' + n + ': encara no el tens"><span class="q">?</span><small>#' + n + "</small></div>";
      var kind = P.ALBUM_KINDS.filter(function (k) { return k.id === c.kind; })[0];
      var bg = c.festivity ? "linear-gradient(" + P.FESTIVITIES[c.festivity].colors[0] + "," + P.FESTIVITIES[c.festivity].colors[1] + ")"
        : "linear-gradient(" + kind.color + "," + kind.color + "b3)";
      return '<div class="jg-cromo" style="background:' + bg + '"><small class="n">#' + n + "</small>" + (count > 1 ? '<span class="dup">×' + count + "</span>" : "") +
        '<span class="e" aria-hidden="true">' + c.emoji + "</span><b>" + esc(c.title) + "</b></div>";
    }
    var html = '<div class="jg-center"><p class="jg-big">' + P.ownedRegular(owned) + " de " + P.REGULAR.length + "</p>" +
      '<p class="jg-small">Cada ⭐ nova als jocs et dona un cromo. Els repetits es marquen amb ×.</p></div>';
    P.ALBUM_KINDS.forEach(function (k) {
      if (k.id === "FESTA") return;
      var list = P.REGULAR.filter(function (c) { return c.kind === k.id; });
      html += "<h3 class=\"jg-sec small\">" + esc(k.title) + '</h3><div class="jg-cromos">' + list.map(card).join("") + "</div>";
    });
    html += '<h3 class="jg-sec small">Cromos de festa  ' + P.ownedFestive(owned) + " de " + festive.length + "</h3>" +
      '<p class="jg-small">Només es guanyen al joc de temporada, durant cada festa. No compten per completar l\'àlbum.</p>' +
      '<div class="jg-cromos">' + festive.map(card).join("") + "</div>";
    page("Àlbum de cromos", html);
  }

  // ---------------------------------------------------------------- La meva Pili

  var MILESTONE_TEXT = {
    3: "🎉 Nivell 3: la Pili ja fa toquets sense parar!", 5: "🎉 Nivell 5: la Pili ja juga a l'Escola del club!",
    8: "🎉 Nivell 8: la Pili ja remata com una sènior!", 10: "🏆 Nivell 10: la Pili és una llegenda verd i negra!"
  };
  function renderPet() {
    var body = page("La meva Pili",
      '<div class="jg-center"><p class="jg-big" id="jg-pet-level"></p><div class="jg-bar xp"><i id="jg-pet-xpbar"></i></div><p class="jg-small" id="jg-pet-xp"></p>' +
      '<button type="button" class="jg-pet" id="jg-pet" aria-label="Fes pessigolles a la Pili"></button>' +
      '<p class="jg-bubble" id="jg-pet-bubble" aria-live="polite"></p></div>' +
      '<div class="jg-stat"><b>🍎 Panxa</b><div class="jg-bar food"><i id="jg-pet-food"></i></div></div>' +
      '<div class="jg-stat"><b>😊 Alegria</b><div class="jg-bar joy"><i id="jg-pet-joy"></i></div></div>' +
      '<button type="button" class="jg-btn primary wide big" id="jg-feed">Dona-li fruita 🍎</button>' +
      '<p class="jg-small jg-center" id="jg-feed-wait"></p><div id="jg-milestone"></div>' +
      '<p class="jg-small jg-center">🏐 Cada partida als jocs l\'entrena: guanya experiència (i molta més amb ⭐ noves).</p>');
    var petBtn = VSP.$("jg-pet");
    var widget = VSPG.piliWidget(petBtn, 240, { mood: "happy", style: "green", shadow: true });
    var message = null, msgTimer = 0, cheerTimer = 0, cheer = false, lastTickle = 0;
    function update() {
      if (!document.body.contains(petBtn)) return;
      var now = P.nowSec(), pet = P.petState(now), level = P.pet.level(pet.xp);
      VSP.$("jg-pet-level").textContent = "Nivell " + level;
      VSP.$("jg-pet-xpbar").style.width = Math.round(P.pet.levelProgress(pet.xp) * 100) + "%";
      VSP.$("jg-pet-xp").textContent = pet.xp + " / " + P.pet.xpFor(level + 1) + " XP fins al nivell " + (level + 1);
      VSP.$("jg-pet-food").style.width = Math.round(pet.food * 100) + "%";
      VSP.$("jg-pet-joy").style.width = Math.round(pet.joy * 100) + "%";
      widget.set({ mood: cheer ? "cheer" : P.pet.mood(pet) });
      VSP.$("jg-pet-bubble").textContent = message || (pet.food < 0.25 ? "Tinc gana… 🍎" : pet.joy < 0.2 ? "M'avorreixo! Fem una partida?" : "Toca-la per fer-li pessigolles!");
      var can = P.pet.canFeed(pet, now);
      VSP.$("jg-feed").disabled = !can;
      VSP.$("jg-feed-wait").textContent = can ? "" : "🍎 Tornarà a tenir gana d'aquí a " + P.pet.formatWait(P.pet.feedWait(pet, now));
      var ms = P.pet.milestone(level), next = P.pet.nextMilestone(level);
      VSP.$("jg-milestone").innerHTML = (ms ? '<p class="jg-milestone">' + esc(MILESTONE_TEXT[ms]) + "</p>" : "") +
        (next ? '<p class="jg-acc jg-center jg-small">Proper premi al nivell ' + next + "</p>" : "");
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
      return P.checkMedals().map(function (id) { var m = P.medal(id); return "🏅 Medalla nova: " + m.emoji + " " + m.title; }).join("\n");
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
      say("Ñam! Gràcies! 🍎" + (m ? "\n" + m : ""));
      cheerUp();
      update();
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
    // with a saved code: bring the progress of the other phones / the app, send this one's
    P.sync.sync().catch(function () {});
    P.board.syncAsync(2000);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { hub.start(); });
  else setTimeout(function () { hub.start(); }, 0);
})();
