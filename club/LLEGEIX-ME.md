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
