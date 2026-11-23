/* Club Vòlei Santpedor — jocs web: «Platja contra la Pili».
 * Port of the Android app (extras/Beach.kt + BeachLogic.kt): same physics, AI, rules and scoring.
 * 1 vs 1 beach volleyball: drag to move, tap to jump; sets to 5; score = sets won in a row. */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  var tr = VSPG.t || function (k) { return k; };
  VSPG.logic = VSPG.logic || {};

  function ext(s, p) { var o = {}, k; for (k in s) o[k] = s[k]; for (k in p) o[k] = p[k]; return o; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // ------------------------------------------------------------------ pure logic (BeachLogic)
  // sides: "ME" (the player, left) and "PILI" (right). Ball {x, y, vx, vy} in world units, y up from the sand.
  var B = {
    G: 1.5,
    BALL_R: 0.035,
    NET_X: 0.5,
    NET_H: 0.19,
    BODY_H: 0.15,     // top of a standing player (hands)
    REACH: 0.065,     // radius of a player's body
    ME_HOME: 0.22,
    PILI_HOME: 0.75,
    ME_SPEED: 0.85,
    JUMP_V: 1.2,
    JUMP_G: 3.6,
    MY_SPIKE: 0.5,    // flight time of the player's spikes
    SET_POINTS: 5,
    LEGEND_SET_POINTS: 7,
    /** The Pili Llegenda plays the first set like the normal Pili plays the set 1 + this. */
    LEGEND_BOOST: 2,
    /** The Pili Llegenda tries to spike at least this often. */
    LEGEND_SPIKE: 0.45,
    POINT_PAUSE: 1.1,
    SET_PAUSE: 2.0
  };
  var NET_GAP = 0.05; // players keep this far from the net

  function ball(x, y, vx, vy) { return { x: x, y: y, vx: vx, vy: vy }; }
  B.ball = ball;

  B.state = function (p) {
    return ext({
      ball: ball(0.25, 0, 0, 0), px: B.ME_HOME, pJump: 0, pVy: 0, cx: B.PILI_HOME, cJump: 0, cVy: 0,
      me: 0, pili: 0, set: 1, score: 0, lastTouch: null, touches: 0, cpuGoal: B.PILI_HOME, cpuDelay: 0,
      cpuSpike: false, pause: 0, pointTo: null, setWon: false, server: "ME", over: false,
      // secret version "Final contra la Pili Llegenda": quicker, she spikes from the first set, sets to 7
      legend: false
    }, p || {});
  };
  /** Level of the rival: the set, a few sets ahead against the Pili Llegenda. */
  B.level = function (s) { return s.legend ? s.set + B.LEGEND_BOOST : s.set; };
  /** Points to win (or lose) a set. */
  B.setPoints = function (s) { return s.legend ? B.LEGEND_SET_POINTS : B.SET_POINTS; };
  B.inPlay = function (s) { return s.pause <= 0 && !s.over; };

  // ---- the Pili gets better every set
  function lvl(set) { return clamp(set - 1, 0, 6); }
  B.cpuSpeed = function (set) { return 0.5 + lvl(set) * 0.13; };
  B.reaction = function (set) { return Math.max(0.12, 0.42 - lvl(set) * 0.07); };
  /** Max error (world units) when she guesses where the ball comes down. */
  B.misjudge = function (set) { return Math.max(0.03, 0.14 - lvl(set) * 0.026); };
  /** Chance that her hit is a mistake (long or short). */
  B.errorChance = function (set) { return Math.max(0.03, 0.2 - lvl(set) * 0.04); };
  /** Chance that she aims away from the player instead of anywhere. */
  B.aimChance = function (set) { return Math.min(0.85, 0.2 + lvl(set) * 0.16); };
  B.spikeChance = function (set) { return Math.min(0.75, lvl(set) * 0.18); };
  /** Her spike chance in a game: the Pili Llegenda always spikes a lot. */
  B.spikeChanceOf = function (s) { return s.legend ? Math.max(B.LEGEND_SPIKE, B.spikeChance(B.level(s))) : B.spikeChance(s.set); };
  /** How high her normal hits rise over the contact: lower (quicker) every set. */
  B.piliLift = function (set) { return Math.max(0.08, 0.42 - lvl(set) * 0.085); };
  /** Flight time of her spikes. */
  B.piliSpike = function (set) { return Math.max(0.45, 0.7 - lvl(set) * 0.06); };

  // ---- flights
  /** A ball hit from (x, y) that comes down on the sand at tx, rising to apex (raised to clear the net). */
  B.launch = function (x, y, tx, apex) {
    var a = Math.max(apex, y + 0.03);
    var b = flight(x, y, tx, a);
    for (var i = 0; i < 40; i++) {
      if (clearsNet(b, tx)) return b;
      a += 0.03;
      b = flight(x, y, tx, a);
    }
    return b;
  };
  /** A spike from (x, y) to the sand at tx in about time s (slower if needed to clear the net). */
  B.drive = function (x, y, tx, time) {
    var t = time;
    var b = driven(x, y, tx, t);
    for (var i = 0; i < 40; i++) {
      if (clearsNet(b, tx)) return b;
      t += 0.05;
      b = driven(x, y, tx, t);
    }
    return b;
  };
  function driven(x, y, tx, t) { return ball(x, y, (tx - x) / t, (B.G * t * t / 2 - y) / t); }
  function flight(x, y, tx, apex) {
    var vy = Math.sqrt(2 * B.G * (apex - y));
    var time = vy / B.G + Math.sqrt(2 * apex / B.G);
    return ball(x, y, (tx - x) / time, vy);
  }
  function clearsNet(b, tx) {
    if ((b.x < B.NET_X) === (tx < B.NET_X) || b.vx === 0) return true;
    var t = (B.NET_X - b.x) / b.vx;
    return B.heightAt(b, t) >= B.NET_H + B.BALL_R + 0.02;
  }
  B.heightAt = function (b, t) { return b.y + b.vy * t - B.G * t * t / 2; };
  /** Seconds until the ball comes down to height h (null if it is already below and falling). */
  B.timeTo = function (b, h) {
    var disc = b.vy * b.vy + 2 * B.G * (b.y - h);
    if (disc < 0) return null;
    var t = (b.vy + Math.sqrt(disc)) / B.G;
    return t >= 0 ? t : null;
  };
  /** x where the ball comes down to height h. */
  B.landingX = function (b, h) {
    var t = B.timeTo(b, h || 0);
    return b.x + b.vx * (t === null ? 0 : t);
  };
  /** Distance from the ball to a player's body (a vertical segment), minus the radii: <= 0 is a touch. */
  B.gap = function (b, x, jump) {
    var y0 = jump + B.REACH * 0.5, y1 = jump + B.BODY_H;
    var cy = clamp(b.y, y0, y1);
    var dx = b.x - x, dy = b.y - cy;
    return Math.sqrt(dx * dx + dy * dy) - B.REACH - B.BALL_R;
  };
  /** Where the player's hit goes: touched by the front (net side) it goes long, by the back short. */
  B.myTarget = function (b, px) {
    var o = clamp((b.x - px) / (B.REACH + B.BALL_R), -1, 1);
    return 0.56 + (o + 1) / 2 * 0.41;
  };
  /** The player's hit; jumping with the ball above the net is a spike (low and fast). */
  B.myHit = function (b, px, jump) {
    var tx = B.myTarget(b, px);
    var spike = jump > 0.03 && b.y > B.NET_H;
    return spike ? B.drive(b.x, b.y, tx, B.MY_SPIKE) : B.launch(b.x, b.y, tx, Math.max(b.y + 0.42, B.NET_H + 0.3));
  };
  /** Where the Pili sends the ball: sometimes a mistake, else away from the player or anywhere. */
  B.piliTarget = function (s, rnd, mistakes) {
    if (mistakes === undefined) mistakes = true;
    if (mistakes && rnd() < B.errorChance(B.level(s))) {
      return rnd() < 0.5 ? -0.03 - rnd() * 0.08 : 0.52 + rnd() * 0.04;
    }
    if (rnd() < B.aimChance(B.level(s))) return s.px < 0.25 ? 0.39 + rnd() * 0.07 : 0.04 + rnd() * 0.07;
    return 0.06 + rnd() * 0.38;
  };
  B.piliHit = function (s, b, rnd) {
    var tx = B.piliTarget(s, rnd);
    var spike = s.cJump > 0.03 && b.y > B.NET_H;
    return spike ? B.drive(b.x, b.y, tx, B.piliSpike(B.level(s))) : B.launch(b.x, b.y, tx, Math.max(b.y + B.piliLift(B.level(s)), B.NET_H + 0.1));
  };
  /** The Pili guesses where the ball comes down (with an error) and starts walking after her reaction time. */
  B.plan = function (s, rnd) {
    var land = B.landingX(s.ball, B.BODY_H);
    var e = (rnd() * 2 - 1) * B.misjudge(B.level(s));
    return ext(s, { cpuGoal: clamp(land + e, B.NET_X + NET_GAP, 1.02), cpuDelay: B.reaction(B.level(s)),
      cpuSpike: rnd() < B.spikeChanceOf(s) && land < 0.85 });
  };

  // ---- game flow
  B.start = function (rnd, legend) { return B.serve(B.state({ legend: !!legend }), rnd); };

  /** The server serves: an easy ball to the other side. */
  B.serve = function (s, rnd) {
    var base = ext(s, { pause: 0, pointTo: null, pJump: 0, pVy: 0, cJump: 0, cVy: 0 });
    if (s.server === "ME") {
      var b = B.launch(base.px, B.BODY_H + 0.08, 0.62 + rnd() * 0.3, 0.75);
      return B.plan(ext(base, { ball: b, lastTouch: "ME" }), rnd);
    }
    var c = ext(base, { cx: 0.85 });
    var b2 = B.launch(c.cx, B.BODY_H + 0.08, B.piliTarget(c, rnd, false), 0.72);
    return ext(c, { ball: b2, lastTouch: "PILI", cpuGoal: B.PILI_HOME, cpuDelay: 0.3 });
  };

  function point(s, to) {
    var me = s.me + (to === "ME" ? 1 : 0);
    var pili = s.pili + (to === "PILI" ? 1 : 0);
    var base = ext(s, { me: me, pili: pili, pointTo: to, server: to, pause: B.POINT_PAUSE, lastTouch: null });
    if (me >= B.setPoints(s)) return ext(base, { score: s.score + 1, setWon: true, pause: B.SET_PAUSE });
    if (pili >= B.setPoints(s)) return ext(base, { over: true });
    return base;
  }

  /** Who wins the point when the ball touches the sand at x. */
  B.landWinner = function (x, lastTouch) {
    if (x < -B.BALL_R || x > 1 + B.BALL_R) return lastTouch === "ME" ? "PILI" : "ME";
    if (x < B.NET_X) return "PILI";
    return "ME";
  };

  function towards(x, goal, maxStep) {
    var d = goal - x;
    return Math.abs(d) <= maxStep ? goal : x + (d > 0 ? maxStep : -maxStep);
  }
  function jumpStep(y, vy, dt) {
    if (y <= 0 && vy <= 0) return [0, 0];
    var ny = y + vy * dt - B.JUMP_G * dt * dt / 2;
    return ny <= 0 ? [0, 0] : [ny, vy - B.JUMP_G * dt];
  }

  /** Advances dt s. targetX: where the player is dragging to (null: stay); jump: the player tapped to jump. */
  B.step = function (s, dt, targetX, jump, rnd) {
    var pj, pv, cj, cv, r;
    if (s.pause > 0) {
      var pause = s.pause - dt;
      var a = jumpStep(s.pJump, s.pVy, dt), c = jumpStep(s.cJump, s.cVy, dt);
      var settled = ext(s, { pJump: a[0], pVy: a[1], cJump: c[0], cVy: c[1] });
      if (pause > 0) return ext(settled, { pause: pause });
      if (s.over) return ext(settled, { pause: 0 });
      var next = s.setWon ? ext(settled, { me: 0, pili: 0, set: s.set + 1, setWon: false, server: "ME" }) : settled;
      return B.serve(next, rnd);
    }
    if (s.over) return s;
    // the player
    var px = targetX !== null && targetX !== undefined ? clamp(towards(s.px, targetX, B.ME_SPEED * dt), 0.03, B.NET_X - NET_GAP) : s.px;
    r = jumpStep(s.pJump, s.pVy, dt); pj = r[0]; pv = r[1];
    if (jump && s.pJump <= 0) { pj = 0.001; pv = B.JUMP_V; }
    // the Pili
    var delay = Math.max(0, s.cpuDelay - dt);
    var cx = delay <= 0 ? clamp(towards(s.cx, s.cpuGoal, B.cpuSpeed(B.level(s)) * dt), B.NET_X + NET_GAP, 1.02) : s.cx;
    r = jumpStep(s.cJump, s.cVy, dt); cj = r[0]; cv = r[1];
    var b0 = s.ball;
    var above = b0.y - B.BODY_H;
    if (s.cpuSpike && s.cJump <= 0 && s.lastTouch === "ME" && b0.x > B.NET_X && b0.vy < 0 &&
        Math.abs(b0.x - cx) < 0.1 && above >= 0.08 && above <= 0.25) { cj = 0.001; cv = B.JUMP_V; }
    // the ball
    var b = ball(b0.x + b0.vx * dt, b0.y + b0.vy * dt - B.G * dt * dt / 2, b0.vx, b0.vy - B.G * dt);
    var crossed = (b0.x < B.NET_X) !== (b.x < B.NET_X);
    if (crossed && b.y < B.NET_H + B.BALL_R) b = ball(b0.x < B.NET_X ? B.NET_X - B.BALL_R : B.NET_X + B.BALL_R, b.y, -b.vx * 0.4, b.vy);
    var st = ext(s, { ball: b, px: px, pJump: pj, pVy: pv, cx: cx, cJump: cj, cVy: cv, cpuDelay: delay });
    // touches
    if (st.lastTouch !== "ME" && b.x < B.NET_X && B.gap(b, px, pj) <= 0) {
      st = B.plan(ext(st, { ball: B.myHit(b, px, pj), lastTouch: "ME", touches: st.touches + 1 }), rnd);
    } else if (st.lastTouch !== "PILI" && b.x >= B.NET_X && B.gap(b, cx, cj) <= 0) {
      st = ext(st, { ball: B.piliHit(st, b, rnd), lastTouch: "PILI", touches: st.touches + 1,
        cpuGoal: B.PILI_HOME, cpuDelay: 0.2, cpuSpike: false });
    }
    // the sand
    if (st.ball.y <= B.BALL_R && st.ball.vy < 0) {
      return point(ext(st, { ball: ball(st.ball.x, B.BALL_R, 0, 0) }), B.landWinner(st.ball.x, st.lastTouch));
    }
    return st;
  };

  VSPG.logic.platja = B;

  // ------------------------------------------------------------------ drawing (Beach.kt)
  var SKIN = "#E8B98A", SAND = "#F2D49B";
  var GREEN = "#1E8C34", DARK = "#1C211E", ACCENT = "#B9F6C0", RED = "#C62828";
  var FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  /** Screen mapping: world x in [-MARGIN, 1 + MARGIN] fills the width, sand at SAND_Y of the height. */
  var V = {
    MARGIN: 0.08, SAND: 0.84,
    scale: function (w) { return w / (1 + 2 * V.MARGIN); },
    x: function (v, w) { return (v + V.MARGIN) * V.scale(w); },
    y: function (v, w, h) { return h * V.SAND - v * V.scale(w); },
    worldX: function (px, w) { return px / V.scale(w) - V.MARGIN; }
  };
  var TAP_MS = 180;

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

  /** Sky, sun, sea, sand, court lines and the net (everything that does not move). */
  function drawScene(c, w, h, u) {
    var sand = h * V.SAND, horizon = sand - V.scale(w) * 0.32;
    var g = c.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, "#4FC3F7"); g.addColorStop(1, "#E1F5FE");
    c.fillStyle = g; c.fillRect(0, 0, w, horizon);
    // sun with a soft glow
    disc(c, "rgba(255,245,157,0.45)", w * 0.12, w * 0.8, h * 0.2);
    disc(c, "#FFD54F", w * 0.075, w * 0.8, h * 0.2);
    // sea with a few waves
    g = c.createLinearGradient(0, horizon, 0, sand);
    g.addColorStop(0, "#0277BD"); g.addColorStop(1, "#4FC3F7");
    c.fillStyle = g; c.fillRect(0, horizon, w, sand - horizon);
    c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 2.5 * u; c.lineCap = "butt";
    for (var i = 0; i < 4; i++) {
      var y = horizon + (sand - horizon) * (0.2 + i * 0.2);
      var x = -((i * 37) % 60) * u;
      c.beginPath(); c.moveTo(x, y);
      while (x < w) {
        c.quadraticCurveTo(x + 15 * u, y - 6 * u, x + 30 * u, y);
        c.quadraticCurveTo(x + 45 * u, y + 6 * u, x + 60 * u, y);
        x += 60 * u;
      }
      c.stroke();
    }
    c.fillStyle = SAND; c.fillRect(0, sand, w, h - sand);
    // grains: a fixed pattern
    for (i = 0; i < 90; i++) {
      var gx = ((i * 7919) % 1000) / 1000 * w;
      var gy = sand + 6 * u + ((i * 4241) % 1000) / 1000 * (h - sand - 8 * u);
      disc(c, "#C9A66B", 2.2 * u, gx, gy);
    }
    // court limits on the sand
    var l = V.x(0, w), r = V.x(1, w);
    line(c, "#fff", l, sand + 2 * u, r, sand + 2 * u, 4 * u);
    line(c, "#1565C0", l, sand - 2 * u, l, sand + 10 * u, 6 * u);
    line(c, "#1565C0", r, sand - 2 * u, r, sand + 10 * u, 6 * u);
    // net: post, mesh and tape
    var nx = V.x(B.NET_X, w), top = V.y(B.NET_H, w, h), bottom = V.y(B.NET_H * 0.45, w, h);
    line(c, "#455A64", nx, sand, nx, top - 6 * u, 7 * u);
    c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(nx - 5 * u, top, 10 * u, bottom - top);
    for (var yy = top; yy < bottom; yy += 9 * u) line(c, "rgba(255,255,255,0.6)", nx - 5 * u, yy, nx + 5 * u, yy, 1.5 * u);
    c.fillStyle = "#fff"; c.fillRect(nx - 6 * u, top - 5 * u, 12 * u, 9 * u);
  }

  /** The player, the Pili, the ball and its shadow. */
  function drawPlay(c, st, w, h, u) {
    var k = V.scale(w), sand = h * V.SAND;
    // the player: legs, green top, head with a visor; arms up when the ball comes
    var px = V.x(st.px, w), feet = V.y(st.pJump, w, h), bw = 0.05 * k;
    var ready = st.ball.x < B.NET_X || st.lastTouch === "PILI";
    var hip = feet - 0.05 * k, shoulder = feet - 0.105 * k;
    line(c, SKIN, px - bw * 0.25, hip, px - bw * 0.3, feet, bw * 0.28, true);
    line(c, SKIN, px + bw * 0.25, hip, px + bw * 0.3, feet, bw * 0.28, true);
    var hands = ready ? feet - B.BODY_H * k : shoulder + 0.04 * k;
    line(c, SKIN, px - bw * 0.4, shoulder + 4 * u, px - bw * 0.25, hands, bw * 0.22, true);
    line(c, SKIN, px + bw * 0.4, shoulder + 4 * u, px + bw * 0.25, hands, bw * 0.22, true);
    c.fillStyle = GREEN; rrect(c, px - bw / 2, shoulder, bw, hip - shoulder, bw / 3); c.fill();
    c.fillStyle = DARK; c.fillRect(px - bw / 2, hip - 0.015 * k, bw, 0.02 * k);
    var hx = px, hy = shoulder - 0.022 * k;
    disc(c, SKIN, 0.021 * k, hx, hy);
    line(c, ACCENT, hx - 0.022 * k, hy - 0.008 * k, hx + 0.03 * k, hy - 0.008 * k, 0.009 * k, true);
    // the Pili
    var pr = 0.062 * k;
    var mood = st.pointTo === "PILI" ? "cheer" : (st.pointTo === "ME" ? "sad" : (st.cJump > 0 ? "happy" : "focus"));
    if (VSPG.drawPili) VSPG.drawPili(c, V.x(st.cx, w), V.y(st.cJump, w, h) - pr * 1.24, pr, { mood: mood, style: st.legend ? "legend" : undefined });
    // ball shadow, ball (yellow and blue beach ball) and a marker when it is above the screen
    var b = st.ball, bx = V.x(b.x, w), by = V.y(b.y, w, h), br = B.BALL_R * k;
    var shade = clamp(1 - b.y / 1.2, 0.15, 0.6);
    c.fillStyle = "rgba(0,0,0," + (shade * 0.5) + ")";
    c.beginPath(); c.ellipse(bx, sand, br * 1.1, br * 0.25, 0, 0, Math.PI * 2); c.fill();
    if (by + br < 0) {
      c.fillStyle = "#FFD54F";
      c.beginPath(); c.moveTo(bx, 6); c.lineTo(bx - 14, 30); c.lineTo(bx + 14, 30); c.closePath(); c.fill();
      return;
    }
    disc(c, "#fff", br, bx, by);
    // Compose arcs: degrees clockwise from 3 o'clock, like canvas
    c.fillStyle = "#FFD54F"; c.beginPath(); c.moveTo(bx, by); c.arc(bx, by, br, 200 * Math.PI / 180, 320 * Math.PI / 180); c.closePath(); c.fill();
    c.fillStyle = "#1565C0"; c.beginPath(); c.moveTo(bx, by); c.arc(bx, by, br, 20 * Math.PI / 180, 140 * Math.PI / 180); c.closePath(); c.fill();
    c.strokeStyle = "#263238"; c.lineWidth = 2 * u; c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.stroke();
    if (Math.abs(b.vx) + Math.abs(b.vy) > 1.6) line(c, "rgba(255,255,255,0.5)", bx, by, bx - b.vx * 0.08 * k, by + b.vy * 0.08 * k, br * 0.8, true);
  }

  function drawTexts(c, st, w, h) {
    c.textAlign = "center"; c.textBaseline = "top";
    c.fillStyle = DARK;
    c.font = "bold 16px " + FONT;
    c.fillText(tr("bch.set", st.set), w / 2, 8);
    c.font = "900 26px " + FONT;
    c.fillText(tr("bch.board", st.me, st.pili), w / 2, 28);
    if (st.pause > 0 && st.pointTo) {
      var msg, col;
      if (st.setWon) { msg = tr("bch.set_won"); col = GREEN; }
      else if (st.over) { msg = tr("bch.set_lost"); col = RED; }
      else if (st.pointTo === "ME") { msg = tr("bch.point"); col = GREEN; }
      else { msg = tr("bch.point_pili"); col = RED; }
      c.textBaseline = "middle";
      c.font = "900 30px " + FONT;
      c.fillStyle = col; c.fillText(msg, w / 2, h / 2 - 60);
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
    // secret version "Final contra la Pili Llegenda" (llegenda)
    var legend = !!(api.mode && api.mode.secret === "llegenda");
    var state = B.start(rnd, legend);
    var playing = true, alive = true, raf = 0, last = -1, lastScore = -1;
    var dragX = null, jumpReq = false;
    // pointer: the first finger drags (or taps to jump), any other finger jumps
    var main = null, downAt = 0, downX = 0, downY = 0, moving = false;
    var SLOP = 8;

    function resize() {
      var dpr = window.devicePixelRatio || 1;
      W = stage.clientWidth || 1; H = stage.clientHeight || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function draw() {
      if (!alive) return;
      var u = Math.max(0.3, W / 1080);   // the app draws in device px on a ~1080 px wide phone
      drawScene(ctx, W, H, u);
      drawPlay(ctx, state, W, H, u);
      if (playing) drawTexts(ctx, state, W, H);
      else drawTexts(ctx, ext(state, { pause: 0 }), W, H);
    }
    function hud() { if (state.score !== lastScore) { lastScore = state.score; api.setScore(state.score); } }

    function frame(now) {
      if (!alive) return;
      if (api.paused) { last = -1; raf = requestAnimationFrame(frame); return; }   // pause overlay: nothing advances
      if (last < 0) last = now;
      var dt = Math.min(Math.max(0, (now - last) / 1000), 0.033) * (api.speed || 1);
      last = now;
      if (playing) {
        var s = state, next = B.step(s, dt, dragX, jumpReq, rnd);
        jumpReq = false;
        if (next.touches !== s.touches && next.lastTouch === "ME") api.haptic(15);
        if (next.pointTo !== null && s.pointTo === null) api.haptic(40);
        state = next;
        hud();
        if (next.over && next.pause <= 0) {
          playing = false;
          draw();
          api.end(next.score);
          return;
        }
      }
      draw();
      raf = requestAnimationFrame(frame);
    }

    function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
    function onDown(ev) {
      ev.preventDefault();
      if (main === null) {
        main = ev.pointerId; downAt = now(); downX = ev.clientX; downY = ev.clientY; moving = false;
        try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      } else jumpReq = true;   // a second finger jumps too
    }
    function onMove(ev) {
      if (ev.pointerId !== main) return;
      ev.preventDefault();
      var dx = ev.clientX - downX, dy = ev.clientY - downY;
      if (!moving && (Math.sqrt(dx * dx + dy * dy) > SLOP || now() - downAt > TAP_MS)) moving = true;
      if (moving && playing) dragX = V.worldX(api.point(ev, cv).x, W);
    }
    function onUp(ev) {
      if (ev.pointerId !== main) return;
      if (ev.type === "pointerup" && !moving && now() - downAt <= TAP_MS) jumpReq = true;
      main = null;
    }
    function noop(ev) { ev.preventDefault(); }

    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
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
        cv.removeEventListener("pointermove", onMove);
        cv.removeEventListener("pointerup", onUp);
        cv.removeEventListener("pointercancel", onUp);
        cv.removeEventListener("contextmenu", noop);
        window.removeEventListener("resize", resize);
        if (ro) ro.disconnect();
        if (cv.parentNode) cv.parentNode.removeChild(cv);
      },
      _state: function () { return state; }
    };
  }

  VSPG.games.register({
    id: "platja",
    title: tr("game.platja"),
    emoji: "🏖️",
    help: tr("help.platja"),
    lives: 0,
    action: true,
    start: start
  });
})();
