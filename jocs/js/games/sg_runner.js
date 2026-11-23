/* Club Vòlei Santpedor — jocs web, camí secret: «Cursa de la Pili» (id "sg_runner").
 * Port of the Android app (extras/OfflineRunner.kt + OfflineRunnerLogic.kt) in its hard version, the one
 * of the secret path (SecretGame.RUNNER, 01.48.01): faster (up to 1.9), closer obstacles, more blockers
 * and double nets from 12. Tap = jump, hold = higher jump. One point per obstacle cleared. */
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

  // ------------------------------------------------------------------ pure logic (OfflineRunnerLogic)
  // The field is 1 unit wide; heights use the same unit; the ground is y = 0. The Pili stays at PILI_X.
  // Obstacle: { x, w, h, blocker, counted }. State: { y, vy, hold, obstacles, score, dist, nextIn, over, hard }.
  var L = {
    PILI_X: 0.2,
    R: 0.045,
    G: 4.2,
    JUMP_V: 1.1,
    /** While the finger is held on the way up, gravity is this fraction (for up to MAX_HOLD s). */
    HOLD_G: 0.4,
    MAX_HOLD: 0.3,
    NET_W: 0.035,
    BLOCKER_W: 0.06,
    /** Score from which tall blockers appear. */
    BLOCKERS_FROM: 3,
    /** Hard version: double nets from this score. */
    DOUBLE_FROM: 12,
    DOUBLE_W: 0.13,
    /** Secret path (SecretPath.kt RUNNER): star thresholds and score cap. */
    THRESHOLDS: [5, 10, 20, 35, 55],
    CAP: 2000
  };
  /** Running speed (units/s): faster with the score, capped. */
  L.speed = function (score, hard) { return hard ? Math.min(1.9, 0.5 + score * 0.028) : Math.min(1.25, 0.45 + score * 0.015); };
  L.start = function (hard) {
    return { y: 0, vy: 0, hold: 0, obstacles: [], score: 0, dist: 0, nextIn: 0.6, over: false, hard: hard !== false };
  };
  L.onGround = function (s) { return s.y <= 0 && s.vy <= 0; };
  /** Starts a jump if the Pili is on the ground (else the same state). */
  L.jump = function (s) { return (s.over || !L.onGround(s)) ? s : K.ext(s, { vy: L.JUMP_V, hold: 0 }); };

  /** A new obstacle at the right edge. Tall blockers only after BLOCKERS_FROM nets. */
  L.spawn = function (score, rnd, hard) {
    if (hard && score >= L.DOUBLE_FROM && rnd() < 0.25)
      return { x: 1.05, w: L.DOUBLE_W, h: 0.06 + rnd() * 0.02, blocker: false, counted: false };   // two nets together
    var chance = hard ? Math.min(0.35 + score * 0.008, 0.6) : 0.35;
    var blocker = score >= L.BLOCKERS_FROM && rnd() < chance;
    return blocker ? { x: 1.05, w: L.BLOCKER_W, h: 0.17 + rnd() * 0.04, blocker: true, counted: false }
      : { x: 1.05, w: L.NET_W, h: 0.06 + rnd() * 0.03, blocker: false, counted: false };
  };

  /** Distance to the next obstacle: always enough to land and jump again at the current speed. */
  L.gap = function (score, rnd, hard) {
    var v = L.speed(score, hard);
    return hard ? v * (0.8 + rnd() * (0.9 - Math.min(score * 0.01, 0.5))) + 0.12
      : v * (1.0 + rnd() * 0.9) + 0.15;
  };

  /** True if the Pili (a circle, slightly forgiving) touches [o]. */
  L.hits = function (y, o) {
    var r = L.R * 0.8, cx = L.PILI_X, cy = y + L.R;
    var nx = K.clamp(cx, o.x, o.x + o.w), ny = K.clamp(cy, 0, o.h);
    var dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  };

  /** Advances [dt] s; [holding] = the finger is still down. */
  L.step = function (s, dt, holding, rnd) {
    if (s.over) return s;
    // vertical: lighter gravity while the jump is held on the way up
    var held = holding && s.vy > 0 && s.hold < L.MAX_HOLD;
    var g = held ? L.G * L.HOLD_G : L.G;
    var vy = s.vy - g * dt;
    var y = s.y + s.vy * dt - g * dt * dt / 2;
    if (y <= 0) { y = 0; vy = 0; }
    var hold = held ? s.hold + dt : L.MAX_HOLD;
    // horizontal: obstacles move left
    var dx = L.speed(s.score, s.hard) * dt;
    var score = s.score, moved = [];
    s.obstacles.forEach(function (o) {
      var n = K.ext(o, { x: o.x - dx });
      if (n.x + n.w < -0.1) return;
      if (!n.counted && n.x + n.w < L.PILI_X - L.R) { score++; n.counted = true; }
      moved.push(n);
    });
    var nextIn = s.nextIn - dx;
    if (nextIn <= 0) {
      moved.push(L.spawn(score, rnd, s.hard));
      nextIn = L.gap(score, rnd, s.hard);
    }
    var over = moved.some(function (o) { return L.hits(y, o); });
    return { y: y, vy: vy, hold: hold, obstacles: moved, score: score, dist: s.dist + dx, nextIn: nextIn, over: over, hard: s.hard };
  };

  VSPG.sgLogic.runner = L;

  // ------------------------------------------------------------------ game
  function start(stage, api) {
    var offs = [];
    var s = L.start(true), playing = true, holding = false, pointers = {};
    var S = K.surface(stage, function () { draw(); });
    S.el.setAttribute("role", "button");
    S.el.setAttribute("aria-label", tr("sg.runner.area"));
    api.setScore(0);

    function draw() {
      var c = S.ctx, w = S.w, h = S.h, u = w;
      // 1 logic unit = the canvas width (capped by the height on wide screens); the ground at 78 %
      u = Math.min(w, h * 1.1);
      var ox = (w - u) / 2, ground = h * 0.78;
      function px(x) { return ox + x * u; }
      function py(y) { return ground - y * u; }
      K.bg(c, w, h, "#0D3B1E", K.C.green);
      // court floor with scrolling lines (the Pili seems to roll forward)
      c.fillStyle = "#0A2A15"; c.fillRect(0, ground, w, h - ground);
      c.fillStyle = "rgba(255,255,255,0.7)"; c.fillRect(0, ground, w, 3);
      var step = 0.12, x = -(s.dist % step);
      c.fillStyle = "rgba(255,255,255,0.18)";
      while (x < 1.1) { c.fillRect(px(x), ground + 10, u * 0.05, 3); x += step; }
      // obstacles
      s.obstacles.forEach(function (o) {
        var left = px(o.x), top = py(o.h), ow = o.w * u;
        if (o.blocker) {
          // two raised hands of a blocker (green and black)
          var hw = ow / 2.2;
          for (var k = 0; k < 2; k++) {
            var hx = left + k * (ow - hw);
            c.fillStyle = k === 0 ? K.C.bright : K.C.dark;
            K.rr(c, hx, top, hw, ground - top, hw / 2); c.fill();
            c.fillStyle = "rgba(255,255,255,0.8)";
            K.rr(c, hx, top, hw, hw * 1.2, hw / 2); c.fill();
          }
        } else {
          // a little net (or two together): posts, white top band and a mesh
          var post = Math.min(ow * 0.18, u * 0.0065);
          c.fillStyle = "#CFD8DC";
          c.fillRect(left, top, post, ground - top);
          c.fillRect(left + ow - post, top, post, ground - top);
          if (o.w > L.NET_W * 2) c.fillRect(left + ow / 2 - post / 2, top, post, ground - top);
          var band = (ground - top) * 0.12, meshTop = top + band;
          c.fillStyle = "#fff"; c.fillRect(left, top, ow, band);
          for (var i = 1; i < 4; i++) {
            var yy = meshTop + (ground - meshTop) * i / 4;
            K.line(c, left, yy, left + ow, yy, "rgba(255,255,255,0.6)", 1);
          }
          K.line(c, left + ow / 2, meshTop, left + ow / 2, ground, "rgba(255,255,255,0.6)", 1);
        }
      });
      // the Pili, rolling (angle = distance / radius)
      var r = L.R * u, cx = px(L.PILI_X), cy = py(s.y) - r;
      c.fillStyle = "rgba(0,0,0,0.25)";
      c.beginPath(); c.ellipse(cx, ground, r, r * 0.15, 0, 0, Math.PI * 2); c.fill();
      var mood = s.over ? "sad" : (!L.onGround(s) ? "wow" : (playing ? "focus" : "happy"));
      K.pili(c, cx, cy, r, mood, "green", s.dist / L.R);
      K.text(c, api, w, tr("sg.runner.score", s.score), w / 2, 26, 22, "#fff");
    }

    function frame(dt) {
      S.fit();
      if (playing) {
        var before = s;
        s = L.step(s, dt, holding, api.rnd);
        if (s.score > before.score) { api.setScore(s.score); api.haptic(8); }
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

    // press = jump; keep the finger down for a higher jump
    function press() {
      if (!playing || api.paused) return;
      var before = s;
      s = L.jump(s);
      if (s !== before) api.haptic(15);
      holding = true;
    }
    function release() { holding = Object.keys(pointers).length > 0; }
    K.on(offs, S.el, "pointerdown", function (ev) {
      ev.preventDefault();
      if (ev.button != null && ev.button > 0) return;
      pointers[ev.pointerId] = 1;
      try { S.el.setPointerCapture(ev.pointerId); } catch (e) {}
      press();
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (type) {
      K.on(offs, S.el, type, function (ev) { delete pointers[ev.pointerId]; release(); });
    });
    K.on(offs, S.el, "contextmenu", function (ev) { ev.preventDefault(); });
    var keyDown = false;
    K.on(offs, document, "keydown", function (ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.target && /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(ev.target.tagName || "")) return;
      if (ev.key === " " || ev.key === "ArrowUp" || ev.key === "Spacebar") {
        ev.preventDefault();
        if (ev.repeat || keyDown) return;
        keyDown = true; pointers.key = 1; press();
      }
    });
    K.on(offs, document, "keyup", function (ev) {
      if (ev.key === " " || ev.key === "ArrowUp" || ev.key === "Spacebar") { keyDown = false; delete pointers.key; release(); }
    });

    draw();
    // the app's runner has no TURBO scaling: the run already gets faster by itself
    var stopLoop = K.loop(api, frame, { raw: true, onPaused: function () { pointers = {}; holding = false; keyDown = false; } });
    return {
      stop: function () {
        playing = false;
        stopLoop();
        while (offs.length) offs.pop()();
        S.destroy();
      },
      /** For tests. */
      state: function () { return s; },
      press: press,
      release: function () { pointers = {}; release(); }
    };
  }

  if (VSPG.GESTURES && !VSPG.GESTURES.sg_runner) VSPG.GESTURES.sg_runner = ["👆", "sg.runner.g"];
  if (VSPG.games) VSPG.games.register({
    id: "sg_runner",
    title: tr("sg.runner.title"),
    emoji: "🏃",
    help: tr("sg.runner.help"),
    lives: 0,
    action: true,
    start: start
  });
})();
