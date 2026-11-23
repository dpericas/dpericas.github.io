/* Club Vòlei Santpedor — jocs web: «Col·locació».
 * Port of the Android app (extras/Setter.kt + SetterLogic.kt): same rules, windows, speeds and scoring.
 * When the pass reaches the setter's hands, tap the third of the screen of a free hitter (not a blocked one). */
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

  var gk = VSPG.gk, ext = gk.ext, clamp = gk.clamp;

  // ------------------------------------------------------------------ pure logic (SetterLogic)
  // Field fractions: x 0..1 left to right, y 0..1 top to bottom (portrait, rival court at the top).
  // phase: "PASS" | "RESULT"; result: null | "PERFECT" | "GOOD" | "BLOCKED" | "EARLY" | "LATE".
  // A rival blocker { x, target, hold } walks to target, waits hold s there, then picks another spot.
  var POINTS = { PERFECT: 2, GOOD: 1, BLOCKED: 0, EARLY: 0, LATE: 0 };
  var CAP = 40;
  var L = {
    LIVES: 3, PAUSE: 1.0, BLOCK_R: 0.12,
    /** x of the left, middle and right hitters. */
    HITTERS: [0.17, 0.5, 0.83],
    /** Each blocker keeps to its half (with an overlap in the middle), so a hitter is always free. */
    RANGES: [[0.08, 0.62], [0.38, 0.92]],
    SETTER_X: 0.5, SETTER_Y: 0.64, RECEIVER_Y: 0.98, HITTER_Y: 0.45, NET_Y: 0.32,
    POINTS: POINTS
  };
  L.blocker = function (x, target, hold) { return { x: x, target: target, hold: hold || 0 }; };
  L.startBlockers = function () { return [L.blocker(0.17, 0.17, 0.5), L.blocker(0.83, 0.83, 0.5)]; };

  function lvl(score) { return Math.min(score, CAP) / CAP; }
  /** Seconds the pass takes to reach the setter. */
  L.arrive = function (score) { return 1.5 - lvl(score) * 0.65; };
  /** |tap time - arrival| for a good set and a perfect one (s). */
  L.goodWindow = function (score) { return 0.17 - lvl(score) * 0.05; };
  L.perfectWindow = function (score) { return 0.06 - lvl(score) * 0.015; };
  /** Blocker speed (field widths per second). */
  L.blockerSpeed = function (score) { return 0.35 + lvl(score) * 0.75; };
  /** Lane of a tap at x (0..1): 0 left, 1 middle, 2 right. */
  L.lane = function (x) { return x < 1 / 3 ? 0 : (x > 2 / 3 ? 2 : 1); };

  L.state = function (p) {
    return ext({ phase: "PASS", t: 0, arrive: L.arrive(0), passX: 0.3, blockers: L.startBlockers(), chosen: null,
      result: null, pause: 0, score: 0, lives: L.LIVES }, p || {});
  };
  L.over = function (s) { return s.lives <= 0; };

  L.blocked = function (s, hitter) {
    for (var i = 0; i < s.blockers.length; i++) if (Math.abs(s.blockers[i].x - L.HITTERS[hitter]) < L.BLOCK_R) return true;
    return false;
  };

  L.newPass = function (s, rnd) {
    var arrive = L.arrive(s.score) * (0.9 + rnd() * 0.2);
    var passX = 0.2 + rnd() * 0.6;
    return ext(s, { phase: "PASS", t: 0, pause: 0, chosen: null, result: null, arrive: arrive, passX: passX });
  };
  L.start = function (rnd) { return L.newPass(L.state(), rnd); };

  function resolve(s, hit, hitter) {
    return ext(s, { phase: "RESULT", pause: L.PAUSE, result: hit, chosen: hitter, score: s.score + POINTS[hit],
      lives: POINTS[hit] === 0 ? Math.max(0, s.lives - 1) : s.lives });
  }

  /** Tap on [hitter]'s lane. Ignored (same object) while the pass is still far (first 45 %) or between rallies. */
  L.tap = function (s, hitter) {
    if (L.over(s) || s.phase !== "PASS" || s.t < s.arrive * 0.45) return s;
    var d = s.t - s.arrive, hit;
    if (d < -L.goodWindow(s.score)) hit = "EARLY";
    else if (L.blocked(s, hitter)) hit = "BLOCKED";
    else if (Math.abs(d) <= L.perfectWindow(s.score)) hit = "PERFECT";
    else hit = "GOOD";
    return resolve(s, hit, hitter);
  };

  function moveBlocker(b, range, speed, dt, rnd) {
    if (b.hold > 0) return ext(b, { hold: b.hold - dt });
    var dx = b.target - b.x;
    var stepX = speed * dt;
    if (Math.abs(dx) > stepX) return ext(b, { x: b.x + (dx > 0 ? stepX : -stepX) });
    // arrived: wait a moment, then go to a hitter in range (mostly) or anywhere in range
    var inRange = L.HITTERS.filter(function (x) { return x >= range[0] && x <= range[1]; });
    var next;
    if (Math.floor(rnd() * 4) !== 0) {
      var pick = inRange[Math.floor(rnd() * inRange.length)];
      next = pick + (rnd() - 0.5) * 0.06;
    } else next = range[0] + rnd() * (range[1] - range[0]);
    return L.blocker(b.target, clamp(next, range[0], range[1]), 0.1 + rnd() * 0.45);
  }

  /** Advances [dt] s. Blockers stand still while a rally is being resolved. */
  L.step = function (s, dt, rnd) {
    if (s.phase === "PASS") {
      var speed = L.blockerSpeed(s.score);
      var blockers = [];
      for (var i = 0; i < s.blockers.length; i++) blockers.push(moveBlocker(s.blockers[i], L.RANGES[i], speed, dt, rnd));
      var moved = ext(s, { t: s.t + dt, blockers: blockers });
      return moved.t > moved.arrive + L.goodWindow(s.score) ? resolve(moved, "LATE", null) : moved;
    }
    var p = s.pause - dt;
    return (p > 0 || L.over(s)) ? ext(s, { pause: Math.max(0, p) }) : L.newPass(s, rnd);
  };

  /** Pass ball position (x, y fractions) at time [t]; after the arrival it keeps falling. */
  L.passBall = function (s, t) {
    var q = t / s.arrive;
    return { x: s.passX + (L.SETTER_X - s.passX) * q, y: L.RECEIVER_Y + (L.SETTER_Y - L.RECEIVER_Y) * q - 1.2 * q * (1 - q) };
  };
  VSPG.logic.colocacio = L;

  // ------------------------------------------------------------------ drawing
  var FLOOR = "#D9894A", RIVAL = "#C62828";
  var LABELS = {
    PERFECT: [tr("set.perfect"), gk.C.accent], GOOD: [tr("set.good"), "#FFFFFF"], BLOCKED: [tr("set.blocked"), gk.C.bad],
    EARLY: [tr("set.early"), gk.C.bad], LATE: [tr("set.late"), gk.C.bad]
  };
  function lerp(a, b, k) { return a + (b - a) * k; }

  /** A simple player seen from behind: body, head and arms ([armsUp] 0..1). [lift] raises the whole player (jump). */
  function player(c, x, foot, height, shirt, armsUp, lift) {
    var C = gk.C;
    lift = lift || 0;
    var bw = height * 0.42, bh = height * 0.55, top = foot - bh - lift, head = bw * 0.42;
    // legs
    gk.line(c, x - bw * 0.2, top + bh * 0.9, x - bw * 0.22, foot - lift + height * 0.18, C.skin, bw * 0.2, true);
    gk.line(c, x + bw * 0.2, top + bh * 0.9, x + bw * 0.22, foot - lift + height * 0.18, C.skin, bw * 0.2, true);
    c.fillStyle = shirt; gk.rr(c, x - bw / 2, top, bw, bh, bw / 3); c.fill();
    gk.circle(c, x, top - head * 0.9, head, C.skin);
    var handY = top + bh * 0.4 - armsUp * (bh * 0.4 + head * 2.6);
    var spread = bw * (0.75 - armsUp * 0.3);
    gk.line(c, x - bw * 0.42, top + bh * 0.12, x - spread, handY, C.skin, bw * 0.17, true);
    gk.line(c, x + bw * 0.42, top + bh * 0.12, x + spread, handY, C.skin, bw * 0.17, true);
  }

  function drawSetter(c, st, clock, w, h) {
    var C = gk.C, px = gk.px, i;
    gk.bg(c, w, h);
    var netY = h * L.NET_Y;
    // floors: rival court (top), ours (bottom)
    c.fillStyle = gk.rgba(FLOOR, 0.55); c.fillRect(w * 0.04, h * 0.02, w * 0.92, netY - h * 0.02);
    c.fillStyle = gk.rgba(FLOOR, 0.8); c.fillRect(0, netY, w, h - netY);
    gk.line(c, 0, netY + h * 0.13, w, netY + h * 0.13, "rgba(255,255,255,0.7)", px(4));
    // tap lanes
    c.save(); c.setLineDash([px(16), px(14)]);
    for (i = 1; i <= 2; i++) gk.line(c, w * i / 3, h * 0.72, w * i / 3, h, "rgba(255,255,255,0.25)", px(3));
    c.restore();

    var unit = Math.min(w, h * 0.6);
    var pLen = unit * 0.2;
    var k = (st && st.phase === "RESULT") ? clamp(1 - st.pause / L.PAUSE, 0, 1) : 0;
    var chosen = st ? st.chosen : null;
    var success = st && (st.result === "PERFECT" || st.result === "GOOD");
    // rival blockers behind the net (arms up, they jump when they block)
    if (st) st.blockers.forEach(function (b) {
      var jump = (st.result === "BLOCKED" && chosen !== null && Math.abs(b.x - L.HITTERS[chosen]) < L.BLOCK_R) ?
        Math.sin(Math.PI * k) * h * 0.04 : 0;
      player(c, b.x * w, netY - h * 0.02, pLen * 0.85, RIVAL, 1, jump);
    });
    // the net
    var netTop = netY - h * 0.08;
    c.fillStyle = "rgba(0,0,0,0.3)"; c.fillRect(0, netTop, w, h * 0.06);
    for (var gx = 0; gx < w; gx += px(12)) gk.line(c, gx, netTop, gx, netTop + h * 0.06, "rgba(255,255,255,0.2)", px(1.5));
    c.fillStyle = "#FFFFFF"; c.fillRect(0, netTop - px(4), w, px(8));
    if (!st) return;

    // hitters: a floor ring tells if each one is free (green) or blocked (red)
    L.HITTERS.forEach(function (hx, idx) {
      var free = !L.blocked(st, idx);
      var foot = h * L.HITTER_Y + pLen * 0.5;
      c.save();
      c.fillStyle = gk.rgba(free ? C.accent : C.bad, clamp(0.45 + 0.15 * Math.sin(clock * 7), 0, 1));
      c.beginPath(); c.ellipse(hx * w, foot + pLen * 0.03, pLen * 0.55, pLen * 0.15, 0, 0, Math.PI * 2); c.fill();
      c.restore();
      var jumping = chosen === idx && st.result !== "EARLY" && st.result !== "LATE";
      var lift = jumping ? Math.sin(Math.PI * clamp((k - 0.25) / 0.6, 0, 1)) * h * 0.06 : 0;
      player(c, hx * w, foot, pLen, C.dark, jumping ? 1 : 0.25, lift);
    });
    // setter (centre) and receiver (bottom)
    var sx = L.SETTER_X * w, sy = L.SETTER_Y * h;
    player(c, sx, sy + pLen * 1.1, pLen, C.green, 1);
    player(c, st.passX * w, h * 0.995, pLen * 0.9, C.green, 0.1);

    // the ball
    var r = unit * 0.06, bx, by, mood = "focus", q;
    if (st.phase === "PASS") {
      var pb = L.passBall(st, st.t);
      bx = pb.x * w; by = pb.y * h;
      // approach ring around the hands: it closes when the ball arrives
      var remain = Math.max(0, (st.arrive - st.t) / st.arrive);
      var inWindow = Math.abs(st.t - st.arrive) <= L.goodWindow(st.score);
      gk.circle(c, sx, sy, r * (1.15 + 3 * remain), inWindow ? C.accent : "rgba(255,255,255,0.6)", r * 0.18);
    } else {
      var hx = chosen !== null ? L.HITTERS[chosen] * w : null;
      var hitY = h * L.HITTER_Y - pLen * 0.9 - h * 0.06;
      if (st.result === "EARLY" || st.result === "LATE" || hx === null) {
        mood = "sad";
        var fb = L.passBall(st, st.t + k * st.arrive * 0.6);
        bx = fb.x * w; by = Math.min(fb.y * h, h * 0.97);
      } else if (k < 0.4) {
        q = k / 0.4;
        bx = lerp(sx, hx, q); by = lerp(sy, hitY, q) - h * 0.22 * 4 * q * (1 - q);
      } else if (success) {
        mood = "cheer";
        q = (k - 0.4) / 0.6;
        bx = lerp(hx, lerp(hx, w / 2, 0.4), q); by = lerp(hitY, h * 0.08, Math.min(1, q * 1.6));
      } else {
        mood = "focus"; // WOW in the app: the hit is stuffed back
        q = (k - 0.4) / 0.6;
        bx = lerp(hx, hx + (w / 2 - hx) * 0.3, q);
        by = q < 0.25 ? lerp(hitY, netTop, q / 0.25) : lerp(netTop, h * 0.6, (q - 0.25) / 0.75);
      }
      if (success && k > 0.4) gk.circle(c, bx, by, r * (1 + (k - 0.4) * 5), gk.rgba(C.accent, 1 - k), r * 0.2);
    }
    gk.pili(c, bx, by, r, mood, "green");
  }

  // ------------------------------------------------------------------ game
  function start(stage, api) {
    var offs = [], rnd = api.rnd, playing = true, clock = 0;
    var S = gk.surface(stage, function () { draw(); });
    var state = L.start(rnd);
    api.setScore(0); api.setLives(L.LIVES);

    function draw() {
      var c = S.ctx, w = S.w, h = S.h, st = state;
      drawSetter(c, st, clock, w, h);
      gk.text(c, api, w, String(st.score), 16, h - 8, 64, "rgba(255,255,255,0.3)", "left", "bottom");
      if (playing && st.phase === "RESULT" && st.result) {
        var lb = LABELS[st.result];
        gk.text(c, api, w, lb[0], w / 2, h / 2 + 130, 30, lb[1]);
      }
    }

    function frame(dt) {
      S.fit();
      if (!playing) return;
      clock += dt;
      var s = state;
      var next = L.step(s, dt, rnd);
      if (next.result === "LATE" && s.result === null) api.haptic(10);
      if (next.lives !== s.lives) api.setLives(next.lives);
      state = next;
      if (L.over(next) && next.pause <= 0) {
        playing = false;
        stopLoop();
        draw();
        api.end(next.score);
        return;
      }
      draw();
    }

    gk.on(offs, S.el, "pointerdown", function (ev) {
      ev.preventDefault();
      if (!playing) return;
      var p = api.point(ev, S.el);
      var cur = state;
      var next = L.tap(cur, L.lane(p.x / S.w));
      if (next !== cur) {
        state = next;
        if (next.score !== cur.score) api.setScore(next.score);
        if (next.lives !== cur.lives) api.setLives(next.lives);
        api.haptic(POINTS[next.result] > 0 ? 30 : 10);
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
    id: "colocacio",
    title: tr("game.colocacio"),
    emoji: "🤲",
    help: tr("help.colocacio"),
    lives: L.LIVES,
    action: true,
    start: start
  });
})();
