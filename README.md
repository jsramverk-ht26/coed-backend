# coed-backend

Backend till en kollaborativ kodeditor, använd som kursreferens i DV1677 HT26 vid BTH.
Byggt med Express, MongoDB, Socket.io och JWT. Visar hur flera projektkrav kan
uppfyllas i ett sammanhängande system.

## Projektkrav som demonstreras

| Krav | Vad visas | Var i koden |
|------|-----------|-------------|
| Krav 1 – Autentisering | JWT-baserad inloggning och registrering | `routes/auth.js`, `middleware/auth.js` |
| Krav 2 – Realtid | Simultan redigering via Socket.io, cursors, aktiva användare | `socket/collaboration.js` |
| Krav 3 – CI och tester | GitHub Actions + Vitest med mongodb-memory-server | `.github/workflows/ci.yml`, `tests/` |
| Krav 4 – Kommentarer | Radbaserade kommentarer kopplade till filer | `routes/comments.js`, `controllers/commentController.js` |

## Kör lokalt

```bash
cp .env.example .env   # fyll i egna värden
npm install
npm run dev
```

Servern startar på `http://localhost:3001` (eller det PORT du satt i `.env`).

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
