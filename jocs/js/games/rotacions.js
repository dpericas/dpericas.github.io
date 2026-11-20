/* Club Vòlei Santpedor — jocs web: «Rotacions».
 * Port of the Android app (extras/RotationPuzzle.kt + RotationPuzzleLogic.kt): same puzzles, same
 * rules (FIVB Official Volleyball Rules 2025-2028) and scoring: score = puzzles solved, 3 mistakes end the run.
 *  - zones 4 (front-left), 3 (front-centre), 2 (front-right), 5 (back-left), 6 (back-centre), 1 (back-right, the server);
 *  - when the receiving team wins the rally it rotates clockwise: 2→1 (serves), 1→6, 6→5, 5→4, 4→3, 3→2;
 *    the serving team that wins the rally serves again with the same player;
 *  - at the service hit only the RECEIVING team must be in rotational order (5-4, 6-3, 1-2 in depth and
 *    4-3-2, 5-6-1 sideways; being level is legal); the serving team may stand anywhere (rule 7.4, 2025);
 *  - the Libero only replaces back-row players and may not serve (19.3.1.1, 19.3.1.3). */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  VSPG.logic = VSPG.logic || {};

  function ext(s, p) { var o = {}, k; for (k in s) o[k] = s[k]; for (k in p) o[k] = p[k]; return o; }
  function floorMod(a, n) { return ((a % n) + n) % n; }
  function hypot(x, y) { return Math.sqrt(x * x + y * y); }
  function nextInt(rnd, n) { return Math.floor(rnd() * n); }
  function range(rnd, a, b) { return b <= a ? a : a + rnd() * (b - a); }
  function pick(rnd, list) { return list[nextInt(rnd, list.length)]; }
  function spot(x, y) { return { x: x, y: y }; }
  function player(role, number) { return { role: role, number: number }; }

  // ------------------------------------------------------------------ pure logic (RotationPuzzleLogic)
  // roles: "S" col·locador, "O" opòsit, "OH" receptor, "MB" central, "L" líbero
  // kinds: "PLACE", "WHO_SERVES", "ROTATE", "LEGAL", "OUT_OF_POSITION"
  // faults: {type: "depth", back, front} | {type: "side", left, right} | {type: "liberoFront", zone} | {type: "liberoServes"}
  var R = {
    LIVES: 3,
    COURT: 9,
    SERVE_Y: 9.8,   // depth of the service position drawn behind the end line
    MIN_GAP: 1.2,   // minimum distance between two players so the drawing stays readable
    /** Pairs that must keep their order for the receiving team: [front zone, back zone]. */
    FRONT_BACK: [[4, 5], [3, 6], [2, 1]],
    /** Pairs [left zone, right zone] in each row. */
    LEFT_RIGHT: [[4, 3], [3, 2], [5, 6], [6, 1]],
    FRONT_ZONES: [2, 3, 4],
    /** Rotational order of the starting line-up (I..VI) of a 5-1 system. */
    LINEUP_ROLES: ["S", "OH", "MB", "O", "OH", "MB"]
  };
  R.player = player;
  R.spot = spot;
  R.label = function (p) { return "#" + p.number + " " + p.role; };
  function front(zone) { return zone >= 2 && zone <= 4; }
  R.isFront = front;
  R.roman = function (i) { return ["I", "II", "III", "IV", "V", "VI"][i]; };

  /** Usual place of each zone. */
  R.baseSpot = function (zone) {
    switch (zone) {
      case 1: return spot(7.5, 6.5);
      case 2: return spot(7.5, 2);
      case 3: return spot(4.5, 2);
      case 4: return spot(1.5, 2);
      case 5: return spot(1.5, 6.5);
      default: return spot(4.5, 6.5);
    }
  };
  R.BASE = [1, 2, 3, 4, 5, 6].map(R.baseSpot);

  /** One clockwise rotation: zone p takes the player who was in zone p+1 (2→1, 3→2 … 1→6). */
  R.rotate = function (z, times) {
    var k = floorMod(times === undefined ? 1 : times, 6), out = [];
    for (var i = 0; i < 6; i++) out.push(z[(i + k) % 6]);
    return out;
  };
  /** Zone (1..6) of the player in line-up position lineupPos (1..6) after k rotations. */
  R.zoneAfter = function (lineupPos, k) { return floorMod(lineupPos - 1 - k, 6) + 1; };

  /** Zones a fault involves. */
  R.faultZones = function (f) {
    if (f.type === "depth") return [f.back, f.front];
    if (f.type === "side") return [f.left, f.right];
    if (f.type === "liberoFront") return [f.zone];
    return [1];
  };

  /** Everything that makes the formation illegal at the service hit (empty = legal). */
  R.faults = function (zones, spots, serving) {
    var out = [], i;
    for (i = 0; i < zones.length; i++) {
      if (zones[i].role === "L") {
        if (front(i + 1)) out.push({ type: "liberoFront", zone: i + 1 });
        if (serving && i === 0) out.push({ type: "liberoServes" });
      }
    }
    // since 2025 only the receiving team must keep the rotational order at the service hit
    if (!serving) {
      R.FRONT_BACK.forEach(function (fb) {
        var f = fb[0], b = fb[1];
        if (spots[b - 1].y < spots[f - 1].y) out.push({ type: "depth", back: b, front: f });
      });
      R.LEFT_RIGHT.forEach(function (lr) {
        var l = lr[0], r = lr[1];
        if (spots[l - 1].x > spots[r - 1].x) out.push({ type: "side", left: l, right: r });
      });
    }
    return out;
  };

  /** Players (indexes of zones) that answer a WHO_SERVES, ROTATE or OUT_OF_POSITION puzzle. */
  R.answer = function (p) {
    if (p.kind === "WHO_SERVES") return [p.serving ? 0 : 1];
    if (p.kind === "ROTATE") return [(p.askZone - 1 + p.rotations) % 6];
    if (p.kind === "OUT_OF_POSITION") {
      if (!p.faults.length) return [];
      var common = R.faultZones(p.faults[0]);
      for (var i = 1; i < p.faults.length; i++) {
        var z = R.faultZones(p.faults[i]);
        common = common.filter(function (x) { return z.indexOf(x) >= 0; });
      }
      return common.map(function (x) { return x - 1; });
    }
    return [];
  };

  /** PLACE: zone where line-up player i (0-based) must go. */
  R.placeTarget = function (p, i) { return R.zoneAfter(i + 1, p.rotations); };
  /** LEGAL: the right answer. */
  R.isLegal = function (p) { return p.faults.length === 0; };

  R.minDistance = function (spots) {
    var m = Number.MAX_VALUE;
    for (var i = 0; i < spots.length; i++) for (var j = i + 1; j < spots.length; j++) {
      m = Math.min(m, hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y));
    }
    return m;
  };

  // ---- generation
  /** Which kind of puzzle comes at level (= puzzles solved so far): a fixed start, then mixed. */
  R.kindFor = function (level, rnd) {
    switch (level) {
      case 0: return "PLACE";
      case 1: return "WHO_SERVES";
      case 2: return "ROTATE";
      case 3: return "PLACE";
      case 4: return "LEGAL";
      case 5: return "OUT_OF_POSITION";
      default: return pick(rnd, ["PLACE", "WHO_SERVES", "ROTATE", "ROTATE", "LEGAL", "LEGAL", "LEGAL",
        "OUT_OF_POSITION", "OUT_OF_POSITION"]);
    }
  };

  function puzzle(kind, level, zones, spots, serving, extra) {
    return ext({ kind: kind, level: level, zones: zones, spots: spots, serving: serving, rotations: 0,
      askZone: 1, showZones: true, faults: [] }, extra || {});
  }
  R.puzzle = puzzle;

  function shuffled(list, rnd) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = nextInt(rnd, i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  R.generate = function (level, rnd) {
    var all = [];
    for (var n = 1; n <= 20; n++) all.push(n);
    var numbers = shuffled(all, rnd).slice(0, 7);
    var start = R.LINEUP_ROLES.map(function (r, i) { return player(r, numbers[i]); });
    var libero = player("L", numbers[6]);
    var hard = level >= 8;
    var kind = R.kindFor(level, rnd), serving;
    if (kind === "PLACE") {
      return puzzle("PLACE", level, start, R.BASE, false,
        { rotations: level >= 6 ? 1 + nextInt(rnd, 3) : 0, showZones: level < 3 });
    }
    if (kind === "WHO_SERVES") {
      serving = rnd() < 0.5;
      var z = R.withLibero(R.rotate(start, nextInt(rnd, 6)), libero, serving, rnd() < 0.5);
      return puzzle("WHO_SERVES", level, z, jittered(rnd, serving), serving, { showZones: level < 6 });
    }
    if (kind === "ROTATE") {
      serving = rnd() < 0.5;
      var zr = R.rotate(start, nextInt(rnd, 6));
      var sp = jittered(rnd, serving);
      var rotations = level >= 6 ? 1 + nextInt(rnd, 3) : 1;
      return puzzle("ROTATE", level, zr, sp, serving,
        { rotations: rotations, askZone: 1 + nextInt(rnd, 6), showZones: level < 6 });
    }
    if (kind === "LEGAL") return legalPuzzle(level, start, libero, hard, rnd);
    return outPuzzle(level, start, libero, hard, rnd);
  };

  /** The Libero (if use) replaces the middle blocker who is in the back row (not the one serving). */
  R.withLibero = function (z, libero, serving, use) {
    if (use === false) return z;
    for (var i = 0; i < z.length; i++) {
      if (!front(i + 1) && z[i].role === "MB" && !(serving && i === 0)) {
        var out = z.slice(); out[i] = libero; return out;
      }
    }
    return z;
  };

  /** Base places moved a little (always legal), with the server in the service zone. */
  function jittered(rnd, serving) {
    var s = R.BASE.map(function (b) { return spot(b.x + range(rnd, -0.5, 0.5), b.y + range(rnd, -0.5, 0.5)); });
    return serving ? withServer(s, rnd) : s;
  }
  function withServer(s, rnd) { var o = s.slice(); o[0] = spot(range(rnd, 1, 8), R.SERVE_Y); return o; }

  var neutral = [1, 2, 3, 4, 5, 6].map(function (n) { return player("OH", n); });

  /** A legal reception formation; tight puts players close to the limits (level with is legal). */
  R.legalSpots = function (rnd, tight) {
    for (var it = 0; it < 300; it++) {
      var gap = tight ? R.MIN_GAP : 2.2;
      var fr = increasing(rnd, gap);   // x of zones 4, 3, 2
      var bk = increasing(rnd, gap);   // x of zones 5, 6, 1
      var fy = [], by = [], i;
      for (i = 0; i < 3; i++) fy.push(range(rnd, 0.8, tight ? 4 : 2.6));
      for (i = 0; i < 3; i++) by.push(Math.min(fy[i] + (tight ? range(rnd, 0, 2.2) : range(rnd, 3, 5.2)), 8.6));
      // index by zone - 1: 1 back-right, 2 front-right, 3 front-centre, 4 front-left, 5 back-left, 6 back-centre
      var s = [spot(bk[2], by[2]), spot(fr[2], fy[2]), spot(fr[1], fy[1]), spot(fr[0], fy[0]), spot(bk[0], by[0]), spot(bk[1], by[1])];
      if (R.minDistance(s) >= R.MIN_GAP && R.faults(neutral, s, false).length === 0) return s;
    }
    return R.BASE;
  };

  function increasing(rnd, gap) {
    var a = range(rnd, 0.6, 8.4 - 2 * gap);
    var b = range(rnd, a + gap, 8.4 - gap);
    var c = range(rnd, b + gap, 8.4);
    return [a, b, c];
  }

  /** Moves ONE player of a legal reception formation so that it breaks an order with margin metres (or null). */
  R.breakOne = function (s, rnd, margin) {
    var pairs = R.FRONT_BACK.concat(R.LEFT_RIGHT);
    var pr = pick(rnd, pairs), a = pr[0], b = pr[1];
    var depth = R.FRONT_BACK.indexOf(pr) >= 0;
    var moveFirst = rnd() < 0.5;
    var out = s.slice();
    if (depth) {
      // a = front zone, b = back zone
      if (moveFirst) out[a - 1] = spot(out[a - 1].x, s[b - 1].y + margin); else out[b - 1] = spot(out[b - 1].x, s[a - 1].y - margin);
    } else {
      // a = left zone, b = right zone
      if (moveFirst) out[a - 1] = spot(s[b - 1].x + margin, out[a - 1].y); else out[b - 1] = spot(s[a - 1].x - margin, out[b - 1].y);
    }
    var moved = moveFirst ? a - 1 : b - 1;
    // make room: slide the moved player along the other axis if it now sits on somebody
    var shifts = [0, 1.3, -1.3, 2, -2];
    for (var k = 0; k < shifts.length; k++) {
      var p = out[moved];
      var c = depth ? spot(p.x + shifts[k], p.y) : spot(p.x, p.y + shifts[k]);
      var t = out.slice(); t[moved] = c;
      var inside = t.every(function (q) { return q.x >= 0.4 && q.x <= 8.6 && q.y >= 0.4 && q.y <= 8.6; });
      if (inside && R.minDistance(t) >= R.MIN_GAP && R.faults(neutral, t, false).length > 0) return t;
    }
    return null;
  };

  function overlapSpots(rnd, hard) {
    for (var i = 0; i < 100; i++) {
      var margin = hard ? range(rnd, 0.4, 0.8) : range(rnd, 1.2, 1.8);
      var r = R.breakOne(R.legalSpots(rnd, hard), rnd, margin);
      if (r) return r;
    }
    // fallback: the players of zones 1 and 2 swapped
    var o = R.BASE.slice(); o[0] = R.BASE[1]; o[1] = R.BASE[0];
    return o;
  }

  function legalPuzzle(level, start, libero, hard, rnd) {
    var z0 = R.rotate(start, nextInt(rnd, 6));
    var advanced = level >= 6;
    var roll = nextInt(rnd, 100);
    var zones, spots, serving;
    if (roll < 35) {            // a correct reception
      zones = R.withLibero(z0, libero, false, rnd() < 0.5); spots = R.legalSpots(rnd, hard); serving = false;
    } else if (roll < 70) {     // a reception with an overlap
      zones = R.withLibero(z0, libero, false, rnd() < 0.5); spots = overlapSpots(rnd, hard); serving = false;
    } else if (roll < 82 || !advanced) {   // the Libero stayed on court in the front row
      zones = R.liberoInFront(z0, libero); spots = R.legalSpots(rnd, false); serving = false;
    } else if (roll < 92) {     // serving team out of order: legal since 2025
      zones = R.withLibero(z0, libero, true, rnd() < 0.5); spots = servingFree(rnd); serving = true;
    } else {                    // the Libero serves
      zones = liberoServing(z0, libero); spots = withServer(R.legalSpots(rnd, false), rnd); serving = true;
    }
    return puzzle("LEGAL", level, zones, spots, serving, { faults: R.faults(zones, spots, serving) });
  }

  function outPuzzle(level, start, libero, hard, rnd) {
    var z0 = R.rotate(start, nextInt(rnd, 6));
    var zones, spots;
    if (hard && nextInt(rnd, 10) === 0) {
      zones = R.liberoInFront(z0, libero); spots = R.legalSpots(rnd, true);
    } else {
      zones = R.withLibero(z0, libero, false, rnd() < 0.5); spots = overlapSpots(rnd, hard);
    }
    return puzzle("OUT_OF_POSITION", level, zones, spots, false, { faults: R.faults(zones, spots, false) });
  }

  /** The Libero replaces the middle blocker of the FRONT row (illegal). */
  R.liberoInFront = function (z, libero) {
    for (var i = 0; i < z.length; i++) {
      if (front(i + 1) && z[i].role === "MB") { var o = z.slice(); o[i] = libero; return o; }
    }
    throw new Error("no front-row middle blocker");
  };

  /** The Libero is in zone 1 of the serving team (illegal: the Libero may not serve). */
  function liberoServing(z, libero) {
    // rotate until a middle blocker is in zone 1, then the Libero takes his place
    var r = z;
    for (var i = 0; i < 6; i++) if (r[0].role !== "MB") r = R.rotate(r);
    var o = r.slice(); o[0] = libero;
    return o;
  }

  /** Serving team out of rotational order: zones 4 and 2 switched and/or zone 6 in front of zone 3 (legal since 2025). */
  function servingFree(rnd) {
    var s = R.BASE.slice();
    var sw = rnd() < 0.5;
    if (sw) { s[3] = R.BASE[1]; s[1] = R.BASE[3]; }
    if (!sw || rnd() < 0.5) s[5] = spot(3, 0.9);
    return withServer(s, rnd);
  }

  VSPG.logic.rotacions = R;

  // ------------------------------------------------------------------ UI (RotationPuzzle.kt)
  var GREEN = "#1E8C34", DARK = "#1C211E", ACCENT = "#B9F6C0", FLOOR = "#2E9E46", FLOOR_FRONT = "#268A3C",
    FAULT = "#FF5252", YELLOW = "#FFD54F";
  var FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  // half court drawing: margin around the 9 × 9 m court and room for the server behind the end line
  var M = 0.5, CW = 9 + 2 * M, CH = M + 9 + 1.6, JERSEY_R = 0.5;

  function cops(n) { return n + (n === 1 ? " cop" : " cops"); }
  function prompt(p) {
    switch (p.kind) {
      case "PLACE": return p.rotations === 0 ? "Toca un jugador i després la zona on comença el set." :
        "L'equip ja ha rotat " + cops(p.rotations) + ". Toca un jugador i després la zona on és ara.";
      case "WHO_SERVES": return "El teu equip guanya el punt. Qui serveix ara? Toca'l.";
      case "ROTATE": return "Si l'equip rota " + cops(p.rotations) + ", qui quedarà a la zona " + p.askZone + "? Toca'l.";
      case "LEGAL": return "És legal aquesta formació en el moment del servei?";
      default: return "Hi ha una falta de posició. Toca un jugador mal col·locat.";
    }
  }
  function faultText(p, f) {
    var lb = function (z) { return R.label(p.zones[z - 1]); };
    if (f.type === "depth") return lb(f.back) + " (zona " + f.back + ") ha d'estar més lluny de la xarxa que " + lb(f.front) +
      " (zona " + f.front + "), o com a mínim a la mateixa alçada.";
    if (f.type === "side") return lb(f.left) + " (zona " + f.left + ") ha d'estar més a l'esquerra que " + lb(f.right) +
      " (zona " + f.right + "), o com a mínim a la mateixa línia.";
    if (f.type === "liberoFront") return "El líbero (" + lb(f.zone) + ") només pot substituir jugadors del fons: no pot ser a la zona " + f.zone + ".";
    return "El líbero no pot servir (regla 19.3.1.3).";
  }
  function explain(p, right) {
    var lines = [];
    if (p.kind === "PLACE") {
      if (right) lines.push("Ben col·locat! 🎉");
      lines.push("Zones: 4-3-2 a la xarxa (d'esquerra a dreta) i 5-6-1 al fons. Qui és a la zona 1 serveix.");
      if (p.rotations > 0) lines.push("Cada rotació, tothom avança una zona en sentit horari: 2→1, 1→6, 6→5, 5→4, 4→3 i 3→2.");
    } else if (p.kind === "WHO_SERVES") {
      lines.push(p.serving ? "Si guanya el punt l'equip que serveix, torna a servir el mateix jugador: " + R.label(p.zones[0]) + "." :
        "Si guanya l'equip que rep, rota en sentit horari: " + R.label(p.zones[1]) + " passa de la zona 2 a la 1 i serveix.");
    } else if (p.kind === "ROTATE") {
      lines.push("Cada rotació és un pas en sentit horari (2→1, 1→6, 6→5, 5→4, 4→3, 3→2): ara és " + R.label(p.zones[R.answer(p)[0]]) + ".");
    } else if (!p.faults.length) {
      lines.push(p.serving ?
        "Legal! Des del 2025 (regla 7.4) l'equip que serveix es pot col·locar on vulgui dins del seu camp; només l'equip que rep ha de respectar l'ordre de rotació." :
        "Tot correcte: cada jugador del fons és més lluny de la xarxa que el seu company de davant, i cada fila està en ordre d'esquerra a dreta. Estar a la mateixa alçada també és legal.");
    } else p.faults.forEach(function (f) { lines.push(faultText(p, f)); });
    return lines;
  }

  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function hidpi(cv, w, h) {
    var dpr = window.devicePixelRatio || 1;
    cv.style.width = w + "px"; cv.style.height = h + "px";
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  function centred(c, text, x, y, px, color, bold) {
    c.font = (bold ? "bold " : "") + px + "px " + FONT;
    c.fillStyle = color; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(text, x, y);
  }

  /** A jersey: green (the Libero black), number, role and the zone badge. */
  function jersey(c, x, y, r, pl, zone, ring) {
    var lib = pl.role === "L";
    if (ring) { c.fillStyle = ring; c.beginPath(); c.arc(x, y, r * 1.3, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = lib ? "#111111" : GREEN; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = lib ? ACCENT : "#fff"; c.lineWidth = r * 0.12; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    centred(c, String(pl.number), x, y - r * 0.18, r * 0.8, "#fff", true);
    centred(c, pl.role, x, y + r * 0.5, r * 0.38, ACCENT, true);
    if (zone !== null) {
      var bx = x + r * 0.85, by = y - r * 0.85;
      c.fillStyle = ACCENT; c.beginPath(); c.arc(bx, by, r * 0.4, 0, Math.PI * 2); c.fill();
      centred(c, String(zone), bx, by, r * 0.48, "#000", true);
    }
  }

  /** Top view of the own half court (net at the top), the players and, once answered, the solution. */
  function drawCourt(c, w, p, ui) {
    var s = w / CW;
    function X(x) { return (x + M) * s; }
    function Y(y) { return (y + M) * s; }
    c.fillStyle = DARK; c.fillRect(0, 0, w, CH * s);
    c.fillStyle = FLOOR; c.fillRect(X(0), Y(0), 9 * s, 9 * s);
    c.fillStyle = FLOOR_FRONT; c.fillRect(X(0), Y(0), 9 * s, 3 * s);
    var ln = 0.06 * s;
    c.strokeStyle = "#fff"; c.lineWidth = ln; c.strokeRect(X(0), Y(0), 9 * s, 9 * s);
    c.lineCap = "butt";
    c.beginPath(); c.moveTo(X(0), Y(3)); c.lineTo(X(9), Y(3)); c.stroke();
    // service zone marks behind the end line
    c.beginPath(); c.moveTo(X(0), Y(9)); c.lineTo(X(0), Y(9.5)); c.moveTo(X(9), Y(9)); c.lineTo(X(9), Y(9.5)); c.stroke();
    // the net
    c.fillStyle = "#000"; c.fillRect(X(-0.35), Y(-0.4), 9.7 * s, 0.4 * s);
    c.fillStyle = "#fff"; c.fillRect(X(-0.35), Y(-0.4), 9.7 * s, 0.08 * s);
    centred(c, "XARXA", X(4.5), Y(-0.18), 0.26 * s, "#fff", true);

    var r = JERSEY_R * s, z, i;
    if (p.kind === "PLACE") {
      for (z = 1; z <= 6; z++) {
        var b = R.baseSpot(z), who = null;
        for (var k in ui.placed) if (ui.placed[k] === z) who = +k;
        if (who === null) {
          c.save();
          c.strokeStyle = "rgba(255,255,255,0.8)"; c.lineWidth = 0.05 * s;
          if (c.setLineDash) c.setLineDash([0.15 * s, 0.12 * s]);
          c.beginPath(); c.arc(X(b.x), Y(b.y), r, 0, Math.PI * 2); c.stroke();
          c.restore();
          if (p.showZones || ui.answered) centred(c, String(z), X(b.x), Y(b.y), 0.45 * s, "rgba(255,255,255,0.8)", true);
        } else jersey(c, X(b.x), Y(b.y), r, p.zones[who], (p.showZones || ui.answered) ? z : null, null);
      }
      return;
    }
    var solution = ui.answered ? R.answer(p) : [];
    var faulty = [];
    if (ui.answered) p.faults.forEach(function (f) {
      var zs = R.faultZones(f);
      faulty = faulty.concat(zs);
      // faults: a red line between the players of each broken pair
      if (zs.length === 2) {
        var a = p.spots[zs[0] - 1], bb = p.spots[zs[1] - 1];
        c.strokeStyle = FAULT; c.lineWidth = 0.1 * s;
        c.beginPath(); c.moveTo(X(a.x), Y(a.y)); c.lineTo(X(bb.x), Y(bb.y)); c.stroke();
      }
    });
    for (i = 0; i < p.zones.length; i++) {
      var ring = null;
      if (ui.answered) {
        if (solution.indexOf(i) >= 0) ring = ACCENT;
        else if (i === ui.chosen && p.kind !== "LEGAL") ring = FAULT;
        else if (faulty.indexOf(i + 1) >= 0) ring = FAULT;
      }
      jersey(c, X(p.spots[i].x), Y(p.spots[i].y), r, p.zones[i], (p.showZones || ui.answered) ? i + 1 : null, ring);
    }
  }

  function button(text, bg, fg) {
    var b = el("button", "border:0;border-radius:20px;padding:10px 22px;font:bold 15px " + FONT + ";background:" + bg +
      ";color:" + fg + ";cursor:pointer;touch-action:manipulation", text);
    b.type = "button";
    return b;
  }

  function start(stage, api) {
    var root = el("div", "position:absolute;left:0;top:0;right:0;bottom:0;overflow-y:auto;-webkit-overflow-scrolling:touch;" +
      "background:linear-gradient(#0D3B1E," + GREEN + ");color:#fff;font-family:" + FONT + ";box-sizing:border-box;padding:8px 16px 16px;" +
      "display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center");
    stage.appendChild(root);
    var rnd = api.rnd;
    var alive = true, ended = false;
    var score = 0, lives = R.LIVES;
    var p = null, ui = null, hint = null;
    var court = null, cctx = null, courtW = 0;

    function newPuzzle() {
      p = R.generate(score, rnd);
      ui = { answered: false, right: false, chosen: null, placed: {}, selected: null };
      hint = null;
      render();
    }
    function mistake() {
      lives--;
      api.setLives(Math.max(0, lives));
      api.haptic(40);
    }
    function close(ok) {
      ui.answered = true; ui.right = ok;
      if (ok) { score++; api.setScore(score); api.haptic(15); } else mistake();
      render();
    }
    function next() {
      if (lives <= 0) {
        if (!ended) { ended = true; api.end(score); }
      } else newPuzzle();
    }
    function placedCount() { var n = 0; for (var k in ui.placed) n++; return n; }

    function tap(x, y) {
      if (!p || ui.answered) return;
      if (p.kind === "PLACE") {
        var sel = ui.selected;
        if (sel === null) return;
        var used = [], k;
        for (k in ui.placed) used.push(ui.placed[k]);
        var zone = null, best = Infinity;
        for (var z = 1; z <= 6; z++) {
          if (used.indexOf(z) >= 0) continue;
          var b = R.baseSpot(z), d = hypot(b.x - x, b.y - y);
          if (d < best) { best = d; zone = z; }
        }
        if (zone === null || best >= 1.5) return;
        var target = R.placeTarget(p, sel);
        if (zone === target) {
          ui.placed[sel] = zone; ui.selected = null; hint = null;
          if (placedCount() === 6) { close(true); return; }
        } else {
          hint = R.label(p.zones[sel]) + " no va a aquesta zona: va a la zona " + target + ".";
          mistake();
          if (lives <= 0) { ui.answered = true; ui.right = false; }
        }
        render();
      } else if (p.kind !== "LEGAL") {
        var bi = -1, bd = Infinity;
        for (var i = 0; i < p.spots.length; i++) {
          var dd = hypot(p.spots[i].x - x, p.spots[i].y - y);
          if (dd < bd) { bd = dd; bi = i; }
        }
        if (bi < 0 || bd > 1.1) return;
        ui.chosen = bi;
        close(R.answer(p).indexOf(bi) >= 0);
      }
    }

    function onCourtDown(ev) {
      ev.preventDefault();
      if (!courtW) return;
      var pt = api.point(ev, court), s = courtW / CW;
      tap(pt.x / s - M, pt.y / s - M);
    }

    function drawCourtNow() {
      if (!court || !p) return;
      var avail = root.clientWidth - 32;
      courtW = Math.max(160, Math.min(440, avail > 0 ? avail : 300));
      cctx = hidpi(court, courtW, courtW * CH / CW);
      drawCourt(cctx, courtW, p, ui);
    }

    function render() {
      if (!alive) return;
      var top = root.scrollTop;
      if (court) court.removeEventListener("pointerdown", onCourtDown);
      root.innerHTML = "";
      var row = el("div", "display:flex;width:100%;align-items:center;max-width:440px");
      row.appendChild(el("div", "flex:1;text-align:left;color:" + ACCENT + ";font-weight:bold", "Nivell " + (p.level + 1)));
      if (p.kind !== "PLACE") row.appendChild(el("div", "font-size:13px", p.serving ? "🏐 El teu equip serveix" : "🙌 El teu equip rep"));
      root.appendChild(row);
      root.appendChild(el("div", "font-weight:bold;font-size:17px;max-width:440px", prompt(p)));
      if (p.kind === "PLACE") {
        var sheet = p.zones.map(function (pl, i) { return R.roman(i) + " " + R.label(pl); }).join(" · ");
        root.appendChild(el("div", "color:" + ACCENT + ";font-size:13px;max-width:440px", "Acta (inici del set): " + sheet));
      }
      court = el("canvas", "display:block;touch-action:none;-webkit-tap-highlight-color:transparent;flex:none");
      court.addEventListener("pointerdown", onCourtDown);
      root.appendChild(court);
      drawCourtNow();
      if (p.kind === "PLACE" && !ui.answered) {
        var tray = el("div", "display:flex;gap:6px;flex-wrap:wrap;justify-content:center");
        p.zones.forEach(function (pl, i) {
          if (ui.placed.hasOwnProperty(i)) return;
          var sel = i === ui.selected;
          var b = el("button", "width:50px;height:50px;border-radius:50%;padding:0;display:flex;flex-direction:column;align-items:center;" +
            "justify-content:center;cursor:pointer;touch-action:manipulation;background:" + (sel ? ACCENT : GREEN) + ";border:2px solid " +
            (sel ? "#fff" : "rgba(255,255,255,0.7)") + ";font-family:" + FONT);
          b.type = "button";
          b.appendChild(el("span", "font-weight:900;font-size:16px;line-height:16px;color:" + (sel ? "#000" : "#fff"), String(pl.number)));
          b.appendChild(el("span", "font-size:10px;line-height:10px;color:" + (sel ? "#000" : ACCENT), pl.role));
          b.addEventListener("click", function () { if (!ui.answered) { ui.selected = i; hint = null; render(); } });
          tray.appendChild(b);
        });
        root.appendChild(tray);
      }
      if (hint) root.appendChild(el("div", "color:" + YELLOW + ";font-size:14px;max-width:440px", hint));
      if (p.kind === "LEGAL" && !ui.answered) {
        var bar = el("div", "display:flex;gap:12px");
        var yes = button("✅ Legal", ACCENT, "#000"), no = button("❌ Falta", "#fff", "#000");
        yes.addEventListener("click", function () { if (!ui.answered) { ui.chosen = 1; close(R.isLegal(p)); } });
        no.addEventListener("click", function () { if (!ui.answered) { ui.chosen = 0; close(!R.isLegal(p)); } });
        bar.appendChild(yes); bar.appendChild(no);
        root.appendChild(bar);
      }
      if (ui.answered) {
        var fb = el("div", "display:flex;align-items:center;width:100%;max-width:440px;box-sizing:border-box;background:rgba(0,0,0,0.35);" +
          "border-radius:16px;padding:10px;text-align:left");
        var pc = el("canvas", "flex:none;width:64px;height:64px");
        var pctx = hidpi(pc, 64, 64);
        if (VSPG.drawPili) VSPG.drawPili(pctx, 32, 32, 26, { mood: ui.right ? "cheer" : "sad" });
        fb.appendChild(pc);
        var col = el("div", "padding-left:8px;flex:1;display:flex;flex-direction:column;gap:4px");
        if (p.kind !== "PLACE" || !ui.right) col.appendChild(el("div", "font-weight:bold;color:" + (ui.right ? ACCENT : YELLOW),
          ui.right ? "Correcte! 🎉" : "Ui! No és això 😅"));
        explain(p, ui.right).forEach(function (t) { col.appendChild(el("div", "font-size:14px", t)); });
        fb.appendChild(col);
        root.appendChild(fb);
        var nx = button("Següent", ACCENT, "#000");
        nx.addEventListener("click", next);
        root.appendChild(nx);
      }
      root.appendChild(el("div", "color:rgba(255,255,255,0.7);font-size:12px;max-width:440px",
        "S col·locador · O opòsit · OH receptor · MB central · L líbero"));
      root.scrollTop = top;
    }

    var lastW = -1;
    function resize() { if (root.clientWidth !== lastW) { lastW = root.clientWidth; drawCourtNow(); } }
    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(root); }
    window.addEventListener("resize", resize);

    api.setScore(0);
    api.setLives(lives);
    newPuzzle();
    lastW = root.clientWidth;

    return {
      stop: function () {
        alive = false;
        if (court) court.removeEventListener("pointerdown", onCourtDown);
        window.removeEventListener("resize", resize);
        if (ro) ro.disconnect();
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      _state: function () { return { score: score, lives: lives, puzzle: p, ui: ui, ended: ended, hint: hint }; },
      _tap: tap,
      _next: next
    };
  }

  VSPG.games.register({
    id: "rotacions",
    title: "Rotacions",
    emoji: "🔄",
    help: "Aprèn les rotacions! Col·loca l'equip, endevina qui serveix i caça les faltes de posició. Tres errors i s'acaba.",
    lives: R.LIVES,
    action: false,
    start: start
  });
})();
