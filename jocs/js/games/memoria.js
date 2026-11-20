/* Club Vòlei Santpedor · Jocs · "Memory de la Pili" (port of Memory.kt / MemoryLogic).
   Score = max(0, base − 20·moves − 5·seconds); base 1000 (4×4) or 700 (3×4). */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};

  // ------------------------------------------------------------------ logic (MemoryLogic)
  var MOVE_COST = 20;
  var SECOND_COST = 5;
  var SIZES = {
    NORMAL: { id: "NORMAL", cols: 4, rows: 4, base: 1000, pairs: 8 },
    KIDS: { id: "KIDS", cols: 3, rows: 4, base: 700, pairs: 6 }
  };
  /* PiliStyle (the styles VSPG.drawPili draws), PiliMood and PiliProp (NONE, SANTA_HAT, BUNNY_EARS,
     CARNIVAL_MASK, ROSE, CHESTNUTS, PARTY_HAT, SPARKLER, SENYERA_FLAG, GLASSES). */
  var STYLES = ["green", "stripes", "champion", "spiker"];
  var MOODS = ["happy", "wink", "cheer", "focus", "sad", "wow", "sleep"];
  var PROPS = [null, "santa", "bunny", "mask", "rose", "chestnuts", "party", "sparkler", "senyera", "glasses"];

  function score(size, moves, seconds) {
    return Math.max(0, size.base - MOVE_COST * moves - SECOND_COST * seconds);
  }

  function shuffled(list, rnd) {
    var a = list.slice();
    for (var i = a.length - 1; i >= 1; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** n (≤ 10) different faces: every one has its own prop, so no two look alike. */
  function faces(n, rnd) {
    if (n < 1 || n > PROPS.length) throw new Error("faces: " + n);
    var props = shuffled(PROPS, rnd).slice(0, n);
    var moods = shuffled(MOODS, rnd);
    var styles = shuffled(STYLES, rnd);
    return props.map(function (p, i) { return { style: styles[i % styles.length], mood: moods[i % moods.length], prop: p }; });
  }

  /** A new shuffled board, all cards face down. */
  function deal(size, rnd) {
    var f = faces(size.pairs, rnd);
    var idx = [];
    for (var k = 0; k < 2; k++) for (var i = 0; i < f.length; i++) idx.push(i);
    var cards = shuffled(idx, rnd).map(function (face) { return { face: face, up: false, matched: false }; });
    return { faces: f, cards: cards, open: [], moves: 0 };
  }

  function done(s) { return s.cards.length > 0 && s.cards.every(function (c) { return c.matched; }); }
  function waiting(s) { return s.open.length === 2; }
  function copy(s, o) {
    return { faces: s.faces, cards: o.cards || s.cards, open: o.open || s.open, moves: o.moves != null ? o.moves : s.moves };
  }

  /** Turns card i. Ignored (same object back) if already up / matched or two cards are waiting. */
  function flip(s, i) {
    if (i < 0 || i >= s.cards.length || waiting(s) || done(s)) return s;
    var c = s.cards[i];
    if (c.up || c.matched) return s;
    var cards = s.cards.slice();
    cards[i] = { face: c.face, up: true, matched: false };
    if (s.open.length === 0) return copy(s, { cards: cards, open: [i] });
    var j = s.open[0];
    var moves = s.moves + 1;
    if (cards[j].face === c.face) {
      cards[i] = { face: c.face, up: true, matched: true };
      cards[j] = { face: cards[j].face, up: true, matched: true };
      return copy(s, { cards: cards, open: [], moves: moves });
    }
    return copy(s, { cards: cards, open: [j, i], moves: moves });
  }

  /** Turns a non-matching pair face down again. */
  function settle(s) {
    if (!waiting(s)) return s;
    var cards = s.cards.slice();
    s.open.forEach(function (k) { cards[k] = { face: cards[k].face, up: false, matched: cards[k].matched }; });
    return copy(s, { cards: cards, open: [] });
  }

  // ------------------------------------------------------------------ shared UI helpers
  var CSS = ".vg-root{position:absolute;top:0;left:0;right:0;bottom:0;overflow-y:auto;-webkit-overflow-scrolling:touch;background:linear-gradient(180deg,#0D3B1E,#1E8C34);color:#fff;padding:16px 16px 24px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;line-height:1.35}" +
    ".vg-root *{box-sizing:border-box}" +
    ".vg-col{width:100%;max-width:520px;display:flex;flex-direction:column;gap:12px;align-items:stretch}" +
    ".vg-center{align-items:center;text-align:center}" +
    ".vg-label{color:#B9F6C0;font-weight:700;font-size:14px;text-align:center}" +
    ".vg-bar{height:6px;border-radius:3px;background:rgba(255,255,255,.2);overflow:hidden;flex:none}" +
    ".vg-bar>i{display:block;height:100%;background:#B9F6C0;border-radius:3px}" +
    ".vg-q{font-size:19px;font-weight:700;text-align:center}" +
    ".vg-big{font-size:24px;font-weight:900}" +
    ".vg-small{font-size:14px;opacity:.9;margin-top:2px}" +
    ".vg-grow{flex:1;min-width:0}" +
    ".vg-pili{flex:none;display:block}" +
    ".vg-ans{width:100%;min-height:48px;border:0;border-radius:14px;padding:10px 14px;background:rgba(255,255,255,.14);color:#fff;font:inherit;font-size:16px;cursor:pointer;text-align:center}" +
    ".vg-ans:hover:not([disabled]){background:rgba(255,255,255,.22)}" +
    ".vg-ans.ok{background:#3CC24A}.vg-ans.ko{background:#C62828}.vg-ans.dim{background:rgba(255,255,255,.08)}" +
    ".vg-ans[disabled]{cursor:default;opacity:1;color:#fff}" +
    ".vg-fb{display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.35);border-radius:14px;padding:10px}" +
    ".vg-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;align-self:center;padding:12px 20px;min-height:44px;border-radius:12px;border:0;background:#B9F6C0;color:#1a1a1a;font:inherit;font-size:16px;font-weight:700;cursor:pointer}" +
    ".vg-btn.white{background:#fff;color:#000}" +
    ".vg-btn.ghost{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.6)}" +
    ".vg-btn.wide{align-self:stretch;width:100%}" +
    ".vg-box{background:rgba(0,0,0,.35);border-radius:20px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}";
  var MEM_CSS =
    ".vg-mem-hud{display:flex;justify-content:space-evenly;width:100%;max-width:480px;font-weight:700;font-size:18px;margin-bottom:10px;flex:none}" +
    ".vg-mem-grid{display:grid;gap:8px;margin:0 auto;flex:none}" +
    ".vg-mem-card{position:relative;-webkit-perspective:600px;perspective:600px;cursor:pointer;touch-action:manipulation}" +
    ".vg-mem-in{position:absolute;top:0;left:0;right:0;bottom:0;transition:transform .32s;-webkit-transform-style:preserve-3d;transform-style:preserve-3d}" +
    ".vg-mem-card.up .vg-mem-in{-webkit-transform:rotateY(180deg);transform:rotateY(180deg)}" +
    ".vg-mem-face{position:absolute;top:0;left:0;right:0;bottom:0;border-radius:12px;overflow:hidden;-webkit-backface-visibility:hidden;backface-visibility:hidden;border:2px solid rgba(255,255,255,.6)}" +
    ".vg-mem-back{background:radial-gradient(circle at 50% 50%,#fff 0,#B9F6C0 17%,rgba(0,0,0,.5) 18%,rgba(0,0,0,.5) 19.5%,transparent 20%),repeating-linear-gradient(180deg,#1E8C34 0,#1E8C34 11.11%,rgba(185,246,192,.35) 11.11%,rgba(185,246,192,.35) 22.22%),#1E8C34}" +
    ".vg-mem-front{background:#fff;-webkit-transform:rotateY(180deg);transform:rotateY(180deg)}" +
    ".vg-mem-card.matched .vg-mem-face{border-color:#B9F6C0}" +
    ".vg-mem-card.matched .vg-mem-front{background:#e3fbe6}" +
    ".vg-mem-front canvas{display:block;width:100%;height:100%}";
  function injectCss() {
    if (!document.getElementById("vg-common-css")) {
      var s = document.createElement("style");
      s.id = "vg-common-css";
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    if (!document.getElementById("vg-mem-css")) {
      var m = document.createElement("style");
      m.id = "vg-mem-css";
      m.textContent = MEM_CSS;
      document.head.appendChild(m);
    }
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function drawPili(ctx, x, y, r, mood, style, prop) {
    if (typeof VSPG.drawPili === "function") VSPG.drawPili(ctx, x, y, r, { mood: mood, style: style, prop: prop });
    else { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  }
  function pili(size, mood, style, prop) {
    var c = document.createElement("canvas");
    var dpr = window.devicePixelRatio || 1;
    c.width = c.height = Math.round(size * dpr);
    c.style.width = c.style.height = size + "px";
    c.className = "vg-pili";
    var ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    drawPili(ctx, size / 2, size / 2, size * 0.42, mood, style, prop);
    return c;
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /** Front of a card: the Pili with the style, mood and prop of its face. */
  function drawFace(canvas, w, h, face) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var m = Math.min(w, h);
    drawPili(ctx, w / 2, h * 0.54, m * 0.28, face.mood, face.style, face.prop);
  }

  // ------------------------------------------------------------------ game
  function start(stage, api) {
    injectCss();
    var root = el("div", "vg-root");
    stage.appendChild(root);

    var size = null, state = null, views = [];
    var started = false, over = false, stopped = false, ended = false;
    var clock = 0, seconds = 0, raf = 0, last = 0, settleT = 0, endT = 0;
    var hudMoves = null, hudTime = null, grid = null;

    api.setScore(0);
    menu();

    function menu() {
      root.innerHTML = "";
      var col = el("div", "vg-col");
      col.style.marginTop = "auto";
      col.style.marginBottom = "auto";
      var box = el("div", "vg-box");
      box.appendChild(pili(110, "wink", "green", "glasses"));
      box.appendChild(el("div", null, "Gira les cartes de dues en dues i troba les parelles. Com menys moviments i més ràpid, més punts!"));
      var b1 = el("button", "vg-btn", "Juga (4×4)");
      b1.type = "button"; b1.setAttribute("data-size", "NORMAL");
      b1.addEventListener("click", function () { play(SIZES.NORMAL); });
      var b2 = el("button", "vg-btn ghost", "Fàcil per als petits (3×4)");
      b2.type = "button"; b2.setAttribute("data-size", "KIDS");
      b2.addEventListener("click", function () { play(SIZES.KIDS); });
      box.appendChild(b1);
      box.appendChild(b2);
      col.appendChild(box);
      root.appendChild(col);
    }

    function play(s) {
      size = s;
      state = deal(s, api.rnd);
      seconds = 0; clock = 0; started = false; over = false;
      root.innerHTML = "";
      var hud = el("div", "vg-mem-hud");
      hudMoves = el("span");
      hudTime = el("span");
      hud.appendChild(hudMoves);
      hud.appendChild(hudTime);
      root.appendChild(hud);
      grid = el("div", "vg-mem-grid");
      grid.style.gridTemplateColumns = "repeat(" + s.cols + ",1fr)";
      root.appendChild(grid);
      views = state.cards.map(function (c, i) {
        var card = el("div", "vg-mem-card");
        card.setAttribute("role", "button");
        card.setAttribute("data-i", String(i));
        var inner = el("div", "vg-mem-in");
        var back = el("div", "vg-mem-face vg-mem-back");
        var front = el("div", "vg-mem-face vg-mem-front");
        var cv = document.createElement("canvas");
        front.appendChild(cv);
        inner.appendChild(back);
        inner.appendChild(front);
        card.appendChild(inner);
        card.addEventListener("click", function () { tap(i); });
        grid.appendChild(card);
        return { card: card, canvas: cv };
      });
      layout();
      render();
      last = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }

    /** Cards of ratio 0.8 that fit the stage (max 480 px wide like the app). */
    function layout() {
      if (!size || !grid) return;
      var gap = 8;
      var W = Math.min(480, (root.clientWidth || stage.clientWidth || 320) - 32);
      var H = (root.clientHeight || stage.clientHeight || 480) - 40 - 28 - 10;
      var cw = (W - gap * (size.cols - 1)) / size.cols;
      var chMax = (H - gap * (size.rows - 1)) / size.rows;
      if (cw / 0.8 > chMax) cw = chMax * 0.8;
      cw = Math.max(40, Math.floor(cw));
      var ch = Math.floor(cw / 0.8);
      grid.style.width = (cw * size.cols + gap * (size.cols - 1)) + "px";
      views.forEach(function (v, i) {
        v.card.style.width = cw + "px";
        v.card.style.height = ch + "px";
        drawFace(v.canvas, cw - 4, ch - 4, state.faces[state.cards[i].face]);
      });
    }

    function render() {
      hudMoves.textContent = "Moviments: " + state.moves;
      hudTime.textContent = "⏱ " + Math.floor(seconds / 60) + ":" + pad2(seconds % 60);
      views.forEach(function (v, i) {
        var c = state.cards[i];
        var up = c.up || c.matched;
        v.card.className = "vg-mem-card" + (up ? " up" : "") + (c.matched ? " matched" : "");
        v.card.setAttribute("aria-label", up ? "Carta girada" : "Carta tapada");
      });
    }

    function tap(i) {
      if (over || stopped || !state) return;
      var next = flip(state, i);
      if (next === state) return;
      started = true;
      api.haptic(10);
      state = next;
      render();
      if (waiting(state)) {
        clearTimeout(settleT);
        settleT = setTimeout(function () { if (!stopped) { state = settle(state); render(); } }, 850);
      }
      if (done(state)) {
        over = true;
        var sc = score(size, state.moves, seconds);
        api.setScore(sc);
        api.haptic(80);
        endT = setTimeout(function () {
          if (!stopped && !ended) { ended = true; api.end(sc); }
        }, 700);
      }
    }

    // the clock runs from the first card turned until the last pair
    function tick(now) {
      if (stopped) return;
      var dt = last ? Math.min((now - last) / 1000, 0.25) : 0;
      last = now;
      if (started && !over) {
        clock += dt;
        var s = Math.floor(clock);
        if (s !== seconds) { seconds = s; render(); }
      }
      raf = requestAnimationFrame(tick);
    }

    function onResize() { layout(); }
    window.addEventListener("resize", onResize);

    return {
      stop: function () {
        stopped = true;
        cancelAnimationFrame(raf);
        clearTimeout(settleT);
        clearTimeout(endT);
        window.removeEventListener("resize", onResize);
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      // for the tests
      _state: function () { return { state: state, seconds: seconds, size: size, over: over, ended: ended }; }
    };
  }

  var def = {
    id: "memoria",
    title: "Memory de la Pili",
    emoji: "🃏",
    help: "Gira les cartes de dues en dues i troba les parelles. Com menys moviments i més ràpid, més punts!",
    lives: 0,
    action: false,
    start: start,
    logic: { SIZES: SIZES, MOVE_COST: MOVE_COST, SECOND_COST: SECOND_COST, score: score, faces: faces, deal: deal,
      flip: flip, settle: settle, done: done, waiting: waiting, shuffled: shuffled }
  };
  if (VSPG.games && typeof VSPG.games.register === "function") VSPG.games.register(def);
})();
