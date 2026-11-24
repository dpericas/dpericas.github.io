#!/usr/bin/env python3
"""Subscribable season calendars, one per team: cal/{team}.ics (+ cal/index.json with the teams).

Run by .github/workflows/calendaris.yml every hour. Reads the club agenda published by the editors'
phones (`agenda/{team}`) and the friendlies (`amistosos`) with the same service account as the web
push job, and writes an .ics file per team. A phone subscribed to it (iPhone: webcal://…; Google
Calendar: "From URL") updates by itself: changed times, results, new matches.

The files only change when the matches change (no timestamps that move on every run), so the
workflow commits only then. Without the secrets it does nothing and exits 0.
Python 3.7+, standard library only (pure parts: python3 calendars.py --selftest).
"""
import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import webpush_send as W   # noqa: E402  (Firestore REST helpers and the team names)

SITE = os.environ.get("SITE", "https://dpericas.github.io")
OUT = os.environ.get("CAL_DIR", "cal")
VTIMEZONE = "\r\n".join([
    "BEGIN:VTIMEZONE", "TZID:Europe/Madrid",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
    "END:VTIMEZONE"])

# ---------------------------------------------------------------- pure parts (selftest)

SMALL = {"de", "del", "dels", "la", "les", "el", "els", "i", "y", "en", "a"}


def title_case(s):
    """Same as VSP.titleCase / TeamNames.titleCase."""
    out = []
    for i, w in enumerate((s or "").strip().lower().split()):
        if w in SMALL:
            out.append(w if i > 0 else w[:1].upper() + w[1:])
        elif (w.startswith("d'") or w.startswith("l'")) and len(w) > 2:
            out.append(w[:2] + w[2:3].upper() + w[3:])
        elif len(w) <= 2 or (len(w) == 3 and not re.search("[aeiouàèéíòóú]", w)):
            out.append(w.upper())
        else:
            out.append(w[:1].upper() + w[1:])
    return " ".join(out)


def nice_team(s):
    """Same as VSP.niceTeam / TeamNames.nice: "VOLEI SANTPEDOR N" -> "Santpedor N"."""
    m = re.match(r"^(?:club\s+)?v[oò]lei\s+santpedor\b\s*(.*)$", (s or "").strip(), re.I)
    return ("Santpedor " + title_case(m.group(1))).strip() if m else title_case(s)


def java_hash(s):
    """Java's String.hashCode (UTF-16 code units), as the app and the web (friendly ids)."""
    h = 0
    data = s.encode("utf-16-be")
    for i in range(0, len(data), 2):
        h = (31 * h + ((data[i] << 8) | data[i + 1])) & 0xFFFFFFFF
    return h - (1 << 32) if h >= (1 << 31) else h


def friendly_id(o):
    key = o.get("id") or "%s-%s-%s" % (o.get("equip"), o.get("data"), (o.get("rival") or "").strip())
    return str(-(java_hash(key) & 0x7FFFFFFF) - 1)


def matches_of(agenda_docs, friendlies):
    """{team: [match]} from agenda/{team} and amistosos (same fields as js/agenda.js)."""
    out = {}
    for d in agenda_docs:
        team = d.get("equip") or int(d["id"])
        for p in d.get("partits") or []:
            if not isinstance(p, dict) or not p.get("f"):
                continue
            f = str(p["f"])
            t = int(p.get("t") or team)
            hm = f[11:16]
            gl, gv = int(p.get("gl") or 0), int(p.get("gv") or 0)
            lid = int(p.get("lid") or 0)
            out.setdefault(t, []).append({
                "id": str(p.get("id")), "date": f[:10], "time": hm if hm and hm != "00:00" else None,
                "home": str(p.get("l") or "").strip(), "away": str(p.get("v") or "").strip(), "home_club": lid != 0 and lid == t,
                "played": bool(re.search("finali[tz]", str(p.get("st") or ""), re.I)) or gl + gv > 0, "hs": gl, "as": gv,
                "venue": str(p.get("c") or "").strip(), "address": str(p.get("d") or "").strip(),
                "comp": p.get("co") or "", "round": int(p.get("j") or 0), "stamp": d.get("actualitzat") or ""})
    for o in friendlies:
        if not (o.get("equip") and o.get("data") and o.get("rival")):
            continue
        t = int(o["equip"])
        club = "VOLEI SANTPEDOR " + W.TEAMS.get(t, "").upper()
        home = o.get("local") is not False
        rival = str(o.get("rival")).strip()
        sc, sr = o.get("sets_club"), o.get("sets_rival")
        has = isinstance(sc, int) and isinstance(sr, int)
        out.setdefault(t, []).append({
            "id": friendly_id(o), "date": o["data"], "time": o.get("hora") or None,
            "home": club if home else rival, "away": rival if home else club, "home_club": home,
            "played": has, "hs": (sc if home else sr) if has else 0, "as": (sr if home else sc) if has else 0,
            "venue": str(o.get("lloc") or "").strip(), "address": str(o.get("adreca") or "").strip(),
            "comp": o.get("competicio") or "Amistós", "round": int(o.get("jornada") or 0), "stamp": o.get("created") or ""})
    for t in out:
        seen, uniq = set(), []
        for m in sorted(out[t], key=lambda m: (m["date"], m["time"] or "")):
            if m["id"] not in seen:
                seen.add(m["id"])
                uniq.append(m)
        out[t] = uniq
    return out


def esc(s):
    return str(s or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n")


def fold(line):
    """RFC 5545: lines of at most 75 octets, continued with a space."""
    out, cur = [], ""
    for ch in line:
        if len((cur + ch).encode("utf-8")) > 74:
            out.append(cur)
            cur = " " + ch
        else:
            cur += ch
    out.append(cur)
    return "\r\n".join(out)


def stamp(iso):
    """A stable DTSTAMP from when the data was published (never "now": the file must not change by itself)."""
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})", iso or "")
    return "%s%s%sT%s%s%sZ" % m.groups() if m else "20260801T000000Z"


def event(m, team_name):
    d = m["date"].replace("-", "")
    h, a = nice_team(m["home"]), nice_team(m["away"])
    result = ""
    if m["played"]:
        result = " (%d-%d)" % ((m["hs"], m["as"]) if m["home_club"] else (m["as"], m["hs"]))
    summary = "🏐 %s: %s – %s%s" % (team_name, h, a, result)
    lines = ["BEGIN:VEVENT", "UID:%s@voleisantpedor" % m["id"], "DTSTAMP:" + stamp(m["stamp"])]
    if m["time"]:
        hh, mm = m["time"][:2], m["time"][3:5]
        start = datetime.datetime(int(d[:4]), int(d[4:6]), int(d[6:]), int(hh), int(mm))
        end = start + datetime.timedelta(hours=2)
        lines += ["DTSTART;TZID=Europe/Madrid:" + start.strftime("%Y%m%dT%H%M00"), "DTEND;TZID=Europe/Madrid:" + end.strftime("%Y%m%dT%H%M00")]
    else:
        nxt = (datetime.date(int(d[:4]), int(d[4:6]), int(d[6:])) + datetime.timedelta(days=1)).strftime("%Y%m%d")
        lines += ["DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + nxt]
        summary += " · hora per confirmar"
    info = []
    if m["round"]:
        info.append("Jornada %d" % m["round"])
    if m["comp"]:
        info.append(m["comp"])
    info.append("A casa" if m["home_club"] else "A fora")
    desc = " · ".join(info) + "\nConvocatòria, com arribar-hi i cotxes: %s/#partit/%s" % (SITE, m["id"])
    loc = ", ".join(x for x in [title_case(m["venue"]), m["address"]] if x)
    lines += ["SUMMARY:" + esc(summary), "DESCRIPTION:" + esc(desc)]
    if loc:
        lines.append("LOCATION:" + esc(loc))
    lines += ["URL:%s/#partit/%s" % (SITE, m["id"]), "END:VEVENT"]
    return "\r\n".join(fold(x) for x in lines)


def calendar(team, team_name, matches):
    head = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Club Volei Santpedor//Calendari//CA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
            "X-WR-CALNAME:" + esc("Vòlei Santpedor · " + team_name), "X-WR-TIMEZONE:Europe/Madrid",
            "X-WR-CALDESC:" + esc("Partits del %s (Club Vòlei Santpedor). S'actualitza sol." % team_name),
            "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"]
    body = [fold(x) for x in head] + [VTIMEZONE] + [event(m, team_name) for m in matches] + ["END:VCALENDAR"]
    return "\r\n".join(body) + "\r\n"


def write_if_changed(path, text):
    old = None
    if os.path.exists(path):
        with open(path, encoding="utf-8", newline="") as f:
            old = f.read()
    if old == text:
        return False
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    return True


def build(agenda_docs, friendlies, out_dir):
    """Writes the files; returns how many changed."""
    os.makedirs(out_dir, exist_ok=True)
    by_team = matches_of(agenda_docs, friendlies)
    changed = 0
    teams = []
    for t in sorted(by_team):
        if t not in W.TEAMS or not by_team[t]:
            continue
        teams.append(t)
        changed += write_if_changed(os.path.join(out_dir, "%d.ics" % t), calendar(t, W.TEAMS[t], by_team[t]))
    changed += write_if_changed(os.path.join(out_dir, "index.json"), json.dumps({"teams": teams}) + "\n")
    return changed


def main():
    email, password = os.environ.get("WEBPUSH_SERVICE_EMAIL"), os.environ.get("WEBPUSH_SERVICE_PASSWORD")
    if not (email and password):
        print("Calendars not configured yet (service account secrets missing): nothing to do.")
        return 0
    auth = W.http("POST", "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + W.API_KEY,
                  {"email": email, "password": password, "returnSecureToken": True})
    token = auth["idToken"]
    n = build(W.list_all("agenda", token), W.list_all("amistosos", token), OUT)
    print("calendar files changed: %d" % n)
    return 0


def selftest():
    import tempfile
    assert nice_team("VOLEI SANTPEDOR N") == "Santpedor N" and nice_team("CV ENCAMP") == "CV Encamp"
    assert title_case("LA TORRE DE CLARAMUNT VC") == "La Torre de Claramunt VC"
    assert java_hash("abc") == 96354 and java_hash("") == 0 and java_hash("polygenelubricants") == -2147483648
    agenda = [{"id": "3629", "equip": 3629, "actualitzat": "2026-11-24T14:19:00Z", "partits": [
        {"id": 101, "f": "2026-11-29 16:00:00", "t": 3629, "l": "VOLEI SANTPEDOR", "v": "CLUB VOLEI TÀRREGA", "lid": 3629, "c": "PAVELLÓ RAFA MARTÍNEZ", "d": "C. Major 1, Santpedor", "co": "4a Divisió", "j": 8},
        {"id": 102, "f": "2026-12-13 00:00:00", "t": 3629, "l": "CV ENCAMP", "v": "VOLEI SANTPEDOR", "lid": 999, "j": 9},
        {"id": 100, "f": "2026-11-21 18:00:00", "t": 3629, "l": "A, B; C", "v": "VOLEI SANTPEDOR", "lid": 1, "gl": 1, "gv": 3, "st": "Finalizado"}]}]
    friendlies = [{"id": "abc", "equip": 3629, "data": "2026-12-20", "hora": "10:00", "rival": "Manresa", "local": False}]
    ms = matches_of(agenda, friendlies)[3629]
    assert [m["id"] for m in ms] == ["100", "101", "102", friendly_id(friendlies[0])], [m["id"] for m in ms]
    ics = calendar(3629, "Sènior Femení", ms)
    flat = ics.replace("\r\n ", "")   # unfolded
    assert "DTSTART;TZID=Europe/Madrid:20261129T160000" in ics and "DTEND;TZID=Europe/Madrid:20261129T180000" in ics
    assert "DTSTART;VALUE=DATE:20261213" in flat and "hora per confirmar" in flat
    assert "Santpedor – Club Volei Tàrrega" in flat and "A\\, B\\; C – Santpedor (3-1)" in flat, "escaped, result from the club's side"
    assert "DTSTAMP:20261124T141900Z" in ics and all(len(l.encode("utf-8")) <= 75 for l in ics.split("\r\n"))
    assert "#partit/101" in flat and "UID:101@voleisantpedor" in flat
    d = tempfile.mkdtemp()
    assert build(agenda, friendlies, d) == 2 and build(agenda, friendlies, d) == 0, "unchanged data: no new files"
    with open(os.path.join(d, "index.json")) as f:
        assert json.load(f) == {"teams": [3629]}
    print("selftest OK")
    return 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else main())
