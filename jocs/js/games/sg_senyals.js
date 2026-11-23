/* Club Vòlei Santpedor — jocs web, camí secret: «Senyals de l'àrbitre» (id "sg_senyals").
 * Port of the Android app (extras/SecretSenyals.kt + SecretSenyalsLogic.kt): a referee makes an
 * official FIVB hand signal; pick its meaning among 4 before the time runs out. Right = +1; wrong or
 * too late = a life (3); the time gets shorter with each point. */
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

  // ------------------------------------------------------------------ pure logic (SenyalsLogic)
  // Question: { signal, options: [4 signals], correct: index }.
  // State: { q, left, total, score, lives, chosen (null | option index | -1 = time out), pause }.
  var L = {
    LIVES: 3,
    OPTIONS: 4,
    START_TIME: 5.5,
    MIN_TIME: 1.8,
    TIME_STEP: 0.12,
    FEEDBACK: 0.9,
    /** The official signals (RefSignal of the app; texts "sg.sig.<name>"). */
    SIGNALS: ["BALL_IN", "BALL_OUT", "BALL_TOUCHED", "NET_TOUCH", "FOUR_HITS", "DOUBLE_CONTACT", "TIME_OUT",
      "SUBSTITUTION", "POSITIONAL_FAULT", "END_OF_SET", "DOUBLE_FAULT", "YELLOW_CARD"],
    /** Secret path (SecretPath.kt SENYALS): star thresholds and score cap. */
    THRESHOLDS: [5, 10, 15, 20, 30],
    CAP: 500
  };
  L.time = function (score) { return Math.max(L.START_TIME - score * L.TIME_STEP, L.MIN_TIME); };
  L.over = function (s) { return s.lives <= 0; };
  /** Game over and its feedback has been shown: time to finish. */
  L.ended = function (s) { return L.over(s) && s.chosen != null && s.pause <= 0; };

  /** A new signal (never the same as [previous]) with 3 other distinct signals, shuffled. */
  L.question = function (rnd, previous) {
    var pool = L.SIGNALS.filter(function (x) { return x !== previous; });
    var signal = pool[K.nextInt(rnd, pool.length)];
    var others = K.shuffled(L.SIGNALS.filter(function (x) { return x !== signal; }), rnd).slice(0, L.OPTIONS - 1);
    var options = K.shuffled(others.concat([signal]), rnd);
    return { signal: signal, options: options, correct: options.indexOf(signal) };
  };
  L.start = function (rnd) {
    var t = L.time(0);
    return { q: L.question(rnd), left: t, total: t, score: 0, lives: L.LIVES, chosen: null, pause: 0 };
  };
  /** An answer ([index] of the options). Ignored once answered (the same state comes back). */
  L.answer = function (s, index) {
    if (s.chosen != null || L.over(s)) return s;
    return index === s.q.correct ? K.ext(s, { chosen: index, score: s.score + 1, pause: L.FEEDBACK })
      : K.ext(s, { chosen: index, lives: s.lives - 1, pause: L.FEEDBACK });
  };
  /** Advances [dt] s: the countdown (a life when it runs out) or the feedback and the next signal. */
  L.step = function (s, dt, rnd) {
    if (s.chosen == null) {
      var left = s.left - dt;
      return left > 0 ? K.ext(s, { left: left }) : K.ext(s, { left: 0, chosen: -1, lives: s.lives - 1, pause: L.FEEDBACK });
    }
    var pause = s.pause - dt;
    if (pause > 0 || L.over(s)) return K.ext(s, { pause: Math.max(0, pause) });
    var total = L.time(s.score);
    return K.ext(s, { q: L.question(rnd, s.q.signal), left: total, total: total, chosen: null, pause: 0 });
  };

  VSPG.sgLogic.senyals = L;

  // ------------------------------------------------------------------ the referee and the signals
  // Figure units: neck = (0, 0), y down; shoulders at (±0.45, 0.1). "left"/"right" = sides of the screen.
  var SKIN = K.C.skin, SHIRT = "#F5F5F5", PANTS = "#15181A";
  function arm(ex, ey, hx, hy, shape) { return { elbow: [ex, ey], hand: [hx, hy], shape: shape }; }
  var RELAXED_L = arm(-0.6, 0.8, -0.65, 1.45, "FIST");
  function raisedR(shape) { return arm(0.85, -0.55, 0.95, -1.25, shape); }

  function pose(sig) {
    switch (sig) {
      // arm and fingers pointing to the floor
      case "BALL_IN": return { l: RELAXED_L, r: arm(0.75, 0.65, 1.0, 1.3, "POINT"), marks: [{ k: "ball", c: [1.6, 2.72] }] };
      // forearms raised vertically, hands open
      case "BALL_OUT": return { l: arm(-1.05, 0.15, -1.05, -0.75, "OPEN"), r: arm(1.05, 0.15, 1.05, -0.75, "OPEN"), marks: [] };
      // the palm of one hand brushes the fingers of the other, held vertically
      case "BALL_TOUCHED": return { l: arm(-1.0, 0.35, -0.95, -0.3, "NONE"), r: arm(0.75, -0.7, -0.45, -1.08, "NONE"),
        marks: [{ k: "palm", a: [-0.95, -0.3], b: [-0.95, -0.95] }, { k: "palm", a: [-0.45, -1.08], b: [-1.15, -1.12] }, { k: "swish", c: [-0.85, -1.35] }] };
      // a hand on the net
      case "NET_TOUCH": return { l: RELAXED_L, r: arm(0.95, 0.0, 1.42, -0.22, "OPEN"), marks: [{ k: "net" }] };
      case "FOUR_HITS": return { l: RELAXED_L, r: raisedR("FOUR"), marks: [] };
      case "DOUBLE_CONTACT": return { l: RELAXED_L, r: raisedR("TWO"), marks: [] };
      // a T: one palm flat over the fingers of the other
      case "TIME_OUT": return { l: arm(-0.7, 0.95, 0, 0.8, "NONE"), r: arm(0.9, 0.4, 0.38, 0.05, "NONE"),
        marks: [{ k: "palm", a: [0, 0.8], b: [0, 0.12] }, { k: "palm", a: [0.38, 0.05], b: [-0.38, 0.05] }] };
      // forearms rolling around each other
      case "SUBSTITUTION": return { l: arm(-0.75, 0.5, 0.35, 0.42, "FIST"), r: arm(0.75, 0.95, -0.35, 0.88, "FIST"),
        marks: [{ k: "turn", c: [0, 0.65], r: 0.75 }] };
      // a circle with the forefinger
      case "POSITIONAL_FAULT": return { l: RELAXED_L, r: arm(0.95, 0.0, 1.2, -0.6, "POINT"), marks: [{ k: "turn", c: [1.35, -1.05], r: 0.28 }] };
      // forearms crossed on the chest, hands open
      case "END_OF_SET": return { l: arm(-0.75, 0.75, 0.5, 0.0, "OPEN"), r: arm(0.75, 0.75, -0.5, 0.0, "OPEN"), marks: [] };
      // both thumbs up: double fault, replay
      case "DOUBLE_FAULT": return { l: arm(-0.95, 0.65, -0.9, -0.05, "THUMB"), r: arm(0.95, 0.65, 0.9, -0.05, "THUMB"), marks: [] };
      default: return { l: RELAXED_L, r: raisedR("CARD"), marks: [] };   // YELLOW_CARD
    }
  }

  /** An arc of the ellipse centred at (cx, cy), angles in degrees clockwise from 3 o'clock (Compose drawArc). */
  function ellArc(c, cx, cy, rx, ry, start, sweep, pie) {
    c.beginPath();
    if (pie) c.moveTo(cx, cy);
    c.ellipse(cx, cy, rx, ry, 0, start * Math.PI / 180, (start + sweep) * Math.PI / 180);
    if (pie) c.closePath();
  }

  /** Draws the referee making [sig], fitted and centred in a w × h canvas. */
  function drawReferee(c, w, h, sig) {
    var u = Math.min(w / 4.5, h / 5.0);
    var ox = w / 2, oy = (h - 4.95 * u) / 2 + 1.9 * u;
    function X(v) { return ox + v[0] * u; }
    function Y(v) { return oy + v[1] * u; }
    function seg(a, b, color, width, round) { K.line(c, X(a), Y(a), X(b), Y(b), color, width * u, round); }
    var ps = pose(sig);
    // floor
    seg([-2.1, 2.95], [2.1, 2.95], "rgba(255,255,255,0.25)", 0.04);
    if (ps.marks.some(function (m) { return m.k === "net"; })) drawNet();
    // legs and shoes
    [-1, 1].forEach(function (sx) {
      seg([0.22 * sx, 1.45], [0.32 * sx, 2.85], PANTS, 0.3, true);
      seg([0.3 * sx, 2.92], [0.48 * sx, 2.92], "#fff", 0.16, true);
    });
    // shirt (body), collar, shorts
    c.beginPath();
    c.moveTo(X([-0.5, 0.05]), Y([-0.5, 0.05])); c.lineTo(X([0.5, 0.05]), Y([0.5, 0.05]));
    c.lineTo(X([0.42, 1.55]), Y([0.42, 1.55])); c.lineTo(X([-0.42, 1.55]), Y([-0.42, 1.55])); c.closePath();
    c.fillStyle = SHIRT; c.fill();
    seg([-0.18, 0], [0, 0.2], PANTS, 0.07, true);
    seg([0.18, 0], [0, 0.2], PANTS, 0.07, true);
    c.fillStyle = PANTS; c.fillRect(X([-0.44, 1.35]), Y([-0.44, 1.35]), 0.88 * u, 0.2 * u);
    // head: face, hair, eyes, smile
    var hx = X([0, -0.5]), hy = Y([0, -0.5]);
    K.circle(c, hx, hy, 0.32 * u, SKIN);
    ellArc(c, hx, hy - 0.15 * u, 0.33 * u, 0.21 * u, 180, 180, true); c.fillStyle = K.C.dark; c.fill();
    K.circle(c, hx - 0.11 * u, hy + 0.02 * u, 0.035 * u, K.C.dark);
    K.circle(c, hx + 0.11 * u, hy + 0.02 * u, 0.035 * u, K.C.dark);
    ellArc(c, hx, hy + 0.1 * u, 0.12 * u, 0.08 * u, 20, 140, false);
    c.strokeStyle = K.C.dark; c.lineWidth = 0.03 * u; c.lineCap = "butt"; c.stroke();
    // arms and hands, then the marks on top
    drawArm([-0.45, 0.12], ps.l);
    drawArm([0.45, 0.12], ps.r);
    ps.marks.forEach(function (m) {
      if (m.k === "palm") seg(m.a, m.b, SKIN, 0.2, true);
      else if (m.k === "ball") drawBall(X(m.c), Y(m.c), u * 0.22);
      else if (m.k === "turn") drawTurn(X(m.c), Y(m.c), m.r * u);
      else if (m.k === "swish") {
        for (var k = -1; k <= 1; k++) {
          var cx = X(m.c), cy = Y(m.c);
          K.line(c, cx - 0.25 * u, cy + k * 0.1 * u, cx + 0.15 * u, cy + k * 0.1 * u - 0.04 * u, K.C.gold, u * 0.035, true);
        }
      }
    });

    function drawArm(shoulder, a) {
      seg(shoulder, a.elbow, SHIRT, 0.24, true);
      seg(a.elbow, a.hand, SKIN, 0.17, true);
      var dx = a.hand[0] - a.elbow[0], dy = a.hand[1] - a.elbow[1], len = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
      drawHand(X(a.hand), Y(a.hand), dx / len, dy / len, a.shape);
    }
    /** A hand at (x, y) whose fingers point along (dx, dy). The counting ones are bigger, to be read. */
    function drawHand(x, y, dx, dy, shape) {
      function ray(deg, from, length, width) {
        var a = deg * Math.PI / 180, rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
        K.line(c, x + rx * from * u, y + ry * from * u, x + rx * (from + length) * u, y + ry * (from + length) * u, SKIN, width * u, true);
      }
      switch (shape) {
        case "FIST": K.circle(c, x, y, 0.13 * u, SKIN); break;
        case "OPEN":
          K.circle(c, x, y, 0.14 * u, SKIN);
          [-21, -7, 7, 21].forEach(function (d) { ray(d, 0.08, 0.24, 0.07); });
          ray(-70, 0.05, 0.16, 0.07);
          break;
        case "POINT": K.circle(c, x, y, 0.13 * u, SKIN); ray(0, 0.08, 0.34, 0.08); break;
        case "TWO": K.circle(c, x, y, 0.17 * u, SKIN); [-16, 16].forEach(function (d) { ray(d, 0.1, 0.38, 0.1); }); break;
        case "FOUR": K.circle(c, x, y, 0.18 * u, SKIN); [-33, -11, 11, 33].forEach(function (d) { ray(d, 0.1, 0.38, 0.09); }); break;
        case "THUMB":
          K.circle(c, x, y, 0.16 * u, SKIN);
          K.line(c, x, y - 0.1 * u, x, y - 0.38 * u, SKIN, 0.1 * u, true);
          break;
        case "CARD":
          c.fillStyle = K.C.gold; c.fillRect(x - 0.17 * u, y - 0.62 * u, 0.34 * u, 0.48 * u);
          c.strokeStyle = K.C.dark; c.lineWidth = 0.025 * u; c.strokeRect(x - 0.17 * u, y - 0.62 * u, 0.34 * u, 0.48 * u);
          K.circle(c, x, y, 0.13 * u, SKIN);
          break;
        default: break;
      }
    }
    /** The net on the right: post, white band and mesh. */
    function drawNet() {
      var top = -0.3, bottom = 0.55, x, y;
      seg([2.05, -0.45], [2.05, 2.95], "#B0BEC5", 0.08);
      for (x = 1.45; x <= 2.05 + 1e-6; x += 0.12) seg([x, top], [x, bottom], "rgba(255,255,255,0.45)", 0.015);
      for (y = top; y <= bottom + 1e-6; y += 0.12) seg([1.45, y], [2.05, y], "rgba(255,255,255,0.45)", 0.015);
      seg([1.42, top], [2.05, top], "#fff", 0.09);
    }
    function drawBall(x, y, r) {
      K.circle(c, x, y, r, K.C.gold);
      K.circle(c, x, y, r, "#1565C0", r * 0.18);
      ellArc(c, x, y - 0.4 * r, 0.7 * r, 0.8 * r, 200, 140, false);
      c.strokeStyle = "#1565C0"; c.lineWidth = r * 0.14; c.lineCap = "butt"; c.stroke();
    }
    /** A circular arrow (rotation): most of a circle and an arrowhead at its end. */
    function drawTurn(x, y, r) {
      var sweep = 290, st = -60;
      ellArc(c, x, y, r, r, st, sweep, false);
      c.strokeStyle = K.C.gold; c.lineWidth = u * 0.05; c.lineCap = "round"; c.stroke();
      var end = (st + sweep) * Math.PI / 180;
      var tx0 = x + r * Math.cos(end), ty0 = y + r * Math.sin(end);
      var tx = -Math.sin(end), ty = Math.cos(end), hd = u * 0.14;
      c.beginPath();
      c.moveTo(tx0 + tx * hd, ty0 + ty * hd);
      c.lineTo(tx0 - tx * hd * 0.4 + ty * hd * 0.7, ty0 - ty * hd * 0.4 - tx * hd * 0.7);
      c.lineTo(tx0 - tx * hd * 0.4 - ty * hd * 0.7, ty0 - ty * hd * 0.4 + tx * hd * 0.7);
      c.closePath(); c.fillStyle = K.C.gold; c.fill();
    }
  }
  L.drawReferee = drawReferee;

  // ------------------------------------------------------------------ game
  var CSS = ".sgs-wrap{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;gap:10px;padding:8px 16px 12px;box-sizing:border-box;" +
    "background:linear-gradient(#0B1F12,#173D24)}" +
    ".sgs-time{height:10px;border-radius:5px;background:rgba(255,255,255,.12);overflow:hidden;flex:none}" +
    ".sgs-time>i{display:block;height:100%;border-radius:5px;background:#B9F6C0}" +
    ".sgs-fig{position:relative;flex:1 1 auto;min-height:120px}" +
    ".sgs-score{position:absolute;left:0;top:0;font:900 80px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:rgba(255,255,255,.18);pointer-events:none}" +
    ".sgs-fb{position:absolute;right:0;top:0;font:900 26px/1.1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;pointer-events:none;text-align:right}" +
    ".sgs-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;flex:none}" +
    ".sgs-opt{min-height:64px;border:0;border-radius:14px;padding:8px 10px;color:#fff;font:700 14px/1.2 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
    "background:rgba(255,255,255,.14);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}" +
    ".sgs-opt:disabled{cursor:default}";

  function start(stage, api) {
    if (!document.getElementById("sgs-css")) {
      var st = document.createElement("style");
      st.id = "sgs-css"; st.textContent = CSS;
      document.head.appendChild(st);
    }
    var offs = [];
    var s = L.start(api.rnd), playing = true;
    var wrap = document.createElement("div");
    wrap.className = "sgs-wrap";
    wrap.innerHTML = '<div class="sgs-time" aria-hidden="true"><i></i></div><div class="sgs-fig"><div class="sgs-score" aria-hidden="true">0</div>' +
      '<div class="sgs-fb" aria-live="polite"></div></div><div class="sgs-grid"></div>';
    stage.appendChild(wrap);
    var bar = wrap.querySelector(".sgs-time>i"), fig = wrap.querySelector(".sgs-fig"), grid = wrap.querySelector(".sgs-grid");
    var scoreEl = wrap.querySelector(".sgs-score"), fbEl = wrap.querySelector(".sgs-fb");
    var S = K.surface(fig, function () { drawn = null; });
    fig.insertBefore(S.el, fig.firstChild);
    var btns = [];
    for (var i = 0; i < L.OPTIONS; i++) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "sgs-opt";
      (function (idx) { K.on(offs, b, "click", function () { choose(idx); }); })(i);
      grid.appendChild(b); btns.push(b);
    }
    api.setScore(0);
    api.setLives(L.LIVES);

    var drawn = null, shownQ = null, shownChosen;
    function render() {
      var frac = s.total > 0 ? K.clamp(s.left / s.total, 0, 1) : 0;
      bar.style.width = (frac * 100) + "%";
      bar.style.background = frac < 0.3 ? K.C.bad : K.C.accent;
      scoreEl.textContent = String(s.score);
      if (drawn !== s.q || S.fit()) {
        drawn = s.q;
        S.ctx.clearRect(0, 0, S.w, S.h);
        drawReferee(S.ctx, S.w, S.h, s.q.signal);
      }
      if (shownQ !== s.q || shownChosen !== s.chosen) {
        shownQ = s.q; shownChosen = s.chosen;
        s.q.options.forEach(function (sig, k) {
          var bt = btns[k];
          bt.textContent = tr("sg.sig." + sig);
          bt.disabled = s.chosen != null || !playing;
          bt.style.background = s.chosen == null ? "rgba(255,255,255,0.14)" : (k === s.q.correct ? K.C.green : (k === s.chosen ? "#C62828" : "rgba(255,255,255,0.08)"));
        });
        if (s.chosen == null) { fbEl.textContent = ""; }
        else {
          var ok = s.chosen === s.q.correct;
          fbEl.textContent = tr(ok ? "sg.ok" : (s.chosen === -1 ? "sg.time" : "sg.ko"));
          fbEl.style.color = ok ? K.C.accent : K.C.bad;
        }
      }
    }

    function choose(idx) {
      if (!playing || api.paused) return;
      var before = s;
      s = L.answer(s, idx);
      if (s === before) return;
      if (s.score > before.score) { api.setScore(s.score); api.haptic(10); }
      else { api.setLives(s.lives); api.haptic(40); }
      render();
    }

    function frame(dt) {
      if (!playing) return;
      var before = s;
      s = L.step(s, dt, api.rnd);
      if (s.chosen === -1 && before.chosen == null) { api.setLives(s.lives); api.haptic(40); }
      render();
      if (L.ended(s)) {
        playing = false;
        stopLoop();
        api.end(Math.min(s.score, L.CAP));
      }
    }

    render();
    var stopLoop = K.loop(api, frame, { cap: 0.05 });
    return {
      stop: function () {
        playing = false;
        stopLoop();
        while (offs.length) offs.pop()();
        S.destroy();
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      },
      /** For tests. */
      state: function () { return s; },
      choose: choose
    };
  }

  if (VSPG.GESTURES && !VSPG.GESTURES.sg_senyals) VSPG.GESTURES.sg_senyals = ["🟨", "sg.senyals.g"];
  if (VSPG.games) VSPG.games.register({
    id: "sg_senyals",
    title: tr("sg.senyals.title"),
    emoji: "🟨",
    help: tr("sg.senyals.help"),
    lives: L.LIVES,
    action: true,
    start: start
  });
})();
