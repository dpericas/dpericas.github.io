/* Club Vòlei Santpedor — jocs web: «Rematada».
 * Port of the Android app (extras/Spike.kt + SpikeLogic.kt): same rules, timings and scoring.
 * The setter sets the ball; tap the rival court when it reaches the ring, through the gap of the block. */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  var tr = VSPG.t || function (k) { return k; };
  VSPG.logic = VSPG.logic || {};

  function ext(s, p) { var o = {}, k; for (k in s) o[k] = s[k]; for (k in p) o[k] = p[k]; return o; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // ------------------------------------------------------------------ pure logic (SpikeLogic)
  // results: points of each outcome
  var POINTS = { PERFECT: 2, KILL: 1, BLOCKED: 0, OUT: 0, EARLY: 0, LATE: 0 };
  var CAP = 40;

  var L = {
    LIVES: 3,
    COURT_L: 0.08, COURT_R: 0.92,
    COURT_TOP: 0.10,  // rival end line
    NET_Y: 0.46,
    CONTACT_Y: 0.74,  // the ball is hit here, at its peak
    SET_Y: 0.98,      // the setter releases the ball here
    SETTER_X: 0.86,
    BLOCKER_W: 0.13,
    BALL_R: 0.03,
    PAUSE: 1.0,
    FLY: 0.35,        // seconds the shot takes to land (drawing only)
    POINTS: POINTS
  };
  /** Seconds from the set to the peak: a bit quicker with the score. */
  L.peak = function (score) { return 0.9 - Math.min(score, CAP) * 0.006; };
  /** |t - peak| allowed to hit at all, and for a perfect hit. */
  L.window = function (score) { return 0.24 - Math.min(score, CAP) * 0.003; };
  L.perfectWindow = function (score) { return 0.08 - Math.min(score, CAP) * 0.001; };
  /** Block speed along the net (field widths per second). */
  L.blockSpeed = function (score) { return 0.22 + Math.min(score, CAP) * 0.016; };
  L.maxBlockers = function (score) { return score < 4 ? 1 : (score < 14 ? 2 : 3); };
  /** Chance that the block goes to the ball instead of a random place (it reads the set). */
  L.readChance = function (score) { return Math.min(score, CAP) * 0.012; };
  L.blockWidth = function (n) { return n * L.BLOCKER_W; };
  function blockMin(n) { return L.COURT_L + L.blockWidth(n) / 2; }
  function blockMax(n) { return L.COURT_R - L.blockWidth(n) / 2; }

  L.state = function (p) {
    return ext({ score: 0, lives: L.LIVES, t: 0, peak: L.peak(0), ballX: 0.5, blockX: 0.5, blockGoal: 0.5,
      blockers: 1, result: null, pause: 0, shotX: 0.5, shotY: L.CONTACT_Y }, p || {});
  };
  L.over = function (s) { return s.lives <= 0; };
  L.attacking = function (s) { return s.pause <= 0 && !L.over(s); };

  L.start = function (rnd) { return L.rally(L.state(), rnd); };

  /** A new set: the ball goes to a random x, the block gets 1-3 players. */
  L.rally = function (s, rnd) {
    var max = L.maxBlockers(s.score);
    var n = Math.max(1, max - Math.floor(rnd() * 2));
    var ballX = 0.25 + rnd() * 0.5;
    var base = ext(s, { t: 0, peak: L.peak(s.score), ballX: ballX, blockers: n, result: null, pause: 0,
      blockX: clamp(s.blockX, blockMin(n), blockMax(n)) });
    return ext(base, { blockGoal: goal(base, rnd) });
  };

  function goal(s, rnd) {
    var n = s.blockers;
    var x = rnd() < L.readChance(s.score) ? s.ballX : blockMin(n) + rnd() * (blockMax(n) - blockMin(n));
    return clamp(x, blockMin(n), blockMax(n));
  }

  /** x where a shot from the contact point to (x, y) crosses the net. */
  L.crossing = function (ballX, x, y) { return ballX + (x - ballX) * (L.CONTACT_Y - L.NET_Y) / (L.CONTACT_Y - y); };
  L.blocked = function (s, cross) { return Math.abs(cross - s.blockX) <= L.blockWidth(s.blockers) / 2 + L.BALL_R; };
  L.outside = function (x, y) { return x < L.COURT_L || x > L.COURT_R || y < L.COURT_TOP; };

  /** Result of hitting towards (x, y) now (the point must be on the rival side). */
  L.judge = function (s, x, y) {
    var d = s.t - s.peak;
    if (d < -L.window(s.score)) return "EARLY";
    if (d > L.window(s.score)) return "LATE";
    if (L.blocked(s, L.crossing(s.ballX, x, y))) return "BLOCKED";
    if (L.outside(x, y)) return "OUT";
    if (Math.abs(d) <= L.perfectWindow(s.score)) return "PERFECT";
    return "KILL";
  };

  function resolve(s, r, x, y) {
    var pts = POINTS[r];
    return ext(s, { score: s.score + pts, lives: pts === 0 ? Math.max(0, s.lives - 1) : s.lives,
      result: r, pause: L.PAUSE, shotX: x, shotY: y });
  }

  /** The player taps (x, y). Taps on our own side or between attacks are ignored (same object back). */
  L.hit = function (s, x, y) {
    if (!L.attacking(s) || y >= L.NET_Y) return s;
    return resolve(s, L.judge(s, x, y), x, y);
  };

  /** Advances dt s: the block walks, a ball not hit in time is late, then a new set. */
  L.step = function (s, dt, rnd) {
    if (s.pause > 0) {
      var pause = s.pause - dt;
      return (pause <= 0 && !L.over(s)) ? L.rally(s, rnd) : ext(s, { pause: Math.max(0, pause) });
    }
    if (L.over(s)) return s;
    var moved = ext(moveBlock(s, dt, rnd), { t: s.t + dt });
    return (moved.t - moved.peak > L.window(s.score)) ? resolve(moved, "LATE", moved.ballX, L.CONTACT_Y) : moved;
  };

  function moveBlock(s, dt, rnd) {
    var d = s.blockGoal - s.blockX;
    var stepX = L.blockSpeed(s.score) * dt;
    if (Math.abs(d) > stepX) return ext(s, { blockX: s.blockX + (d > 0 ? stepX : -stepX) });
    var there = ext(s, { blockX: s.blockGoal });
    return ext(there, { blockGoal: goal(there, rnd) });
  }

  /** Ball y on the screen while it is set: from the setter up to the contact point and down again. */
  L.ballY = function (s, t) {
    if (t === undefined) t = s.t;
    var k = (t - s.peak) / s.peak;
    return Math.min(L.CONTACT_Y + (L.SET_Y - L.CONTACT_Y) * k * k, 1.05);
  };
  L.ballXAt = function (s, t) {
    if (t === undefined) t = s.t;
    return L.SETTER_X + (s.ballX - L.SETTER_X) * clamp(t / s.peak, 0, 1);
  };

  VSPG.logic.rematada = L;

  // ------------------------------------------------------------------ drawing (Spike.kt)
  var SKIN = "#E8B98A", RIVAL = "#C62828", HAIR = "#3E2723", BAD = "#FF8A80";
  var GREEN = "#1E8C34", DARK = "#1C211E", ACCENT = "#B9F6C0";
  var TEXTS = {
    PERFECT: [tr("spk.perfect"), ACCENT], KILL: [tr("spk.kill"), "#fff"], BLOCKED: [tr("spk.blocked"), BAD],
    OUT: [tr("spk.out"), BAD], EARLY: [tr("spk.early"), BAD], LATE: [tr("spk.late"), BAD]
  };

  function rrect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r);
    c.closePath();
  }
  function line(c, color, x1, y1, x2, y2, wd, round) {
    c.strokeStyle = color; c.lineWidth = wd; c.lineCap = round ? "round" : "butt";
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }
  function disc(c, color, r, x, y) { c.fillStyle = color; c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); c.fill(); }
  function ring(c, color, r, x, y, wd) { c.strokeStyle = color; c.lineWidth = wd; c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); c.stroke(); }
  function pili(c, x, y, r, mood) { if (VSPG.drawPili) VSPG.drawPili(c, x, y, r, { mood: mood }); }

  /** Both courts, lines and the setter. u: app pixels → CSS pixels. */
  function drawCourt(c, w, h, u) {
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0D3B1E"); g.addColorStop(1, GREEN);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    var l = L.COURT_L * w, r = L.COURT_R * w, top = L.COURT_TOP * h, net = L.NET_Y * h;
    c.fillStyle = "rgba(224,123,57,0.55)"; c.fillRect(l, top, r - l, net - top);
    c.fillStyle = "rgba(224,123,57,0.35)"; c.fillRect(l, net, r - l, h - net);
    var ln = "rgba(255,255,255,0.8)";
    c.strokeStyle = ln; c.lineWidth = 3 * u; c.strokeRect(l, top, r - l, net - top);
    line(c, ln, l, net, l, h, 3 * u);
    line(c, ln, r, net, r, h, 3 * u);
    // attack lines
    line(c, "rgba(255,255,255,0.4)", l, net - (net - top) / 3, r, net - (net - top) / 3, 2 * u);
    line(c, "rgba(255,255,255,0.4)", l, net + h * 0.12, r, net + h * 0.12, 2 * u);
    // the setter, arms up, near the right sideline
    var sx = L.SETTER_X * w, sy = h * 0.9, bw = w * 0.07;
    c.fillStyle = GREEN; rrect(c, sx - bw / 2, sy, bw, h * 0.1, bw / 3); c.fill();
    disc(c, SKIN, bw * 0.4, sx, sy - bw * 0.3);
    line(c, SKIN, sx - bw * 0.35, sy + 4 * u, sx - bw * 0.3, sy - bw * 0.9, bw * 0.18, true);
    line(c, SKIN, sx + bw * 0.35, sy + 4 * u, sx + bw * 0.3, sy - bw * 0.9, bw * 0.18, true);
  }

  /** The rival block standing at the net (hands over the tape), then the net in front of their bodies. */
  function drawBlock(c, st, w, h, u) {
    var net = L.NET_Y * h, bw = L.BLOCKER_W * w;
    var left = (st.blockX - L.blockWidth(st.blockers) / 2) * w;
    for (var i = 0; i < st.blockers; i++) {
      var cx = left + bw * (i + 0.5), body = bw * 0.62, top = net - h * 0.15;
      line(c, SKIN, cx - body * 0.4, top + 6 * u, cx - body * 0.35, net - h * 0.215, body * 0.22, true);
      line(c, SKIN, cx + body * 0.4, top + 6 * u, cx + body * 0.35, net - h * 0.215, body * 0.22, true);
      c.fillStyle = RIVAL; rrect(c, cx - body / 2, top, body, h * 0.13, body / 3); c.fill();
      disc(c, HAIR, body * 0.36, cx, top - body * 0.3);
    }
    // net: mesh band and white tape
    var l = L.COURT_L * w - 10 * u, r = L.COURT_R * w + 10 * u, tape = net - h * 0.12;
    c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(l, tape, r - l, net - tape - h * 0.04);
    for (var x = l; x < r; x += 14 * u) line(c, "rgba(255,255,255,0.25)", x, tape, x, net - h * 0.04, 1.5 * u);
    c.fillStyle = "#fff"; c.fillRect(l, tape - 4 * u, r - l, 8 * u);
    line(c, "rgba(255,255,255,0.8)", l, tape, l, net, 5 * u);
    line(c, "rgba(255,255,255,0.8)", r, tape, r, net, 5 * u);
  }

  /** Contact ring, the attacker and the ball (set, shot, blocked or falling). */
  function drawBall(c, st, w, h, u) {
    var r = w * 0.045, cx = st.ballX * w, cy = L.CONTACT_Y * h, d = st.t - st.peak;
    // the attacker jumps under the ball
    var k = clamp(1 - Math.abs(d) / (st.peak * 0.6), 0, 1);
    var px = cx - w * 0.05, bodyTop = cy + h * 0.1 - k * h * 0.04, bw = w * 0.085;
    var hx = cx - r * 0.2, hy = cy + r * 0.8 + (1 - k) * h * 0.05;
    line(c, SKIN, px + bw * 0.3, bodyTop + 6 * u, hx, hy, bw * 0.2, true);
    c.fillStyle = GREEN; rrect(c, px - bw / 2, bodyTop, bw, h * 0.12, bw / 3); c.fill();
    c.fillStyle = DARK; c.fillRect(px - bw / 2, bodyTop + h * 0.085, bw, h * 0.035);
    disc(c, HAIR, bw * 0.38, px, bodyTop - bw * 0.3);
    if (L.attacking(st)) {
      // the ring closes as the ball arrives: green inside the window, white for perfect
      var ringK = clamp(-d / st.peak, 0, 1);
      var color = Math.abs(d) <= L.perfectWindow(st.score) ? "#fff" :
        (Math.abs(d) <= L.window(st.score) ? ACCENT : "rgba(255,255,255,0.45)");
      ring(c, color, r * (1.15 + ringK * 2.5), cx, cy, 5 * u);
      pili(c, L.ballXAt(st) * w, L.ballY(st) * h, r, "focus");
      return;
    }
    var res = st.result;
    if (!res) return;
    var e = L.PAUSE - st.pause; // seconds since the result
    if (res === "PERFECT" || res === "KILL" || res === "OUT") {
      var f = clamp(e / L.FLY, 0, 1);
      var tx = st.shotX * w, ty = st.shotY * h;
      var x = cx + (tx - cx) * f, y = cy + (ty - cy) * f;
      if (f >= 1) {
        if (res === "OUT") {
          var m = r * 0.6;
          line(c, BAD, tx - m, ty - m, tx + m, ty + m, 6 * u, true);
          line(c, BAD, tx - m, ty + m, tx + m, ty - m, 6 * u, true);
        } else ring(c, ACCENT, r * (1 + (e - L.FLY) * 3), tx, ty, 4 * u);
      }
      pili(c, x, y, r * (1 - 0.4 * f), res === "OUT" ? "sad" : "cheer");
    } else if (res === "BLOCKED") {
      var hitX = L.crossing(st.ballX, st.shotX, st.shotY) * w, hitY = (L.NET_Y - 0.17) * h;
      var half = L.FLY * 0.6;
      if (e < half) pili(c, cx + (hitX - cx) * (e / half), cy + (hitY - cy) * (e / half), r * 0.8, "sad");
      else pili(c, hitX, hitY + (e - half) * h * 1.1, r * 0.8, "sad");
    } else {
      pili(c, L.ballXAt(st, st.t + e) * w, L.ballY(st, st.t + e) * h, r, "wink");
    }
  }

  function drawAll(c, st, w, h) {
    var u = Math.max(0.3, w / 1080);   // the app draws in device px on a ~1080 px wide phone
    drawCourt(c, w, h, u);
    if (!st) return;
    drawBlock(c, st, w, h, u);
    drawBall(c, st, w, h, u);
    // the score, big and faded, bottom left
    c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.font = "900 72px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    c.fillStyle = "rgba(255,255,255,0.22)";
    c.fillText(String(st.score), 16, h - 16);
    if (st.pause > 0 && st.result) {
      var tc = TEXTS[st.result];
      c.textAlign = "center"; c.textBaseline = "middle";
      c.font = "900 30px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      c.fillStyle = tc[1]; c.fillText(tc[0], w / 2, h / 2 + 20);
    }
  }

  // ------------------------------------------------------------------ the game module
  function start(stage, api) {
    var cv = document.createElement("canvas");
    cv.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none;" +
      "-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent";
    stage.appendChild(cv);
    var ctx = cv.getContext("2d");
    var W = 0, H = 0;
    var rnd = api.rnd;
    var state = L.start(rnd);
    var playing = true, alive = true, raf = 0, last = -1, lastScore = -1, lastLives = -1;

    function resize() {
      var dpr = window.devicePixelRatio || 1;
      W = stage.clientWidth || 1; H = stage.clientHeight || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function draw() { if (alive) drawAll(ctx, state, W, H); }
    function hud() {
      if (state.score !== lastScore) { lastScore = state.score; api.setScore(state.score); }
      if (state.lives !== lastLives) { lastLives = state.lives; api.setLives(state.lives); }
    }

    function frame(now) {
      if (!alive) return;
      if (api.paused) { last = -1; raf = requestAnimationFrame(frame); return; }   // pause overlay: nothing advances
      if (last < 0) last = now;
      var dt = Math.min(Math.max(0, (now - last) / 1000), 0.033) * (api.speed || 1);
      last = now;
      if (playing) {
        var s = state, next = L.step(s, dt, rnd);
        if (next.result === "LATE" && s.result === null) api.haptic(15);
        state = next;
        hud();
        if (L.over(next) && next.pause <= 0) {
          playing = false;
          draw();
          api.end(next.score);
          return;
        }
      }
      draw();
      raf = requestAnimationFrame(frame);
    }

    function onDown(ev) {
      ev.preventDefault();
      if (!playing || !W || !H) return;
      var p = api.point(ev, cv);
      var cur = state, next = L.hit(cur, p.x / W, p.y / H);
      if (next !== cur) {
        state = next;
        api.haptic(POINTS[next.result] > 0 ? 40 : 15);
        hud();
      }
    }
    function noop(ev) { ev.preventDefault(); }

    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("contextmenu", noop);
    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(stage); }
    window.addEventListener("resize", resize);
    resize();
    hud();
    raf = requestAnimationFrame(frame);

    return {
      stop: function () {
        alive = false; playing = false;
        cancelAnimationFrame(raf);
        cv.removeEventListener("pointerdown", onDown);
        cv.removeEventListener("contextmenu", noop);
        window.removeEventListener("resize", resize);
        if (ro) ro.disconnect();
        if (cv.parentNode) cv.parentNode.removeChild(cv);
      },
      // for tests
      _state: function () { return state; }
    };
  }

  VSPG.games.register({
    id: "rematada",
    title: tr("game.rematada"),
    emoji: "💥",
    help: tr("help.rematada"),
    lives: L.LIVES,
    action: true,
    start: start
  });
})();
