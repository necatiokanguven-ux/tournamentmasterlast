# Tournament Master — Architecture Overview

## Current production path (Phase 1 complete)

```text
Browser clients (director, floor, dealer phone, tracking)
        │ HTTP (+ WS for dealer table timer only)
        ▼
   server.ts (Express)
        │
        ▼
   createRepository()  ──►  JsonFileRepository  ──►  db.json
        │
        └── USE_POSTGRES=true  ──►  PostgresRepository  ──►  PostgreSQL
              (fallback)       ──►  JsonFileRepository
```

## Target path (roadmap)

```text
                    ┌─────────────────────────┐
  Operator browsers │  Express + WS hub       │
  Dealer phones     │  (single Node process)  │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │  TournamentRepository │
                    │  Json fallback        │
                    │  PostgreSQL primary   │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │  Embedded PG (port 5433)          │
              │  config/database.json (auto creds)│
              └───────────────────────────────────┘
```

## Key modules

| Area | Path |
|------|------|
| Repository interface | `src/server/repository/TournamentRepository.ts` |
| JSON persistence (default) | `src/server/repository/JsonFileRepository.ts` |
| Factory | `src/server/repository/createRepository.ts` |
| Dealer rotation engine | `src/server/dealerRotation/DealerQueueManager.ts` |
| WebSocket hub (F4) | `src/server/websocket/TournamentSocketHub.ts` |
| Floor teams (zone precedent) | `src/floor/floorRoutes.ts` |

## Feature flags (planned)

| Flag | Default | Phase |
|------|---------|-------|
| `USE_POSTGRES` | `false` | F2 |
| `VITE_USE_WS` | `false` | F4 |
| `DEALER_ZONES` | `false` | F6 |

## Safety

- Default flags off = identical to pre-roadmap behavior
- One phase per merge; lint + build after each phase

See [ROADMAP.md](./ROADMAP.md) for full phase list.
