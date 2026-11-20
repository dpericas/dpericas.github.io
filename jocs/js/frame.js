/* El camí de la Pili (web) — game registry and the game shell (port of GameFrame / GamePanel /
 * RewardLines of extras/Games.kt): top bar (back, title with the variant emoji and the "Repte del
 * dia" tag, lives, score, record), the play field (NIT and MIRALL applied here), the start panel
 * (help + Juga) and the game over panel (score, record, rewards, Torna-hi, Comparteix).
 * Contract for the game modules: jocs_web_api.md (VSPG.games.register, api).
 */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  var VSP = window.VSP, P = VSPG.progress, esc = VSP.esc;

  VSPG.COLORS = { green: "#1E8C34", dark: "#0D3B1E", accent: "#B9F6C0", black: "#1C211E", white: "#fff" };
  VSPG.SITE_URL = "https://dpericas.github.io/jocs/";

  // ---------------------------------------------------------------- registry

  var registry = {};
  VSPG.games = {
    register: function (def) {
      if (!def || typeof def.id !== "string" || typeof def.start !== "function") {
        if (window.console) console.error("VSPG.games.register: cal id i start()", def);
        return;
      }
      registry[def.id] = def;
      VSPG.emit("games");
    },
    get: function (id) { return registry[id] || null; },
    has: function (id) { return !!registry[id]; },
    all: function () { return Object.keys(registry).map(function (k) { return registry[k]; }); }
  };

  // ---------------------------------------------------------------- small UI helpers (shared with hub.js)

  /** A modal dialog. html: body; buttons: [{text, primary, onClick(close) -> false keeps it open}]. Returns {el, close}. */
  VSPG.modal = function (title, html, buttons) {
    var prev = document.activeElement;
    var wrap = document.createElement("div");
    wrap.className = "jg-modal";
    wrap.innerHTML = '<div class="jg-dialog" role="dialog" aria-modal="true" aria-labelledby="jg-mt">' +
      '<h2 id="jg-mt">' + esc(title) + '</h2><div class="jg-mbody">' + html + '</div><div class="jg-mbtns"></div></div>';
    var box = wrap.querySelector(".jg-mbtns");
    function close() {
      if (!wrap.parentNode) return;
      wrap.parentNode.removeChild(wrap);
      document.removeEventListener("keydown", onKey);
      if (prev && prev.focus) try { prev.focus(); } catch (e) {}
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    (buttons || [{ text: "Tanca" }]).forEach(function (b) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "jg-btn " + (b.primary ? "primary" : "ghost");
      btn.textContent = b.text;
      btn.onclick = function () { if (!b.onClick || b.onClick(close) !== false) close(); };
      box.appendChild(btn);
    });
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(wrap);
    var f = wrap.querySelector("input, button");
    if (f) try { f.focus(); } catch (e) {}
    return { el: wrap, close: close };
  };

  VSPG.toast = function (msg) {
    if (VSP.$("toast")) { VSP.toast(msg); return; }
  };

  /** Shares a text (navigator.share) or copies it. */
  VSPG.share = function (text, title) {
    if (navigator.share) {
      return navigator.share({ title: title || "Vòlei Santpedor", text: text }).catch(function () {});
    }
    return VSPG.copy(text).then(function (ok) { VSPG.toast(ok ? "Copiat! Ja ho pots enganxar on vulguis." : text); });
  };
  VSPG.copy = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch (e) { return false; }
    }
  };

  // ---------------------------------------------------------------- the game shell

  var current = null;   // { id, def, handle, run }

  /** Stops the running game, if any (back / leaving). */
  VSPG.stopGame = function () {
    if (!current) return;
    var c = current;
    current = null;
    stopRun(c);
  };
  function stopRun(c) {
    if (c.run && c.run.handle && !c.run.stopped) {
      c.run.stopped = true;
      try { c.run.handle.stop(); } catch (e) { if (window.console) console.error(e); }
    }
  }

  function livesCanvas(el) {
    var c = document.createElement("canvas");
    c.className = "jg-lives";
    el.appendChild(c);
    var state = { n: 0, total: 0 };
    function draw() {
      if (!state.total) { c.hidden = true; return; }
      c.hidden = false;
      var h = 18, w = state.total * 20;
      var ctx = VSPG.setupCanvas(c, w, h);
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < state.total; i++) {
        var cx = h / 2 + i * (w / state.total), cy = h / 2, r = h / 2 * 0.9;
        if (i < state.n) VSPG.drawPili(ctx, cx, cy, r, { mood: "happy" });
        else { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fill(); }
      }
      c.setAttribute("aria-label", "Vides: " + state.n);
    }
    return {
      set: function (n, total) {
        if (total != null) state.total = Math.max(0, total | 0);
        n = Math.max(0, n | 0);
        if (n > state.total) state.total = n;
        state.n = n;
        draw();
      }
    };
  }

  /**
   * Shows game [id] in [root]. mode: {variant, daily}. onBack: back to the hub. A game whose
   * module is not loaded shows "Aviat!"; a locked one says what opens it.
   */
  VSPG.openGame = function (root, id, mode, onBack) {
    VSPG.stopGame();
    var info = P.game(id);
    var def = VSPG.games.get(id);
    var today = P.today();
    var bests = P.bests();
    var daily = !!(mode && mode.daily) && P.daily.game(today) === id;
    var variant = (mode && mode.variant) || "NORMAL";
    if (daily || !P.variantUnlocked(variant, id, bests)) variant = "NORMAL";
    var v = P.variant(variant);
    var m = { variant: variant, seed: daily ? P.daily.seed(today) : null, daily: daily };
    var title = info ? info.title : (def && def.title) || id;
    var night = variant === "NIT", mirror = variant === "MIRALL";

    root.innerHTML =
      '<div class="jg-game' + (night ? " night" : "") + '">' +
      '<div class="jg-top"><button class="jg-back" type="button" aria-label="Enrere">←</button>' +
      '<div class="jg-ttl"><b>' + (variant !== "NORMAL" ? v.emoji + " " : "") + esc(title) + "</b>" +
      (daily ? '<span class="jg-tag">📅 Repte del dia</span>' : "") + "</div>" +
      '<span class="jg-livesbox"></span><span class="jg-score" aria-live="polite" hidden></span>' +
      '<span class="jg-best">Rècord: <b>' + P.best(id) + "</b></span></div>" +
      '<div class="jg-field"><div class="jg-stagebox"></div>' + (night ? '<div class="jg-night" aria-hidden="true"></div>' : "") +
      '<div class="jg-panel-wrap"></div></div></div>';
    var game = root.querySelector(".jg-game");
    var field = root.querySelector(".jg-field");
    var stageBox = root.querySelector(".jg-stagebox");
    var panelWrap = root.querySelector(".jg-panel-wrap");
    var scoreEl = root.querySelector(".jg-score");
    var bestEl = root.querySelector(".jg-best b");
    root.querySelector(".jg-back").onclick = function () { onBack(); };
    var lives = livesCanvas(root.querySelector(".jg-livesbox"));
    var c = current = { id: id, def: def, run: null, lives: lives };
    if (mirror) stageBox.classList.add("mirror");

    function panel(html, piliMood) {
      panelWrap.hidden = false;
      panelWrap.innerHTML = '<div class="jg-panel"><div class="jg-panel-pili"></div>' + html + "</div>";
      VSPG.piliWidget(panelWrap.querySelector(".jg-panel-pili"), 110, { mood: piliMood || "happy", style: "spiker", shadow: true });
      return panelWrap.querySelector(".jg-panel");
    }

    // not available
    if (!def) {
      panel('<h3>Aviat!</h3><p>Aquest joc encara s\'està preparant per al web. Mentrestant el pots jugar a l\'app del club.</p>' +
        '<button type="button" class="jg-btn primary jg-go">Torna als jocs</button>', "wink").querySelector(".jg-go").onclick = onBack;
      return;
    }
    if (id === "temporada" && !P.seasonOpen(today)) {
      panel('<h3>🔒 Encara no</h3><p>Torna-hi per una festa (Castanyada, Nadal, Carnestoltes, Sant Jordi, Sant Joan…)</p>' +
        '<button type="button" class="jg-btn primary jg-go">Torna als jocs</button>', "sleep").querySelector(".jg-go").onclick = onBack;
      return;
    }
    if (!daily && !P.unlocked(id, bests)) {
      var need = P.requirement(id);
      panel("<h3>🔒 Encara no</h3><p>Aconsegueix 2 ⭐ a " + esc(P.title(need)) + "</p>" +
        '<button type="button" class="jg-btn primary jg-go">Torna als jocs</button>', "focus").querySelector(".jg-go").onclick = onBack;
      return;
    }

    var initialLives = Math.max(0, def.lives | 0);
    lives.set(initialLives, initialLives);

    function startPanel() {
      var p = panel("<p>" + esc(def.help || "") + "</p>" +
        (daily ? '<p class="jg-small">📅 La mateixa partida per a tothom avui. El teu millor d\'avui: <b>' + P.dailyBest(today) + "</b></p>" : "") +
        '<button type="button" class="jg-btn primary jg-play">Juga</button>', "happy");
      p.querySelector(".jg-play").onclick = play;
      try { p.querySelector(".jg-play").focus(); } catch (e) {}
    }

    function overPanel(score, r) {
      var lines = P.rewardLines(r);
      var html = '<h3 class="jg-over">Fi del joc!</h3><p class="jg-points">Punts: ' + score + "</p>" +
        (r.record ? '<p class="jg-record">Nou rècord! 🏆</p>' : "") +
        (r.record && !P.nickname() ? '<p class="jg-small">Posa\'t un àlies per sortir al rànquing del club.</p>' : "") +
        (lines.length ? '<div class="jg-rewards">' + lines.map(function (l) { return "<p>" + esc(l) + "</p>"; }).join("") + "</div>" : "") +
        '<div class="jg-row"><button type="button" class="jg-btn primary jg-play">Torna-hi</button>' +
        (score > 0 ? '<button type="button" class="jg-btn ghost jg-share">Comparteix</button>' : "") + "</div>";
      var p = panel(html, r.record ? "cheer" : "sad");
      p.querySelector(".jg-play").onclick = play;
      var sh = p.querySelector(".jg-share");
      if (sh) sh.onclick = function () {
        VSPG.share("🏐 He fet " + score + " punts al joc «" + title + "» del Vòlei Santpedor. Ets capaç de superar-ho? " + VSPG.SITE_URL);
      };
    }

    function play() {
      if (current !== c) return;
      if (c.run) stopRun({ run: c.run });
      panelWrap.hidden = true;
      panelWrap.innerHTML = "";
      stageBox.innerHTML = "";
      var stage = document.createElement("div");
      stage.className = "jg-stage";
      stageBox.appendChild(stage);
      lives.set(initialLives, initialLives);
      scoreEl.hidden = false; scoreEl.textContent = "0";
      var run = { handle: null, ended: false, stopped: false };
      c.run = run;
      var api = {
        mode: { variant: m.variant, seed: m.seed, daily: m.daily },
        rnd: P.mulberry32(m.seed != null ? m.seed : P.randomSeed()),
        speed: v.speed,
        best: P.best(id),
        colors: VSPG.COLORS,
        setScore: function (n) { if (current === c && c.run === run) scoreEl.textContent = String(n); },
        setLives: function (n) { if (current === c && c.run === run) lives.set(n); },
        point: function (ev, el) {
          el = el || stage;
          var rect = el.getBoundingClientRect();
          var t = ev.touches && ev.touches[0] ? ev.touches[0] : (ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0] : ev);
          var x = t.clientX - rect.left, y = t.clientY - rect.top;
          if (mirror) x = rect.width - x;
          return { x: x, y: y };
        },
        haptic: function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 15); } catch (e) {} },
        end: function (score) {
          if (run.ended || current !== c || c.run !== run) return;
          run.ended = true;
          score = P.clampScore(score);
          var r = P.finish(id, score, m);
          bestEl.textContent = P.best(id);
          scoreEl.textContent = String(score);
          setTimeout(function () { stopRun({ run: run }); }, 0);
          overPanel(score, r);
        }
      };
      try {
        run.handle = def.start(stage, api) || { stop: function () {} };
        if (typeof run.handle.stop !== "function") run.handle.stop = function () {};
        if (run.ended) setTimeout(function () { stopRun({ run: run }); }, 0);
      } catch (e) {
        if (window.console) console.error(e);
        run.ended = true;
        panel('<h3>Ups!</h3><p>Aquest joc no s\'ha pogut començar. Torna-ho a provar més tard.</p>' +
          '<button type="button" class="jg-btn primary jg-go">Torna als jocs</button>', "sad").querySelector(".jg-go").onclick = onBack;
      }
    }

    startPanel();
    return game;
  };
})();
