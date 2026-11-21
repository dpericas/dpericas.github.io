#!/usr/bin/env python3
"""Sends the club's new notices and call-ups as web push notifications (iPhone / browsers).

Run by .github/workflows/webpush.yml every few minutes. It signs in to Firebase with the club's
sending-service account (listed in Firestore serveis/{uid}), reads the new public notices
(`avisos`) and call-ups (`convocatories`: public summaries, only the number called), and sends each one to the browsers subscribed in
`webpush/{uid}` that want it: whole-club notices for everybody, team ones for the subscription's
teams (★ in the web), call-ups of its teams. What was already sent is kept in config/webpush.
The first run only records what exists (nobody gets a pile of old notices).

Environment (GitHub secrets): WEBPUSH_SERVICE_EMAIL, WEBPUSH_SERVICE_PASSWORD, VAPID_PRIVATE_KEY,
optional VAPID_SUBJECT (mailto:…). Without them it does nothing and exits 0.
Python 3.7+. Needs `pywebpush` only to send (pure parts: python3 webpush_send.py --selftest).
"""
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

API_KEY = os.environ.get("FIREBASE_API_KEY", "AIzaSyAfdF-SxBI89qHnq_Ke2jCki_HnXosBxoY")   # public web key (same as js/core.js)
PROJECT = "volei-santpedor-eaa1d"
BASE = "https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents" % PROJECT
SITE = "https://dpericas.github.io"
KEEP = 600   # ids remembered per kind
TEAMS = {3629: "Sènior Femení", 4578: "Sènior Masculí", -3: "Màsters Mixt", 3630: "Juvenil Femení V",
         3631: "Juvenil Femení N", 3632: "Cadet Femení V", 3633: "Cadet Femení N", 3634: "Infantil Femení V",
         4916: "Infantil Femení N", 6731: "Aleví Femení", -1: "Escola Aleví Femení", -2: "Escola Femení"}


# ---------------------------------------------------------------- pure parts (selftest)

# Only the browsers' real push services (same list as the Firestore rules): a made-up address must
# never make this job post somewhere else or fail.
PUSH_HOSTS = re.compile(r"^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|"
                        r"[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9_:/.=+?%&-]+$")
MAX_SENDS = 3000   # per run: a flood of subscriptions cannot keep the job busy for ever


def valid_sub(s):
    """A subscription this job may send to (the rules check the same; old documents may not)."""
    return (isinstance(s.get("endpoint"), str) and len(s["endpoint"]) < 800 and PUSH_HOSTS.match(s["endpoint"]) is not None
            and isinstance(s.get("p256dh"), str) and re.match(r"^[A-Za-z0-9_-]{80,100}$", s["p256dh"]) is not None
            and isinstance(s.get("auth"), str) and re.match(r"^[A-Za-z0-9_-]{16,30}$", s["auth"]) is not None)


def relevant(notice_teams, sub_teams):
    """Same rule as the app (MembersLogic.relevant): club-wide for all; no teams chosen = everything."""
    return not notice_teams or not sub_teams or any(t in sub_teams for t in notice_teams)


def notice_payload(a):
    title = ("⚠️ " if a.get("urgent") else "📣 ") + (a.get("titol") or "Avís del club")
    body = (a.get("text") or "").strip().replace("\n", " ")
    if len(body) > 180:
        body = body[:179] + "…"
    teams = [TEAMS.get(t) for t in (a.get("equips") or []) if TEAMS.get(t)]
    if teams and not body:
        body = ", ".join(teams)
    return {"title": title, "body": body, "url": "/#inici", "tag": "avis-" + a["id"]}


def convocation_payload(c):
    team = TEAMS.get(c.get("equip"), "Vòlei Santpedor")
    # public summary {partit, equip, n, created, autor}: never the meeting time or place (they are
    # team-only data); an old full document still counts its "convocades"
    n = c.get("n")
    if not isinstance(n, int) or isinstance(n, bool):
        n = len(c.get("convocades") or [])
    body = ("%d convocades" % n) if n > 0 else "Convocatòria publicada"
    return {"title": "🏐 Convocatòria · " + team, "body": body,
            "url": "/#agenda", "tag": "conv-" + c["id"]}


def still_valid(a, today):
    """Notices whose "fins" (visible until) has passed are not sent."""
    fins = a.get("fins") or ""
    return not fins or fins >= today


def plan(state, avisos, convs, subs, today):
    """(messages to send as (sub, payload), new state). First run: nothing to send, only remember."""
    first = not state.get("inicialitzat")
    seen_a, seen_c = set(state.get("avisos") or []), set(state.get("convocatories") or [])
    out = []
    if not first:
        for a in avisos:
            if a["id"] in seen_a or not still_valid(a, today):
                continue
            p = notice_payload(a)
            for s in subs:
                if s.get("avisos", True) and relevant(a.get("equips") or [], s.get("equips") or []):
                    out.append((s, p))
        for c in convs:
            if c["id"] in seen_c:
                continue
            p = convocation_payload(c)
            for s in subs:
                if s.get("convocatories", True) and c.get("equip") in (s.get("equips") or []):
                    out.append((s, p))
    new_state = {"inicialitzat": True,
                 "avisos": [a["id"] for a in avisos][-KEEP:],
                 "convocatories": [c["id"] for c in convs][-KEEP:]}
    return out, new_state


# ---------------------------------------------------------------- Firestore REST

def http(method, url, body=None, token=None, form=False):
    data = None
    headers = {}
    if body is not None:
        data = body.encode() if form else json.dumps(body).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt else {}


def value(v):
    if "stringValue" in v:
        return v["stringValue"]
    if "integerValue" in v:
        return int(v["integerValue"])
    if "doubleValue" in v:
        return v["doubleValue"]
    if "booleanValue" in v:
        return v["booleanValue"]
    if "arrayValue" in v:
        return [value(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v:
        return {k: value(x) for k, x in v["mapValue"].get("fields", {}).items()}
    return None


def to_value(x):
    if isinstance(x, bool):
        return {"booleanValue": x}
    if isinstance(x, int):
        return {"integerValue": str(x)}
    if isinstance(x, list):
        return {"arrayValue": {"values": [to_value(i) for i in x]}}
    return {"stringValue": str(x)}


def doc(d):
    o = {k: value(v) for k, v in d.get("fields", {}).items()}
    o["id"] = d["name"].rsplit("/", 1)[-1]
    return o


def list_all(coll, token):
    out, page = [], None
    while True:
        url = BASE + "/" + coll + "?pageSize=300" + ("&pageToken=" + urllib.parse.quote(page) if page else "")
        r = http("GET", url, token=token)
        out += [doc(d) for d in r.get("documents", [])]
        page = r.get("nextPageToken")
        if not page:
            return out


def main():
    email, password = os.environ.get("WEBPUSH_SERVICE_EMAIL"), os.environ.get("WEBPUSH_SERVICE_PASSWORD")
    vapid = os.environ.get("VAPID_PRIVATE_KEY")
    if not (email and password and vapid):
        print("Web push not configured yet (secrets missing): nothing to do.")
        return 0
    subject = os.environ.get("VAPID_SUBJECT") or "mailto:voleisantpedor@hotmail.com"
    auth = http("POST", "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + API_KEY,
                {"email": email, "password": password, "returnSecureToken": True})
    token = auth["idToken"]
    try:
        state = doc(http("GET", BASE + "/config/webpush", token=token))
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        state = {}
    avisos = list_all("avisos", token)
    convs = list_all("convocatories", token)
    subs = [s for s in list_all("webpush", token) if valid_sub(s)]
    today = datetime.date.today().isoformat()
    messages, new_state = plan(state, avisos, convs, subs, today)
    print("subscriptions: %d · new messages: %d" % (len(subs), len(messages)))
    # remember what is being sent BEFORE sending: if anything fails half way, nothing is sent twice
    http("PATCH", BASE + "/config/webpush", {"fields": {k: to_value(v) for k, v in new_state.items()}}, token=token)
    messages = messages[:MAX_SENDS]
    if messages:
        from pywebpush import webpush, WebPushException   # only needed to send
        gone = set()
        for s, payload in messages:
            if s["id"] in gone:
                continue
            try:
                webpush(subscription_info={"endpoint": s["endpoint"], "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}},
                        data=json.dumps(payload, ensure_ascii=False), vapid_private_key=vapid,
                        vapid_claims={"sub": subject}, ttl=86400, timeout=10)
            except WebPushException as e:
                code = getattr(getattr(e, "response", None), "status_code", None)
                if code in (404, 410):   # the browser dropped the subscription: forget it
                    gone.add(s["id"])
                    http("DELETE", BASE + "/webpush/" + s["id"], token=token)
                else:
                    print("send failed (%s) for one subscription" % code)
            except Exception as e:   # bad keys, timeouts, network: skip this one, never stop the job
                print("send failed (%s) for one subscription" % type(e).__name__)
        print("removed expired subscriptions: %d" % len(gone))
    return 0


def selftest():
    subs = [{"id": "a", "equips": [3633], "avisos": True, "convocatories": True},
            {"id": "b", "equips": [], "avisos": True, "convocatories": True},
            {"id": "c", "equips": [3629], "avisos": False, "convocatories": True}]
    avisos = [{"id": "n1", "titol": "Entreno anul·lat", "equips": [3633]},
              {"id": "n2", "titol": "Sopar", "equips": []},
              {"id": "n3", "titol": "Vell", "equips": [], "fins": "2020-01-01"}]
    convs = [{"id": "100", "equip": 3629, "quedada": "9:30", "lloc": "Pavelló", "convocades": ["A", "B"]}]
    msgs, st = plan({}, avisos, convs, subs, "2026-11-20")
    assert msgs == [] and st["inicialitzat"] and st["avisos"] == ["n1", "n2", "n3"], "first run only records"
    msgs, st2 = plan({"inicialitzat": True, "avisos": [], "convocatories": []}, avisos, convs, subs, "2026-11-20")
    got = sorted((s["id"], p["tag"]) for s, p in msgs)
    assert got == [("a", "avis-n1"), ("a", "avis-n2"), ("b", "avis-n1"), ("b", "avis-n2"), ("c", "conv-100")], got
    msgs, _ = plan(st2, avisos, convs, subs, "2026-11-20")
    assert msgs == [], "never twice"
    p = notice_payload({"id": "x", "titol": "T", "text": "a" * 300, "urgent": True})
    assert p["title"].startswith("⚠️") and len(p["body"]) == 180
    assert convocation_payload(convs[0])["body"] == "2 convocades", "old full doc: only the count"
    assert convocation_payload({"id": "101", "equip": 3629, "partit": "101", "n": 5})["body"] == "5 convocades"
    assert convocation_payload({"id": "102", "equip": 3629, "n": 0})["body"] == "Convocatòria publicada"
    assert "Pavelló" not in str(convocation_payload(convs[0])) and "9:30" not in str(convocation_payload(convs[0]))
    assert relevant([1], []) and relevant([], [2]) and not relevant([1], [2])
    good = {"endpoint": "https://fcm.googleapis.com/fcm/send/abc:DEF-123", "p256dh": "B" * 87, "auth": "a" * 22}
    assert valid_sub(good)
    assert not valid_sub(dict(good, endpoint="https://nonexistent.invalid/x"))
    assert not valid_sub(dict(good, endpoint="https://fcm.googleapis.com.evil.example/x"))
    assert not valid_sub(dict(good, p256dh="short"))
    assert valid_sub(dict(good, endpoint="https://web.push.apple.com/QGm1abc"))
    assert valid_sub(dict(good, endpoint="https://wns2-db5p.notify.windows.com/w/?token=BQYAAAB%2bx&a=1"))
    print("selftest OK")
    return 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else main())
