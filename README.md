# Privát Poker Room

Privát 2–6 fős Texas Hold'em szoba barátoknak: a zárt lapok mindenki saját telefonján vannak, a közös TV/tablet csak az asztalt mutatja. A játékmotor és a titkos állapot kizárólag a szerveren él.

## Futtatás

```bash
npm install        # vagy: bun install
npm run dev        # http://localhost:3000
```

Production módban (`NODE_ENV=production`) a szerver a `dist/` mappát szolgálja ki, ezt előbb `npm run build` készíti el.

Szoba létrehozása után a szobakóddal (vagy a `?room=XXXX` meghívó linkkel) csatlakozhatnak a játékosok telefonról; a TV/tablet "megfigyelőként" nyitja meg ugyanazt a kódot.

## Telepítés Renderre (ajánlott)

A szerver hosszan futó Node-folyamat (Express + WebSocket, a szobák memóriában élnek), ezért **nem fut serverless környezetben (pl. Vercel)**. A repó tartalmaz egy `render.yaml` Blueprintet.

1. Render → **New → Blueprint** → válaszd ki ezt a repót. A `render.yaml` beállítja a buildet, az indítást és a `/healthz` ellenőrzést.
2. Pontosan **1 példány** fusson (a memóriában tárolt szobák miatt ne skálázd fel).
3. A játék címe: `https://<szolgáltatás-neve>.onrender.com`, a frontend és az API ugyanazon a címen van.

### Ne aludjon el az ingyenes példány

A Render ingyenes példánya 15 perc bejövő forgalom nélkül elalszik (újraindulás ~1 perc), és ilyenkor **a szobák elvesznek**. Bejövő HTTP kérés és bejövő WebSocket-üzenet is ébren tartja, tehát játék közben nem alszik el. Játékok között egy külső pingelő tartja ébren:

- [UptimeRobot](https://uptimerobot.com) (ingyenes) → HTTP(s) monitor → `https://<szolgáltatás-neve>.onrender.com/healthz`, 5 percenként.
- Az ingyenes csomag havi 750 példányórát ad; egy szolgáltatás folyamatos futása ~744 óra, ez éppen belefér.
- Megbízhatóbb megoldás a fizetős kis példány, ott nincs elalvás.

## Mentés (Supabase / Postgres)

Állítsd be a `DATABASE_URL` környezeti változót (Supabase: Connect → Session pooler). A szerver induláskor létrehozza a `poker_rooms` táblát, minden lépés után menti a szobát, induláskor visszatölti. Ha az adatbázis nem érhető el, a játék memóriával megy tovább, a hiba a naplóba kerül. Helyi Postgreshez `PGSSL_DISABLE=1`.

## Parancsok

| Parancs | Feladat |
| --- | --- |
| `npm run dev` / `npm start` | Express + WebSocket szerver (fejlesztéskor Vite middleware) |
| `npm run build` | Frontend build (`dist/`) |
| `npm test` | Egység- és szerver-integrációs tesztek (Vitest) |
| `npm run lint` | Típusellenőrzés (`tsc --noEmit`) |

A szerver-integrációs tesztek valódi szerverfolyamatot indítanak, és egy ~12 másodperces időzítős leosztást is lefuttatnak, ezért a teljes tesztelés néhány másodpercig tart.

## Felépítés

- `server.ts`: REST + WebSocket, szobák, 30 mp-es (állítható) szerveroldali köridőzítő
- `src/engine/`: pakli, kézkiértékelő, kassza/mellékkassza, determinisztikus állapotgép
- `src/components/`: lobby, játékos (telefon) és asztal (TV) nézet
- `tests/`: motor-egységtesztek és szerver-integrációs tesztek

## Biztonsági alapelvek

- A zárt lapok csak a jogosult játékos saját session tokenjével érhetők el; a közös nézet csak showdownkor kap lapokat.
- Showdown nélküli nyereménynél (mindenki dobott) a nyertes lapjai nem lepleződnek le.
- Az akciók idempotensek (`action_id`) és állapotverzióhoz kötöttek (`expected_version`).
- A `/start` csak a szobagazdának, a `/next-hand` és a `/rebuy` csak szobatagoknak engedélyezett.

## Ismert korlátok

- A szobák `DATABASE_URL` megadása esetén Postgresbe (Supabase) is mentődnek, és újraindítás után visszatöltődnek (24 óránál régebbiek nem). Nélküle csak memóriában élnek.
- A visszaszámláló a kliens órájától függ, a szerver időzítője viszont mérvadó.
