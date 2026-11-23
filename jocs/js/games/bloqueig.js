/* Club Vòlei Santpedor — jocs web: «Bloqueig».
 * Port of the Android app (extras/Block.kt + BlockLogic in GamesLogic.kt): same windows, speeds and scoring.
 * Tap to jump and block when the spike is in the light zone by the net. Perfect +2, good +1, early/late: a life. */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  var tr = VSPG.t || function (k) { return k; };
  VSPG.logic = VSPG.logic || {};

  // ------------------------------------------------------------------ shared drawing kit
  // (identical copy in toquets/recepcio/bloqueig/servei/colocacio.js: the first file loaded defines it)
  if (!VSPG.gk) VSPG.gk = (function () {
    var K = {};
    K.ext = function (s, p) { var o = {}, k; for (k in s) o[k] = s[k]; for (k in p) o[k] = p[k]; return o; };
    K.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
    /** The app draws in device pixels: a fixed size of n device px is n / devicePixelRatio CSS px. */
    K.px = function (n) { return n / (window.devicePixelRatio || 1); };
    K.rgba = function (hex, a) {
      var n = parseInt(hex.slice(1), 16);
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + (a == null ? 1 : a) + ")";
    };
    K.C = { green: "#1E8C34", dark: "#1C211E", accent: "#B9F6C0", skin: "#E8B98A", bad: "#FF8A80", bgTop: "#0D3B1E" };

    /** A canvas filling [stage], devicePixelRatio aware; [onResize](oldW, oldH, w, h) after a size change. */
    K.surface = function (stage, onResize) {
      var c = document.createElement("canvas");
      c.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none;" +
        "-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent";
      stage.appendChild(c);
      var ctx = c.getContext("2d");
      var o = { el: c, ctx: ctx, w: 0, h: 0, dpr: 0 };
      o.fit = function () {
        var w = stage.clientWidth || 1, h = stage.clientHeight || 1, dpr = window.devicePixelRatio || 1;
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
     * requestAnimationFrame loop: frame(dt) with dt in s, capped at 0.033 and multiplied by api.speed.
     * While api.paused (frame.js pause overlay) nothing advances and the time restarts on resume. Returns stop().
     */
    K.loop = function (api, frame) {
      var raf = 0, last = -1, alive = true;
      function tick(now) {
        if (!alive) return;
        raf = window.requestAnimationFrame(tick);
        if (api.paused) { last = -1; return; }
        var dt = last < 0 ? 0 : Math.min(Math.max(0, (now - last) / 1000), 0.033) * (api.speed || 1);
        last = now;
        frame(dt);
      }
      raf = window.requestAnimationFrame(tick);
      return function () { alive = false; window.cancelAnimationFrame(raf); };
    };

    /** addEventListener remembered in [list] (array of remover functions). */
    K.on = function (list, el, type, fn) {
      el.addEventListener(type, fn, false);
      list.push(function () { el.removeEventListener(type, fn, false); });
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
      if (r <= 0) return;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (stroke) { ctx.strokeStyle = color; ctx.lineWidth = stroke; ctx.stroke(); } else { ctx.fillStyle = color; ctx.fill(); }
    };
    /** Game background (GameFrame of the app): dark green to club green. */
    K.bg = function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, K.C.bgTop); g.addColorStop(1, K.C.green);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    };
    /** Text at (x, y) of the screen, never mirrored (MIRALL flips the stage, not the texts). */
    K.text = function (ctx, api, w, s, x, y, size, color, align, base) {
      ctx.save();
      ctx.font = "900 " + size + "px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = color; ctx.textAlign = align || "center"; ctx.textBaseline = base || "middle";
      if (api.mode && api.mode.variant === "MIRALL") { ctx.translate(w - x, y); ctx.scale(-1, 1); ctx.fillText(s, 0, 0); }
      else ctx.fillText(s, x, y);
      ctx.restore();
    };
    /** The Pili ball (moods of the contract: happy, focus, wink, sad, cheer; [style] is only a hint). */
    K.pili = function (ctx, x, y, r, mood, style) {
      if (!(r > 0)) return;
      ctx.save();
      if (VSPG.drawPili) VSPG.drawPili(ctx, x, y, r, { mood: mood, style: style });
      else K.circle(ctx, x, y, r, K.C.green);
      ctx.restore();
    };
    return K;
  })();

  var gk = VSPG.gk, ext = gk.ext;

  // ------------------------------------------------------------------ pure logic (BlockLogic)
  // p: distance of the attack to the net, 1 = it is hit at the right edge, 0 = at the net.
  // While pause > 0 the last attack is resolved (last) and the ball bounces back (block) or goes on.
  var POINTS = { PERFECT: 2, GOOD: 1, EARLY: 0, LATE: 0 };
  var L = {
    LIVES: 3,
    SWEET: 0.10,          // ideal distance to the net
    PERFECT_WINDOW: 0.04, // |p - SWEET| <= this: perfect
    GOOD_WINDOW: 0.12,    // |p - SWEET| <= this: good
    MISS_AT: -0.08,       // the ball has passed: late
    PAUSE: 0.75,
    JUMP: 0.4,
    POINTS: POINTS
  };
  L.ZONE_START = L.SWEET + L.GOOD_WINDOW;
  L.ZONE_END = L.SWEET - L.GOOD_WINDOW;

  /** Attack speed (field fractions per second), faster with the score, capped. */
  L.speed = function (score) { return 0.45 + Math.min(score, 60) * 0.02; };

  L.state = function (p) {
    return ext({ p: 1, speed: L.speed(0), score: 0, lives: L.LIVES, pause: 0, last: null, jump: 0 }, p || {});
  };
  L.over = function (s) { return s.lives <= 0; };
  L.attacking = function (s) { return s.pause <= 0 && !L.over(s); };

  L.judge = function (p) {
    var d = p - L.SWEET;
    if (Math.abs(d) <= L.PERFECT_WINDOW) return "PERFECT";
    if (Math.abs(d) <= L.GOOD_WINDOW) return "GOOD";
    return d > 0 ? "EARLY" : "LATE";
  };
  L.inZone = function (p) { return p <= L.ZONE_START && p >= L.ZONE_END; };

  function resolve(s, hit) {
    return ext(s, {
      score: s.score + POINTS[hit],
      lives: POINTS[hit] === 0 ? Math.max(0, s.lives - 1) : s.lives,
      pause: L.PAUSE, last: hit
    });
  }

  /** The player taps (jumps). Ignored (same object) while in the air or between attacks. */
  L.tap = function (s) {
    if (!L.attacking(s) || s.jump > 0) return s;
    return ext(resolve(s, L.judge(s.p)), { jump: L.JUMP });
  };

  /** Advances [dt] s; [jitter] in [0.9, 1.1] varies the speed of the next attack. */
  L.step = function (s, dt, jitter) {
    if (jitter == null) jitter = 1;
    var jump = Math.max(0, s.jump - dt);
    if (s.pause > 0) {
      var blocked = s.last === "PERFECT" || s.last === "GOOD";
      var p = s.p + (blocked ? 1.4 : -1) * s.speed * dt;
      var pause = s.pause - dt;
      return (pause <= 0 && !L.over(s)) ? ext(s, { p: 1, speed: L.speed(s.score) * jitter, pause: 0, jump: jump })
        : ext(s, { p: p, pause: Math.max(0, pause), jump: jump });
    }
    if (L.over(s)) return ext(s, { jump: jump });
    var np = s.p - s.speed * dt;
    return np < L.MISS_AT ? resolve(ext(s, { p: np, jump: jump }), "LATE") : ext(s, { p: np, jump: jump });
  };
  VSPG.logic.bloqueig = L;

  // ------------------------------------------------------------------ field geometry (fractions of the play field)
  var F = {
    NET_X: 0.32, NET_TOP: 0.42, FLOOR: 0.86,
    RUN: 0.62, // horizontal distance covered from p = 1 to the net
    x: function (p, w) { return w * (F.NET_X + p * F.RUN); },
    y: function (p, h) {
      return p >= 0 ? h * (F.NET_TOP - 0.04 - p * 0.2) : Math.min(h * (F.NET_TOP - 0.04) - p * h * 3, h * F.FLOOR);
    }
  };
  var LABELS = {
    PERFECT: [tr("blk.perfect"), gk.C.accent], GOOD: [tr("blk.good"), "#FFFFFF"],
    EARLY: [tr("blk.early"), gk.C.bad], LATE: [tr("blk.late"), gk.C.bad]
  };

  // ------------------------------------------------------------------ game
  function start(stage, api) {
    var offs = [], rnd = api.rnd, playing = true;
    var S = gk.surface(stage, function () { draw(); });
    var state = L.state({ speed: L.speed(0) });
    api.setScore(0); api.setLives(L.LIVES);

    function draw() {
      var c = S.ctx, w = S.w, h = S.h, C = gk.C, px = gk.px;
      var st = state;
      gk.bg(c, w, h);
      gk.text(c, api, w, String(st.score), w / 2, 8, 110, "rgba(255,255,255,0.25)", "center", "top");
      var floor = h * F.FLOOR, netX = w * F.NET_X, netTop = h * F.NET_TOP;
      // floor and block zone (good: light, perfect: stronger)
      c.fillStyle = gk.rgba("#E07B39", 0.35); c.fillRect(0, floor, w, h - floor);
      var zx0 = F.x(Math.max(0, L.ZONE_END), w), zx1 = F.x(L.ZONE_START, w);
      c.fillStyle = gk.rgba(C.accent, 0.12); c.fillRect(zx0, 0, zx1 - zx0, floor);
      var px0 = F.x(L.SWEET - L.PERFECT_WINDOW, w), px1 = F.x(L.SWEET + L.PERFECT_WINDOW, w);
      c.fillStyle = gk.rgba(C.accent, 0.22); c.fillRect(px0, 0, px1 - px0, floor);
      // net: post, mesh and white band
      gk.line(c, netX, netTop, netX, floor, "rgba(255,255,255,0.7)", px(4));
      for (var yy = netTop; yy < netTop + h * 0.16; yy += px(10))
        gk.line(c, netX - px(6), yy, netX + px(6), yy, "rgba(255,255,255,0.3)", px(1.5));
      c.fillStyle = "#FFFFFF"; c.fillRect(netX - px(7), netTop - px(4), px(14), px(8));
      // the blocker (left of the net), jumping with both hands up
      var jumpK = st.jump > 0 ? Math.sin(Math.PI * (1 - st.jump / L.JUMP)) : 0;
      var lift = jumpK * h * 0.14;
      var bodyW = w * 0.09, bodyH = h * 0.17;
      var bx = netX - w * 0.07;
      var bodyTop = floor - bodyH - h * 0.03 - lift;
      c.fillStyle = C.dark; gk.rr(c, bx - bodyW / 2, bodyTop, bodyW, bodyH, bodyW / 3); c.fill();
      gk.circle(c, bx, bodyTop - bodyW * 0.45, bodyW * 0.42, C.skin);
      var handY = bodyTop - bodyH * (0.35 + jumpK * 0.35);
      gk.line(c, bx - bodyW * 0.3, bodyTop + px(6), netX - px(4), handY, C.skin, bodyW * 0.22, true);
      gk.line(c, bx + bodyW * 0.3, bodyTop + px(6), netX + px(6), handY + px(4), C.skin, bodyW * 0.22, true);
      c.fillStyle = C.accent; c.fillRect(bx - bodyW / 2, bodyTop + bodyH * 0.55, bodyW, bodyH * 0.12);
      // the attack
      if (st.p <= 1.05) {
        gk.pili(c, F.x(st.p, w), F.y(st.p, h), w * 0.05,
          (st.last === "EARLY" || st.last === "LATE") ? "wink" : "focus", "spiker");
      }
      if (st.pause > 0 && st.last) {
        var lb = LABELS[st.last];
        gk.text(c, api, w, lb[0], w / 2, h / 2 - 60, 30, lb[1]);
      }
    }

    function frame(dt) {
      S.fit();
      if (!playing) return;
      var s = state;
      var next = L.step(s, dt, 0.9 + rnd() * 0.2);
      if (next.lives !== s.lives) api.setLives(next.lives);
      state = next;
      draw();
      if (L.over(next) && next.pause <= 0) {
        playing = false;
        stopLoop();
        api.end(next.score);
      }
    }

    gk.on(offs, S.el, "pointerdown", function (ev) {
      ev.preventDefault();
      if (!playing) return;
      var cur = state;
      var next = L.tap(cur);
      if (next !== cur) {
        state = next;
        if (next.score !== cur.score) api.setScore(next.score);
        if (next.lives !== cur.lives) api.setLives(next.lives);
        api.haptic(POINTS[next.last] > 0 ? 30 : 10);
        draw();
      }
    });
    gk.on(offs, S.el, "contextmenu", function (ev) { ev.preventDefault(); });

    draw();
    var stopLoop = gk.loop(api, frame);
    return {
      stop: function () {
        playing = false;
        stopLoop();
        while (offs.length) offs.pop()();
        S.destroy();
      },
      /** For tests. */
      state: function () { return { s: state, playing: playing, w: S.w, h: S.h }; }
    };
  }

  VSPG.games.register({
    id: "bloqueig",
    title: tr("game.bloqueig"),
    emoji: "✋",
    help: tr("help.bloqueig"),
    lives: L.LIVES,
    action: true,
    start: start
  });
})();
