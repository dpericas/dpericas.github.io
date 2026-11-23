/* Club Vòlei Santpedor — jocs web, camí secret: «Líbero» (id "sg_libero").
 * Port of the Android app (extras/SecretLibero.kt + SecretLiberoLogic.kt): read the spike and swipe /
 * drag the Pili to dig it. +1 per dug spike; 3 on the floor = over; faster and faster. */
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

  // ------------------------------------------------------------------ pure logic (LiberoLogic)
  // Ball (a spike): { x0, x1, dur, curve, t, done (0 flying, 1 dug, 2 on the floor), age }: from x0 at
  // the net to x1 on the defence line in dur s, bending sideways by curve mid-flight (widths fractions).
  // State: { x, lean, balls, next, lives, score, over }.
  var L = {
    LIVES: 3,
    FIRST: 0.8,
    /** Dive speed (field widths per second). */
    RUN: 1.7,
    /** How far from the Pili a ball is still dug. */
    REACH: 0.1,
    FADE: 0.6,
    /** Secret path (SecretPath.kt LIBERO): star thresholds and score cap. */
    THRESHOLDS: [5, 10, 18, 28, 40],
    CAP: 500
  };
  /** Flight time of a spike: shorter with the score. */
  L.flight = function (score) { return Math.max(1.6 - 0.035 * score, 0.6); };
  /** Time between spikes: from some point they overlap (two balls at once). */
  L.gap = function (score) { return Math.max(1.5 - 0.03 * score, 0.55); };
  L.ball = function (x0, x1, dur, curve) { return { x0: x0, x1: x1, dur: dur, curve: curve || 0, t: 0, done: 0, age: 0 }; };
  L.state = function (p) { return K.ext({ x: 0.5, lean: 0, balls: [], next: L.FIRST, lives: L.LIVES, score: 0, over: false }, p || {}); };
  L.start = function () { return L.state(); };

  L.spawn = function (score, rnd) {
    var x0 = 0.1 + rnd() * 0.8;
    var x1 = 0.08 + rnd() * 0.84;
    var curve = score >= 8 ? (rnd() * 2 - 1) * 0.15 : 0;
    return L.ball(x0, x1, L.flight(score) * (0.9 + rnd() * 0.2), curve);
  };

  /** Where the ball is: [x (width fraction), k 0 (net) .. 1 (defence line)]. */
  L.pos = function (b) {
    var k = K.clamp(b.t / b.dur, 0, 1);
    return [b.x0 + (b.x1 - b.x0) * k + b.curve * Math.sin(Math.PI * k), k];
  };

  L.step = function (s, dt, target, rnd) {
    if (s.over) return s;
    var goal = K.clamp(target, 0.04, 0.96), d = goal - s.x;
    var move = Math.min(L.RUN * dt, Math.abs(d));
    var x = s.x + (d >= 0 ? move : -move);
    var lean = Math.abs(d) < 0.01 ? s.lean * 0.8 : K.clamp(d / 0.15, -1, 1);
    var score = s.score, lives = s.lives, balls = [];
    s.balls.forEach(function (b) {
      if (b.done !== 0) { if (b.age + dt < L.FADE) balls.push(K.ext(b, { age: b.age + dt })); return; }
      var t = b.t + dt;
      if (t < b.dur) { balls.push(K.ext(b, { t: t })); return; }
      var dug = Math.abs(b.x1 - x) <= L.REACH;
      if (dug) score++; else lives--;
      balls.push(K.ext(b, { t: b.dur, done: dug ? 1 : 2 }));
    });
    var next = s.next - dt;
    if (next <= 0) { balls.push(L.spawn(score, rnd)); next = L.gap(score); }
    return K.ext(s, { x: x, lean: lean, balls: balls, next: next, lives: Math.max(0, lives), score: score, over: lives <= 0 });
  };

  VSPG.sgLogic.libero = L;

  // ------------------------------------------------------------------ game
  var NET = 0.14, LINE = 0.80;   // field geometry (fractions of the height)

  function start(stage, api) {
    var offs = [];
    var S = K.surface(stage, function () { draw(); });
    var s = L.start(), playing = true, target = 0.5, down = false;
    api.setScore(0);
    api.setLives(L.LIVES);

    /** Our half seen from behind the libero: the net on top, the side lines opening towards us. */
    function drawCourt(c, w, h) {
      var net = h * NET;
      c.beginPath();
      c.moveTo(w * 0.12, net); c.lineTo(w * 0.88, net); c.lineTo(w * 1.02, h); c.lineTo(-w * 0.02, h); c.closePath();
      c.fillStyle = K.rgba(K.C.floor, 0.22); c.fill();
      c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = 2; c.stroke();
      // attack line and the defence line
      var atk = net + (h - net) * 0.3;
      K.line(c, w * 0.07, atk, w * 0.93, atk, "rgba(255,255,255,0.35)", 2);
      K.line(c, 0, h * LINE, w, h * LINE, K.rgba(K.C.accent, 0.2), 1.5);
      // the net
      c.fillStyle = "rgba(255,255,255,0.12)"; c.fillRect(w * 0.06, net - h * 0.07, w * 0.88, h * 0.07);
      for (var x = w * 0.06; x <= w * 0.94; x += 8) K.line(c, x, net - h * 0.07, x, net, "rgba(255,255,255,0.18)", 1);
      c.fillStyle = "#fff"; c.fillRect(w * 0.06, net - h * 0.075, w * 0.88, 3);
    }

    function draw() {
      var c = S.ctx, w = S.w, h = S.h, net = h * NET, line = h * LINE;
      K.bg(c, w, h);
      K.text(c, api, w, String(s.score), w / 2, h / 2, 100, "rgba(255,255,255,0.18)");
      drawCourt(c, w, h);
      // the attackers: an arm over the net where each spike starts
      s.balls.forEach(function (b) {
        if (b.done !== 0 || b.t >= 0.25) return;
        var ax = b.x0 * w;
        K.circle(c, ax, net - h * 0.09, w * 0.035, K.C.dark);
        K.line(c, ax, net - h * 0.09, ax + w * 0.03, net - h * 0.13, K.C.dark, w * 0.02);
      });
      // the libero: leans and dives towards where she runs
      var lx = s.x * w, pr = w * 0.07, last = null;
      s.balls.forEach(function (b) { if (b.done !== 0 && (!last || b.age < last.age)) last = b; });
      var mood = last ? (last.done === 1 ? "cheer" : "sad") : "focus";
      var reach = L.REACH * w;
      K.line(c, lx - reach, line + pr * 1.1, lx + reach, line + pr * 1.1, K.rgba(K.C.accent, 0.35), 4);
      c.save();
      c.translate(lx, line + pr); c.rotate(s.lean * 55 * Math.PI / 180); c.translate(-lx, -(line + pr));
      K.pili(c, lx, line + pr * 0.2, pr, mood, "green");
      c.restore();
      // the spikes, bigger as they come
      s.balls.forEach(function (b) {
        var p = L.pos(b), cx = p[0] * w, cy = net + (line - net) * p[1], r = w * (0.02 + 0.022 * p[1]);
        var f = K.clamp(b.age / L.FADE, 0, 1);
        if (b.done === 0) K.ball(c, cx, cy, r);
        else if (b.done === 1) {
          K.circle(c, cx, cy, r * (1 + f * 2), K.rgba(K.C.accent, 1 - f), r * 0.25);
          K.ball(c, cx, cy - f * h * 0.25, r * (1 - f * 0.4));
        } else {
          K.ball(c, cx, cy, r);
          var red = K.rgba(K.C.red, 1 - f * 0.6);
          K.line(c, cx - r * 1.4, cy - r * 1.4, cx + r * 1.4, cy + r * 1.4, red, r * 0.3);
          K.line(c, cx + r * 1.4, cy - r * 1.4, cx - r * 1.4, cy + r * 1.4, red, r * 0.3);
        }
      });
      // the last dig / ball on the floor
      if (last && playing) K.text(c, api, w, tr(last.done === 1 ? "sg.dig" : "sg.floor"), w / 2, 64 + 14, 28, last.done === 1 ? K.C.accent : K.C.bad);
    }

    function frame(dt) {
      S.fit();
      if (playing) {
        var before = s;
        s = L.step(s, dt, target, api.rnd);
        if (s.score !== before.score) api.setScore(s.score);
        if (s.lives < before.lives) { api.setLives(s.lives); api.haptic(40); }
        else if (s.score > before.score) api.haptic(10);
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

    function point(ev) { if (playing && !api.paused && S.w > 0) target = api.point(ev, S.el).x / S.w; }
    K.on(offs, S.el, "pointerdown", function (ev) {
      ev.preventDefault();
      down = true;
      try { S.el.setPointerCapture(ev.pointerId); } catch (e) {}
      point(ev);
    });
    K.on(offs, S.el, "pointermove", function (ev) { if (down || ev.pointerType === "mouse") point(ev); });
    ["pointerup", "pointercancel"].forEach(function (t) { K.on(offs, S.el, t, function () { down = false; }); });
    K.on(offs, S.el, "contextmenu", function (ev) { ev.preventDefault(); });
    // keyboard: arrows run left / right (desktop)
    var keys = { left: false, right: false };
    K.on(offs, document, "keydown", function (ev) {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") { ev.preventDefault(); keys[ev.key === "ArrowLeft" ? "left" : "right"] = true; }
    });
    K.on(offs, document, "keyup", function (ev) {
      if (ev.key === "ArrowLeft") keys.left = false;
      if (ev.key === "ArrowRight") keys.right = false;
    });
    var stopKeys = K.loop(api, function () {
      if (!playing || keys.left === keys.right) return;
      target = keys.left ? 0 : 1;
    });
    K.on(offs, document, "keyup", function (ev) {
      if ((ev.key === "ArrowLeft" || ev.key === "ArrowRight") && keys.left === keys.right) target = s.x;
    });

    draw();
    var stopLoop = K.loop(api, frame);
    return {
      stop: function () {
        playing = false;
        stopLoop(); stopKeys();
        while (offs.length) offs.pop()();
        S.destroy();
      },
      /** For tests. */
      state: function () { return s; }
    };
  }

  if (VSPG.GESTURES && !VSPG.GESTURES.sg_libero) VSPG.GESTURES.sg_libero = ["👈 👉", "sg.libero.g"];
  if (VSPG.games) VSPG.games.register({
    id: "sg_libero",
    title: tr("sg.libero.title"),
    emoji: "🦸",
    help: tr("sg.libero.help"),
    lives: L.LIVES,
    action: true,
    start: start
  });
})();
