# Privát Poker Room

Privát 2–6 fős Texas Hold'em szoba barátoknak: a zárt lapok mindenki saját telefonján vannak, a közös TV/tablet csak az asztalt mutatja. A játékmotor és a titkos állapot kizárólag a szerveren él.

## Futtatás

```bash
npm install        # vagy: bun install
npm run dev        # http://localhost:3000
```

Production módban (`NODE_ENV=production`) a szerver a `dist/` mappát szolgálja ki, ezt előbb `npm run build` készíti el.

Szoba létrehozása után a szobakóddal (vagy a `?room=XXXX` meghívó linkkel) csatlakozhatnak a játékosok telefonról; a TV/tablet "megfigyelőként" nyitja meg ugyanazt a kódot.

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

- A szobák és leosztások a szerverfolyamat memóriájában élnek: újraindításkor elvesznek (perzisztens tárolás még nincs).
- A visszaszámláló a kliens órájától függ, a szerver időzítője viszont mérvadó.
