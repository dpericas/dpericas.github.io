# Contingut del club per a l'app

L'app del Vòlei Santpedor llegeix aquests fitxers de `https://dpericas.github.io/club/`.
Per canviar-los no cal tocar l'app: s'editen a GitHub (repositori `dpericas.github.io`,
carpeta `club/`, botó del llapis ✏️ i "Commit changes"). L'app els torna a llegir en obrir
la pestanya **Club** (o amb el botó d'actualitzar). Comproveu que el JSON és vàlid
(cometes dobles, comes entre elements, sense coma després de l'últim): https://jsonlint.com

Ids dels equips: 3629 Sènior Femení · 4578 Sènior Masculí · 3630 Juvenil V · 3631 Juvenil N ·
3632 Cadet V · 3633 Cadet N · 3634 Infantil V · 4916 Infantil N · 6731 Aleví ·
-1 Escola Aleví · -2 Escola · -3 Màsters

## avisos.json — Avisos del club
```json
{
  "avisos": [
    {
      "id": "sense-pista-23-11",
      "data": "2026-11-20",
      "titol": "Dilluns no hi ha entrenament",
      "text": "El pavelló està ocupat per un acte municipal.",
      "equips": [3630, 3631],
      "enllac": "https://…",
      "fins": "2026-11-24"
    }
  ]
}
```
- `id`: únic i que no canviï (l'app el fa servir per saber quins avisos ja s'han vist).
- `equips` (opcional): a qui va adreçat; sense, és per a tothom.
- `enllac` (opcional): https o un fitxer d'aquesta carpeta.
- `fins` (opcional): a partir de l'endemà ja no surt.
Els avisos nous surten amb un número vermell a la pestanya Club.

## horaris.json — Horaris d'entrenament
```json
{
  "equips": [
    { "equip": 3630, "sessions": [
      { "dia": "Dilluns",  "inici": "18:00", "fi": "19:30", "lloc": "Pavelló Rafa Martínez" },
      { "dia": "Dimecres", "inici": "18:00", "fi": "19:30", "lloc": "Pavelló Rafa Martínez" }
    ] }
  ]
}
```
Surten a Club > Horaris d'entrenament i a la pestanya Plantilla de cada equip.

## galeria.json — Galeria de fotos
```json
{
  "albums": [
    { "id": "j7-juvenil", "titol": "Jornada 7 · Juvenil V", "data": "2026-11-21", "equips": [3630],
      "fotos": ["fotos/2026-11-21/1.jpg", "fotos/2026-11-21/2.jpg"] },
    { "titol": "Presentació d'equips", "data": "2026-12-14",
      "enllac": "https://photos.app.goo.gl/…" }
  ]
}
```
- `fotos`: fitxers penjats a `club/fotos/...` (millor JPG d'uns 1600 px i < 500 KB) o adreces https.
- `enllac`: en lloc de `fotos`, obre un àlbum extern (Google Fotos, Instagram…).
- `portada` (opcional): la foto de la portada; per defecte, la primera.

⚠️ Fotos de menors: publiqueu-ne només amb el consentiment de les famílies. Aquesta web és pública.

## activitats.json — Activitats del club
Surten a l'Agenda (amb el dia) i a Club > Activitats del club, amb el botó per afegir-les al calendari.
```json
{
  "activitats": [
    { "id": "presentacio-2026", "data": "2026-12-13", "hora": "17:00",
      "titol": "Presentació d'equips", "text": "Tots els equips del club, amb berenar.",
      "lloc": "Pavelló Rafa Martínez", "adreca": "Ctra. de Navarcles, 60, Santpedor" },
    { "id": "campus-estiu", "data": "2027-06-28", "fins": "2027-07-02",
      "titol": "Campus d'estiu", "enllac": "https://…", "equips": [6731, -1] }
  ]
}
```
- `hora` opcional (sense hora = tot el dia); `fins` per a activitats de diversos dies.
- `equips` opcional: amb "★ Els meus" a l'Agenda, només surten als equips indicats (sense, a tothom).

## amistosos.json — Partits dels equips no federats (i amistosos)
Escola (-2), Escola Aleví (-1), Màsters (-3) o qualsevol equip. Surten a l'Agenda com els oficials
(amb Calendari, Com arribar i Cotxes si són a fora) i a la pantalla de l'equip.
```json
{
  "partits": [
    { "id": "masters-1", "equip": -3, "data": "2026-11-28", "hora": "18:30",
      "rival": "CV Manresa Màsters", "local": true, "lloc": "Pavelló Rafa Martínez",
      "adreca": "Ctra. de Navarcles, 60, Santpedor" },
    { "id": "escola-1", "equip": -2, "data": "2026-11-21", "hora": "10:00",
      "rival": "Escola Sant Fruitós", "local": false, "lloc": "Pavelló de Sant Fruitós",
      "sets_club": 2, "sets_rival": 1, "competicio": "Trobada escolar" }
  ]
}
```
- `local`: true si es juga a casa. Per posar el resultat, afegiu `sets_club` i `sets_rival`.
