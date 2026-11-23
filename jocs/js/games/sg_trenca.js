/* Club Vòlei Santpedor — jocs web, camí secret: «Trenca-blocs» (id "sg_trenca").
 * Port of the Android app (extras/SecretTrenca.kt + SecretTrencaLogic.kt): drag the Pili at the bottom,
 * bounce the ball, break the wall. +1 per broken brick, +5 × level per cleared wall; 3 lives. */
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

  // ------------------------------------------------------------------ pure logic (TrencaLogic)
  // Units: the field width is 1 and its height is [aspect] (height / width). Brick: { col, row, hp, maxHp }.
  // State: { aspect, paddleX, ballX, ballY, vx, vy, stuck, bricks, level, lives, score, bounces, banner, over }.
  // stuck > 0: the ball waits on the Pili and is served when it ends.
  var L = {
    LIVES: 3,
    COLS: 7,
    SERVE: 0.9,
    R: 0.022,
    PADDLE_W: 0.24,
    BRICK_H: 0.05,
    TOP: 0.08,
    BANNER: 1.4,
    /** Longest move of the ball in one sub-step (well under its radius: no tunnelling). */
    MAX_STEP: 0.008,
    /** Widest bounce off the Pili, from the vertical (radians, 60°). */
    MAX_ANGLE: 1.047,
    /** Secret path (SecretPath.kt TRENCA): star thresholds and score cap. */
    THRESHOLDS: [15, 35, 60, 90, 130],
    CAP: 2000
  };
  L.paddleY = function (aspect) { return aspect - 0.1; };
  L.brickW = function () { return 1 / L.COLS; };
  L.speed = function (level) { return Math.min(0.8 + 0.12 * (level - 1), 1.8); };
  L.rows = function (level) { return Math.min(3 + level, 7); };
  L.bonus = function (level) { return 5 * level; };
  /** Probability of a sturdier brick (2 hits; 3 hits from level 4). */
  L.sturdy = function (level) { return Math.min(0.1 + 0.06 * level, 0.5); };
  L.brick = function (col, row, hp, maxHp) { return { col: col, row: row, hp: hp, maxHp: maxHp == null ? hp : maxHp }; };

  L.wall = function (level, rnd) {
    var out = [];
    for (var row = 0; row < L.rows(level); row++) for (var col = 0; col < L.COLS; col++) {
      var hp = rnd() < L.sturdy(level) ? (level >= 4 && rnd() < 0.3 ? 3 : 2) : 1;
      out.push(L.brick(col, row, hp));
    }
    return out;
  };
  L.state = function (p) {
    return K.ext({ aspect: 1.6, paddleX: 0.5, ballX: 0.5, ballY: 0, vx: 0, vy: 0, stuck: L.SERVE, bricks: [], level: 1,
      lives: L.LIVES, score: 0, bounces: 0, banner: 0, over: false }, p || {});
  };
  L.start = function (aspect, rnd) { return L.onPaddle(L.state({ aspect: aspect, bricks: L.wall(1, rnd) })); };
  /** The ball back on the Pili, waiting to be served. */
  L.onPaddle = function (s) { return K.ext(s, { ballX: s.paddleX, ballY: L.paddleY(s.aspect) - L.R, vx: 0, vy: 0, stuck: L.SERVE }); };
  L.movePaddle = function (s, x) {
    var px = K.clamp(x, L.PADDLE_W / 2, 1 - L.PADDLE_W / 2);
    return s.stuck > 0 ? K.ext(s, { paddleX: px, ballX: px }) : K.ext(s, { paddleX: px });
  };
  /** Brick rectangle: [left, top, right, bottom]. */
  L.rect = function (b) {
    var l = b.col * L.brickW(), t = L.TOP + b.row * L.BRICK_H;
    return [l, t, l + L.brickW(), t + L.BRICK_H];
  };
  /** The ball (circle) overlaps the brick. */
  L.touches = function (x, y, b) {
    var r = L.rect(b), nx = K.clamp(x, r[0], r[2]), ny = K.clamp(y, r[1], r[3]), dx = x - nx, dy = y - ny;
    return dx * dx + dy * dy <= L.R * L.R;
  };

  L.step = function (s, dt, rnd) {
    if (s.over) return s;
    var banner = Math.max(0, s.banner - dt);
    if (s.stuck > 0) {
      var left = s.stuck - dt;
      if (left > 0) return K.ext(s, { stuck: left, banner: banner, ballX: s.paddleX });
      // serve: up, up to 25° to either side
      var a0 = (rnd() * 2 - 1) * 0.44, v = L.speed(s.level);
      return K.ext(s, { stuck: 0, banner: banner, vx: v * Math.sin(a0), vy: -v * Math.cos(a0) });
    }
    var x = s.ballX, y = s.ballY, vx = s.vx, vy = s.vy, bricks = s.bricks, score = s.score, bounces = s.bounces;
    var py = L.paddleY(s.aspect), sp = Math.sqrt(vx * vx + vy * vy);
    var n = Math.max(1, Math.ceil(sp * dt / L.MAX_STEP)), h = dt / n;
    for (var i = 0; i < n; i++) {
      x += vx * h; y += vy * h;
      if (x < L.R) { x = L.R; vx = Math.abs(vx); }
      if (x > 1 - L.R) { x = 1 - L.R; vx = -Math.abs(vx); }
      if (y < L.R) { y = L.R; vy = Math.abs(vy); }
      // the Pili: the further from its centre, the wider the bounce
      if (vy > 0 && y + L.R >= py && y - L.R <= py + 0.03 && Math.abs(x - s.paddleX) <= L.PADDLE_W / 2 + L.R) {
        var off = K.clamp((x - s.paddleX) / (L.PADDLE_W / 2), -1, 1), a = off * L.MAX_ANGLE;
        vx = sp * Math.sin(a); vy = -sp * Math.cos(a);
        y = py - L.R;
        bounces++;
      }
      // bricks: one per sub-step, bounce on the side with the smaller overlap
      var hit = -1;
      for (var j = 0; j < bricks.length; j++) if (L.touches(x, y, bricks[j])) { hit = j; break; }
      if (hit >= 0) {
        var b = bricks[hit], r = L.rect(b), cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
        var ox = L.brickW() / 2 + L.R - Math.abs(x - cx), oy = L.BRICK_H / 2 + L.R - Math.abs(y - cy);
        if (ox < oy) vx = x < cx ? -Math.abs(vx) : Math.abs(vx); else vy = y < cy ? -Math.abs(vy) : Math.abs(vy);
        if (b.hp <= 1) { score++; bricks = bricks.filter(function (o, k) { return k !== hit; }); }
        else bricks = bricks.map(function (o, k) { return k === hit ? K.ext(o, { hp: o.hp - 1 }) : o; });
        if (bricks.length === 0) {
          // wall cleared: bonus and the next level, faster
          var next = s.level + 1;
          return L.onPaddle(K.ext(s, { bricks: L.wall(next, rnd), level: next, score: score + L.bonus(s.level), bounces: bounces, banner: L.BANNER }));
        }
      }
      if (y - L.R > s.aspect) {
        var lives = s.lives - 1;
        var lost = K.ext(s, { bricks: bricks, score: score, lives: lives, bounces: bounces, banner: banner });
        return lives <= 0 ? K.ext(lost, { ballY: y, over: true }) : L.onPaddle(lost);
      }
    }
    return K.ext(s, { ballX: x, ballY: y, vx: vx, vy: vy, bricks: bricks, score: score, bounces: bounces, banner: banner });
  };

  VSPG.sgLogic.trenca = L;

  // ------------------------------------------------------------------ game
  /** The field: as wide as the stage but never wider than height / MIN_ASPECT (wide screens), centred. */
  var MIN_ASPECT = 1.4;
  function field(w, h) { var fw = Math.min(w, h / MIN_ASPECT); return { x: (w - fw) / 2, w: fw }; }

  function brickColor(hp) { return hp === 1 ? K.C.bright : (hp === 2 ? K.C.green : K.C.dark); }

  function start(stage, api) {
    var offs = [];
    var S = K.surface(stage, function () { draw(); });
    var f0 = field(S.w, S.h);
    var s = L.start(S.h / f0.w, api.rnd), playing = true, finger = -1, down = false;
    api.setScore(0);
    api.setLives(L.LIVES);

    function draw() {
      var c = S.ctx, w = S.w, h = S.h, f = field(w, h), u = f.w, ox = f.x, gap = u * 0.006;
      K.bg(c, w, h);
      if (ox > 0) { c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(0, 0, ox, h); c.fillRect(ox + u, 0, w - ox - u, h); }
      K.text(c, api, w, String(s.score), w / 2, h / 2, 90, "rgba(255,255,255,0.18)");
      // the wall
      s.bricks.forEach(function (b) {
        var r = L.rect(b), x0 = ox + r[0] * u + gap, y0 = r[1] * u + gap, bw = (r[2] - r[0]) * u - 2 * gap, bh = (r[3] - r[1]) * u - 2 * gap;
        c.fillStyle = brickColor(b.hp);
        K.rr(c, x0, y0, bw, bh, u * 0.01); c.fill();
        if (b.maxHp > 1) {
          c.strokeStyle = b.hp >= 3 ? K.C.accent : "rgba(255,255,255,0.6)"; c.lineWidth = Math.max(1, u * 0.005);
          K.rr(c, x0, y0, bw, bh, u * 0.01); c.stroke();
        }
        // cracks on a hit sturdy brick
        if (b.hp < b.maxHp) K.line(c, x0 + bw * 0.3, y0, x0 + bw * 0.55, y0 + bh, "rgba(0,0,0,0.45)", Math.max(1, u * 0.004));
      });
      // floor line
      c.fillStyle = K.rgba(K.C.floor, 0.35); c.fillRect(ox, Math.min(h, s.aspect * u) - 3, u, 3);
      // the Pili with a platform on her arms
      var py = L.paddleY(s.aspect) * u, pw = L.PADDLE_W * u, px = ox + s.paddleX * u, barH = u * 0.022;
      K.pili(c, px, py + barH + u * 0.035, u * 0.04, s.stuck > 0 ? "focus" : "happy", "green");
      c.fillStyle = K.C.accent; K.rr(c, px - pw / 2, py, pw, barH, barH / 2); c.fill();
      c.fillStyle = K.C.dark;
      K.rr(c, px - pw / 2, py, pw * 0.12, barH, barH / 2); c.fill();
      K.rr(c, px + pw / 2 - pw * 0.12, py, pw * 0.12, barH, barH / 2); c.fill();
      // the ball
      if (!s.over) K.ball(c, ox + s.ballX * u, s.ballY * u, L.R * u);
      if (s.banner > 0 && playing) K.text(c, api, w, tr("sg.level", s.level), w / 2, h / 2 + 70, 30, K.C.accent);
    }

    function frame(dt) {
      S.fit();
      if (playing) {
        var f = field(S.w, S.h);
        var moved = finger >= 0 && f.w > 0 ? L.movePaddle(s, (finger - f.x) / f.w) : s;
        var before = s;
        s = L.step(moved, dt, api.rnd);
        if (s.score !== before.score) api.setScore(s.score);
        if (s.lives < before.lives) api.setLives(s.lives);
        if (s.lives < before.lives || s.level > before.level) api.haptic(40);
        else if (s.score > before.score || s.bounces > before.bounces) api.haptic(8);
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

    function point(ev) { if (playing && !api.paused) finger = api.point(ev, S.el).x; }
    K.on(offs, S.el, "pointerdown", function (ev) {
      ev.preventDefault();
      down = true;
      try { S.el.setPointerCapture(ev.pointerId); } catch (e) {}
      point(ev);
    });
    K.on(offs, S.el, "pointermove", function (ev) {
      // a finger only while pressed; a mouse also just hovering (desktop)
      if (down || ev.pointerType === "mouse") point(ev);
    });
    ["pointerup", "pointercancel"].forEach(function (t) { K.on(offs, S.el, t, function () { down = false; }); });
    K.on(offs, S.el, "contextmenu", function (ev) { ev.preventDefault(); });
    // keyboard: arrows move the Pili (desktop)
    var keys = { left: false, right: false };
    K.on(offs, document, "keydown", function (ev) {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        ev.preventDefault();
        keys[ev.key === "ArrowLeft" ? "left" : "right"] = true;
      }
    });
    K.on(offs, document, "keyup", function (ev) {
      if (ev.key === "ArrowLeft") keys.left = false;
      if (ev.key === "ArrowRight") keys.right = false;
    });
    var stopKeys = K.loop(api, function (dt) {
      if (!playing || keys.left === keys.right) return;
      var f = field(S.w, S.h), x = finger >= 0 ? finger : f.x + s.paddleX * f.w;
      finger = K.clamp(x + (keys.right ? 1 : -1) * f.w * 1.2 * dt, f.x, f.x + f.w);
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

  if (VSPG.GESTURES && !VSPG.GESTURES.sg_trenca) VSPG.GESTURES.sg_trenca = ["👈 👉", "sg.trenca.g"];
  if (VSPG.games) VSPG.games.register({
    id: "sg_trenca",
    title: tr("sg.trenca.title"),
    emoji: "🧱",
    help: tr("sg.trenca.help"),
    lives: L.LIVES,
    action: true,
    start: start
  });
})();
