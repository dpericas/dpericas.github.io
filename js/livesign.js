/*
 * Live matches of the club's list are signed by the scorer's phone (app: live/LiveSign.kt).
 * The public key is in Firestore directes/{topic}; only editors and approved team members can
 * create it. Anyone can post to the public relay (ntfy.sh), so:
 *  - the "live now" lists only show matches with that document and a correctly signed score;
 *  - the live page drops unsigned or forged snapshots of a listed match;
 *  - every snapshot is checked for absurd sizes, rules or dates (VSP.liveGuard).
 */
(function () {
  "use strict";
  var VSP = window.VSP;

  function n(x) { var v = Number(x); return isFinite(v) ? String(Math.trunc(v)) : "0"; }
  function s(x) { return x === undefined || x === null ? "" : String(x); }
  /** The signed text: same fields and order as LiveSign.canonical in the app. Pure: tested. */
  VSP.liveCanonical = function (d, topic) {
    return [n(d.v), topic, n(d.id), s(d.h), s(d.a), s(d.r), s(d.f), s(d.e), s(d.x), n(d.st), s(d.c), n(d.end), n(d.t)].join("\n");
  };

  /** Sanity limits (LiveGuard in the app). Pure: tested. */
  VSP.liveGuard = function (d, now) {
    if (!d || d.v !== 1) return false;
    var r = String(d.r || "").split(",").map(Number);
    if (r.length < 6 || r.some(function (x) { return !isFinite(x); })) return false;
    var ok = r[0] >= 1 && r[0] <= 3 && r[1] >= 5 && r[1] <= 50 && r[2] >= 5 && r[2] <= 50 && r[3] >= 1 && r[3] <= 5 &&
      r[4] >= 0 && r[4] <= 10 && r[5] >= 0 && r[5] <= 20;
    return ok && s(d.h).length <= 60 && s(d.a).length <= 60 && s(d.c).length <= 80 && s(d.e).length <= 8000 &&
      s(d.x).length <= 2000 && Number(d.t || 0) <= (now || Date.now()) + 600000;
  };

  function unb64(t) {
    t = t.replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "=";
    var b = atob(t), out = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }
  var keys = {};
  /** The public key of a listed match (null = not in the club's list). Failures are not cached. */
  VSP.liveKey = function (topic) {
    if (keys[topic]) return keys[topic];
    if (!window.crypto || !crypto.subtle || !VSP.fs) return Promise.resolve(null);
    var p = VSP.fs.get("directes/" + topic).then(function (doc) {
      if (!doc || !doc.pub) return null;
      return crypto.subtle.importKey("spki", unb64(doc.pub), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    });
    keys[topic] = p;
    p.catch(function () { delete keys[topic]; });
    return p.catch(function () { return null; });
  };
  function verify(d, topic, key) {
    if (!key || !d.sg) return Promise.resolve(false);
    var data = new TextEncoder().encode(VSP.liveCanonical(d, topic));
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, unb64(d.sg), data).catch(function () { return false; });
  }
  /** A listed match with this snapshot signed by its scorer. */
  VSP.liveVerified = function (d, topic) {
    if (!VSP.liveGuard(d)) return Promise.resolve(false);
    return VSP.liveKey(topic).then(function (k) { return verify(d, topic, k); });
  };
  /** For a private link: unlisted matches are accepted (unverified); listed ones must be signed. */
  VSP.liveAccept = function (d, topic) {
    if (!VSP.liveGuard(d)) return Promise.resolve(false);
    return VSP.liveKey(topic).then(function (k) { return k ? verify(d, topic, k) : true; });
  };
})();
