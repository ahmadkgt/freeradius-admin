# FreeRADIUS Admin

A modern web admin panel for [FreeRADIUS](https://www.freeradius.org/) — built with **React + TypeScript + shadcn/ui** on the frontend and **FastAPI + SQLAlchemy** on the backend, talking to the standard FreeRADIUS MySQL schema.

Supports **English and Arabic** with automatic RTL switching.

## Features

- **Dashboard** — overall stats, top users by traffic, 7-day authentication chart.
- **Users** — full CRUD over `radcheck` / `radreply` / `radusergroup` with check & reply attribute browser.
- **Groups** — manage `radgroupcheck` / `radgroupreply` and member assignments.
- **NAS / RADIUS clients** — CRUD over the `nas` table.
- **Accounting / Sessions** — list `radacct` rows, filter by user / NAS / active-only.
- **Authentication log** — paginated `radpostauth` viewer with accept / reject filtering.
- **i18n** — English + Arabic with automatic `dir="rtl"` switching and Arabic-first font stack.
- **Light / dark theme** toggle.

## Quick start (Docker Compose)

```bash
docker compose up --build
```

This brings up:

| Service  | URL                       |
|----------|---------------------------|
| Frontend | http://localhost:8080     |
| Backend  | http://localhost:8000     |
| API docs | http://localhost:8000/docs |
| MySQL    | `localhost:3306` (db `radius`, user `radius` / `radiuspass`) |

The MySQL container auto-applies the standard FreeRADIUS schema (`db/01-schema.sql`) and a small set of demo users / groups / sessions (`db/02-seed.sql`) on first boot.

## Local development

### Backend

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env   # edit DATABASE_URL if needed
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api/*` to `http://localhost:8000` by default. Override via `VITE_API_PROXY`.

## Schema

The backend speaks directly to the standard FreeRADIUS tables:

- `radcheck`, `radreply` — per-user check & reply attributes.
- `radgroupcheck`, `radgroupreply` — per-group check & reply attributes.
- `radusergroup` — user → group bindings.
- `radacct` — accounting / session records.
- `radpostauth` — post-auth log.
- `nas` — RADIUS clients.

The same database can be pointed at a real FreeRADIUS server — no migrations or extra tables required. Just set `DATABASE_URL` to your existing FreeRADIUS DB.

## Arabic support / دعم اللغة العربية

Click the `EN/AR` button in the top bar to switch languages. The UI automatically:

- swaps to `dir="rtl"`,
- swaps to a Noto Sans Arabic font stack,
- mirrors logical paddings, margins and pagination chevrons.

All page titles, table headers, dialogs and confirmation prompts are translated. Translations live in `frontend/src/locales/`.

## Project structure

```
freeradius-admin/
├── backend/          FastAPI + SQLAlchemy
│   └── app/
│       ├── main.py
│       ├── models.py     SQLAlchemy mappings of FreeRADIUS tables
│       ├── schemas.py    Pydantic v2 schemas
│       └── routers/      users / groups / nas / accounting / dashboard
├── frontend/         Vite + React + TS + Tailwind + shadcn-style UI
│   └── src/
│       ├── pages/
│       ├── components/ui/
│       ├── locales/   en.json + ar.json
│       └── i18n.ts
├── db/
│   ├── 01-schema.sql   standard FreeRADIUS schema
│   └── 02-seed.sql     demo seed data
└── docker-compose.yml
```

## Notes

- The seed data uses `Cleartext-Password` for clarity — production deployments should use hashed passwords (e.g. `Crypt-Password`, `SHA2-Password`).
- This UI is intentionally read/write — protect it with an auth proxy (oauth2-proxy, Traefik forward auth, etc.) before exposing it.
