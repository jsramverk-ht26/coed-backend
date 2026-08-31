# coed-backend

Referensimplementation för **DV1677 HT26** — backend till en kollaborativ kodredigerare.

> **OBS — läs detta först**
>
> Det här repot är ett *referensexempel*, inte en facit eller mall att kopiera.
> Det visar ett sätt att implementera flera av kursens projektkrav, men exakt
> hur ni löser dem i ert eget projekt är upp till er. Viss funktionalitet kan
> saknas, vara förenklad eller skilja sig från vad kursens krav specifikt efterfrågar.
>
> Krav 5 (notifieringar) är **inte implementerat** i det här repot.
> GraphQL (tidigare Krav 5, nu borttaget ur kursen) finns inte heller.

## Projektkrav som demonstreras

| Krav | Vad visas | Var i koden |
|------|-----------|-------------|
| Krav 1 – Autentisering | JWT-baserad inloggning och registrering | `routes/auth.js`, `middleware/auth.js` |
| Krav 2 – Realtid | Simultan redigering via Socket.io, cursors, aktiva användare | `socket/collaboration.js` |
| Krav 3 – CI och tester | GitHub Actions + Vitest med mongodb-memory-server | `.github/workflows/ci.yml`, `tests/` |
| Krav 4 – Kommentarer | Radbaserade kommentarer kopplade till filer | `routes/comments.js`, `controllers/commentController.js` |
| Krav 5 – Notifieringar | **Ej implementerat** | — |
| Krav 6 – Kodeditor | Monaco Editor finns i frontend-repot | — |

## Kör lokalt

```bash
cp .env.example .env   # fyll i egna värden
npm install
npm run dev
```

Servern startar på `http://localhost:3001`.

## Tester

```bash
npm test
```

Testerna använder `mongodb-memory-server` och kräver ingen extern MongoDB-installation.

## Miljövariabler

| Variabel | Beskrivning | Exempel |
|----------|-------------|---------|
| `MONGODB_URI` | Anslutningssträng till MongoDB | `mongodb://localhost:27017` |
| `DB_NAME` | Databasnamn | `coed` |
| `PORT` | Port som servern lyssnar på | `3001` |
| `JWT_SECRET` | Hemlighet för JWT-signering | `byt-ut-mig` |
| `CORS_ORIGIN` | Tillåten CORS-origin | `http://localhost:5173` |

## Driftsättning

Bygg och kör med Docker:

```bash
docker build -t ghcr.io/jsramverk-ht26/coed-backend .
docker run -p 3001:3001 --env-file .env ghcr.io/jsramverk-ht26/coed-backend
```

GitHub Actions kör tester automatiskt vid push och pull request mot `main`.
