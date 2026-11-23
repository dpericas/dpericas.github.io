/* Club Vòlei Santpedor — jocs web: «Servei».
 * Port of the Android app (extras/Service.kt + ServiceLogic.kt): same rules, speeds, zones and scoring.
 * Tap to fix the direction, tap again to fix the power. Ace zone +2, in +1, net or out: a life. */
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

  // ------------------------------------------------------------------ pure logic (ServiceLogic)
  // Rival court coordinates: x 0..1 from the left sideline to the right one, d 0..1 from the net to the
  // end line (d < 0 is our side, the server stands at d = SERVER_D).
  // phase: "AIM" | "POWER" | "FLIGHT" | "RESULT"; result: null | "ACE" | "IN" | "NET" | "OUT".
  var POINTS = { ACE: 2, IN: 1, NET: 0, OUT: 0 };
  var CAP = 40;
  var L = { LIVES: 3, SERVER_D: -1.05, FLIGHT: 0.95, PAUSE: 0.85, POINTS: POINTS };

  /** Ace zone: centre (x, d), half sizes (hw, hd) and horizontal speed vx (court units/s). */
  L.target = function (x, d, hw, hd, vx) { return { x: x, d: d, hw: hw, hd: hd, vx: vx || 0 }; };
  L.contains = function (t, px, pd) { return Math.abs(px - t.x) <= t.hw && Math.abs(pd - t.d) <= t.hd; };

  L.state = function (p) {
    return ext({ phase: "AIM", aimPhase: 0, powerPhase: 0, aim: 0, power: 0, target: L.target(0.5, 0.6, 0.18, 0.16),
      t: 0, landX: 0.5, landD: 0.5, result: null, pause: 0, score: 0, lives: L.LIVES,
      // secret version "Servei amb vent": the wind of this serve, added to where the ball lands (0 = no wind)
      windX: 0, windD: 0, windy: false }, p || {});
  };
  L.over = function (s) { return s.lives <= 0; };
  /** Current arrow value, -1 (left) .. 1 (right). */
  L.aimNow = function (s) { return s.phase === "AIM" ? L.tri(s.aimPhase) : s.aim; };
  /** Current power, 0..1. */
  L.powerNow = function (s) {
    if (s.phase === "AIM") return 0;
    return s.phase === "POWER" ? L.saw(s.powerPhase) : s.power;
  };

  /** Triangle wave of period 4: 0 → 1 → 0 → -1 → 0. */
  L.tri = function (p) {
    var q = ((p % 4) + 4) % 4;
    if (q < 1) return q;
    if (q < 3) return 2 - q;
    return q - 4;
  };
  /** Up and down wave of period 2: 0 → 1 → 0. */
  L.saw = function (p) {
    var q = ((p % 2) + 2) % 2;
    return q < 1 ? q : 2 - q;
  };

  function lvl(score) { return Math.min(score, CAP) / CAP; }
  /** Arrow speed (units of the -1..1 sweep per second). */
  L.aimSpeed = function (score) { return 1.5 + lvl(score) * 2.3; };
  /** Power bar speed (full bars per second). */
  L.powerSpeed = function (score) { return 1.1 + lvl(score) * 1.3; };
  /** Landing x for the arrow value: the sweep gets wider (more of it goes out) with the score. */
  L.landX = function (aim, score) { return 0.5 + aim * (0.68 + lvl(score) * 0.5); };
  /** Landing depth for the power: too little = net, too much = long. */
  L.landD = function (power, score) { return 0.5 + (power - 0.5) * (1.55 + lvl(score) * 0.8); };

  L.judge = function (x, d, target) {
    if (d < 0) return "NET";
    if (x < 0 || x > 1 || d > 1) return "OUT";
    if (L.contains(target, x, d)) return "ACE";
    return "IN";
  };

  /** A new ace zone inside the court: smaller and (from 10 points) moving with the score. */
  L.newTarget = function (score, rnd) {
    var k = lvl(score);
    var hw = 0.18 - k * 0.08;
    var hd = 0.16 - k * 0.06;
    var x = hw + rnd() * (1 - 2 * hw);
    var d = 0.12 + hd + rnd() * (0.88 - 2 * hd);
    var speed = score < 10 ? 0 : Math.min(0.4, 0.12 + (score - 10) * 0.01);
    return L.target(x, d, hw, hd, rnd() < 0.5 ? speed : -speed);
  };

  L.start = function (rnd) {
    var aimPhase = rnd() * 4;
    return L.state({ aimPhase: aimPhase, target: L.newTarget(0, rnd) });
  };

  /** First tap fixes the direction, second the power (and the serve is decided). Otherwise ignored (same object). */
  L.tap = function (s) {
    if (L.over(s)) return s;
    if (s.phase === "AIM") return ext(s, { phase: "POWER", aim: L.tri(s.aimPhase), powerPhase: 0 });
    if (s.phase === "POWER") {
      var p = L.saw(s.powerPhase);
      var x = L.landX(s.aim, s.score) + (s.windX || 0);
      var d = L.landD(p, s.score) + (s.windD || 0);
      return ext(s, { phase: "FLIGHT", power: p, t: 0, landX: x, landD: d, result: L.judge(x, d, s.target) });
    }
    return s;
  };

  function moveTarget(t, dt) {
    if (t.vx === 0) return t;
    var x = t.x + t.vx * dt;
    var vx = t.vx;
    if (x < t.hw) { x = t.hw; vx = Math.abs(vx); }
    if (x > 1 - t.hw) { x = 1 - t.hw; vx = -Math.abs(vx); }
    return ext(t, { x: x, vx: vx });
  }

  /** Advances [dt] s. The ace zone moves while aiming; it stops when the power is fixed. */
  L.step = function (s, dt, rnd) {
    switch (s.phase) {
      case "AIM":
        return ext(s, { aimPhase: s.aimPhase + L.aimSpeed(s.score) * dt, target: moveTarget(s.target, dt) });
      case "POWER":
        return ext(s, { powerPhase: s.powerPhase + L.powerSpeed(s.score) * dt, target: moveTarget(s.target, dt) });
      case "FLIGHT":
        var t = s.t + dt / L.FLIGHT;
        if (t < 1) return ext(s, { t: t });
        var r = s.result || L.judge(s.landX, s.landD, s.target);
        return ext(s, { t: 1, phase: "RESULT", pause: L.PAUSE, result: r, score: s.score + POINTS[r],
          lives: POINTS[r] === 0 ? Math.max(0, s.lives - 1) : s.lives });
      default: // RESULT
        var p = s.pause - dt;
        if (p > 0 || L.over(s)) return ext(s, { pause: Math.max(0, p) });
        var aimPhase = rnd() * 4;
        var nx = ext(s, { phase: "AIM", pause: 0, t: 0, result: null, aimPhase: aimPhase, powerPhase: 0,
          target: L.newTarget(s.score, rnd) });
        if (!s.windy) return nx;
        var wn = L.newWind(nx.score, rnd);
        return ext(nx, { windX: wn.x, windD: wn.d });
    }
  };

  /** Ball ground position and height (court units) at flight progress [t]; a net ball stops at the net. */
  L.ballAt = function (s, t) {
    var endD = s.landD < 0 ? 0 : s.landD;
    var endX = s.landD < 0 ? 0.5 + (s.landX - 0.5) * clamp((0 - L.SERVER_D) / (s.landD - L.SERVER_D), 0, 1) : s.landX;
    var x = 0.5 + (endX - 0.5) * t;
    var d = L.SERVER_D + (endD - L.SERVER_D) * t;
    var peak = s.landD < 0 ? 0.25 : 0.55;
    var z = 0.25 * (1 - t) + 4 * peak * t * (1 - t);
    return { x: x, d: d, z: z };
  };
  // ------------------------------------------------ secret version: Servei amb vent (vent)
  /** Share of the wind that moves the depth (a serve is pushed more sideways than long or short). */
  L.WIND_DEPTH = 0.6;
  /** Strongest wind: a bit stronger with the score (court units the landing point moves). */
  L.maxWind = function (score) { return 0.16 + lvl(score) * 0.14; };
  /** A random wind: any direction, strength between a third and all of maxWind; depth moves less. */
  L.newWind = function (score, rnd) {
    var angle = rnd() * 2 * Math.PI;
    var strength = L.maxWind(score) * (0.35 + rnd() * 0.65);
    return { x: Math.cos(angle) * strength, d: Math.sin(angle) * strength * L.WIND_DEPTH };
  };
  /** The windy game: like start plus the first wind. */
  L.startWindy = function (rnd) {
    var s = ext(L.start(rnd), { windy: true });
    var wn = L.newWind(0, rnd);
    return ext(s, { windX: wn.x, windD: wn.d });
  };
  VSPG.logic.servei = L;

  // ------------------------------------------------------------------ drawing
  var FLOOR = "#D9894A", OUT = "#8C5530";
  var LABELS = { ACE: [tr("srv.ace"), gk.C.accent], IN: [tr("srv.in"), "#FFFFFF"], NET: [tr("srv.net"), gk.C.bad], OUT: [tr("srv.out"), gk.C.bad] };

  /** Perspective of Servei: the rival court seen from behind the server. */
  function View(w, h) {
    var farY = h * 0.10, netY = h * 0.47, serverY = h * 0.86;
    var v = { w: w, h: h, netY: netY };
    v.y = function (d) { return d >= 0 ? netY - d * (netY - farY) : netY + (-d / -L.SERVER_D) * (serverY - netY); };
    function half(d) { return w * (0.36 - 0.12 * d); }
    v.scale = function (d) { return half(d) / half(0); };
    v.x = function (x, d) { return w / 2 + (x - 0.5) * 2 * half(d); };
    v.quad = function (c, x0, d0, x1, d1) {
      c.beginPath();
      c.moveTo(v.x(x0, d0), v.y(d0)); c.lineTo(v.x(x1, d0), v.y(d0));
      c.lineTo(v.x(x1, d1), v.y(d1)); c.lineTo(v.x(x0, d1), v.y(d1)); c.closePath();
    };
    v.seg = function (c, x0, d0, x1, d1, color, width, round) {
      gk.line(c, v.x(x0, d0), v.y(d0), v.x(x1, d1), v.y(d1), color, width, round);
    };
    return v;
  }

  function drawNet(c, v) {
    var px = gk.px, h = v.h;
    var top = v.y(0) - h * 0.11, bottom = v.y(0) - h * 0.035;
    var x0 = v.x(-0.06, 0), x1 = v.x(1.06, 0), x, y;
    c.fillStyle = "rgba(0,0,0,0.28)"; c.fillRect(x0, top, x1 - x0, bottom - top);
    for (x = x0; x < x1; x += px(12)) gk.line(c, x, top, x, bottom, "rgba(255,255,255,0.18)", px(1.5));
    for (y = top; y < bottom; y += px(12)) gk.line(c, x0, y, x1, y, "rgba(255,255,255,0.18)", px(1.5));
    c.fillStyle = "#FFFFFF"; c.fillRect(x0, top - px(4), x1 - x0, px(8));
    gk.line(c, x0, top - px(4), x0, v.y(0), "rgba(255,255,255,0.8)", px(5));
    gk.line(c, x1, top - px(4), x1, v.y(0), "rgba(255,255,255,0.8)", px(5));
    gk.line(c, v.x(0, 0), top - px(10), v.x(0, 0), top - h * 0.07, "#FF0000", px(4));
    gk.line(c, v.x(1, 0), top - px(10), v.x(1, 0), top - h * 0.07, "#FF0000", px(4));
  }

  /** Vertical power bar on the right: red = net (bottom) or long (top), green = in, light = ace depth. */
  function drawPowerBar(c, st, w, h) {
    var C = gk.C;
    var bw = w * 0.07, left = w - bw - w * 0.035, top = h * 0.52, bottom = h * 0.92, len = bottom - top;
    function py(p) { return bottom - clamp(p, 0, 1) * len; }
    function pOf(d) { // inverse of landD
      var a = L.landD(0, st.score), b = L.landD(1, st.score);
      return (d - a) / (b - a);
    }
    var alpha = st.phase === "AIM" ? 0.45 : 1;
    c.fillStyle = gk.rgba(C.bad, alpha); gk.rr(c, left, top, bw, len, bw / 3); c.fill();
    var inLo = py(pOf(0)), inHi = py(pOf(1));
    c.fillStyle = gk.rgba(C.green, alpha); c.fillRect(left, inHi, bw, inLo - inHi);
    var t = st.target;
    var aLo = py(pOf(t.d - t.hd)), aHi = py(pOf(t.d + t.hd));
    c.fillStyle = gk.rgba(C.accent, alpha); c.fillRect(left, aHi, bw, aLo - aHi);
    gk.rr(c, left, top, bw, len, bw / 3);
    c.strokeStyle = gk.rgba("#FFFFFF", alpha); c.lineWidth = gk.px(3); c.stroke();
    if (st.phase !== "AIM") {
      var y = py(L.powerNow(st));
      gk.line(c, left - bw * 0.35, y, left + bw * 1.35, y, "#FFFFFF", gk.px(7), true);
      gk.line(c, left - bw * 0.35, y, left + bw * 1.35, y, C.dark, gk.px(3), true);
    }
  }

  function drawService(c, st, clock, w, h) {
    var C = gk.C, v = View(w, h), px = gk.px;
    gk.bg(c, w, h);
    // floor around the court (out), the court and our side
    v.quad(c, -0.35, -0.02, 1.35, 1.35); c.fillStyle = gk.rgba(OUT, 0.55); c.fill();
    v.quad(c, 0, 0, 1, 1); c.fillStyle = FLOOR; c.fill();
    v.quad(c, -0.2, L.SERVER_D - 0.2, 1.2, 0); c.fillStyle = gk.rgba(OUT, 0.35); c.fill();
    v.quad(c, 0, -1, 1, 0); c.fillStyle = gk.rgba(FLOOR, 0.55); c.fill();
    // ace zone (pulsing)
    if (st) {
      var t = st.target;
      v.quad(c, t.x - t.hw, t.d - t.hd, t.x + t.hw, t.d + t.hd);
      c.fillStyle = gk.rgba(C.accent, 0.35 + 0.15 * Math.sin(clock * 6)); c.fill();
      c.strokeStyle = C.accent; c.lineWidth = px(3); c.lineJoin = "miter"; c.stroke();
    }
    // lines: sidelines, end line, attack line, our attack line
    var lw = w * 0.008;
    v.quad(c, 0, 0, 1, 1); c.strokeStyle = "#FFFFFF"; c.lineWidth = lw; c.stroke();
    v.seg(c, 0, 1 / 3, 1, 1 / 3, "#FFFFFF", lw * 0.8);
    v.seg(c, 0, -1 / 3, 1, -1 / 3, "rgba(255,255,255,0.6)", lw);
    v.seg(c, 0, 0, 0, -1, "rgba(255,255,255,0.6)", lw);
    v.seg(c, 1, 0, 1, -1, "rgba(255,255,255,0.6)", lw);
    if (!st) { drawNet(c, v); return; }

    var aiming = st.phase === "AIM" || st.phase === "POWER";
    var lx = L.landX(L.aimNow(st), st.score);
    if (aiming) {
      // lane where the ball will land (the power decides how deep)
      c.save();
      c.setLineDash([px(18), px(12)]); c.lineDashOffset = px(clock * 60);
      v.seg(c, lx, 0, lx, 1.3, "rgba(255,255,255,0.85)", w * 0.006, true);
      c.restore();
      var tx = 0.5 + (lx - 0.5) * 0.55;
      v.seg(c, 0.5, L.SERVER_D + 0.1, tx, -0.45, C.accent, w * 0.016, true);
      gk.circle(c, v.x(tx, -0.45), v.y(-0.45), w * 0.018, C.accent);
    }
    // shadow of the ball, then the net, then the ball
    var r0 = w * 0.055;
    var b = aiming ? { x: 0.5, d: L.SERVER_D, z: 0.25 + 0.02 * Math.sin(clock * 5) } : L.ballAt(st, st.t);
    var gx = v.x(b.x, b.d), gy = v.y(b.d), sc = v.scale(b.d);
    c.save();
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath(); c.ellipse(gx, gy, r0 * sc, r0 * sc * 0.35, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    if (st.phase === "RESULT" && st.landD >= 0) {
      var k = clamp(1 - st.pause / L.PAUSE, 0, 1);
      var col = (st.result === "ACE" || st.result === "IN") ? C.accent : C.bad;
      gk.circle(c, gx, gy, r0 * sc * (1 + k * 2.5), gk.rgba(col, 1 - k), r0 * 0.2);
    }
    var ballFirst = b.d > 0; // beyond the net: the net is drawn over the ball
    if (!ballFirst) drawNet(c, v);
    var mood = "focus";
    if (st.result === "ACE") mood = "cheer";
    else if ((st.result === "NET" || st.result === "OUT") && st.phase === "RESULT") mood = "sad";
    gk.pili(c, gx, gy - b.z * h * 0.5 * sc, r0 * sc, mood, "champion");
    if (ballFirst) drawNet(c, v);
    drawPowerBar(c, st, w, h);
    if (st.windy) drawWind(c, st, w, h);
  }

  /** Secret version (Servei amb vent): a dial at the top left with an arrow towards where the wind blows, as long as it is strong. */
  function drawWind(c, st, w, h) {
    var r = w * 0.11, cx = w * 0.035 + r, cy = h * 0.035 + r;
    gk.circle(c, cx, cy, r, "rgba(0,0,0,0.35)");
    gk.circle(c, cx, cy, r, "rgba(255,255,255,0.8)", gk.px(3));
    // screen: wind x to the right, deeper (into the rival court) upwards; depth is scaled back to a full turn
    var dx = st.windX, dy = -st.windD / L.WIND_DEPTH;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-4) return;
    var top = L.maxWind(40);
    var k = clamp(len / top, 0.25, 1) * r * 0.85;
    var ux = dx / len, uy = dy / len, color = "#81D4FA";
    gk.line(c, cx - ux * k, cy - uy * k, cx + ux * k, cy + uy * k, color, r * 0.16, true);
    var tx = cx + ux * k, ty = cy + uy * k, head = r * 0.38;
    c.beginPath();
    c.moveTo(tx + ux * head * 0.4, ty + uy * head * 0.4);
    c.lineTo(tx - ux * head * 0.6 - uy * head * 0.55, ty - uy * head * 0.6 + ux * head * 0.55);
    c.lineTo(tx - ux * head * 0.6 + uy * head * 0.55, ty - uy * head * 0.6 - ux * head * 0.55);
    c.closePath(); c.fillStyle = color; c.fill();
    // strength in bars (1-3) under the dial
    var bars = L.windBars(st);
    for (var i = 0; i < 3; i++) {
      var bw = r * 0.3, bx = cx - r * 0.55 + i * r * 0.4, bh = r * (0.18 + i * 0.12);
      c.fillStyle = i < bars ? color : "rgba(255,255,255,0.25)";
      c.fillRect(bx, cy + r * 1.45 - bh, bw, bh);
    }
  }
  /** Strength bars (1-3) of the wind dial. */
  L.windBars = function (st) {
    var dx = st.windX, dy = -st.windD / L.WIND_DEPTH, len = Math.sqrt(dx * dx + dy * dy), top = L.maxWind(40);
    return len < top * 0.45 ? 1 : len < top * 0.75 ? 2 : 3;
  };

  // ------------------------------------------------------------------ game
  function start(stage, api) {
    var offs = [], rnd = api.rnd, playing = true, clock = 0;
    var S = gk.surface(stage, function () { draw(); });
    // secret version "Servei amb vent": a wind on every serve
    var windy = !!(api.mode && api.mode.secret === "vent");
    var state = windy ? L.startWindy(rnd) : L.start(rnd);
    api.setScore(0); api.setLives(L.LIVES);

    function draw() {
      var c = S.ctx, w = S.w, h = S.h, st = state;
      drawService(c, st, clock, w, h);
      gk.text(c, api, w, String(st.score), 16, h - 8, 64, "rgba(255,255,255,0.3)", "left", "bottom");
      if (playing && (st.phase === "AIM" || st.phase === "POWER")) {
        c.save(); c.shadowColor = "rgba(0,0,0,0.5)"; c.shadowBlur = 4;
        gk.text(c, api, w, st.phase === "AIM" ? tr("srv.tap_aim") : tr("srv.tap_power"), w / 2, h - 16, 16, "#FFFFFF", "center", "bottom");
        c.restore();
      } else if (playing && st.phase === "RESULT" && st.result) {
        var lb = LABELS[st.result];
        gk.text(c, api, w, lb[0], w / 2, h / 2 + 60, 32, lb[1]);
      }
    }

    function frame(dt) {
      S.fit();
      if (!playing) return;
      clock += dt;
      var s = state;
      var next = L.step(s, dt, rnd);
      if (next.phase === "RESULT" && s.phase === "FLIGHT") {
        api.haptic(next.result === "ACE" ? 30 : 10);
        if (next.score !== s.score) api.setScore(next.score);
        if (next.lives !== s.lives) api.setLives(next.lives);
      }
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
      var cur = state;
      var next = L.tap(cur);
      if (next !== cur) { state = next; api.haptic(10); draw(); }
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
    id: "servei",
    title: tr("game.servei"),
    emoji: "🎯",
    help: tr("help.servei"),
    lives: L.LIVES,
    action: true,
    start: start
  });
})();
