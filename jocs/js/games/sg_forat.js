/* Club Vòlei Santpedor — jocs web, camí secret: «On és el forat?» (id "sg_forat").
 * Port of the Android app (extras/SecretForat.kt + SecretForatLogic.kt): remember the opponents'
 * defence and, when it hides, tap the zone left empty. +1 per gap found; wrong or too slow = a life. */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  VSPG.sgLogic = VSPG.sgLogic || {};

  // >>> sgk
  // ------------------------------------------------------------------ shared kit of the secret games
  // (identical copy in every sg_*.js: the first file loaded defines it)
  if (!VSPG.sgk) VSPG.sgk = (function () {
    var K = {};
    K.ext = function (s, p) { var o = {}, k; for (k in s) o[k] = s[k]; for (k in p) o[k] = p[k]; return o; };
    K.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
    /** App colours (Effects.kt / Pili.kt) and the darker background of the secret room (SecretFrame). */
    K.C = { green: "#1E8C34", bright: "#3CC24A", dark: "#1C211E", accent: "#B9F6C0", gold: "#FFC107", skin: "#E8B98A",
      bad: "#FF8A80", red: "#FF5252", floor: "#E07B39", bgTop: "#0B1F12", bgBottom: "#173D24" };
    K.rgba = function (hex, a) {
      var n = parseInt(hex.slice(1), 16);
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + (a == null ? 1 : a) + ")";
    };
    /** Kotlin's Random.nextInt(n) and shuffled(random) on a float PRNG (api.rnd). */
    K.nextInt = function (rnd, n) { return Math.min(n - 1, Math.floor(rnd() * n)); };
    K.shuffled = function (list, rnd) {
      var a = list.slice();
      for (var i = a.length - 1; i >= 1; i--) { var j = K.nextInt(rnd, i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    };
    K.now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };

    /** A canvas filling [stage], devicePixelRatio aware; [onResize](oldW, oldH, w, h) after a size change. */
    K.surface = function (stage, onResize) {
      var c = document.createElement("canvas");
      c.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none;" +
        "-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent";
      stage.appendChild(c);
      var ctx = c.getContext("2d");
      var o = { el: c, ctx: ctx, w: 0, h: 0, dpr: 0 };
      o.fit = function () {
        var w = c.parentNode ? (c.parentNode.clientWidth || 1) : 1, h = c.parentNode ? (c.parentNode.clientHeight || 1) : 1;
        var dpr = window.devicePixelRatio || 1;
        if (w === o.w && h === o.h && dpr === o.dpr) return false;
        var ow = o.w, oh = o.h;
        o.w = w; o.h = h; o.dpr = dpr;
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (ow && onResize) onResize(ow, oh, w, h);
        return true;
      };
      o.fit();
      var ro = null;
      if (window.ResizeObserver) { ro = new window.ResizeObserver(function () { o.fit(); }); ro.observe(stage); }
      window.addEventListener("resize", o.fit, false);
      o.destroy = function () {
        if (ro) ro.disconnect();
        window.removeEventListener("resize", o.fit, false);
        if (c.parentNode) c.parentNode.removeChild(c);
      };
      return o;
    };

    /**
     * requestAnimationFrame loop: frame(dt, now) with dt in s capped at [opt.cap] (default 0.033) and
     * multiplied by api.speed unless [opt.raw] (games whose clock is the game: Ritme, Cursa). While
     * api.paused (pause overlay of frame.js) nothing advances and the clock restarts on resume.
     * [now] is the frame's timestamp (performance.now() clock). Returns stop().
     */
    K.loop = function (api, frame, opt) {
      opt = opt || {};
      var cap = opt.cap || 0.033, raf = 0, last = -1, alive = true;
      function tick(now) {
        if (!alive) return;
        raf = window.requestAnimationFrame(tick);
        if (api.paused) { last = -1; if (opt.onPaused) opt.onPaused(); return; }
        var dt = last < 0 ? 0 : Math.min(Math.max(0, (now - last) / 1000), cap) * (opt.raw ? 1 : (api.speed || 1));
        last = now;
        frame(dt, now);
      }
      raf = window.requestAnimationFrame(tick);
      return function () { alive = false; window.cancelAnimationFrame(raf); };
    };

    /** addEventListener remembered in [list] (array of remover functions). */
    K.on = function (list, el, type, fn, opts) {
      el.addEventListener(type, fn, opts || false);
      list.push(function () { el.removeEventListener(type, fn, opts || false); });
    };

    K.rr = function (ctx, x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    K.line = function (ctx, x0, y0, x1, y1, color, width, round) {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = round ? "round" : "butt"; ctx.stroke();
    };
    K.circle = function (ctx, x, y, r, color, stroke) {
      if (!(r > 0)) return;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (stroke) { ctx.strokeStyle = color; ctx.lineWidth = stroke; ctx.stroke(); } else { ctx.fillStyle = color; ctx.fill(); }
    };
    /** Background of the secret games (SecretFrame): very dark green to dark green. */
    K.bg = function (ctx, w, h, top, bottom) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, top || K.C.bgTop); g.addColorStop(1, bottom || K.C.bgBottom);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    };
    /** Text at (x, y) of the screen, never mirrored (MIRALL flips the stage, not the texts). */
    K.text = function (ctx, api, w, s, x, y, size, color, align, base) {
      ctx.save();
      ctx.font = "900 " + size + "px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = color; ctx.textAlign = align || "center"; ctx.textBaseline = base || "middle";
      if (api && api.mode && api.mode.variant === "MIRALL") { ctx.translate(w - x, y); ctx.scale(-1, 1); ctx.fillText(s, 0, 0); }
      else ctx.fillText(s, x, y);
      ctx.restore();
    };
    /** The Pili (VSPG.drawPili of pili.js; a green circle without it). */
    K.pili = function (ctx, x, y, r, mood, style, rot) {
      if (!(r > 0)) return;
      ctx.save();
      if (VSPG.drawPili) VSPG.drawPili(ctx, x, y, r, { mood: mood, style: style, rot: rot || 0 });
      else K.circle(ctx, x, y, r, K.C.green);
      ctx.restore();
    };
    /** A plain volleyball: white with three green panel lines (drawSgVolleyball of the app). */
    K.ball = function (ctx, x, y, r) {
      if (!(r > 0)) return;
      ctx.save();
      K.circle(ctx, x, y, r, "#fff");
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = K.C.green; ctx.lineWidth = r * 0.16;
      function arc(cx, cy, a0, sweep) { ctx.beginPath(); ctx.arc(cx, cy, r, a0 * Math.PI / 180, (a0 + sweep) * Math.PI / 180); ctx.stroke(); }
      arc(x - r * 0.4, y + r * 0.6, 200, 140);
      arc(x + r * 0.4, y - r * 0.6, 20, 140);
      arc(x + r * 0.8, y + r * 0.8, 100, 140);
      ctx.restore();
      K.circle(ctx, x, y, r, K.rgba(K.C.dark, 0.5), r * 0.1);
    };

    /** Time of a pointer / touch event on the performance.now() clock (precise taps), or now. */
    K.evTime = function (ev) {
      var n = K.now(), t = ev && typeof ev.timeStamp === "number" ? ev.timeStamp : NaN;
      // old engines give an epoch time stamp: then the moment of the handler is the best guess
      return t > 0 && Math.abs(n - t) < 1000 ? t : n;
    };

    // ---------------------------------------------------------------- sound (Web Audio, synthesized)
    /**
     * The games are silent unless they sound; a sound plays only when not muted: VSPG.muted (bool or
     * function, if the framework ever defines it) or localStorage "jocs_mute" = "1".
     */
    var audio = null, buffers = {};
    K.muted = function () {
      try {
        if (typeof VSPG.muted === "function" ? VSPG.muted() : VSPG.muted === true) return true;
        return window.localStorage && window.localStorage.getItem("jocs_mute") === "1";
      } catch (e) { return false; }
    };
    /** The AudioContext, created / resumed (call it from a user gesture: iOS unlocks audio there). */
    K.audio = function () {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        if (!audio) { try { audio = new AC({ latencyHint: "interactive" }); } catch (e) { audio = new AC(); } }
        if (audio.state === "suspended" && audio.resume) audio.resume();
        return audio;
      } catch (e) { return null; }
    };
    /** mulberry32 for the noise of the synthesized sounds (fixed seed: always the same sound). */
    function noise(seed) {
      var a = seed >>> 0;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    /** Synth.bassDrum of the app (Sounds.kt): a deep, loud bass drum, 0.7 s. Float samples at [rate]. */
    K.bassDrumSamples = function (rate) {
      var len = Math.floor(rate * 0.7), rnd = noise(11), x = new Float32Array(len);
      var phase = 0, low = 0, release = Math.floor(rate / 40);
      for (var i = 0; i < len; i++) {
        var t = i / rate;
        var f = 42 + 98 * Math.exp(-t / 0.035);
        phase += 2 * Math.PI * f / rate;
        var body = Math.sin(phase) * Math.exp(-t / 0.28) + 0.35 * Math.sin(2 * phase) * Math.exp(-t / 0.08);
        low += 0.02 * ((rnd() * 2 - 1) - low);   // low-passed noise: the skin
        var click = (rnd() * 2 - 1) * 0.25 * Math.exp(-t / 0.003);
        var env = i < 1 ? i : (i > len - release ? (len - i) / release : 1);
        x[i] = K.clamp((body + 2.5 * low * Math.exp(-t / 0.12) + click) * env * 0.8, -1, 1);
      }
      return x;
    };
    function buffer(ac, name, make) {
      var b = buffers[name];
      if (!b || b.sampleRate !== ac.sampleRate) {
        var x = make(ac.sampleRate);
        b = buffers[name] = ac.createBuffer(1, x.length, ac.sampleRate);
        if (b.copyToChannel) b.copyToChannel(x, 0); else b.getChannelData(0).set(x);
      }
      return b;
    }
    function play(name, make) {
      if (K.muted()) return false;
      var ac = K.audio();
      if (!ac) return false;
      try {
        var b = buffer(ac, name, make);
        var src = ac.createBufferSource();
        src.buffer = b;
        src.connect(ac.destination);
        src.start(0);
        return true;
      } catch (e) { return false; }
    }
    /** The bass drum, at once (Ritme: it is an instrument, it sounds on every tap). */
    K.bassDrum = function () { return play("bombo", K.bassDrumSamples); };
    /**
     * Gets the bass drum ready: the AudioContext (unlocked if called from a user gesture, e.g. inside the
     * "Juga" click that starts the game) and its samples, so the first tap sounds at once.
     */
    K.warmBassDrum = function () {
      if (K.muted()) return;
      var ac = K.audio();
      if (ac) try { buffer(ac, "bombo", K.bassDrumSamples); } catch (e) {}
    };
    return K;
  })();
  // <<< sgk

  var K = VSPG.sgk;
  var tr = VSPG.t || function (k) { return k; };

  // ------------------------------------------------------------------ pure logic (ForatLogic)
  // The opponents' half (top view, net on top) has cols × rows zones, index row * cols + col (row 0 =
  // by the net); every zone but [gap] has a defender, placed at [spots] (offset from the zone centre,
  // fractions of the zone, x and y alternated). phase: "SHOW" | "GUESS" | "RESULT".
  // State: { cols, rows, gap, spots, phase, timer, lives, score, tapped (-1 = none), ok, over }.
  var L = {
    LIVES: 3,
    RESULT: 0.8,
    /** From this score the half has 9 zones (3 × 3) instead of the 6 positions. */
    NINE: 12,
    /** Secret path (SecretPath.kt FORAT): star thresholds and score cap. */
    THRESHOLDS: [5, 10, 18, 28, 40],
    CAP: 500
  };
  /** How long the defence is shown: shorter every gap found. */
  L.show = function (score) { return Math.max(1.3 * Math.pow(0.93, score), 0.3); };
  /** Time to tap once the defence is hidden. */
  L.answer = function (score) { return Math.max(3 - 0.05 * score, 1.5); };
  L.zones = function (s) { return s.cols * s.rows; };
  L.state = function (p) {
    return K.ext({ cols: 3, rows: 2, gap: 0, spots: [], phase: "SHOW", timer: 0, lives: L.LIVES, score: 0, tapped: -1, ok: false, over: false }, p || {});
  };

  L.round = function (score, lives, rnd, prevGap) {
    if (prevGap == null) prevGap = -1;
    var rows = score >= L.NINE ? 3 : 2, zones = 3 * rows;
    var gap = K.nextInt(rnd, zones);
    if (gap === prevGap) gap = (gap + 1 + K.nextInt(rnd, zones - 1)) % zones;
    var spots = [];
    for (var i = 0; i < zones * 2; i++) spots.push((rnd() * 2 - 1) * 0.22);
    return L.state({ cols: 3, rows: rows, gap: gap, spots: spots, phase: "SHOW", timer: L.show(score), lives: lives, score: score });
  };
  L.start = function (rnd) { return L.round(0, L.LIVES, rnd); };

  L.step = function (s, dt, rnd) {
    if (s.over) return s;
    var t = s.timer - dt;
    if (t > 0) return K.ext(s, { timer: t });
    if (s.phase === "SHOW") return K.ext(s, { phase: "GUESS", timer: L.answer(s.score) });
    if (s.phase === "GUESS") return K.ext(s, { phase: "RESULT", timer: L.RESULT, tapped: -1, ok: false, lives: s.lives - 1 });
    return s.lives <= 0 ? K.ext(s, { timer: 0, over: true }) : L.round(s.score, s.lives, rnd, s.gap);
  };

  /** A tap on [zone]: only while the defence is hidden (otherwise the same state comes back). */
  L.tap = function (s, zone) {
    if (s.over || s.phase !== "GUESS" || !(zone >= 0 && zone < L.zones(s))) return s;
    var ok = zone === s.gap;
    return K.ext(s, { phase: "RESULT", timer: L.RESULT, tapped: zone, ok: ok,
      score: ok ? s.score + 1 : s.score, lives: ok ? s.lives : s.lives - 1 });
  };

  /** The opponents' half (a square, net on top) inside a w × h field: {x, y, side}. */
  L.court = function (w, h) {
    var side = Math.min(w * 0.86, h * 0.66);
    return { x: (w - side) / 2, y: h * 0.2, side: side };
  };
  /** Zone under the point (px, py) of the field, or -1. */
  L.zoneAt = function (court, s, px, py) {
    if (px < court.x || py < court.y || px > court.x + court.side || py > court.y + court.side) return -1;
    var col = K.clamp(Math.floor((px - court.x) / court.side * s.cols), 0, s.cols - 1);
    var row = K.clamp(Math.floor((py - court.y) / court.side * s.rows), 0, s.rows - 1);
    return row * s.cols + col;
  };

  VSPG.sgLogic.forat = L;

  // ------------------------------------------------------------------ game
  function start(stage, api) {
    var offs = [];
    var S = K.surface(stage, function () { draw(); });
    var s = L.start(api.rnd), playing = true;
    api.setScore(0);
    api.setLives(L.LIVES);

    function draw() {
      var c = S.ctx, w = S.w, h = S.h, ct = L.court(w, h), zw = ct.side / s.cols, zh = ct.side / s.rows, z;
      K.bg(c, w, h);
      // the floor, the zones and the net on top
      c.fillStyle = K.rgba(K.C.floor, 0.3); c.fillRect(ct.x, ct.y, ct.side, ct.side);
      for (z = 0; z < L.zones(s); z++) {
        var zx = ct.x + (z % s.cols) * zw, zy = ct.y + Math.floor(z / s.cols) * zh, fill = null;
        if (s.phase === "RESULT") fill = z === s.gap ? K.rgba(K.C.accent, 0.55) : (z === s.tapped ? K.rgba(K.C.red, 0.5) : null);
        if (fill) { c.fillStyle = fill; c.fillRect(zx, zy, zw, zh); }
        c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1; c.strokeRect(zx, zy, zw, zh);
      }
      c.strokeStyle = "#fff"; c.lineWidth = 3; c.strokeRect(ct.x, ct.y, ct.side, ct.side);
      c.fillStyle = "rgba(255,255,255,0.2)"; c.fillRect(ct.x - 6, ct.y - 14, ct.side + 12, 11);
      c.fillStyle = "#fff"; c.fillRect(ct.x - 6, ct.y - 5, ct.side + 12, 3);
      // time left: shown defence / time to answer
      var total = s.phase === "SHOW" ? L.show(s.score) : (s.phase === "GUESS" ? L.answer(s.score) : 0);
      if (total > 0) {
        var k = K.clamp(s.timer / total, 0, 1), col = s.phase === "SHOW" ? "#ffffff" : K.C.accent;
        c.fillStyle = K.rgba(col, 0.2); c.fillRect(ct.x, ct.y + ct.side + 10, ct.side, 6);
        c.fillStyle = col; c.fillRect(ct.x, ct.y + ct.side + 10, ct.side * k, 6);
      }
      // the defenders: while shown, and again on the result
      if (s.phase !== "GUESS") {
        var r = Math.min(zw, zh) * 0.22;
        for (z = 0; z < L.zones(s); z++) {
          if (z === s.gap) continue;
          var cx = ct.x + (z % s.cols + 0.5 + (s.spots[2 * z] || 0)) * zw;
          var cy = ct.y + (Math.floor(z / s.cols) + 0.5 + (s.spots[2 * z + 1] || 0)) * zh;
          K.pili(c, cx, cy, r, "focus", "stripes");
        }
      }
      if (playing) {
        var txt, tc;
        if (s.phase === "SHOW") { txt = tr("sg.look"); tc = "#fff"; }
        else if (s.phase === "GUESS") { txt = tr("sg.where"); tc = K.C.accent; }
        else if (s.ok) { txt = tr("sg.gap_ok"); tc = K.C.accent; }
        else { txt = tr(s.tapped < 0 ? "sg.gap_late" : "sg.gap_wrong"); tc = K.C.bad; }
        K.text(c, api, w, txt, w / 2, 12, Math.min(24, w / 15), tc, "center", "top");
      }
      K.text(c, api, w, String(s.score), w / 2, h - 8, 56, "rgba(255,255,255,0.3)", "center", "bottom");
    }

    function frame(dt) {
      S.fit();
      if (playing) {
        var before = s;
        s = L.step(s, dt, api.rnd);
        if (s.lives < before.lives) { api.setLives(s.lives); api.haptic(40); }
        if (s.over) {
          playing = false;
          stopLoop();
          draw();
          api.end(Math.min(s.score, L.CAP));
          return;
        }
      }
      draw();
    }

    function tapZone(zone) {
      if (!playing || api.paused) return;
      var before = s;
      s = L.tap(s, zone);
      if (s === before) return;
      if (s.score !== before.score) api.setScore(s.score);
      if (s.lives !== before.lives) api.setLives(s.lives);
      api.haptic(s.ok ? 10 : 40);
      draw();
    }
    K.on(offs, S.el, "pointerdown", function (ev) {
      ev.preventDefault();
      if (ev.button != null && ev.button > 0) return;
      var p = api.point(ev, S.el);
      tapZone(L.zoneAt(L.court(S.w, S.h), s, p.x, p.y));
    });
    K.on(offs, S.el, "contextmenu", function (ev) { ev.preventDefault(); });
    // keyboard: the digits 1-9 are the zones, row by row from the net (desktop)
    K.on(offs, document, "keydown", function (ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || !/^[1-9]$/.test(ev.key || "")) return;
      tapZone(parseInt(ev.key, 10) - 1);
    });

    draw();
    var stopLoop = K.loop(api, frame);
    return {
      stop: function () {
        playing = false;
        stopLoop();
        while (offs.length) offs.pop()();
        S.destroy();
      },
      /** For tests. */
      state: function () { return s; },
      tapZone: tapZone
    };
  }

  if (VSPG.GESTURES && !VSPG.GESTURES.sg_forat) VSPG.GESTURES.sg_forat = ["🎯", "sg.forat.g"];
  if (VSPG.games) VSPG.games.register({
    id: "sg_forat",
    title: tr("sg.forat.title"),
    emoji: "🧠",
    help: tr("sg.forat.help"),
    lives: L.LIVES,
    action: true,
    start: start
  });
})();
