# Limo Platform

Limousine intercity booking platform for Egypt — airport transfers, city-to-city trips.

## Docs

| Document | Purpose |
|---|---|
| [limo-webapp-architecture.md](../limo-webapp-architecture.md) | Data model, endpoints, security checklist, production readiness gate |
| [limo-implementation-phases.md](../limo-implementation-phases.md) | Phase-by-phase build guide |
| [limo-demo-prototype-spec.md](../limo-demo-prototype-spec.md) | Demo-first approach: mock WhatsApp + payments for customer sign-off |

## Quick start (demo mode)

```bash
# 1. Start Postgres
docker-compose up postgres -d

# 2. Run migrations
cd backend && npm run db:migrate

# 3. Start backend (in one terminal)
cd backend && npm run dev

# 4. Start frontend (in another terminal)
cd frontend && npm run dev
```

Then open http://localhost:5173

`MOCK_MODE=true` is set by default in `backend/.env` — WhatsApp messages are stored locally and shown in the admin dashboard, payments use a fake checkout page.

## Project structure

```
limo-platform/
├── docker-compose.yml          # Demo: 3 services (postgres, backend, frontend)
├── backend/
│   ├── src/
│   │   ├── server.ts
│   │   ├── lib/
│   │   │   └── prisma.ts
│   │   ├── middleware/
│   │   │   ├── errorHandler.ts
│   │   │   └── notFoundHandler.ts
│   │   └── modules/
│   │       ├── cities/
│   │       └── trips/         # (Phase 2)
│   └── prisma/
│       └── schema.prisma
└── frontend/
    └── src/                   # (Phase 4 + 5)
```

## Environment

Copy `backend/.env` and fill in real credentials when switching from demo to production.
Set `MOCK_MODE=false` to activate real WhatsApp and Paymob integrations.
